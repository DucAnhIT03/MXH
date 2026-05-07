import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, Video, MessageSquare, Search } from 'lucide-react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  fetchFollowingIds,
  fetchRecommendations,
  fetchFriendRequests,
  fetchFriends,
  FriendItem,
  FriendRequestItem,
  rejectFriendRequest,
  searchUsers,
  sendFriendRequest,
  UserSummary,
} from '@/api/friends';
import { createPrivateConversation } from '@/api/chat';
import { useNavigate } from 'react-router-dom';

type RankedSearchItem = {
  user: UserSummary;
  score: number;
  reasons: string[];
};

export default function Friends() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequestItem[]>([]);
  const [recommendations, setRecommendations] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<RankedSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sendingRequestUserIds, setSendingRequestUserIds] = useState<string[]>([]);
  const [openingMessageUserIds, setOpeningMessageUserIds] = useState<string[]>([]);
  const [openingAudioCallUserIds, setOpeningAudioCallUserIds] = useState<string[]>([]);
  const [openingVideoCallUserIds, setOpeningVideoCallUserIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  const getStoredToken = useCallback(
    () => localStorage.getItem('accessToken') ?? localStorage.getItem('token'),
    [],
  );

  const handleAuthMismatch = useCallback((message?: string) => {
    if (message !== 'Current user not found') {
      return false;
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('token');
    navigate('/login');
    return true;
  }, [navigate]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent ?? false;

    if (!getStoredToken()) {
      navigate('/login');
      return;
    }

    if (!isSilent) {
      setIsLoading(true);
      setError('');
    }

    try {
      const [friendsResponse, requestsResponse, recommendationsResponse, followingIdsResponse] = await Promise.all([
        fetchFriends({ page: 1, limit: 20 }),
        fetchFriendRequests({ page: 1, limit: 20 }),
        fetchRecommendations({ page: 1, limit: 50 }).catch(() => ({
          page: 1,
          limit: 50,
          total: 0,
          items: [],
        })),
        fetchFollowingIds().catch(() => [] as string[]),
      ]);
      setFriends(friendsResponse.items);
      setRequests(requestsResponse.items);
      setRecommendations(recommendationsResponse.items);
      setFollowingIds(followingIdsResponse);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login');
        return;
      }

      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }

      if (!isSilent) {
        setError(Array.isArray(message) ? message.join(', ') : message || 'Không tải được danh sách bạn bè');
      }
    } finally {
      if (!isSilent) {
        setIsLoading(false);
      }
    }
  }, [getStoredToken, handleAuthMismatch, navigate]);

  const buildRankedResults = (
    keyword: string,
    candidates: UserSummary[],
  ): RankedSearchItem[] => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return [];
    }

    const terms = normalizedKeyword
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);

    const directFriendMap = new Map(friends.map((friend) => [friend.user.id, friend.user]));
    const requestMap = new Map(requests.map((request) => [request.fromUser.id, request.fromUser]));
    const recommendationIndexMap = new Map<string, number>(
      recommendations.map((user, index) => [user.id, index]),
    );

    const locationKeywords = [
      'hanoi',
      'ha noi',
      'tphcm',
      'ho chi minh',
      'da nang',
      'hai phong',
      'can tho',
    ];

    return candidates
      .map((user) => {
        const reasons: string[] = [];
        let score = 0;

        const username = user.username.toLowerCase();
        const bio = (user.bio || '').toLowerCase();

        // 1) Bạn bè trực tiếp
        if (directFriendMap.has(user.id)) {
          score += 1_000_000;
          reasons.push('Bạn bè trực tiếp');
        }

        // 2) Bạn chung
        const recommendationIndex = recommendationIndexMap.get(user.id);
        if (recommendationIndex !== undefined) {
          score += 500_000 - recommendationIndex * 100;
          reasons.push('Bạn chung / gợi ý kết nối');
        }

        // 3) Thông tin cá nhân trùng khớp (tạm thời dựa trên bio)
        const profileMatchCount = terms.reduce((count, term) => {
          return bio.includes(term) ? count + 1 : count;
        }, 0);
        if (profileMatchCount > 0) {
          score += 100_000 + profileMatchCount * 500;
          reasons.push('Thông tin cá nhân trùng khớp');
        }

        // 4) Tương tác trước đó (tạm thời: đã có lời mời kết bạn)
        if (requestMap.has(user.id)) {
          score += 70_000;
          reasons.push('Đã từng tương tác (lời mời kết bạn)');
        }

        // 5) Số điện thoại / email liên kết: chưa có dữ liệu trên schema hiện tại

        // 6) Vị trí địa lý gần nhau (tạm thời: heuristic qua bio + từ khóa địa điểm)
        const hasLocationTerm = locationKeywords.some(
          (location) => normalizedKeyword.includes(location) && bio.includes(location),
        );
        if (hasLocationTerm) {
          score += 40_000;
          reasons.push('Vị trí địa lý gần nhau');
        }

        // 7) Độ phổ biến tài khoản (proxy theo thứ tự recommendation)
        if (recommendationIndex !== undefined) {
          score += 20_000 - recommendationIndex * 10;
          reasons.push('Độ phổ biến tài khoản');
        }

        // 8) Độ khớp với từ khóa tìm kiếm
        if (username === normalizedKeyword) {
          score += 10_000;
          reasons.push('Khớp chính xác từ khóa');
        } else if (username.startsWith(normalizedKeyword)) {
          score += 8_000;
          reasons.push('Username bắt đầu bằng từ khóa');
        } else if (username.includes(normalizedKeyword)) {
          score += 6_000;
          reasons.push('Username chứa từ khóa');
        }

        const termMatchCount = terms.reduce((count, term) => {
          return username.includes(term) || bio.includes(term) ? count + 1 : count;
        }, 0);
        score += termMatchCount * 200;

        return {
          user,
          score,
          reasons,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadData({ silent: true });
    }, 5000);

    const onWindowFocus = () => {
      void loadData({ silent: true });
    };

    const onVisibilityChange = () => {
      if (!document.hidden) {
        void loadData({ silent: true });
      }
    };

    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadData]);

  useEffect(() => {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [searchResponse, freshRecommendations] = await Promise.all([
          searchUsers(keyword, { page: 1, limit: 50 }),
          fetchRecommendations({ page: 1, limit: 50 }).catch(() => ({
            page: 1,
            limit: 50,
            total: 0,
            items: [] as UserSummary[],
          })),
        ]);

        const mergedMap = new Map<string, UserSummary>();

        searchResponse.items.forEach((user) => mergedMap.set(user.id, user));
        friends.forEach((friend) => {
          const username = friend.user.username.toLowerCase();
          if (username.includes(keyword.toLowerCase())) {
            mergedMap.set(friend.user.id, friend.user);
          }
        });
        requests.forEach((request) => {
          const username = request.fromUser.username.toLowerCase();
          if (username.includes(keyword.toLowerCase())) {
            mergedMap.set(request.fromUser.id, request.fromUser);
          }
        });
        freshRecommendations.items.forEach((user) => {
          const username = user.username.toLowerCase();
          const bio = (user.bio || '').toLowerCase();
          if (username.includes(keyword.toLowerCase()) || bio.includes(keyword.toLowerCase())) {
            mergedMap.set(user.id, user);
          }
        });

        setRecommendations(freshRecommendations.items);
        setSearchResults(buildRankedResults(keyword, Array.from(mergedMap.values())));
      } catch (err: any) {
        const message = err?.response?.data?.message;
        setError(Array.isArray(message) ? message.join(', ') : message || 'Không tìm kiếm được người dùng');
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [searchKeyword, friends, requests]);

  const handleAccept = async (id: string) => {
    try {
      await acceptFriendRequest(id);
      const acceptedRequest = requests.find((req) => req.id === id);

      setRequests((prev) => prev.filter((req) => req.id !== id));

      if (acceptedRequest) {
        const now = new Date().toISOString();

        setFollowingIds((prev) => (
          prev.includes(acceptedRequest.fromUser.id)
            ? prev
            : [...prev, acceptedRequest.fromUser.id]
        ));

        setFriends((prev) => {
          const alreadyFriend = prev.some((friend) => friend.user.id === acceptedRequest.fromUser.id);
          if (alreadyFriend) {
            return prev;
          }

          return [
            {
              createdAt: now,
              user: acceptedRequest.fromUser,
            },
            ...prev,
          ];
        });
      }
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không chấp nhận được lời mời');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectFriendRequest(id);
      setRequests((prev) => prev.filter((req) => req.id !== id));
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không từ chối được lời mời');
    }
  };

  const handleSendFriendRequest = async (userId: string) => {
    setError('');
    setSendingRequestUserIds((prev) => [...prev, userId]);
    try {
      if (sentRequestUserIds.has(userId)) {
        await cancelFriendRequest(userId);
        setFollowingIds((prev) => prev.filter((id) => id !== userId));
      } else {
        await sendFriendRequest(userId);
        setFollowingIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
      }
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không cập nhật được lời mời kết bạn');
    } finally {
      setSendingRequestUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const handleOpenMessages = async (userId: string) => {
    setError('');
    setOpeningMessageUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      const conversation = await createPrivateConversation(userId);
      navigate(`/messages?userId=${userId}&conversationId=${conversation.id}`);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không mở được cuộc trò chuyện');
    } finally {
      setOpeningMessageUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const goToProfile = (userId: string) => {
    navigate(`/profile?userId=${userId}`);
  };

  const handleOpenAudioCall = async (userId: string) => {
    setError('');
    setOpeningAudioCallUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      const conversation = await createPrivateConversation(userId);
      navigate(`/audio-call?userId=${userId}&conversationId=${conversation.id}&mode=caller`);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không tạo được cuộc gọi thoại');
    } finally {
      setOpeningAudioCallUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const handleOpenVideoCall = async (userId: string) => {
    setError('');
    setOpeningVideoCallUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    try {
      const conversation = await createPrivateConversation(userId);
      navigate(`/video-call?userId=${userId}&conversationId=${conversation.id}&mode=caller`);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      if (handleAuthMismatch(Array.isArray(message) ? message[0] : message)) {
        return;
      }
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không tạo được cuộc gọi video');
    } finally {
      setOpeningVideoCallUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const onlineContacts = friends
    .filter((friend) => friend.user.isOnline)
    .map((friend) => friend.user);

  const showSearchResults = searchKeyword.trim().length > 0;

  const friendIds = useMemo(() => new Set(friends.map((friend) => friend.user.id)), [friends]);
  const incomingRequestFromUserIds = useMemo(
    () => new Set(requests.map((request) => request.fromUser.id)),
    [requests],
  );
  const sentRequestUserIds = useMemo(
    () => new Set(followingIds.filter((id) => !friendIds.has(id))),
    [followingIds, friendIds],
  );

  const rankingNotes = useMemo(
    () => [
      '1. Bạn bè trực tiếp',
      '2. Bạn chung (từ gợi ý)',
      '3. Thông tin cá nhân trùng khớp (bio)',
      '4. Tương tác trước đó (lời mời kết bạn)',
      '5. Số điện thoại/email: chưa có dữ liệu',
      '6. Vị trí địa lý: heuristic theo bio',
      '7. Độ phổ biến tài khoản: proxy theo gợi ý',
      '8. Độ khớp từ khóa: username/bio',
    ],
    [],
  );

  return (
    <div className="flex h-full gap-6">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <h1 className="text-2xl font-bold text-white mb-6">Bạn bè & Lời mời</h1>
        
        <div className="flex border-b border-[#2A2A2A] mb-6">
          <button className="px-6 py-3 text-blue-500 border-b-2 border-blue-500 font-medium">Bạn bè</button>
          <button className="px-6 py-3 text-gray-400 hover:text-white font-medium transition-colors">Nhóm & Bạn bè</button>
        </div>

        <div className="mb-5 rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-4">
          <label className="mb-2 block text-sm font-medium text-gray-300">
            Tìm kiếm người dùng
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Nhập tên, username, thông tin cá nhân..."
              className="w-full rounded-xl border border-[#2A2A2A] bg-[#121212] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="mt-3 text-xs text-gray-500">
            {rankingNotes.join(' | ')}
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {isLoading && <p className="mb-6 text-sm text-gray-400">Đang tải dữ liệu...</p>}

        {showSearchResults && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-semibold text-white">Kết quả tìm kiếm</h2>
            {isSearching && <p className="mb-3 text-sm text-gray-400">Đang tìm kiếm...</p>}
            {!isSearching && searchResults.length === 0 && (
              <p className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3 text-sm text-gray-400">
                Không tìm thấy người dùng phù hợp.
              </p>
            )}

            <div className="space-y-3">
              {searchResults.map((item) => (
                <div
                  key={item.user.id}
                  className="rounded-xl border border-[#2A2A2A] bg-[#1A1A1A] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.user.avatar || `https://picsum.photos/seed/${item.user.id}/48/48`}
                        alt={item.user.username}
                        className="h-12 w-12 rounded-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => goToProfile(item.user.id)}
                      />
                      <div>
                        <p
                          className="font-medium text-white cursor-pointer hover:underline"
                          onClick={() => goToProfile(item.user.id)}
                        >
                          {item.user.username}
                        </p>
                        <p className="text-xs text-gray-400">{item.user.bio || 'Chưa cập nhật bio'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Điểm: {item.score}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.reasons.slice(0, 4).map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => void handleSendFriendRequest(item.user.id)}
                      disabled={
                        friendIds.has(item.user.id) ||
                        incomingRequestFromUserIds.has(item.user.id) ||
                        sendingRequestUserIds.includes(item.user.id)
                      }
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {friendIds.has(item.user.id)
                        ? 'Đã là bạn bè'
                        : sendingRequestUserIds.includes(item.user.id)
                          ? 'Đang cập nhật...'
                        : incomingRequestFromUserIds.has(item.user.id)
                          ? 'Đã có lời mời'
                          : sentRequestUserIds.has(item.user.id)
                            ? 'Đã gửi lời mời (bấm để hủy)'
                            : 'Gửi lời mời kết bạn'}
                    </button>
                    <button
                      onClick={() => void handleOpenMessages(item.user.id)}
                      disabled={openingMessageUserIds.includes(item.user.id)}
                      className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-white hover:bg-[#2A2A2A] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {openingMessageUserIds.includes(item.user.id) ? 'Đang mở chat...' : 'Nhắn tin'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showSearchResults && recommendations.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-bold text-white">Gợi ý kết bạn</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations
                .filter(recUser => 
                  !friendIds.has(recUser.id) && 
                  !sentRequestUserIds.has(recUser.id) && 
                  !incomingRequestFromUserIds.has(recUser.id)
                )
                .slice(0, 6)
                .map((recUser) => (
                <div key={recUser.id} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-4 flex flex-col items-center text-center hover:border-[#333] transition-colors shadow-sm">
                  <div className="relative mb-3">
                    <img
                      src={recUser.avatar || `https://ui-avatars.com/api/?background=10B981&color=fff&size=80&name=${encodeURIComponent(recUser.username)}`}
                      alt={recUser.username}
                      className="w-20 h-20 rounded-full object-cover cursor-pointer"
                      referrerPolicy="no-referrer"
                      onClick={() => goToProfile(recUser.id)}
                    />
                  </div>
                  <h3
                    className="text-white font-semibold text-base mb-1 truncate w-full px-2 cursor-pointer hover:underline"
                    onClick={() => goToProfile(recUser.id)}
                  >
                    {recUser.username}
                  </h3>
                  <p className="text-xs text-gray-400 mb-4 line-clamp-1 px-2">{recUser.bio || 'Có thể bạn biết'}</p>
                  
                  <button
                    onClick={() => void handleSendFriendRequest(recUser.id)}
                    disabled={
                      friendIds.has(recUser.id) ||
                      incomingRequestFromUserIds.has(recUser.id) ||
                      sendingRequestUserIds.includes(recUser.id)
                    }
                    className="w-full mt-auto bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 font-semibold py-2 px-4 rounded-xl transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/20"
                  >
                    {sendingRequestUserIds.includes(recUser.id)
                      ? 'Đang gửi...'
                      : sentRequestUserIds.has(recUser.id)
                        ? 'Đã gửi lời mời'
                        : incomingRequestFromUserIds.has(recUser.id)
                          ? 'Đã có lời mời'
                          : friendIds.has(recUser.id)
                            ? 'Đã là bạn bè'
                            : 'Thêm bạn bè'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 mt-2">
          <h2 className="text-xl font-bold text-white">Tất cả bạn bè ({friends.length})</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {!isLoading && friends.length === 0 && (
            <p className="col-span-full text-sm text-gray-400">Bạn chưa có bạn bè nào.</p>
          )}

          {friends.map((friend) => (
            <div key={friend.user.id} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-5 flex flex-col items-center text-center">
              <div className="relative mb-3">
                <img
                  src={friend.user.avatar || `https://picsum.photos/seed/${friend.user.id}/80/80`}
                  alt={friend.user.username}
                  className="w-20 h-20 rounded-full object-cover cursor-pointer"
                  referrerPolicy="no-referrer"
                  onClick={() => goToProfile(friend.user.id)}
                />
                {friend.user.isOnline && (
                  <span className="absolute bottom-1 right-1 block h-4 w-4 rounded-full bg-green-500 ring-4 ring-[#1A1A1A]" />
                )}
              </div>
              <h3
                className="text-white font-semibold mb-1 cursor-pointer hover:underline"
                onClick={() => goToProfile(friend.user.id)}
              >
                {friend.user.username}
              </h3>
              
              {friend.user.bio && <p className="mb-3 text-xs text-gray-400">{friend.user.bio}</p>}
              
              <div className="flex w-full space-x-2 mt-auto pt-4">
                <button
                  onClick={() => void handleOpenMessages(friend.user.id)}
                  disabled={openingMessageUserIds.includes(friend.user.id)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl flex items-center justify-center gap-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap text-xs font-medium">
                    {openingMessageUserIds.includes(friend.user.id) ? 'Đang mở...' : 'Nhắn tin'}
                  </span>
                </button>
                <button
                  onClick={() => void handleOpenAudioCall(friend.user.id)}
                  disabled={openingAudioCallUserIds.includes(friend.user.id)}
                  className="flex-1 bg-transparent border border-gray-600 hover:bg-[#2A2A2A] text-white py-2 rounded-xl flex items-center justify-center gap-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap text-xs font-medium">
                    {openingAudioCallUserIds.includes(friend.user.id) ? 'Đang gọi...' : 'Gọi thoại'}
                  </span>
                </button>
                <button
                  onClick={() => void handleOpenVideoCall(friend.user.id)}
                  disabled={openingVideoCallUserIds.includes(friend.user.id)}
                  className="flex-1 bg-transparent border border-cyan-700/60 hover:bg-cyan-500/10 text-cyan-200 py-2 rounded-xl flex items-center justify-center gap-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Video className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap text-xs font-medium">
                    {openingVideoCallUserIds.includes(friend.user.id) ? 'Đang gọi...' : 'Gọi video'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 shrink-0 flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
        {/* Requests */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Lời mời ({requests.length})</h2>
          <div className="space-y-3">
            {!isLoading && requests.length === 0 && (
              <p className="text-sm text-gray-400">Không có lời mời kết bạn.</p>
            )}

            {requests.map((req) => (
              <div key={req.id} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={req.fromUser.avatar || `https://picsum.photos/seed/${req.fromUser.id}/48/48`}
                    alt={req.fromUser.username}
                    className="w-12 h-12 rounded-full object-cover cursor-pointer"
                    referrerPolicy="no-referrer"
                    onClick={() => goToProfile(req.fromUser.id)}
                  />
                  <div>
                    <h3
                      className="text-white font-medium text-sm cursor-pointer hover:underline"
                      onClick={() => goToProfile(req.fromUser.id)}
                    >
                      {req.fromUser.username}
                    </h3>
                    <p className="text-xs text-gray-400">{req.fromUser.isOnline ? 'Đang online' : 'Đang offline'}</p>
                  </div>
                </div>
                <div className="flex flex-col space-y-2">
                  <button onClick={() => void handleAccept(req.id)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">Chấp nhận</button>
                  <button onClick={() => void handleReject(req.id)} className="bg-transparent border border-gray-600 hover:bg-[#2A2A2A] text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">Từ chối</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Online Contacts */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Bạn bè đang online</h2>
          <div className="space-y-4">
            {onlineContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between cursor-pointer hover:bg-[#2A2A2A] p-2 rounded-xl transition-colors -mx-2"
                onClick={() => goToProfile(contact.id)}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <img src={contact.avatar || `https://picsum.photos/seed/${contact.id}/32/32`} alt={contact.username} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                    <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#121212]" />
                  </div>
                  <span className="text-sm text-gray-200">{contact.username}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
