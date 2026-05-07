import { userApiClient } from '@/api/userApiClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string;
  username: string;
  avatar?: string | null;
  cover?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  email?: string;
};

export type UpdateProfilePayload = {
  username?: string;
  bio?: string;
  avatar?: string;
  cover?: string;
};

export type FriendItem = {
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatar?: string | null;
    bio?: string | null;
    isOnline: boolean;
  };
};

export type PaginatedResponse<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

// ── Profile APIs ──────────────────────────────────────────────────────────────

/** Lấy profile của user hiện tại (cần Bearer token) */
export const getMe = async (): Promise<UserProfile> => {
  const res = await userApiClient.get('/users/me');
  return res.data;
};

/** Lấy profile theo userId (public) */
export const getProfile = async (userId: string): Promise<UserProfile> => {
  const res = await userApiClient.get(`/users/${encodeURIComponent(userId)}`);
  return res.data;
};

/** Cập nhật profile: username, bio, avatar URL, cover URL */
export const updateProfile = async (
  data: UpdateProfilePayload,
): Promise<UserProfile> => {
  const res = await userApiClient.patch('/users/me', data);
  return res.data;
};

// ── Upload API ────────────────────────────────────────────────────────────────

/**
 * Upload file ảnh / video lên Cloudinary thông qua backend.
 * @returns URL công khai của file vừa upload
 */
export const uploadMedia = async (
  file: File,
  type: 'image' | 'video' = 'image',
): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await userApiClient.post('/users/me/uploads', formData, {
    params: { type },
  });
  return { url: res.data.url };
};

// ── Friends APIs ──────────────────────────────────────────────────────────────

/** Danh sách bạn bè (mutual follow) */
export const getFriends = async (
  page = 1,
  limit = 6,
): Promise<PaginatedResponse<FriendItem>> => {
  const res = await userApiClient.get('/users/me/friends', {
    params: { page, limit },
  });
  return res.data;
};

// ── Follower / Following APIs ─────────────────────────────────────────────────

/** Đếm số người theo dõi userId */
export const getFollowers = async (
  userId: string,
  page = 1,
  limit = 1,
): Promise<PaginatedResponse<any>> => {
  const res = await userApiClient.get(`/users/${encodeURIComponent(userId)}/followers`, {
    params: { page, limit },
  });
  return res.data;
};

/** Đếm số người userId đang theo dõi */
export const getFollowing = async (
  userId: string,
  page = 1,
  limit = 1,
): Promise<PaginatedResponse<any>> => {
  const res = await userApiClient.get(`/users/${encodeURIComponent(userId)}/following`, {
    params: { page, limit },
  });
  return res.data;
};
