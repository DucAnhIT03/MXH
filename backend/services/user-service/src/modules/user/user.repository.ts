import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../libs/database/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  updateById(id: string, data: { username?: string; avatar?: string | null; cover?: string | null; bio?: string | null }) {
    return this.prisma.user.update({ where: { id }, data });
  }

  // ─── Search ───────────────────────────────────────────────────────────────

  async searchByUsername(username: string, skip: number, take: number) {
    const terms = username.split(/\s+/).map(t => t.trim()).filter(t => t.length > 0);

    const where = terms.length > 0
      ? { OR: terms.map(term => ({ username: { contains: term } })) }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { username: 'asc' },
        skip,
        take,
        select: { id: true, username: true, avatar: true, bio: true, isOnline: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  // ─── Notifications / Friend Requests ──────────────────────────────────────

  async createFriendRequestNotification(targetUserId: string, fromUserId: string) {
    return (this.prisma as any).notification.create({
      data: { userId: targetUserId, fromUserId, type: 'FRIEND_REQUEST' },
    });
  }

  async listFriendRequests(userId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      (this.prisma as any).notification.findMany({
        where: { userId, type: 'FRIEND_REQUEST', isRead: false },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          isRead: true,
          createdAt: true,
          fromUser: { select: { id: true, username: true, avatar: true, bio: true, isOnline: true } },
        },
      }),
      (this.prisma as any).notification.count({
        where: { userId, type: 'FRIEND_REQUEST', isRead: false },
      }),
    ]);
    return { items, total };
  }

  async findFriendRequestByIdForUser(userId: string, notificationId: string) {
    return (this.prisma as any).notification.findFirst({
      where: { id: notificationId, userId, type: 'FRIEND_REQUEST' },
      select: { id: true, isRead: true, createdAt: true, fromUserId: true },
    });
  }

  async markFriendRequestAsRead(notificationId: string) {
    return (this.prisma as any).notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async clearPendingFriendRequests(targetUserId: string, fromUserId: string) {
    return (this.prisma as any).notification.deleteMany({
      where: { userId: targetUserId, fromUserId, type: 'FRIEND_REQUEST', isRead: false },
    });
  }

  // ─── Recommend ────────────────────────────────────────────────────────────

  async recommendForUser(userId: string, skip: number, take: number) {
    const uid = userId.trim();

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT u.id, u.username, u.avatar, u.bio, u.isOnline, u.createdAt,
               COUNT(f2.followerId) as score
        FROM users u
        LEFT JOIN follows f2 ON f2.followingId = u.id AND f2.followerId IN (
          SELECT followingId FROM follows WHERE followerId = ${uid}
        )
        WHERE u.id != ${uid}
          AND u.id NOT IN (SELECT followingId FROM follows WHERE followerId = ${uid})
          AND u.id NOT IN (SELECT followerId FROM follows WHERE followingId = ${uid})
        GROUP BY u.id
        ORDER BY score DESC, u.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) as total FROM users u
        WHERE u.id != ${uid}
          AND u.id NOT IN (SELECT followingId FROM follows WHERE followerId = ${uid})
          AND u.id NOT IN (SELECT followerId FROM follows WHERE followingId = ${uid})
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return {
      total,
      items: items.map(u => ({
        id: u.id, username: u.username, avatar: u.avatar,
        bio: u.bio, isOnline: Boolean(Number(u.isOnline)), createdAt: u.createdAt,
      })),
    };
  }

  // ─── Follow ───────────────────────────────────────────────────────────────

  createFollow(followerId: string, followingId: string) {
    return this.prisma.follow.create({ data: { followerId, followingId } });
  }

  deleteFollow(followerId: string, followingId: string) {
    return this.prisma.follow.deleteMany({ where: { followerId, followingId } });
  }

  async listFollowers(userId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        orderBy: { createdAt: 'desc' },
        skip, take,
        select: {
          createdAt: true,
          follower: { select: { id: true, username: true, avatar: true, bio: true, isOnline: true } },
        },
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);
    return { items, total };
  }

  async listFollowing(userId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: 'desc' },
        skip, take,
        select: {
          createdAt: true,
          following: { select: { id: true, username: true, avatar: true, bio: true, isOnline: true } },
        },
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { items, total };
  }

  async listFollowingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    return rows.map(r => r.followingId);
  }

  // ─── Friends (mutual follow) ──────────────────────────────────────────────

  async listFriends(userId: string, skip: number, take: number) {
    const outgoing = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true, createdAt: true },
    });

    if (outgoing.length === 0) return { items: [], total: 0 };

    const outgoingIds = outgoing.map(f => f.followingId);
    const incoming = await this.prisma.follow.findMany({
      where: { followerId: { in: outgoingIds }, followingId: userId },
      select: { followerId: true, createdAt: true },
    });

    const incomingByFollowerId = new Map(incoming.map(f => [f.followerId, f.createdAt]));

    const mutual = outgoing
      .filter(f => incomingByFollowerId.has(f.followingId))
      .map(f => {
        const incomingAt = incomingByFollowerId.get(f.followingId)!;
        return { friendId: f.followingId, establishedAt: incomingAt > f.createdAt ? incomingAt : f.createdAt };
      })
      .sort((a, b) => b.establishedAt.getTime() - a.establishedAt.getTime());

    if (mutual.length === 0) return { items: [], total: 0 };

    const paged = mutual.slice(skip, skip + take);
    const users = await this.prisma.user.findMany({
      where: { id: { in: paged.map(f => f.friendId) } },
      select: { id: true, username: true, avatar: true, bio: true, isOnline: true },
    });

    const userById = new Map(users.map(u => [u.id, u]));
    const items = paged
      .map(f => {
        const user = userById.get(f.friendId);
        if (!user) return null;
        return { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio, isOnline: user.isOnline, createdAt: f.establishedAt };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return { items, total: mutual.length };
  }
}
