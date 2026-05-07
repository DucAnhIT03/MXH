import { Search, Bell, MessageCircle, LogOut, ChevronDown, Edit, Maximize2, MoreHorizontal, Users, UserCheck, UserX, Loader2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useUser } from '@/features/auth/context/UserContext';
import { fetchConversations } from '@/api/chat';
import { fetchFriends } from '@/api/friends';
import { userApiClient } from '@/api/userApiClient';
import type { ChatConversation } from '@/api/chat';
import type { FriendItem } from '@/api/friends';
import { getCallLogPreview } from '@/utils/callLog';

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=10B981&color=fff&size=100&name=';
const IMAGE_PREFIX = '[IMG]';
const VOICE_PREFIX = '[VOICE]';

type FriendRequest = {
  id: string;
  isRead: boolean;
  createdAt: string;
  fromUser: {
    id: string;
    username: string;
    avatar: string | null;
    bio: string | null;
    isOnline: boolean;
  };
};

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  return `${Math.floor(diff / 86400)} ngày`;
}

export default function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isMsgMenuOpen, setIsMsgMenuOpen] = useState(false);
  const [isBellMenuOpen, setIsBellMenuOpen] = useState(false);

  // Conversations
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [friendMap, setFriendMap] = useState<Map<string, FriendItem['user']>>(new Map());
  const [convLoading, setConvLoading] = useState(false);

  // Notifications (friend requests)
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const msgMenuRef = useRef<HTMLDivElement>(null);
  const bellMenuRef = useRef<HTMLDivElement>(null);

  const avatarSrc = user?.avatar
    ? user.avatar
    : `${DEFAULT_AVATAR}${encodeURIComponent(user?.username ?? 'U')}`;

  const unreadCount = friendRequests.filter(r => !r.isRead).length;

  /* ── Load conversations ── */
  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const firstPage = await fetchConversations(1, 50);
      let mergedItems = [...(firstPage.items ?? [])];
      const total = firstPage.total ?? mergedItems.length;
      let currentPage = 2;
      while (mergedItems.length < total) {
        const nextPage = await fetchConversations(currentPage, 50).catch(() => null);
        if (!nextPage?.items?.length) break;
        mergedItems = mergedItems.concat(nextPage.items);
        currentPage += 1;
      }
      setConvs(mergedItems);
      const friendRes = await fetchFriends({ limit: 300 }).catch(() => null);
      if (friendRes?.items?.length) {
        const map = new Map<string, FriendItem['user']>();
        friendRes.items.forEach(f => map.set(f.user.id, f.user));
        setFriendMap(map);
      }
    } catch {
      setConvs([]);
    } finally {
      setConvLoading(false);
    }
  }, []);

  /* ── Load friend requests (notifications) ── */
  const loadFriendRequests = useCallback(async () => {
    if (!user?.id) return;
    setNotifLoading(true);
    try {
      const res = await userApiClient.get('/users/me/friend-requests', {
        params: { page: 1, limit: 20 },
      });
      setFriendRequests(res.data?.items ?? []);
    } catch {
      setFriendRequests([]);
    } finally {
      setNotifLoading(false);
    }
  }, [user?.id]);

  /* ── Accept friend request ── */
  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await userApiClient.post(`/users/me/friend-requests/${requestId}/accept`);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      // giữ nguyên
    } finally {
      setProcessingId(null);
    }
  };

  /* ── Reject friend request ── */
  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await userApiClient.post(`/users/me/friend-requests/${requestId}/reject`);
      setFriendRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {
      // giữ nguyên
    } finally {
      setProcessingId(null);
    }
  };

  const getSearchPlaceholder = () => {
    const path = location.pathname;
    if (path.startsWith('/friends')) return 'Tìm kiếm bạn bè...';
    if (path.startsWith('/messages')) return 'Tìm kiếm tin nhắn...';
    if (path.startsWith('/explore')) return 'Tìm kiếm người ấy...';
    if (path.startsWith('/profile')) return 'Tìm kiếm trên trang cá nhân...';
    if (path.startsWith('/notifications')) return 'Tìm kiếm thông báo...';
    if (path.startsWith('/video')) return 'Tìm kiếm video...';
    if (path.startsWith('/settings')) return 'Tìm kiếm cài đặt...';
    return 'Tìm kiếm trên mạng xã hội...';
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      if (msgMenuRef.current && !msgMenuRef.current.contains(e.target as Node)) {
        setIsMsgMenuOpen(false);
      }
      if (bellMenuRef.current && !bellMenuRef.current.contains(e.target as Node)) {
        setIsBellMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load notifications khi mount (nếu đã đăng nhập)
  useEffect(() => {
    if (user?.id) void loadFriendRequests();
  }, [user?.id, loadFriendRequests]);

  // Get other participant's info for private conv
  const getConvInfo = (conv: ChatConversation) => {
    const myId = user?.id ?? '';
    if (conv.isGroup) {
      return { name: conv.title ?? 'Nhóm chat', avatar: null, isOnline: false, isGroup: true, profileId: '' };
    }
    const otherId = (conv.memberIds ?? []).find(id => id !== myId) ?? '';
    const friend = friendMap.get(otherId);
    return {
      name: friend?.username ?? 'Người dùng',
      avatar: friend?.avatar ?? null,
      isOnline: friend?.isOnline ?? false,
      isGroup: false,
      profileId: otherId,
    };
  };

  return (
    <header className="h-16 bg-[#1A1A1A] border-b border-[#2A2A2A] flex items-center justify-between px-6 shrink-0 relative z-50">
      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder={getSearchPlaceholder()}
          className="block w-full pl-10 pr-3 py-2 border border-transparent rounded-full leading-5 bg-[#2A2A2A] text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-[#333333] focus:border-gray-600 sm:text-sm transition-colors"
        />
      </div>

      <div className="flex items-center space-x-2 ml-4">

        {/* ── Bell (Notification Dropdown) ── */}
        <div className="relative" ref={bellMenuRef}>
          <button
            onClick={() => {
              const next = !isBellMenuOpen;
              setIsBellMenuOpen(next);
              setIsProfileMenuOpen(false);
              setIsMsgMenuOpen(false);
              if (next) void loadFriendRequests();
            }}
            className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              isBellMenuOpen
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-[#2A2A2A] hover:bg-[#333] text-gray-300 hover:text-white'
            }`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-[#1A1A1A]" />
            )}
          </button>

          {isBellMenuOpen && (
            <div className="absolute top-12 right-0 mt-1 w-[380px] bg-[#242526] rounded-2xl shadow-2xl border border-[#3A3B3C] flex flex-col max-h-[calc(100vh-80px)] overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 shrink-0 border-b border-[#3A3B3C]">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Thông báo</h2>
                  <Link
                    to="/notifications"
                    onClick={() => setIsBellMenuOpen(false)}
                    className="text-sm text-yellow-400 hover:underline font-medium"
                  >
                    Xem tất cả
                  </Link>
                </div>
                {unreadCount > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{unreadCount} lời mời kết bạn chưa xử lý</p>
                )}
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {notifLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                ) : friendRequests.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-sm">
                    <Bell className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    Không có thông báo mới
                  </div>
                ) : (
                  friendRequests.map(req => (
                    <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#3A3B3C] transition-colors">
                      <img
                        src={req.fromUser.avatar || `${DEFAULT_AVATAR}${encodeURIComponent(req.fromUser.username)}`}
                        alt={req.fromUser.username}
                        className="w-12 h-12 rounded-full object-cover shrink-0 cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => { setIsBellMenuOpen(false); navigate(`/profile?userId=${req.fromUser.id}`); }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200">
                          <span className="font-semibold text-white">{req.fromUser.username}</span>
                          {' '}đã gửi lời mời kết bạn
                        </p>
                        <p className="text-xs text-yellow-400 mt-0.5">{timeAgo(req.createdAt)}</p>
                        <div className="flex gap-2 mt-2">
                          <button
                            disabled={processingId === req.id}
                            onClick={() => void handleAccept(req.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            {processingId === req.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <UserCheck className="w-3 h-3" />}
                            Chấp nhận
                          </button>
                          <button
                            disabled={processingId === req.id}
                            onClick={() => void handleReject(req.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3A3B3C] hover:bg-[#4E4F50] text-gray-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            <UserX className="w-3 h-3" />
                            Từ chối
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-[#3A3B3C] shrink-0 text-center">
                <Link
                  to="/notifications"
                  onClick={() => setIsBellMenuOpen(false)}
                  className="text-yellow-400 hover:underline font-semibold text-[15px]"
                >
                  Xem tất cả thông báo
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Messages Dropdown ── */}
        <div className="relative" ref={msgMenuRef}>
          <button
            onClick={() => {
              const next = !isMsgMenuOpen;
              setIsMsgMenuOpen(next);
              setIsProfileMenuOpen(false);
              setIsBellMenuOpen(false);
              if (next) loadConversations();
            }}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              isMsgMenuOpen
                ? 'bg-emerald-600/20 text-emerald-400'
                : 'bg-[#2A2A2A] hover:bg-[#333] text-gray-300 hover:text-white'
            }`}
          >
            <svg viewBox="0 0 28 28" fill="currentColor" height="20" width="20">
              <path d="M14 2.042c-6.76 0-12 4.952-12 11.64 0 3.542 1.635 6.702 4.181 8.855.226.192.364.475.364.774v2.793c0 .546.618.86 1.06.535l3.111-2.285c.22-.162.488-.236.758-.214C12.604 24.307 13.294 24.359 14 24.359c6.76 0 12-4.952 12-11.64 0-6.688-5.24-11.64-12-11.64zM15.34 17.56l-2.61-2.783a1.2 1.2 0 0 0-1.63-.12l-3.37 2.535c-.47.353-1.09-.23-1.09-.23l4.67-5.013a1.2 1.2 0 0 1 1.63-.12l2.61 2.783a1.2 1.2 0 0 0 1.63.12l3.37-2.535c.47-.353 1.09.23 1.09.23l-4.67 5.013a1.2 1.2 0 0 1-1.63.12z"/>
            </svg>
          </button>

          {isMsgMenuOpen && (
            <div className="absolute top-12 right-0 mt-1 w-[360px] bg-[#242526] rounded-2xl shadow-2xl border border-[#3A3B3C] flex flex-col max-h-[calc(100vh-80px)] overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-2 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-2xl font-bold text-white">Đoạn chat</h2>
                  <div className="flex gap-1">
                    <button className="w-9 h-9 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] flex items-center justify-center text-gray-300 transition-colors">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                    <button className="w-9 h-9 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] flex items-center justify-center text-gray-300 transition-colors">
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <Link
                      to="/messages"
                      onClick={() => setIsMsgMenuOpen(false)}
                      className="w-9 h-9 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] flex items-center justify-center text-gray-300 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm trên Messenger"
                    className="w-full bg-[#3A3B3C] border-none rounded-full pl-9 pr-4 py-2 text-[15px] focus:outline-none text-gray-200 placeholder-gray-500"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 font-semibold rounded-full text-[14px]">Tất cả</button>
                  <button className="px-3 py-1.5 hover:bg-[#3A3B3C] text-gray-300 font-semibold rounded-full text-[14px] transition-colors">Chưa đọc</button>
                  <button className="px-3 py-1.5 hover:bg-[#3A3B3C] text-gray-300 font-semibold rounded-full text-[14px] transition-colors">Nhóm</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
                {convLoading ? (
                  [1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                      <div className="w-14 h-14 rounded-full bg-[#3A3B3C] shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-[#3A3B3C] rounded w-2/3" />
                        <div className="h-3 bg-[#3A3B3C] rounded w-1/2" />
                      </div>
                    </div>
                  ))
                ) : convs.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-sm">
                    <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    Chưa có cuộc hội thoại nào
                  </div>
                ) : (
                  convs.map(conv => {
                    const info = getConvInfo(conv);
                    const avatarUrl = info.avatar
                      ? info.avatar
                      : `${DEFAULT_AVATAR}${encodeURIComponent(info.name)}`;
                    const lastMsg = conv.lastMessage;
                    const myId = user?.id ?? '';
                    const isFromMe = lastMsg?.senderId === myId;
                    const callPreview = getCallLogPreview(lastMsg?.content, isFromMe);
                    const imagePreview = lastMsg?.content?.startsWith(IMAGE_PREFIX)
                      ? (isFromMe ? 'Bạn đã gửi một ảnh' : 'Đã gửi một ảnh')
                      : null;
                    const voicePreview = lastMsg?.content?.startsWith(VOICE_PREFIX)
                      ? (isFromMe ? 'Bạn đã gửi tin nhắn thoại' : 'Đã gửi tin nhắn thoại')
                      : null;

                    return (
                      <button
                        key={conv.id}
                        onClick={() => { setIsMsgMenuOpen(false); navigate('/messages', { state: { openConvId: conv.id } }); }}
                        className="w-full flex items-center gap-3 p-2 hover:bg-[#3A3B3C] rounded-xl cursor-pointer transition-colors text-left"
                      >
                        <div className="relative shrink-0">
                          {info.isGroup ? (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
                              <Users className="w-7 h-7 text-white" />
                            </div>
                          ) : (
                            <img
                              src={avatarUrl}
                              alt={info.name}
                              className="w-14 h-14 rounded-full object-cover cursor-pointer"
                              referrerPolicy="no-referrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (info.profileId) { setIsMsgMenuOpen(false); navigate(`/profile?userId=${info.profileId}`); }
                              }}
                            />
                          )}
                          {info.isOnline && (
                            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-[#242526] rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[15px] text-white truncate">{info.name}</p>
                          <div className="flex items-center text-[13px] text-gray-400 gap-1">
                            <span className="truncate flex-1">
                              {lastMsg
                                ? (callPreview || imagePreview || voicePreview || (isFromMe ? `Bạn: ${lastMsg.content}` : lastMsg.content))
                                : 'Hãy bắt đầu cuộc trò chuyện'}
                            </span>
                            {lastMsg && (
                              <>
                                <span className="shrink-0">·</span>
                                <span className="shrink-0 text-[12px]">{timeAgo(lastMsg.createdAt)}</span>
                              </>
                            )}
                          </div>
                        </div>
                        {!lastMsg && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-3 border-t border-[#3A3B3C] shrink-0 text-center">
                <Link
                  to="/messages"
                  onClick={() => setIsMsgMenuOpen(false)}
                  className="text-emerald-400 hover:underline font-semibold text-[15px]"
                >
                  Xem tất cả trong Messenger
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* ── Profile Dropdown ── */}
        <div className="relative" ref={profileMenuRef}>
          <div
            onClick={() => { setIsProfileMenuOpen(!isProfileMenuOpen); setIsMsgMenuOpen(false); setIsBellMenuOpen(false); }}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <div className="h-9 w-9 rounded-full bg-gray-700 overflow-hidden border-2 border-gray-600 hover:border-emerald-500 transition-colors">
              <img src={avatarSrc} alt={user?.username ?? 'Profile'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
          </div>

          {isProfileMenuOpen && (
            <div className="absolute top-12 right-0 w-64 bg-[#2A2A2A] rounded-xl shadow-xl border border-[#3A3A3A] overflow-hidden py-2">
              <Link
                to="/profile"
                onClick={() => setIsProfileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#333333] transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-gray-700 overflow-hidden shrink-0 border border-gray-600">
                  <img src={avatarSrc} alt={user?.username ?? 'Profile'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <div className="font-semibold text-white text-[15px]">{user?.username ?? 'Cá nhân'}</div>
                  <div className="text-sm text-gray-400">Xem trang cá nhân của bạn</div>
                </div>
              </Link>
              <div className="h-px bg-[#3A3A3A] my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#333333] transition-colors text-left text-gray-300 hover:text-white"
              >
                <div className="h-9 w-9 rounded-full bg-[#3A3A3A] flex items-center justify-center shrink-0">
                  <LogOut className="w-5 h-5" />
                </div>
                <span className="font-semibold text-[15px]">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
