import { userApiClient } from '@/api/userApiClient';

type Pagination = {
  page?: number;
  limit?: number;
};

export type UserSummary = {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
  isOnline: boolean;
};

export type FriendItem = {
  createdAt: string;
  user: UserSummary;
};

export type FriendRequestItem = {
  id: string;
  isRead: boolean;
  createdAt: string;
  fromUser: UserSummary;
};

export type PaginatedResponse<T> = {
  page: number;
  limit: number;
  total: number;
  items: T[];
};

export const fetchFriends = async (
  pagination: Pagination = {},
): Promise<PaginatedResponse<FriendItem>> => {
  const response = await userApiClient.get('/users/me/friends', {
    params: { page: pagination.page ?? 1, limit: pagination.limit ?? 20 },
  });

  return response.data;
};

export const fetchFriendRequests = async (
  pagination: Pagination = {},
): Promise<PaginatedResponse<FriendRequestItem>> => {
  const response = await userApiClient.get('/users/me/friend-requests', {
    params: { page: pagination.page ?? 1, limit: pagination.limit ?? 20 },
  });

  return response.data;
};

export const acceptFriendRequest = async (
  requestId: string,
): Promise<{ success: boolean }> => {
  const response = await userApiClient.post(
    `/users/me/friend-requests/${encodeURIComponent(requestId)}/accept`,
    {},
  );

  return response.data;
};

export const rejectFriendRequest = async (
  requestId: string,
): Promise<{ success: boolean }> => {
  const response = await userApiClient.post(
    `/users/me/friend-requests/${encodeURIComponent(requestId)}/reject`,
    {},
  );

  return response.data;
};

export const sendFriendRequest = async (
  userId: string,
): Promise<{ success: boolean }> => {
  const response = await userApiClient.post(`/users/${encodeURIComponent(userId)}/follow`, {});

  return response.data;
};

export const cancelFriendRequest = async (
  userId: string,
): Promise<{ success: boolean }> => {
  const response = await userApiClient.delete(`/users/${encodeURIComponent(userId)}/follow`);

  return response.data;
};

export const fetchFollowingIds = async (): Promise<string[]> => {
  const response = await userApiClient.get('/users/me/following-ids');

  return response.data;
};

export const fetchRecommendations = async (
  pagination: Pagination = {},
): Promise<PaginatedResponse<UserSummary>> => {
  const response = await userApiClient.get('/users/recommendations', {
    params: { page: pagination.page ?? 1, limit: pagination.limit ?? 20 },
  });

  return response.data;
};

export const searchUsers = async (
  keyword: string,
  pagination: Pagination = {},
): Promise<PaginatedResponse<UserSummary>> => {
  const response = await userApiClient.get('/users/search', {
    params: {
      username: keyword,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 50,
    },
  });

  return response.data;
};
