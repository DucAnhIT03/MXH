import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../../libs/database/prisma.service';

function affectedRows(raw: unknown): number {
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'number') return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class PostRepository {
  private postsTableInitialized = false;
  private engagementSchemaInitialized = false;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Schema init ─────────────────────────────────────────────────────────

  async ensurePostsTable() {
    if (this.postsTableInitialized) {
      await this.ensurePostEngagementSchema();
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS posts (
        id CHAR(36) NOT NULL PRIMARY KEY,
        authorId CHAR(36) NOT NULL,
        content TEXT NOT NULL,
        imageUrl VARCHAR(2048) NULL,
        postType VARCHAR(32) NOT NULL DEFAULT 'POST',
        shortVideoUrl VARCHAR(2048) NULL,
        hidden TINYINT(1) NOT NULL DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_posts_authorId (authorId),
        INDEX idx_posts_createdAt (createdAt),
        INDEX idx_posts_postType (postType),
        INDEX idx_posts_hidden (hidden)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    for (const col of [
      { name: 'postType',      sql: `ALTER TABLE posts ADD COLUMN postType VARCHAR(32) NOT NULL DEFAULT 'POST' AFTER imageUrl` },
      { name: 'shortVideoUrl', sql: `ALTER TABLE posts ADD COLUMN shortVideoUrl VARCHAR(2048) NULL AFTER postType` },
      { name: 'hidden',        sql: `ALTER TABLE posts ADD COLUMN hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER shortVideoUrl` },
    ]) {
      if (!(await this.hasPostsColumn(col.name))) {
        await this.prisma.$executeRawUnsafe(col.sql);
      }
    }

    for (const idx of [
      { name: 'idx_posts_postType', sql: `ALTER TABLE posts ADD INDEX idx_posts_postType (postType)` },
      { name: 'idx_posts_hidden',   sql: `ALTER TABLE posts ADD INDEX idx_posts_hidden (hidden)` },
    ]) {
      if (!(await this.hasPostsIndex(idx.name))) {
        await this.prisma.$executeRawUnsafe(idx.sql);
      }
    }

    this.postsTableInitialized = true;
    await this.ensurePostEngagementSchema();
  }

  private async ensurePostEngagementSchema() {
    if (this.engagementSchemaInitialized) return;

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS post_reactions (
        id CHAR(36) NOT NULL PRIMARY KEY,
        postId CHAR(36) NOT NULL,
        userId CHAR(36) NOT NULL,
        reaction VARCHAR(16) NOT NULL DEFAULT 'LIKE',
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uniq_post_reactions_post_user (postId, userId),
        INDEX idx_post_reactions_postId (postId),
        INDEX idx_post_reactions_userId (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id CHAR(36) NOT NULL PRIMARY KEY,
        postId CHAR(36) NOT NULL,
        authorId CHAR(36) NOT NULL,
        content TEXT NOT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_post_comments_post_created (postId, createdAt),
        INDEX idx_post_comments_authorId (authorId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    if (!(await this.hasPostsColumn('shareCount'))) {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE posts ADD COLUMN shareCount INT NOT NULL DEFAULT 0 AFTER hidden`,
      );
    }

    this.engagementSchemaInitialized = true;
  }

  private async hasPostsColumn(columnName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ cnt: bigint | number }>>`
      SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = ${columnName}
    `;
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  private async hasPostsIndex(indexName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ cnt: bigint | number }>>`
      SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = ${indexName}
    `;
    return Number(rows[0]?.cnt ?? 0) > 0;
  }

  // ─── Post CRUD ────────────────────────────────────────────────────────────

  async createPost(
    authorId: string,
    content: string,
    imageUrl?: string | null,
    postType: 'POST' | 'SHORT_VIDEO' | 'STORY' = 'POST',
    shortVideoUrl?: string | null,
  ) {
    await this.ensurePostsTable();
    const id = randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO posts (id, authorId, content, imageUrl, postType, shortVideoUrl, hidden, shareCount)
      VALUES (${id}, ${authorId}, ${content}, ${imageUrl ?? null}, ${postType}, ${shortVideoUrl ?? null}, 0, 0)
    `;

    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
             COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt
      FROM posts p WHERE p.id = ${id} LIMIT 1
    `;
    const created = rows[0];
    if (!created) return null;

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true, username: true, avatar: true, bio: true, isOnline: true },
    });

    return {
      ...created,
      authorId: author?.id ?? authorId,
      authorUsername: author?.username ?? '',
      authorAvatar: author?.avatar ?? null,
      authorBio: author?.bio ?? null,
      authorIsOnline: author?.isOnline ?? false,
    };
  }

  async findPostById(postId: string): Promise<{ id: string; authorId: string; hidden: number } | null> {
    await this.ensurePostsTable();
    const pid = postId.trim();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; authorId: string; hidden: number }>>`
      SELECT id, authorId, COALESCE(hidden, 0) AS hidden FROM posts WHERE id = ${pid} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async deletePostByAuthor(postId: string, authorId: string): Promise<boolean> {
    await this.ensurePostsTable();
    const n = await this.prisma.$executeRaw`
      DELETE FROM posts WHERE id = ${postId.trim()} AND authorId = ${authorId.trim()}
    `;
    return affectedRows(n) > 0;
  }

  async setPostHiddenByAuthor(postId: string, authorId: string, hidden: boolean): Promise<boolean> {
    await this.ensurePostsTable();
    const n = await this.prisma.$executeRaw`
      UPDATE posts SET hidden = ${hidden ? 1 : 0}, updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ${postId.trim()} AND authorId = ${authorId.trim()}
    `;
    return affectedRows(n) > 0;
  }

  // ─── Feed queries ─────────────────────────────────────────────────────────

  private buildLikedSql(vid: string | null) {
    return vid && vid.length > 0
      ? Prisma.sql`(CASE WHEN EXISTS (SELECT 1 FROM post_reactions r WHERE r.postId = p.id AND r.userId = ${vid}) THEN 1 ELSE 0 END)`
      : Prisma.sql`0`;
  }

  private async enrichWithAuthors(items: any[]) {
    const authorIds = Array.from(new Set(items.map(i => i.authorId).filter(Boolean)));
    if (authorIds.length === 0) return items;

    const authors = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, avatar: true, bio: true, isOnline: true },
    });
    const map = new Map(authors.map(a => [a.id, a]));

    return items.map(item => {
      const author = map.get(item.authorId);
      return {
        ...item,
        authorId: author?.id ?? item.authorId,
        authorUsername: author?.username ?? '',
        authorAvatar: author?.avatar ?? null,
        authorBio: author?.bio ?? null,
        authorIsOnline: author?.isOnline ?? false,
      };
    });
  }

  async listFeedPosts(skip: number, take: number, viewerId?: string | null) {
    await this.ensurePostsTable();
    const vid = viewerId?.trim() ?? '';
    const likedSql = this.buildLikedSql(vid);

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
               COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt, p.authorId,
               COALESCE(p.shareCount, 0) AS shareCount,
               (SELECT COUNT(*) FROM post_reactions r WHERE r.postId = p.id) AS likeCount,
               (SELECT COUNT(*) FROM post_comments c WHERE c.postId = p.id) AS commentCount,
               ${likedSql} AS likedByMe
        FROM posts p
        WHERE COALESCE(p.hidden, 0) = 0
        ORDER BY p.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total FROM posts WHERE COALESCE(hidden, 0) = 0
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return { items: await this.enrichWithAuthors(items), total };
  }

  async listFriendsFeedPosts(viewerId: string, skip: number, take: number) {
    await this.ensurePostsTable();
    const vid = viewerId.trim();
    const likedSql = this.buildLikedSql(vid);

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
               COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt, p.authorId,
               COALESCE(p.shareCount, 0) AS shareCount,
               (SELECT COUNT(*) FROM post_reactions r WHERE r.postId = p.id) AS likeCount,
               (SELECT COUNT(*) FROM post_comments c WHERE c.postId = p.id) AS commentCount,
               ${likedSql} AS likedByMe
        FROM posts p
        WHERE COALESCE(p.hidden, 0) = 0
          AND (
            p.authorId = ${vid}
            OR EXISTS (
              SELECT 1 FROM follows f
              WHERE f.followerId = ${vid} AND f.followingId = p.authorId
            )
          )
        ORDER BY p.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total FROM posts p
        WHERE COALESCE(p.hidden, 0) = 0
          AND (
            p.authorId = ${vid}
            OR EXISTS (SELECT 1 FROM follows f WHERE f.followerId = ${vid} AND f.followingId = p.authorId)
          )
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return { items: await this.enrichWithAuthors(items), total };
  }

  async listShortVideos(skip: number, take: number, viewerId?: string | null) {
    await this.ensurePostsTable();
    const vid = viewerId?.trim() ?? null;
    const likedSql = this.buildLikedSql(vid);

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
               COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt, p.authorId,
               COALESCE(p.shareCount, 0) AS shareCount,
               (SELECT COUNT(*) FROM post_reactions r WHERE r.postId = p.id) AS likeCount,
               (SELECT COUNT(*) FROM post_comments c WHERE c.postId = p.id) AS commentCount,
               ${likedSql} AS likedByMe
        FROM posts p
        WHERE p.postType = 'SHORT_VIDEO' AND p.shortVideoUrl IS NOT NULL
          AND COALESCE(p.hidden, 0) = 0
        ORDER BY p.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total FROM posts
        WHERE postType = 'SHORT_VIDEO' AND shortVideoUrl IS NOT NULL AND COALESCE(hidden, 0) = 0
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return { items: await this.enrichWithAuthors(items), total };
  }

  async listStories(viewerId: string) {
    await this.ensurePostsTable();
    const vid = viewerId.trim();

    const items = await this.prisma.$queryRaw<Array<any>>`
      SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
             COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt, p.authorId
      FROM posts p
      WHERE p.postType = 'STORY' AND COALESCE(p.hidden, 0) = 0
        AND p.createdAt >= NOW() - INTERVAL 24 HOUR
        AND (
          p.authorId = ${vid}
          OR EXISTS (SELECT 1 FROM follows f WHERE f.followerId = ${vid} AND f.followingId = p.authorId)
        )
      ORDER BY p.createdAt DESC
    `;

    return await this.enrichWithAuthors(items);
  }

  async listPostsByAuthor(authorId: string, skip: number, take: number, includeHidden: boolean) {
    await this.ensurePostsTable();
    const whereHidden = includeHidden ? Prisma.sql`` : Prisma.sql`AND COALESCE(p.hidden, 0) = 0`;
    const countHidden = includeHidden ? Prisma.sql`` : Prisma.sql`AND COALESCE(hidden, 0) = 0`;

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT p.id, p.content, p.imageUrl, p.postType, p.shortVideoUrl,
               COALESCE(p.hidden, 0) AS hidden, p.createdAt, p.updatedAt, p.authorId
        FROM posts p
        WHERE p.authorId = ${authorId} ${whereHidden}
        ORDER BY p.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total FROM posts WHERE authorId = ${authorId} ${countHidden}
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return {
      items: items.map(item => ({ ...item, hidden: Boolean(Number(item.hidden)) })),
      total,
    };
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  async togglePostReaction(userId: string, postId: string): Promise<{ liked: boolean }> {
    await this.ensurePostsTable();
    const pid = postId.trim();
    const uid = userId.trim();

    const del = await this.prisma.$executeRaw`
      DELETE FROM post_reactions WHERE postId = ${pid} AND userId = ${uid}
    `;
    if (affectedRows(del) > 0) return { liked: false };

    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO post_reactions (id, postId, userId, reaction) VALUES (${id}, ${pid}, ${uid}, 'LIKE')
    `;
    return { liked: true };
  }

  async incrementPostShare(postId: string): Promise<boolean> {
    await this.ensurePostsTable();
    const n = await this.prisma.$executeRaw`
      UPDATE posts SET shareCount = COALESCE(shareCount, 0) + 1, updatedAt = CURRENT_TIMESTAMP(3)
      WHERE id = ${postId.trim()} AND COALESCE(hidden, 0) = 0
    `;
    return affectedRows(n) > 0;
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  async listPostComments(postId: string, skip: number, take: number) {
    await this.ensurePostsTable();
    const pid = postId.trim();

    const [items, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<any>>`
        SELECT c.id, c.postId, c.authorId, c.content, c.createdAt,
               u.username AS authorUsername, u.avatar AS authorAvatar
        FROM post_comments c
        INNER JOIN users u ON u.id = c.authorId
        WHERE c.postId = ${pid}
        ORDER BY c.createdAt DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*) AS total FROM post_comments WHERE postId = ${pid}
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    return { items, total };
  }

  async createPostComment(authorId: string, postId: string, content: string) {
    await this.ensurePostsTable();
    const id = randomUUID();
    const pid = postId.trim();
    const uid = authorId.trim();

    await this.prisma.$executeRaw`
      INSERT INTO post_comments (id, postId, authorId, content) VALUES (${id}, ${pid}, ${uid}, ${content.trim()})
    `;

    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT c.id, c.postId, c.authorId, c.content, c.createdAt,
             u.username AS authorUsername, u.avatar AS authorAvatar
      FROM post_comments c INNER JOIN users u ON u.id = c.authorId
      WHERE c.id = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
