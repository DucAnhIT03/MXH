import api from '@/api/axios';
import { userApiClient } from '@/api/userApiClient';

const chatApiBaseUrl =
  import.meta.env.VITE_CHAT_API_BASE_URL?.trim() || 'http://localhost:3003';

export type ChatConversation = {
  id: string;
  type: 'PRIVATE' | 'GROUP';
  title: string | null;
  isGroup: boolean;
  memberIds?: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage: ChatMessage | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type ChatPaginatedResponse<T> = {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
};

export type UserProfile = {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string | null;
  isOnline?: boolean;
  updatedAt?: string;
};

export const createPrivateConversation = async (participantId: string): Promise<ChatConversation> => {
  const response = await api.post(`${chatApiBaseUrl}/chat/conversations`, {
    type: 'PRIVATE',
    participantId,
  });

  return response.data;
};

export const fetchConversations = async (
  page = 1,
  limit = 30,
): Promise<ChatPaginatedResponse<ChatConversation>> => {
  const response = await api.get(`${chatApiBaseUrl}/chat/conversations`, {
    params: { page, limit },
  });

  return response.data;
};

export const fetchConversationMessages = async (
  conversationId: string,
  page = 1,
  limit = 100,
): Promise<ChatPaginatedResponse<ChatMessage>> => {
  const response = await api.get(`${chatApiBaseUrl}/chat/conversations/${conversationId}/messages`, {
    params: { page, limit },
  });

  return response.data;
};

export const sendMessage = async (
  conversationId: string,
  content: string,
): Promise<ChatMessage> => {
  const response = await api.post(`${chatApiBaseUrl}/chat/messages`, {
    conversationId,
    content,
  });

  return response.data;
};

export const fetchUserProfile = async (userId: string): Promise<UserProfile> => {
  const response = await userApiClient.get(`/users/${encodeURIComponent(userId)}`);

  return response.data;
};
