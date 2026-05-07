import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventBusService } from '../../shared/events/event-bus.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UserRepository } from './user.repository';
import { PostRepository } from './post.repository';
import { CreatePostDto } from './dto/create-post.dto';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);

  constructor(
    private readonly userRepo: UserRepository,
    private readonly postRepo: PostRepository,
    private readonly eventBus: EventBusService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private toEngagementCount(value: unknown): number {
    if (typeof value === 'bigint') return Number(value);
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  private mapFeedItem(item: Record<string, unknown>) {
    return {
      id: item.id as string,
      content: item.content as string,
      imageUrl: item.imageUrl as string | null | undefined,
      postType: item.postType as string,
      shortVideoUrl: item.shortVideoUrl as string | null | undefined,
      hidden: Boolean(Number(item.hidden ?? 0)),
      createdAt: item.createdAt as Date | string,
      updatedAt: item.updatedAt as Date | string,
      likeCount: this.toEngagementCount(item.likeCount),
      commentCount: this.toEngagementCount(item.commentCount),
      shareCount: this.toEngagementCount(item.shareCount),
      likedByMe: Boolean(Number(item.likedByMe ?? 0)),
      author: {
        id: item.authorId as string,
        username: item.authorUsername as string,
        avatar: item.authorAvatar as string | null | undefined,
        bio: item.authorBio as string | null | undefined,
        isOnline: Boolean(item.authorIsOnline),
      },
    };
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async uploadPostMedia(currentUserId: string, file: any, type?: string) {
    const user = await this.userRepo.findById(currentUserId);
    if (!user) throw new NotFoundException('Current user not found');

    const uploadType = type?.trim().toLowerCase() || 'image';
    if (uploadType !== 'image' && uploadType !== 'video') {
      throw new BadRequestException('Upload type must be image or video');
    }

    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (!mimeType) throw new BadRequestException('Invalid file type');
    if (uploadType === 'image' && !mimeType.startsWith('image/'))
      throw new BadRequestException('Expected an image file');
    if (uploadType === 'video' && !mimeType.startsWith('video/'))
      throw new BadRequestException('Expected a video file');

    const uploaded = await this.cloudinaryService.uploadBuffer(file, uploadType);
    return {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      resourceType: uploaded.resource_type,
      format: uploaded.format,
      bytes: uploaded.bytes,
      duration: uploaded.duration ?? null,
    };
  }

  // ─── Create post ──────────────────────────────────────────────────────────

  async createPost(currentUserId: string, dto: CreatePostDto) {
    const content = String(dto.content ?? '').trim();
    const postType = dto.postType || 'POST';
    const imageUrl = dto.imageUrl?.trim() || null;
    const shortVideoUrl = dto.shortVideoUrl?.trim() || null;

    if (postType === 'SHORT_VIDEO' && !shortVideoUrl)
      throw new BadRequestException('Short video URL is required for short video posts');
    if (!content && !imageUrl && !shortVideoUrl)
      throw new BadRequestException('Post content or media is required');

    const user = await this.userRepo.findById(currentUserId);
    if (!user) throw new NotFoundException('Current user not found');

    const created = await this.postRepo.createPost(currentUserId, content, imageUrl, postType, shortVideoUrl);
    if (!created) throw new BadRequestException('Cannot create post');

    this.eventBus.publish('post.created', {
      postId: created.id,
      authorId: currentUserId,
      createdAt: created.createdAt,
    });

    return {
      id: created.id,
      content: created.content,
      imageUrl: created.imageUrl,
      postType: created.postType,
      shortVideoUrl: created.shortVideoUrl,
      hidden: Boolean(Number((created as { hidden?: number }).hidden ?? 0)),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      author: {
        id: created.authorId,
        username: created.authorUsername,
        avatar: created.authorAvatar,
        bio: created.authorBio,
        isOnline: Boolean(created.authorIsOnline),
      },
    };
  }

  // ─── Feed ─────────────────────────────────────────────────────────────────

  async listFeedPosts(q: PaginationQueryDto, viewerId?: string | null) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.postRepo.listFeedPosts(skip, limit, viewerId);
    return { page, limit, total, items: items.map(i => this.mapFeedItem(i)) };
  }

  async listFriendsFeedPosts(currentUserId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.postRepo.listFriendsFeedPosts(currentUserId, skip, limit);
    return { page, limit, total, items: items.map(i => this.mapFeedItem(i)) };
  }

  async listStories(currentUserId: string) {
    const items = await this.postRepo.listStories(currentUserId);
    return {
      items: items.map(item => ({
        id: item.id,
        content: item.content,
        imageUrl: item.imageUrl,
        postType: item.postType,
        shortVideoUrl: item.shortVideoUrl,
        hidden: Boolean(Number(item.hidden ?? 0)),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        author: {
          id: item.authorId,
          username: item.authorUsername,
          avatar: item.authorAvatar,
          bio: item.authorBio,
          isOnline: Boolean(item.authorIsOnline),
        },
      })),
    };
  }

  async listShortVideos(q: PaginationQueryDto, viewerId?: string | null) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.postRepo.listShortVideos(skip, limit, viewerId);
    return {
      page, limit, total,
      items: items.map(i => this.mapFeedItem(i)),
    };
  }

  // ─── My posts / profile posts ─────────────────────────────────────────────

  async listMyPosts(currentUserId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const authorUser = await this.userRepo.findById(currentUserId);
    if (!authorUser) throw new NotFoundException('User not found');

    const { items, total } = await this.postRepo.listPostsByAuthor(currentUserId, skip, limit, true);
    return {
      page, limit, total,
      items: items.map(item => ({
        id: item.id,
        content: item.content,
        imageUrl: item.imageUrl,
        postType: item.postType,
        shortVideoUrl: item.shortVideoUrl,
        hidden: Boolean(item.hidden),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        author: {
          id: authorUser.id,
          username: authorUser.username,
          avatar: authorUser.avatar,
          bio: authorUser.bio,
          isOnline: Boolean(authorUser.isOnline),
        },
      })),
    };
  }

  async listPostsOnProfile(authorId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const authorUser = await this.userRepo.findById(authorId);
    if (!authorUser) throw new NotFoundException('User not found');

    const { items, total } = await this.postRepo.listPostsByAuthor(authorId, skip, limit, false);
    return {
      page, limit, total,
      items: items.map(item => ({
        id: item.id,
        content: item.content,
        imageUrl: item.imageUrl,
        postType: item.postType,
        shortVideoUrl: item.shortVideoUrl,
        hidden: Boolean(item.hidden),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        author: {
          id: authorUser.id,
          username: authorUser.username,
          avatar: authorUser.avatar,
          bio: authorUser.bio,
          isOnline: Boolean(authorUser.isOnline),
        },
      })),
    };
  }

  // ─── Patch / Delete post ──────────────────────────────────────────────────

  async patchMyPost(currentUserId: string, postId: string, hidden: boolean) {
    const pid = postId.trim();
    const uid = currentUserId.trim();

    const row = await this.postRepo.findPostById(pid);
    if (!row) throw new NotFoundException('Post not found');
    if (row.authorId.trim() !== uid)
      throw new ForbiddenException('Bạn không thể cập nhật bài viết của người khác.');

    const ok = await this.postRepo.setPostHiddenByAuthor(pid, uid, hidden);
    if (!ok) throw new NotFoundException('Post not found');
    return { id: pid, hidden };
  }

  async deleteMyPost(currentUserId: string, postId: string) {
    const pid = postId.trim();
    const uid = currentUserId.trim();

    const row = await this.postRepo.findPostById(pid);
    if (!row) throw new NotFoundException('Post not found');
    if (row.authorId.trim() !== uid)
      throw new ForbiddenException('Bạn không thể xóa bài viết của người khác.');

    const ok = await this.postRepo.deletePostByAuthor(pid, uid);
    if (!ok) throw new NotFoundException('Post not found');
    return { success: true };
  }

  // ─── Reactions / Share ────────────────────────────────────────────────────

  async togglePostReaction(userId: string, postId: string) {
    return this.postRepo.togglePostReaction(userId, postId);
  }

  async recordPostShare(postId: string) {
    const ok = await this.postRepo.incrementPostShare(postId);
    if (!ok) throw new NotFoundException('Post not found');
    return { ok: true };
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  async listPostComments(postId: string, q: PaginationQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.postRepo.listPostComments(postId.trim(), skip, limit);
    return {
      page, limit, total,
      items: items.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        postId: row.postId as string,
        content: row.content as string,
        createdAt: row.createdAt as Date | string,
        author: {
          id: row.authorId as string,
          username: (row.authorUsername as string) ?? '',
          avatar: (row.authorAvatar as string | null) ?? null,
        },
      })),
    };
  }

  async createPostComment(authorId: string, postId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Nội dung bình luận không được để trống.');

    const row = await this.postRepo.findPostById(postId.trim());
    if (!row || Boolean(Number(row.hidden ?? 0)))
      throw new NotFoundException('Post not found');

    const created = await this.postRepo.createPostComment(authorId, postId, trimmed);
    if (!created) throw new BadRequestException('Cannot create comment');

    return {
      id: created.id,
      postId: created.postId,
      content: created.content,
      createdAt: created.createdAt,
      author: {
        id: created.authorId,
        username: created.authorUsername ?? '',
        avatar: created.authorAvatar ?? null,
      },
    };
  }
}
