import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, ArrowLeft, MessageSquare } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  endAudioCall,
  sendAudioAnswer,
  sendAudioIceCandidate,
  sendAudioOffer,
} from '@/api/call';
import { fetchUserProfile, sendMessage } from '@/api/chat';
import { getRealtimeBaseUrl } from '@/utils/realtime';
import { createCallLog } from '@/utils/callLog';

const realtimeBaseUrl = getRealtimeBaseUrl();

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

type IncomingOfferPayload = {
  conversationId: string;
  fromUserId: string;
  targetUserId: string;
  sdp: string;
};

export default function AudioCall() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const conversationId = searchParams.get('conversationId') ?? '';
  const mode = searchParams.get('mode') === 'callee' ? 'callee' : 'caller';

  const [peerName, setPeerName] = useState('Đang tải...');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicReady, setIsMicReady] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'ringing' | 'connected' | 'ended' | 'failed'>('connecting');
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callerOfferSentRef = useRef(false);

  const backToMessagesUrl =
    userId && conversationId
      ? `/messages?userId=${userId}&conversationId=${conversationId}`
      : '/messages';

  const formatDuration = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
      .map((value) => value.toString().padStart(2, '0'))
      .join(':');
  };

  const cleanupMediaResources = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setIsMicReady(false);
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const safeLeaveCall = useCallback(async () => {
    try {
      if (conversationId) {
        if (status === 'connected') {
          await sendMessage(conversationId, createCallLog('audio', 'ended', elapsedSeconds)).catch(() => null);
        } else if (mode === 'caller' && status === 'ringing') {
          await sendMessage(conversationId, createCallLog('audio', 'missed')).catch(() => null);
        }
      }

      if (conversationId && userId) {
        await endAudioCall({
          conversationId,
          targetUserId: userId,
          reason: 'ended',
        }).catch(() => null);
      }
    } finally {
      setStatus('ended');
      cleanupMediaResources();
      navigate(backToMessagesUrl);
    }
  }, [conversationId, userId, status, elapsedSeconds, mode, cleanupMediaResources, navigate, backToMessagesUrl]);

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const connection = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = connection;

    const localStream = localStreamRef.current;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        connection.addTrack(track, localStream);
      });
    }

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream || !remoteAudioRef.current) {
        return;
      }

      remoteAudioRef.current.srcObject = remoteStream;
      void remoteAudioRef.current.play().catch(() => null);
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate || !conversationId || !userId) {
        return;
      }

      void sendAudioIceCandidate({
        conversationId,
        targetUserId: userId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid || '0',
        sdpMLineIndex: String(event.candidate.sdpMLineIndex ?? 0),
      }).catch(() => null);
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;

      if (state === 'connected') {
        setStatus('connected');
        setError('');
        return;
      }

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        if (status !== 'ended') {
          setStatus('failed');
          setError('Cuộc gọi bị ngắt kết nối.');
        }
      }
    };

    return connection;
  }, [conversationId, userId, status]);

  useEffect(() => {
    if (!conversationId || !userId) {
      setError('Thiếu thông tin cuộc gọi.');
      setStatus('failed');
      return;
    }

    let isCancelled = false;

    const initialize = async () => {
      try {
        const profile = await fetchUserProfile(userId).catch(() => null);
        if (!isCancelled && profile) {
          setPeerName(profile.username);
          setPeerAvatar(profile.avatar || null);
        }

        const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (isCancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;
        setIsMicReady(true);
      } catch {
        if (!isCancelled) {
          setError('Không thể truy cập micro. Vui lòng cấp quyền microphone.');
          setStatus('failed');
        }
      }
    };

    void initialize();

    return () => {
      isCancelled = true;
    };
  }, [conversationId, userId]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken') ?? localStorage.getItem('token');
    if (!token) {
      setStatus('failed');
      setError('Phiên đăng nhập đã hết hạn.');
      return;
    }

    const socket = io(`${realtimeBaseUrl}/realtime`, {
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('conversation.join', { conversationId });
    });

    const onAudioAnswer = async (payload: any) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      if (!payload.accepted) {
        setStatus('ended');
        setError('Người nhận đã từ chối cuộc gọi.');
        window.setTimeout(() => navigate(backToMessagesUrl), 1200);
        return;
      }

      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || !payload.sdp) {
        return;
      }

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({
          type: 'answer',
          sdp: payload.sdp,
        }),
      );
      setStatus('connecting');
    };

    const onAudioOffer = async (payload: IncomingOfferPayload) => {
      if (mode !== 'callee' || payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      if (!localStreamRef.current) {
        return;
      }

      const peerConnection = createPeerConnection();
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({
          type: 'offer',
          sdp: payload.sdp,
        }),
      );

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      await sendAudioAnswer({
        conversationId,
        targetUserId: userId,
        accepted: true,
        sdp: answer.sdp || '',
      });

      setStatus('connecting');
    };

    const onAudioIceCandidate = async (payload: any) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      const peerConnection = peerConnectionRef.current;
      if (!peerConnection || !payload?.candidate) {
        return;
      }

      await peerConnection.addIceCandidate(
        new RTCIceCandidate({
          candidate: payload.candidate,
          sdpMid: payload.sdpMid,
          sdpMLineIndex: Number(payload.sdpMLineIndex || 0),
        }),
      ).catch(() => null);
    };

    const onAudioEnd = (payload: any) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      setStatus('ended');
      setError('Cuộc gọi đã kết thúc.');
      cleanupMediaResources();
      window.setTimeout(() => navigate(backToMessagesUrl), 600);
    };

    socket.on('audio-call.answer', onAudioAnswer);
    socket.on('audio-call.offer', onAudioOffer);
    socket.on('audio-call.ice-candidate', onAudioIceCandidate);
    socket.on('audio-call.end', onAudioEnd);

    return () => {
      socket.off('audio-call.answer', onAudioAnswer);
      socket.off('audio-call.offer', onAudioOffer);
      socket.off('audio-call.ice-candidate', onAudioIceCandidate);
      socket.off('audio-call.end', onAudioEnd);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, userId, mode, createPeerConnection, cleanupMediaResources, navigate, backToMessagesUrl]);

  useEffect(() => {
    if (!isMicReady || !conversationId || !userId || status === 'failed') {
      return;
    }

    if (mode === 'callee') {
      const saved = sessionStorage.getItem('incomingAudioCall');
      if (!saved) {
        return;
      }

      try {
        const payload = JSON.parse(saved) as IncomingOfferPayload;
        if (payload.conversationId === conversationId && payload.fromUserId === userId) {
          void (async () => {
            const peerConnection = createPeerConnection();
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription({ type: 'offer', sdp: payload.sdp }),
            );

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            await sendAudioAnswer({
              conversationId,
              targetUserId: userId,
              accepted: true,
              sdp: answer.sdp || '',
            });

            setStatus('connecting');
          })();
        }
      } catch {
        setError('Không xử lý được yêu cầu cuộc gọi đến.');
        setStatus('failed');
      } finally {
        sessionStorage.removeItem('incomingAudioCall');
      }

      return;
    }

    if (callerOfferSentRef.current) {
      return;
    }
    callerOfferSentRef.current = true;

    void (async () => {
      try {
        const peerConnection = createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        await sendAudioOffer({
          conversationId,
          targetUserId: userId,
          sdp: offer.sdp || '',
          metadata: { initiatedBy: 'caller' },
        });

        setStatus('ringing');
      } catch {
        setError('Không thể bắt đầu cuộc gọi thoại.');
        setStatus('failed');
      }
    })();
  }, [mode, conversationId, userId, status, createPeerConnection, isMicReady]);

  useEffect(() => {
    if (status !== 'connected') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);

  useEffect(() => {
    return () => {
      cleanupMediaResources();
    };
  }, [cleanupMediaResources]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
  };

  const statusLabel = useMemo(() => {
    if (status === 'ringing') {
      return 'Đang đổ chuông...';
    }
    if (status === 'connected') {
      return 'Đang kết nối âm thanh';
    }
    if (status === 'failed') {
      return 'Không thể kết nối';
    }
    if (status === 'ended') {
      return 'Đã kết thúc cuộc gọi';
    }
    return 'Đang kết nối...';
  }, [status]);

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] z-50 flex flex-col overflow-hidden">
      <audio ref={remoteAudioRef} autoPlay />

      <div className="absolute inset-0 z-0">
        <img src="https://picsum.photos/seed/alex_blur/1920/1080" alt="Background blur" className="w-full h-full object-cover opacity-30 blur-3xl" referrerPolicy="no-referrer" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0A0A0A] opacity-80"></div>
      </div>

      <div className="h-16 flex items-center justify-between px-4 md:px-6 bg-transparent relative z-10 w-full shrink-0">
        <div className="flex items-center space-x-2 md:space-x-4">
          <Link to={backToMessagesUrl} className="text-gray-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center space-x-2 hidden sm:flex">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">c</span>
            </div>
            <span className="text-lg font-semibold text-white">connectDucAnh</span>
          </div>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#2A2A2A]/50 backdrop-blur-md flex items-center justify-center text-gray-300 hover:bg-[#333333]/80 transition-colors shrink-0">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-4 min-h-0 py-4">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-6 md:mb-8">
            <div className="absolute inset-0 bg-cyan-400/20 rounded-full blur-2xl animate-pulse"></div>
            <div className="absolute inset-0 bg-cyan-400/40 rounded-full blur-xl animate-ping" style={{ animationDuration: '3s' }}></div>
            <img
              src={peerAvatar || `https://picsum.photos/seed/${userId || 'caller'}/160/160`}
              alt={peerName}
              className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover border-4 border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.3)] relative z-10 cursor-pointer"
              referrerPolicy="no-referrer"
              onClick={() => {
                if (userId) navigate(`/profile?userId=${userId}`);
              }}
            />
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 truncate max-w-full">{peerName}</h1>
          <p className="text-gray-400 text-xs md:text-sm tracking-wider uppercase mb-4">{statusLabel}</p>
          <div className="text-4xl md:text-5xl font-mono text-white tracking-widest font-light">
            {formatDuration(elapsedSeconds)}
          </div>
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center space-x-6 md:space-x-8 w-full px-4 pb-8 md:pb-12 shrink-0">
        <button onClick={toggleMute} className="flex flex-col items-center space-y-2 md:space-y-3 group">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#1A1A1A]/80 backdrop-blur-xl group-hover:bg-[#2A2A2A] flex items-center justify-center transition-colors border border-[#333333]">
            {isMuted ? (
              <MicOff className="w-5 h-5 md:w-6 md:h-6 text-red-300" />
            ) : (
              <Mic className="w-5 h-5 md:w-6 md:h-6 text-gray-300" />
            )}
          </div>
          <span className="text-xs md:text-sm text-gray-400 font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button onClick={() => void safeLeaveCall()} className="flex flex-col items-center space-y-2 md:space-y-3 group">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-500 group-hover:bg-red-600 flex items-center justify-center transition-colors shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-400/50">
            <PhoneOff className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <span className="text-xs md:text-sm text-red-400 font-medium">End Call</span>
        </button>
      </div>
    </div>
  );
}
