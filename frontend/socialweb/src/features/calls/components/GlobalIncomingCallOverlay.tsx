import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useLocation, useNavigate } from 'react-router-dom';
import { sendAudioAnswer, sendVideoAnswer } from '@/api/call';
import { fetchUserProfile, sendMessage } from '@/api/chat';
import { getRealtimeBaseUrl } from '@/utils/realtime';
import { createCallLog } from '@/utils/callLog';

type IncomingCallInfo = {
  conversationId: string;
  fromUserId: string;
  targetUserId: string;
  sdp: string;
  callerName: string;
  callerAvatar?: string | null;
};

const realtimeBaseUrl = getRealtimeBaseUrl();

export default function GlobalIncomingCallOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [incomingAudioCall, setIncomingAudioCall] = useState<IncomingCallInfo | null>(null);
  const [incomingVideoCall, setIncomingVideoCall] = useState<IncomingCallInfo | null>(null);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, { username: string; avatar?: string | null }>>({});

  useEffect(() => {
    const token = localStorage.getItem('accessToken') ?? localStorage.getItem('token');
    if (!token) {
      return;
    }

    const nextSocket = io(`${realtimeBaseUrl}/realtime`, {
      auth: { token },
    });
    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
      setSocket(null);
    };
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const hydrateCallerInfo = async (userId: string) => {
      const cached = profilesByUserId[userId];
      if (cached) {
        return cached;
      }

      const profile = await fetchUserProfile(userId).catch(() => null);
      if (!profile) {
        return {
          username: `Người dùng ${String(userId).slice(0, 8)}`,
          avatar: null,
        };
      }

      const nextProfile = {
        username: profile.username,
        avatar: profile.avatar || null,
      };

      setProfilesByUserId((prev) => ({ ...prev, [userId]: nextProfile }));
      return nextProfile;
    };

    const onIncomingAudioOffer = async (payload: any) => {
      if (!payload?.conversationId || !payload?.fromUserId || !payload?.sdp) {
        return;
      }

      const profile = await hydrateCallerInfo(payload.fromUserId);
      setIncomingAudioCall({
        conversationId: payload.conversationId,
        fromUserId: payload.fromUserId,
        targetUserId: payload.targetUserId,
        sdp: payload.sdp,
        callerName: profile.username,
        callerAvatar: profile.avatar || null,
      });
    };

    const onIncomingVideoOffer = async (payload: any) => {
      if (!payload?.conversationId || !payload?.fromUserId || !payload?.sdp) {
        return;
      }

      const profile = await hydrateCallerInfo(payload.fromUserId);
      setIncomingVideoCall({
        conversationId: payload.conversationId,
        fromUserId: payload.fromUserId,
        targetUserId: payload.targetUserId,
        sdp: payload.sdp,
        callerName: profile.username,
        callerAvatar: profile.avatar || null,
      });
    };

    socket.on('audio-call.offer', onIncomingAudioOffer);
    socket.on('video-call.offer', onIncomingVideoOffer);

    return () => {
      socket.off('audio-call.offer', onIncomingAudioOffer);
      socket.off('video-call.offer', onIncomingVideoOffer);
    };
  }, [socket, profilesByUserId]);

  const isCallPage = location.pathname === '/audio-call' || location.pathname === '/video-call';

  const handleAcceptIncomingAudioCall = () => {
    if (!incomingAudioCall) {
      return;
    }
    sessionStorage.setItem('incomingAudioCall', JSON.stringify(incomingAudioCall));
    navigate(`/audio-call?userId=${incomingAudioCall.fromUserId}&conversationId=${incomingAudioCall.conversationId}&mode=callee`);
    setIncomingAudioCall(null);
  };

  const handleRejectIncomingAudioCall = async () => {
    if (!incomingAudioCall) {
      return;
    }
    await sendAudioAnswer({
      conversationId: incomingAudioCall.conversationId,
      targetUserId: incomingAudioCall.fromUserId,
      accepted: false,
    }).catch(() => null);
    await sendMessage(
      incomingAudioCall.conversationId,
      createCallLog('audio', 'rejected'),
    ).catch(() => null);
    setIncomingAudioCall(null);
  };

  const handleAcceptIncomingVideoCall = () => {
    if (!incomingVideoCall) {
      return;
    }
    sessionStorage.setItem('incomingVideoCall', JSON.stringify(incomingVideoCall));
    navigate(`/video-call?userId=${incomingVideoCall.fromUserId}&conversationId=${incomingVideoCall.conversationId}&mode=callee`);
    setIncomingVideoCall(null);
  };

  const handleRejectIncomingVideoCall = async () => {
    if (!incomingVideoCall) {
      return;
    }
    await sendVideoAnswer({
      conversationId: incomingVideoCall.conversationId,
      targetUserId: incomingVideoCall.fromUserId,
      accepted: false,
    }).catch(() => null);
    await sendMessage(
      incomingVideoCall.conversationId,
      createCallLog('video', 'rejected'),
    ).catch(() => null);
    setIncomingVideoCall(null);
  };

  if (isCallPage) {
    return null;
  }

  return (
    <>
      {incomingAudioCall && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2A2A2A] bg-[#151515] p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-widest text-emerald-400">Cuộc gọi đến</p>
            <div className="mt-4 flex items-center gap-3">
              <img
                src={incomingAudioCall.callerAvatar || `https://picsum.photos/seed/${incomingAudioCall.fromUserId}/64/64`}
                alt={incomingAudioCall.callerName}
                className="h-14 w-14 rounded-full object-cover cursor-pointer"
                referrerPolicy="no-referrer"
                onClick={() => navigate(`/profile?userId=${incomingAudioCall.fromUserId}`)}
              />
              <div>
                <p className="text-lg font-semibold text-white">{incomingAudioCall.callerName}</p>
                <p className="text-sm text-gray-400">Đang gọi thoại cho bạn</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleRejectIncomingAudioCall()}
                className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25"
              >
                Từ chối
              </button>
              <button
                type="button"
                onClick={handleAcceptIncomingAudioCall}
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25"
              >
                Chấp nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {incomingVideoCall && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#2A2A2A] bg-[#151515] p-5 shadow-2xl">
            <p className="text-xs uppercase tracking-widest text-cyan-400">Cuộc gọi video đến</p>
            <div className="mt-4 flex items-center gap-3">
              <img
                src={incomingVideoCall.callerAvatar || `https://picsum.photos/seed/${incomingVideoCall.fromUserId}/64/64`}
                alt={incomingVideoCall.callerName}
                className="h-14 w-14 rounded-full object-cover cursor-pointer"
                referrerPolicy="no-referrer"
                onClick={() => navigate(`/profile?userId=${incomingVideoCall.fromUserId}`)}
              />
              <div>
                <p className="text-lg font-semibold text-white">{incomingVideoCall.callerName}</p>
                <p className="text-sm text-gray-400">Đang gọi video cho bạn</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleRejectIncomingVideoCall()}
                className="rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-sm font-medium text-red-300 hover:bg-red-500/25"
              >
                Từ chối
              </button>
              <button
                type="button"
                onClick={handleAcceptIncomingVideoCall}
                className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25"
              >
                Chấp nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
