import { useEffect, useState, useCallback } from 'react';
import { Bell, UserCheck, UserX, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { userApiClient } from '@/api/userApiClient';
import { useUser } from '@/features/auth/context/UserContext';

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

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=10B981&color=fff&size=100&name=';

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await userApiClient.get('/users/me/friend-requests', {
        params: { page: 1, limit: 50 },
      });
      setRequests(res.data?.items ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const handleAccept = async (id: string) => {
    setProcessingId(id);
    try {
      await userApiClient.post(`/users/me/friend-requests/${id}/accept`);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      // giữ nguyên
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await userApiClient.post(`/users/me/friend-requests/${id}/reject`);
      setRequests(prev => prev.filter(r => r.id !== id));
    } catch {
      // giữ nguyên
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto h-full overflow-y-auto custom-scrollbar pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Thông báo</h1>
        <button
          onClick={() => void load()}
          className="w-9 h-9 rounded-full bg-[#2A2A2A] hover:bg-[#333] flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Làm mới"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Section: Lời mời kết bạn */}
      <div className="mb-6">
        <h2 className="text-[15px] font-semibold text-gray-400 mb-3 px-1">
          Lời mời kết bạn {requests.length > 0 && `(${requests.length})`}
        </h2>

        <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 text-gray-400 animate-spin" />
            </div>
          ) : !user?.id ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400 text-sm">Đăng nhập để xem thông báo</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-gray-400 font-medium">Không có thông báo mới</p>
              <p className="text-gray-600 text-sm mt-1">Lời mời kết bạn sẽ xuất hiện ở đây</p>
            </div>
          ) : (
            requests.map((req, i) => (
              <div
                key={req.id}
                className={`flex items-center gap-4 p-4 hover:bg-[#222] transition-colors ${
                  i !== requests.length - 1 ? 'border-b border-[#2A2A2A]' : ''
                } ${!req.isRead ? 'bg-blue-500/5' : ''}`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <img
                    src={req.fromUser.avatar || `${DEFAULT_AVATAR}${encodeURIComponent(req.fromUser.username)}`}
                    alt={req.fromUser.username}
                    className="w-14 h-14 rounded-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    referrerPolicy="no-referrer"
                    onClick={() => navigate(`/profile?userId=${req.fromUser.id}`)}
                  />
                  {req.fromUser.isOnline && (
                    <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-[#1A1A1A] rounded-full" />
                  )}
                  {/* Badge lời mời */}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center border-2 border-[#1A1A1A]">
                    <UserCheck className="w-3 h-3 text-white" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-[15px]">
                    <span
                      className="font-semibold text-white cursor-pointer hover:underline"
                      onClick={() => navigate(`/profile?userId=${req.fromUser.id}`)}
                    >
                      {req.fromUser.username}
                    </span>
                    {' '}đã gửi lời mời kết bạn cho bạn
                  </p>
                  {req.fromUser.bio && (
                    <p className="text-gray-500 text-xs mt-0.5 truncate">{req.fromUser.bio}</p>
                  )}
                  <p className="text-blue-400 text-xs mt-1 font-medium">{timeAgo(req.createdAt)}</p>
                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    <button
                      disabled={processingId === req.id}
                      onClick={() => void handleAccept(req.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {processingId === req.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <UserCheck className="w-4 h-4" />}
                      Xác nhận
                    </button>
                    <button
                      disabled={processingId === req.id}
                      onClick={() => void handleReject(req.id)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-[#3A3B3C] hover:bg-[#4E4F50] text-gray-200 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      <UserX className="w-4 h-4" />
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
