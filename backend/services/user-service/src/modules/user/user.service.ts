import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventBusService } from '../../shared/events/event-bus.service';
import { AuthServiceClient } from '../../shared/clients/auth-service.client';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserRepository } from './user.repository';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly repo: UserRepository,
    private readonly eventBus: EventBusService,
    private readonly authClient: AuthServiceClient,
  ) {}

  // ─── Auth proxy ───────────────────────────────────────────────────────────

  register(dto: RegisterUserDto) {
    return this.authClient.register(dto as any);
  }

  login(dto: LoginUserDto) {
    return this.authClient.login(dto as any);
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfileById(id: string) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(currentUserId: string, dto: UpdateProfileDto) {
    try {
      const updated = await this.repo.updateById(currentUserId, {
        username: dto.username,
        avatar: dto.avatar ?? undefined,
        cover: dto.cover ?? undefined,
        bio: dto.bio ?? undefined,
      });

      this.eventBus.publish('user.profile.updated', {
        userId: currentUserId,
        fields: Object.keys(dto),
      });
      return updated;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new BadRequestException('Username already exists');
      throw e;
    }
  }

  // ─── Follow / Unfollow ────────────────────────────────────────────────────

  async follow(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId)
      throw new BadRequestException('Cannot follow yourself');

    const currentUser = await this.repo.findById(currentUserId);
    if (!currentUser) throw new BadRequestException('Current user not found');

    const target = await this.repo.findById(targetUserId);
    if (!target) throw new NotFoundException('Target user not found');

    try {
      await this.repo.createFollow(currentUserId, targetUserId);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003')
        throw new BadRequestException('Invalid follow relation');
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002')
        throw e;
      // Đã follow trước đó — bỏ qua
    }

    let notification: { id: string; createdAt: Date } | null = null;
    try {
      notification = await this.repo.createFriendRequestNotification(targetUserId, currentUserId);
    } catch (e) {
      this.logger.warn(`Cannot create friend-request notification: ${(e as Error).message}`);
    }

    this.eventBus.publish('user.followed', { followerId: currentUserId, followingId: targetUserId });

    if (notification) {
      this.eventBus.publish('notification.created', {
        userId: targetUserId,
        type: 'friend_request',
        fromUserId: currentUserId,
        notificationId: notification.id,
        createdAt: notification.createdAt,
      });
    }

    return { success: true };
  }

  async unfollow(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId)
      throw new BadRequestException('Cannot unfollow yourself');

    await this.repo.deleteFollow(currentUserId, targetUserId);
    await this.repo.clearPendingFriendRequests(targetUserId, currentUserId);
    this.eventBus.publish('user.unfollowed', { followerId: currentUserId, followingId: targetUserId });
    return { success: true };
  }

  // ─── Followers / Following ────────────────────────────────────────────────

  async listFollowers(userId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repo.listFollowers(userId, skip, limit);
    return { page, limit, total, items: items.map(i => ({ createdAt: i.createdAt, user: i.follower })) };
  }

  async listFollowing(userId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repo.listFollowing(userId, skip, limit);
    return { page, limit, total, items: items.map(i => ({ createdAt: i.createdAt, user: i.following })) };
  }

  async listFollowingIds(currentUserId: string) {
    return this.repo.listFollowingIds(currentUserId);
  }

  // ─── Friends ──────────────────────────────────────────────────────────────

  async listFriends(currentUserId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repo.listFriends(currentUserId, skip, limit);
    return {
      page, limit, total,
      items: items.map(u => ({
        createdAt: u.createdAt,
        user: { id: u.id, username: u.username, avatar: u.avatar, bio: u.bio, isOnline: u.isOnline },
      })),
    };
  }

  async listFriendRequests(currentUserId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repo.listFriendRequests(currentUserId, skip, limit);
    return {
      page, limit, total,
      items: items.map(i => ({ id: i.id, isRead: i.isRead, createdAt: i.createdAt, fromUser: i.fromUser })),
    };
  }

  async acceptFriendRequest(currentUserId: string, notificationId: string) {
    const request = await this.repo.findFriendRequestByIdForUser(currentUserId, notificationId);
    if (!request) throw new NotFoundException('Friend request not found');

    for (const [from, to] of [[currentUserId, request.fromUserId], [request.fromUserId, currentUserId]]) {
      try {
        await this.repo.createFollow(from, to);
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      }
    }

    await this.repo.markFriendRequestAsRead(notificationId);
    return { success: true };
  }

  async rejectFriendRequest(currentUserId: string, notificationId: string) {
    const request = await this.repo.findFriendRequestByIdForUser(currentUserId, notificationId);
    if (!request) throw new NotFoundException('Friend request not found');
    await this.repo.markFriendRequestAsRead(notificationId);
    return { success: true };
  }

  // ─── Search / Recommend ───────────────────────────────────────────────────

  async search(username: string, q: PaginationQueryDto) {
    const normalized = username.trim();
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.repo.searchByUsername(normalized, skip, limit);
    const lowerQuery = normalized.toLowerCase();
    const terms = lowerQuery.split(/\s+/).filter(t => t.length > 0);

    const scored = items
      .map(u => {
        const name = u.username.toLowerCase();
        let score = 0;
        if (name === lowerQuery) score += 100;
        if (name.includes(lowerQuery)) score += 50;
        terms.forEach(t => { if (name.includes(t)) score += 10; });
        return { user: u, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(s => s.user);

    return { page, limit, total, items: scored };
  }

  async recommend(currentUserId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repo.recommendForUser(currentUserId, skip, limit);
    return { page, limit, total, items };
  }
}
