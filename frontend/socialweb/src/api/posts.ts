import type { PaginatedResponse, UserSummary } from '@/api/friends';
import { userApiClient } from '@/api/userApiClient';

export type FeedPost = {
  id: string;
  content: string;
  imageUrl?: string | null;
  postType?: 'POST' | 'SHORT_VIDEO';
  shortVideoUrl?: string | null;
  hidden?: boolean;
  createdAt: string;
  updatedAt: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  likedByMe?: boolean;
  author: UserSummary;
};

export type PostCommentItem = {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  author: Pick<UserSummary, 'id' | 'username' | 'avatar'>;
};

export type ToggleReactionResponse = {
  liked: boolean;
};

export type CreatePostPayload = {
  content: string;
  imageUrl?: string;
  postType?: 'POST' | 'SHORT_VIDEO' | 'STORY';
  shortVideoUrl?: string;
};

export type UploadMediaType = 'image' | 'video';

export type UploadMediaResponse = {
  url: string;
  publicId: string;
  resourceType: string;
  format: string;
  bytes: number;
  duration?: number | null;
};

export const createPost = async (payload: CreatePostPayload): Promise<FeedPost> => {
  const response = await userApiClient.post('/users/me/posts', payload);
  return response.data;
};

export const uploadPostMedia = async (
  file: File,
  type: UploadMediaType,
): Promise<UploadMediaResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await userApiClient.post('/users/me/uploads', formData, {
    params: { type },
  });

  return response.data;
};

export const fetchFeedPosts = async (
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<FeedPost>> => {
  const response = await userApiClient.get('/users/feed/posts', {
    params: { page, limit },
  });

  return response.data;
};

/** Bài của bạn và người bạn đang follow (cần đăng nhập). */
export const fetchFriendsFeedPosts = async (
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<FeedPost>> => {
  const response = await userApiClient.get('/users/feed/friends-posts', {
    params: { page, limit },
  });

  return response.data;
};

export const togglePostReaction = async (postId: string): Promise<ToggleReactionResponse> => {
  const response = await userApiClient.post(
    `/users/posts/${encodeURIComponent(postId)}/reactions/toggle`,
  );
  return response.data;
};

export const recordPostShare = async (postId: string): Promise<{ ok: boolean }> => {
  const response = await userApiClient.post(`/users/posts/${encodeURIComponent(postId)}/share`);
  return response.data;
};

export const fetchPostComments = async (
  postId: string,
  page = 1,
  limit = 30,
): Promise<PaginatedResponse<PostCommentItem>> => {
  const response = await userApiClient.get(`/users/posts/${encodeURIComponent(postId)}/comments`, {
    params: { page, limit },
  });
  return response.data;
};

export const createPostComment = async (postId: string, content: string): Promise<PostCommentItem> => {
  const response = await userApiClient.post(`/users/posts/${encodeURIComponent(postId)}/comments`, {
    content,
  });
  return response.data;
};

export const fetchShortVideoPosts = async (
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<FeedPost>> => {
  const response = await userApiClient.get('/users/feed/short-videos', {
    params: { page, limit },
  });

  return response.data;
};

export const fetchMyPosts = async (
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<FeedPost>> => {
  const response = await userApiClient.get('/users/me/posts', {
    params: { page, limit },
  });
  return response.data;
};

export const fetchStories = async (): Promise<{ items: FeedPost[] }> => {
  const response = await userApiClient.get('/users/feed/stories');
  return response.data;
};

export const fetchPostsByUserId = async (
  userId: string,
  page = 1,
  limit = 50,
): Promise<PaginatedResponse<FeedPost>> => {
  const response = await userApiClient.get(`/users/${encodeURIComponent(userId)}/posts`, {
    params: { page, limit },
  });
  return response.data;
};

export const patchMyPostHidden = async (postId: string, hidden: boolean): Promise<void> => {
  await userApiClient.patch(`/users/me/posts/${encodeURIComponent(postId)}`, { hidden });
};

export const deleteMyPost = async (postId: string): Promise<void> => {
  await userApiClient.delete(`/users/me/posts/${encodeURIComponent(postId)}`);
};
