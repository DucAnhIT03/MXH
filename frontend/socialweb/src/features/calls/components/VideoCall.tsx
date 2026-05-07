import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ArrowLeft, MessageSquare } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  endVideoCall,
  sendVideoAnswer,
  sendVideoIceCandidate,
  sendVideoOffer,
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

type MediaInitResult = {
  stream: MediaStream;
  notice?: string;
};

const getUserMediaWithFallback = async (): Promise<MediaInitResult> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    return { stream };
  } catch (primaryError) {
    try {
      const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return {
        stream: audioOnly,
        notice: 'Camera đang bận hoặc không sẵn sàng. Hệ thống đã chuyển sang gọi chỉ có âm thanh.',
      };
    } catch {
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        return {
          stream: videoOnly,
          notice: 'Micro đang bận hoặc không sẵn sàng. Hệ thống đã chuyển sang gọi chỉ có video.',
        };
      } catch {
        throw primaryError;
      }
    }
  }
};

const resolveMediaErrorMessage = (error: unknown): string => {
  const fallback = 'Không thể truy cập camera/micro. Vui lòng cấp quyền để tiếp tục.';

  if (!window.isSecureContext) {
    return 'Trình duyệt chặn camera/micro vì kết nối chưa an toàn. Hãy mở bằng HTTPS hoặc localhost.';
  }

  if (!error || typeof error !== 'object' || !('name' in error)) {
    return fallback;
  }

  const name = String((error as { name?: string }).name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Bạn đã chặn quyền camera/micro. Hãy cho phép quyền trong trình duyệt rồi gọi lại.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Không tìm thấy camera hoặc microphone trên thiết bị này.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera/micro đang được ứng dụng khác sử dụng. Hãy tắt ứng dụng đó rồi thử lại.';
  }
  if (name === 'SecurityError') {
    return 'Trình duyệt từ chối truy cập camera/micro vì lý do bảo mật.';
  }

  return fallback;
};

export default function VideoCall() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const conversationId = searchParams.get('conversationId') ?? '';
  const mode = searchParams.get('mode') === 'callee' ? 'callee' : 'caller';

  const [peerName, setPeerName] = useState('Đang tải...');
  const [peerAvatar, setPeerAvatar] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [status, setStatus] = useState<'connecting' | 'ringing' | 'connected' | 'ended' | 'failed'>('connecting');
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
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
      setIsMediaReady(false);
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const safeLeaveCall = useCallback(async () => {
    try {
      if (conversationId) {
        if (status === 'connected') {
          await sendMessage(conversationId, createCallLog('video', 'ended', elapsedSeconds)).catch(() => null);
        } else if (mode === 'caller' && status === 'ringing') {
          await sendMessage(conversationId, createCallLog('video', 'missed')).catch(() => null);
        }
      }

      if (conversationId && userId) {
        await endVideoCall({
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
      if (!remoteStream || !remoteVideoRef.current) {
        return;
      }

      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => null);
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate || !conversationId || !userId) {
        return;
      }

      void sendVideoIceCandidate({
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
        setStatus((prev) => {
          if (prev === 'ended') {
            return prev;
          }

          setError('Cuộc gọi bị ngắt kết nối.');
          return 'failed';
        });
      }
    };

    return connection;
  }, [conversationId, userId]);

  const renegotiateWithPeer = useCallback(async () => {
    if (!conversationId || !userId) {
      return;
    }

    const peerConnection = createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await sendVideoOffer({
      conversationId,
      targetUserId: userId,
      sdp: offer.sdp || '',
      metadata: { renegotiate: true },
    });
  }, [conversationId, userId, createPeerConnection]);

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

        const mediaInit = await getUserMediaWithFallback();
        const localStream = mediaInit.stream;
        if (isCancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;
        setIsMuted(localStream.getAudioTracks().length === 0);
        setIsCameraOff(localStream.getVideoTracks().length === 0);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          void localVideoRef.current.play().catch(() => null);
        }
        if (mediaInit.notice) {
          setError(mediaInit.notice);
        }
        setIsMediaReady(true);
      } catch (error) {
        const message = resolveMediaErrorMessage(error);

        if (!isCancelled && mode === 'callee' && conversationId && userId) {
          // If callee cannot access devices, notify caller immediately.
          await sendVideoAnswer({
            conversationId,
            targetUserId: userId,
            accepted: false,
          }).catch(() => null);
        }

        if (!isCancelled) {
          setError(message);
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

    const onVideoAnswer = async (payload: any) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      if (!payload.accepted) {
        setStatus('ended');
        setError('Người nhận đã từ chối cuộc gọi video.');
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

    const onVideoOffer = async (payload: IncomingOfferPayload) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
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

      await sendVideoAnswer({
        conversationId,
        targetUserId: userId,
        accepted: true,
        sdp: answer.sdp || '',
      });

      setStatus('connecting');
    };

    const onVideoIceCandidate = async (payload: any) => {
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

    const onVideoEnd = (payload: any) => {
      if (payload?.conversationId !== conversationId || payload?.fromUserId !== userId) {
        return;
      }

      setStatus('ended');
      setError('Cuộc gọi video đã kết thúc.');
      cleanupMediaResources();
      window.setTimeout(() => navigate(backToMessagesUrl), 600);
    };

    socket.on('video-call.answer', onVideoAnswer);
    socket.on('video-call.offer', onVideoOffer);
    socket.on('video-call.ice-candidate', onVideoIceCandidate);
    socket.on('video-call.end', onVideoEnd);

    return () => {
      socket.off('video-call.answer', onVideoAnswer);
      socket.off('video-call.offer', onVideoOffer);
      socket.off('video-call.ice-candidate', onVideoIceCandidate);
      socket.off('video-call.end', onVideoEnd);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, userId, createPeerConnection, cleanupMediaResources, navigate, backToMessagesUrl]);

  useEffect(() => {
    if (!isMediaReady || !conversationId || !userId || status === 'failed') {
      return;
    }

    if (mode === 'callee') {
      const saved = sessionStorage.getItem('incomingVideoCall');
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

            await sendVideoAnswer({
              conversationId,
              targetUserId: userId,
              accepted: true,
              sdp: answer.sdp || '',
            });

            setStatus('connecting');
          })();
        }
      } catch {
        setError('Không xử lý được yêu cầu cuộc gọi video đến.');
        setStatus('failed');
      } finally {
        sessionStorage.removeItem('incomingVideoCall');
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

        await sendVideoOffer({
          conversationId,
          targetUserId: userId,
          sdp: offer.sdp || '',
          metadata: { initiatedBy: 'caller' },
        });

        setStatus('ringing');
      } catch {
        setError('Không thể bắt đầu cuộc gọi video.');
        setStatus('failed');
      }
    })();
  }, [mode, conversationId, userId, status, createPeerConnection, isMediaReady]);

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
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    if (audioTracks.length === 0) {
      setError('Thiết bị của bạn hiện không có micro khả dụng trong cuộc gọi này.');
      return;
    }

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
  };

  const toggleCamera = () => {
    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
    if (videoTracks.length === 0) {
      void (async () => {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          const [videoTrack] = videoStream.getVideoTracks();

          if (!videoTrack || !localStreamRef.current) {
            return;
          }

          localStreamRef.current.addTrack(videoTrack);
          const peerConnection = createPeerConnection();
          peerConnection.addTrack(videoTrack, localStreamRef.current);

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
            void localVideoRef.current.play().catch(() => null);
          }

          setIsCameraOff(false);
          setError('');
          await renegotiateWithPeer();
        } catch (error) {
          setError(resolveMediaErrorMessage(error));
        }
      })();
      return;
    }

    const nextCameraOff = !isCameraOff;
    setIsCameraOff(nextCameraOff);

    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff;
    });
  };

  const statusLabel = useMemo(() => {
    if (status === 'ringing') {
      return 'Đang đổ chuông...';
    }
    if (status === 'connected') {
      return 'Đang kết nối video trực tiếp';
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
    <div className="fixed inset-0 bg-[#050505] z-50 flex flex-col overflow-hidden">
      <div className="h-16 flex items-center justify-between px-4 md:px-6 bg-[#0F0F0F]/80 backdrop-blur-md border-b border-[#2A2A2A] relative z-20">
        <div className="flex items-center space-x-2 md:space-x-4 overflow-hidden">
          <Link to={backToMessagesUrl} className="text-gray-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src={peerAvatar || `https://picsum.photos/seed/${userId || 'peer'}/40/40`}
              alt={peerName}
              className="w-10 h-10 rounded-full object-cover cursor-pointer"
              referrerPolicy="no-referrer"
              onClick={() => {
                if (userId) navigate(`/profile?userId=${userId}`);
              }}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{peerName}</p>
              <p className="text-xs text-gray-400 truncate">{statusLabel}</p>
            </div>
          </div>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#2A2A2A]/50 backdrop-blur-md flex items-center justify-center text-gray-300 hover:bg-[#333333]/80 transition-colors shrink-0">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />

        {status !== 'connected' && (
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm flex flex-col items-center justify-center px-4 text-center">
            <img
              src={peerAvatar || `https://picsum.photos/seed/${userId || 'peer'}-call/120/120`}
              alt={peerName}
              className="h-24 w-24 rounded-full object-cover border border-white/20 cursor-pointer"
              referrerPolicy="no-referrer"
              onClick={() => {
                if (userId) navigate(`/profile?userId=${userId}`);
              }}
            />
            <p className="mt-4 text-xl font-semibold text-white">{peerName}</p>
            <p className="mt-1 text-sm text-gray-300">{statusLabel}</p>
            {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          </div>
        )}

        <div className="absolute top-4 right-4 rounded-xl bg-black/50 px-3 py-1.5 text-xs font-mono text-white backdrop-blur-md">
          {formatDuration(elapsedSeconds)}
        </div>

        <div className="absolute bottom-28 right-4 md:right-6 w-32 md:w-64 aspect-video rounded-2xl overflow-hidden border border-white/20 bg-[#111111] shadow-2xl">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-cover ${isCameraOff ? 'opacity-30' : ''}`}
          />
          {isCameraOff && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 bg-black/40">
              Camera đã tắt
            </div>
          )}
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-3xl border border-[#2A2A2A] bg-[#101010]/85 px-4 py-3 md:px-8 md:py-4 backdrop-blur-xl shadow-2xl flex items-center gap-4 md:gap-7">
          <button onClick={toggleMute} className="flex flex-col items-center gap-1.5 md:gap-2">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#2A2A2A] hover:bg-[#3A3A3A] transition-colors flex items-center justify-center">
              {isMuted ? <MicOff className="w-5 h-5 md:w-6 md:h-6 text-red-300" /> : <Mic className="w-5 h-5 md:w-6 md:h-6 text-gray-200" />}
            </div>
            <span className="text-[10px] md:text-xs text-gray-400 font-medium">{isMuted ? 'Bật mic' : 'Tắt mic'}</span>
          </button>

          <button onClick={toggleCamera} className="flex flex-col items-center gap-1.5 md:gap-2">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#2A2A2A] hover:bg-[#3A3A3A] transition-colors flex items-center justify-center">
              {isCameraOff ? <VideoOff className="w-5 h-5 md:w-6 md:h-6 text-red-300" /> : <Video className="w-5 h-5 md:w-6 md:h-6 text-gray-200" />}
            </div>
            <span className="text-[10px] md:text-xs text-gray-400 font-medium">{isCameraOff ? 'Bật camera' : 'Tắt camera'}</span>
          </button>

          <button onClick={() => void safeLeaveCall()} className="flex flex-col items-center gap-1.5 md:gap-2">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center shadow-[0_0_18px_rgba(239,68,68,0.5)]">
              <PhoneOff className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <span className="text-[10px] md:text-xs text-red-300 font-medium">Kết thúc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
