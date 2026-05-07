import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  Search,
  Phone,
  Video,
  Send,
  MoreVertical,
  PhoneMissed,
  PhoneCall,
  PenSquare,
  Info,
  Smile,
  ImageIcon,
  Sticker,
  Mic,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import {
  ChatConversation,
  ChatMessage,
  createPrivateConversation,
  fetchConversationMessages,
  fetchConversations,
  fetchUserProfile,
  sendMessage,
  UserProfile,
} from '@/api/chat';
import { getRealtimeBaseUrl } from '@/utils/realtime';
import { getCallLogPreview, parseCallLog } from '@/utils/callLog';
import { uploadPostMedia } from '@/api/posts';

const realtimeBaseUrl = getRealtimeBaseUrl();

const formatTime = (dateLike?: string | null) => {
  if (!dateLike) {
    return '';
  }

  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatConversationTime = (dateLike?: string | null) => {
  if (!dateLike) {
    return '';
  }

  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const sameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (sameDay) {
    return formatTime(dateLike);
  }

  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const parseCurrentUserId = (): string => {
  const token = localStorage.getItem('accessToken') ?? localStorage.getItem('token');
  if (!token) {
    return '';
  }

  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return '';
    }

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(window.atob(base64));
    return typeof decoded?.sub === 'string' ? decoded.sub : '';
  } catch {
    return '';
  }
};

const IMAGE_PREFIX = '[IMG]';
const VOICE_PREFIX = '[VOICE]';

const parseImageMessage = (content?: string | null) => {
  if (!content?.startsWith(IMAGE_PREFIX)) return null;
  return content.slice(IMAGE_PREFIX.length).trim() || null;
};

const parseVoiceMessage = (content?: string | null) => {
  if (!content?.startsWith(VOICE_PREFIX)) return null;
  const body = content.slice(VOICE_PREFIX.length);
  const [urlPart, durationPart] = body.split('|duration=');
  const duration = Number(durationPart);
  return {
    url: urlPart?.trim() || '',
    duration: Number.isFinite(duration) ? duration : undefined,
  };
};

const formatActiveStatus = (profile?: UserProfile | null) => {
  if (!profile) {
    return 'Chưa chọn cuộc trò chuyện';
  }

  if (profile.isOnline) {
    return 'Đang hoạt động';
  }

  if (!profile.updatedAt) {
    return 'Hoạt động gần đây';
  }

  const lastActive = new Date(profile.updatedAt);
  if (Number.isNaN(lastActive.getTime())) {
    return 'Hoạt động gần đây';
  }

  const diffSec = Math.max(0, Math.floor((Date.now() - lastActive.getTime()) / 1000));
  const minute = 60;
  const hour = 3600;
  const day = 86400;

  if (diffSec < hour) {
    return `Hoạt động ${Math.max(1, Math.floor(diffSec / minute))} phút trước`;
  }
  if (diffSec < day) {
    return `Hoạt động ${Math.floor(diffSec / hour)} giờ trước`;
  }
  if (diffSec <= day * 3) {
    return `Hoạt động ${Math.floor(diffSec / day)} ngày trước`;
  }

  return `Hoạt động lần cuối ${lastActive.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`;
};

export default function Messages() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedUserId = searchParams.get('userId') ?? '';
  const selectedConversationIdFromQuery = searchParams.get('conversationId') ?? '';

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [targetUserProfile, setTargetUserProfile] = useState<UserProfile | null>(null);
  const [userProfilesById, setUserProfilesById] = useState<Record<string, UserProfile>>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceWaveBars, setVoiceWaveBars] = useState<number[]>([8, 10, 12, 9, 7, 11, 13, 8, 10, 12, 9, 7]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const isVoiceRecordCancelledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceRafRef = useRef<number | null>(null);

  const currentUserId = useMemo(() => parseCurrentUserId(), []);

  const loadConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const response = await fetchConversations(1, 50);
      const nextItems = response.items ?? [];
      setConversations(nextItems);

      if (!selectedConversationId && nextItems.length > 0) {
        setSelectedConversationId(nextItems[0].id);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không tải được hội thoại');
    } finally {
      setIsLoadingConversations(false);
    }
  }, [selectedConversationId]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!conversationId) {
      return;
    }

    setIsLoadingMessages(true);
    try {
      const response = await fetchConversationMessages(conversationId, 1, 100);
      const sorted = [...(response.items ?? [])].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(sorted);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không tải được tin nhắn');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const getPrivatePeerId = useCallback((conversation: ChatConversation): string => {
    if (conversation.isGroup) {
      return '';
    }

    const memberIds = conversation.memberIds ?? [];
    const peerId = memberIds.find((id) => id !== currentUserId);
    return peerId || '';
  }, [currentUserId]);

  useEffect(() => {
    const peerIds: string[] = Array.from(
      new Set<string>(
        conversations
          .map((conversation) => getPrivatePeerId(conversation))
          .filter((id): id is string => Boolean(id) && !userProfilesById[id]),
      ),
    );

    if (peerIds.length === 0) {
      return;
    }

    let isCancelled = false;

    const loadMissingProfiles = async () => {
      const settled = await Promise.allSettled(peerIds.map((id) => fetchUserProfile(id)));

      if (isCancelled) {
        return;
      }

      const nextEntries: Record<string, UserProfile> = {};
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value?.id) {
          nextEntries[result.value.id] = result.value;
          return;
        }

        const fallbackId = peerIds[index];
        nextEntries[fallbackId] = {
          id: fallbackId,
          username: `Người dùng ${fallbackId.slice(0, 8)}`,
        };
      });

      setUserProfilesById((prev) => ({ ...prev, ...nextEntries }));
    };

    void loadMissingProfiles();

    return () => {
      isCancelled = true;
    };
  }, [conversations, getPrivatePeerId, userProfilesById]);

  useEffect(() => {
    if (selectedConversationIdFromQuery) {
      setSelectedConversationId(selectedConversationIdFromQuery);
    }
  }, [selectedConversationIdFromQuery]);

  useEffect(() => {
    if (!selectedUserId) {
      setTargetUserProfile(null);
      return;
    }

    let isCancelled = false;

    const loadTargetProfile = async () => {
      try {
        const profile = await fetchUserProfile(selectedUserId).catch(() => null);

        if (isCancelled) {
          return;
        }

        if (profile) {
          setTargetUserProfile(profile);
        }
      } catch {
        if (!isCancelled) {
          setTargetUserProfile(null);
        }
      }
    };

    void loadTargetProfile();

    return () => {
      isCancelled = true;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId || selectedConversationIdFromQuery) {
      return;
    }

    let isCancelled = false;

    const ensureConversation = async () => {
      try {
        const conversation = await createPrivateConversation(selectedUserId);

        if (isCancelled) {
          return;
        }

        setSelectedConversationId(conversation.id);
        await loadConversations();
      } catch (err: any) {
        const message = err?.response?.data?.message;
        if (!isCancelled) {
          setError(Array.isArray(message) ? message.join(', ') : message || 'Không thể mở cuộc trò chuyện');
        }
      }
    };

    void ensureConversation();

    return () => {
      isCancelled = true;
    };
  }, [selectedUserId, selectedConversationIdFromQuery, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [selectedConversationId, loadMessages]);

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
    if (!socket || !selectedConversationId) {
      return;
    }

    const joinCurrentConversation = () => {
      socket.emit('conversation.join', { conversationId: selectedConversationId });
    };

    joinCurrentConversation();
    socket.on('connect', joinCurrentConversation);

    return () => {
      socket.off('connect', joinCurrentConversation);
    };
  }, [socket, selectedConversationId]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onMessageCreated = (payload: ChatMessage) => {
      if (!payload?.id || !payload?.conversationId) {
        return;
      }

      setConversations((prev) => {
        const existed = prev.some((conversation) => conversation.id === payload.conversationId);
        if (!existed) {
          return prev;
        }

        const next = prev.map((conversation) => (
          conversation.id === payload.conversationId
            ? { ...conversation, lastMessage: payload, updatedAt: payload.createdAt }
            : conversation
        ));

        return next.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      });

      if (payload.conversationId !== selectedConversationId) {
        return;
      }

      setMessages((prev) => {
        const hasSameId = prev.some((message) => message.id === payload.id);
        if (hasSameId) {
          return prev;
        }

        const withoutTempDup = prev.filter(
          (message) => !(message.id.startsWith('temp-') && message.content === payload.content && message.senderId === payload.senderId),
        );

        return [...withoutTempDup, payload].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
    };

    socket.on('message.created', onMessageCreated);

    return () => {
      socket.off('message.created', onMessageCreated);
    };
  }, [socket, selectedConversationId]);


  const filteredConversations = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const peerId = getPrivatePeerId(conversation);
      const peerName = peerId ? (userProfilesById[peerId]?.username || '') : '';
      const title = (conversation.title || peerName).toLowerCase();
      const lastContent = (conversation.lastMessage?.content || '').toLowerCase();
      return title.includes(keyword) || lastContent.includes(keyword) || conversation.id.toLowerCase().includes(keyword);
    });
  }, [searchKeyword, conversations, getPrivatePeerId, userProfilesById]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const selectedPeerId = selectedConversation ? getPrivatePeerId(selectedConversation) : '';
  const selectedPeerProfile = selectedPeerId ? userProfilesById[selectedPeerId] : null;

  const selectedTitle =
    targetUserProfile?.username ||
    selectedConversation?.title ||
    selectedPeerProfile?.username ||
    (selectedConversation ? `Đoạn chat ${selectedConversation.id.slice(0, 8)}` : 'Tin nhắn');
  const selectedPresenceProfile = targetUserProfile || selectedPeerProfile;

  const handleStartAudioCall = () => {
    if (!selectedConversationId || !selectedPeerId) {
      return;
    }

    navigate(`/audio-call?userId=${selectedPeerId}&conversationId=${selectedConversationId}&mode=caller`);
  };

  const handleStartVideoCall = () => {
    if (!selectedConversationId || !selectedPeerId) {
      return;
    }

    navigate(`/video-call?userId=${selectedPeerId}&conversationId=${selectedConversationId}&mode=caller`);
  };


  const handleSendMessage = async () => {
    const trimmed = draftMessage.trim();
    if (!trimmed || !selectedConversationId || isSending) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      conversationId: selectedConversationId,
      senderId: currentUserId,
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setDraftMessage('');
    setMessages((prev) => [...prev, optimisticMessage]);
    setIsSending(true);

    try {
      const savedMessage = await sendMessage(selectedConversationId, trimmed);

      setMessages((prev) => prev.map((message) => (message.id === tempId ? savedMessage : message)));
      setConversations((prev) => {
        const next = prev.map((conversation) => (
          conversation.id === selectedConversationId
            ? { ...conversation, lastMessage: savedMessage, updatedAt: savedMessage.createdAt }
            : conversation
        ));

        return next.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      });
    } catch (err: any) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setDraftMessage(trimmed);
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không gửi được tin nhắn');
    } finally {
      setIsSending(false);
    }
  };

  const handlePickImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedConversationId) {
      return;
    }

    try {
      setIsUploadingImage(true);
      const uploaded = await uploadPostMedia(file, 'image');
      await sendMessage(selectedConversationId, `${IMAGE_PREFIX}${uploaded.url}`);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Không thể tải ảnh lên');
    } finally {
      setIsUploadingImage(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const stopRecordingTracks = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const stopVoiceAnalyser = () => {
    if (voiceRafRef.current) {
      window.cancelAnimationFrame(voiceRafRef.current);
      voiceRafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => null);
      audioContextRef.current = null;
    }
  };

  const startVoiceAnalyser = (stream: MediaStream) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) {
        return;
      }
      analyser.getByteFrequencyData(data);
      const chunkSize = Math.max(1, Math.floor(data.length / 12));
      const bars = Array.from({ length: 12 }, (_, i) => {
        const start = i * chunkSize;
        const end = Math.min(data.length, start + chunkSize);
        let sum = 0;
        for (let j = start; j < end; j += 1) sum += data[j];
        const avg = end > start ? sum / (end - start) : 0;
        return Math.max(6, Math.min(28, Math.round((avg / 255) * 28)));
      });
      setVoiceWaveBars(bars);
      setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      voiceRafRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  };

  const handleToggleVoiceRecord = async () => {
    if (!selectedConversationId) {
      return;
    }

    if (isRecordingVoice) {
      isVoiceRecordCancelledRef.current = false;
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      recordingStreamRef.current = stream;
      voiceChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      isVoiceRecordCancelledRef.current = false;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          voiceChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = async () => {
        if (isVoiceRecordCancelledRef.current) {
          setRecordingSeconds(0);
          setVoiceWaveBars([8, 10, 12, 9, 7, 11, 13, 8, 10, 12, 9, 7]);
          stopVoiceAnalyser();
          stopRecordingTracks();
          return;
        }
        try {
          setIsUploadingVoice(true);
          const blob = new Blob(voiceChunksRef.current, { type: 'video/webm' });
          const durationSec = Math.max(1, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'video/webm' });
          const uploaded = await uploadPostMedia(file, 'video');
          await sendMessage(selectedConversationId, `${VOICE_PREFIX}${uploaded.url}|duration=${durationSec}`);
        } catch (err: any) {
          const message = err?.response?.data?.message;
          setError(Array.isArray(message) ? message.join(', ') : message || 'Không thể gửi ghi âm');
        } finally {
          setIsUploadingVoice(false);
          setRecordingSeconds(0);
          setVoiceWaveBars([8, 10, 12, 9, 7, 11, 13, 8, 10, 12, 9, 7]);
          stopVoiceAnalyser();
          stopRecordingTracks();
        }
      };

      recorder.start();
      startVoiceAnalyser(stream);
      setIsRecordingVoice(true);
    } catch {
      setError('Không truy cập được microphone. Hãy cấp quyền để ghi âm.');
      stopVoiceAnalyser();
      stopRecordingTracks();
    }
  };

  const handleCancelVoiceRecord = () => {
    if (!isRecordingVoice) {
      return;
    }
    isVoiceRecordCancelledRef.current = true;
    mediaRecorderRef.current?.stop();
    setIsRecordingVoice(false);
  };

  const onMessageInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  useEffect(() => {
    return () => {
      isVoiceRecordCancelledRef.current = true;
      mediaRecorderRef.current?.stop();
      stopVoiceAnalyser();
      stopRecordingTracks();
    };
  }, []);

  return (
    <div className="h-full rounded-2xl border border-[#2A2A2A] bg-[#111217] overflow-hidden">
      <div className="flex h-full">
        <aside className="w-[360px] shrink-0 border-r border-[#2A2A2A] bg-[#16181f] flex flex-col">
          <div className="px-4 pt-4 pb-3 border-b border-[#242730]">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-[28px] leading-none font-bold text-white">Đoạn chat</h1>
              <button className="w-9 h-9 rounded-full bg-[#2B2F3A] hover:bg-[#373C49] text-gray-200 flex items-center justify-center transition-colors">
                <PenSquare className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-500/20 text-blue-300">Tất cả</button>
              <button className="px-3 py-1 rounded-full text-sm font-semibold text-gray-300 hover:bg-[#2B2F3A]">Chưa đọc</button>
              <button className="px-3 py-1 rounded-full text-sm font-semibold text-gray-300 hover:bg-[#2B2F3A]">Nhóm</button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="Tìm kiếm trên Messenger"
                className="w-full bg-[#242730] text-gray-100 rounded-full pl-9 pr-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
            {isLoadingConversations && (
              <p className="px-4 py-3 text-sm text-gray-400">Đang tải hội thoại...</p>
            )}

            {!isLoadingConversations && filteredConversations.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-400">Chưa có hội thoại nào.</p>
            )}

            {filteredConversations.map((conversation) => {
              const isActive = conversation.id === selectedConversationId;
              const peerId = getPrivatePeerId(conversation);
              const peerProfile = peerId ? userProfilesById[peerId] : null;
              const displayName =
                (selectedConversationId === conversation.id ? targetUserProfile?.username : undefined) ||
                conversation.title ||
                peerProfile?.username ||
                `Đoạn chat ${conversation.id.slice(0, 8)}`;
              const displayAvatar =
                peerProfile?.avatar ||
                `https://picsum.photos/seed/${peerId || conversation.id}/48/48`;
              const preview = getCallLogPreview(
                conversation.lastMessage?.content,
                conversation.lastMessage?.senderId === currentUserId,
              );
              const imageUrl = parseImageMessage(conversation.lastMessage?.content);
              const voiceInfo = parseVoiceMessage(conversation.lastMessage?.content);
              const isFromMe = conversation.lastMessage?.senderId === currentUserId;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={`mx-2 w-[calc(100%-1rem)] flex items-center gap-3 text-left px-2.5 py-2.5 rounded-xl transition-colors ${
                    isActive ? 'bg-[#2A2F3B]' : 'hover:bg-[#232734]'
                  }`}
                >
                  <img
                    src={displayAvatar}
                    alt={displayName}
                    className="w-14 h-14 rounded-full object-cover shrink-0 cursor-pointer"
                    referrerPolicy="no-referrer"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (peerId) {
                        navigate(`/profile?userId=${peerId}`);
                      }
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[15px] font-semibold text-white truncate">{displayName}</h3>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {formatConversationTime(conversation.lastMessage?.createdAt || conversation.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-400 truncate">
                      {preview ||
                        (imageUrl ? (isFromMe ? 'Bạn đã gửi một ảnh' : 'Đã gửi một ảnh') : null) ||
                        (voiceInfo?.url ? (isFromMe ? 'Bạn đã gửi tin nhắn thoại' : 'Đã gửi tin nhắn thoại') : null) ||
                        conversation.lastMessage?.content ||
                        'Bắt đầu cuộc trò chuyện mới'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-[#0f1118]">
          <header className="h-16 border-b border-[#242730] px-5 flex items-center justify-between bg-[#16181f]">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={
                  targetUserProfile?.avatar ||
                  selectedPeerProfile?.avatar ||
                  `https://picsum.photos/seed/${selectedConversationId || 'empty'}/40/40`
                }
                alt={selectedTitle}
                className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-90"
                referrerPolicy="no-referrer"
                onClick={() => {
                  if (selectedPeerId) {
                    navigate(`/profile?userId=${selectedPeerId}`);
                  }
                }}
              />
              <div className="min-w-0">
                <h2 className="text-white font-semibold truncate">{selectedTitle}</h2>
                <p className="text-xs text-gray-400">{formatActiveStatus(selectedConversation ? selectedPresenceProfile : null)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartAudioCall}
                disabled={!selectedConversationId || !selectedPeerId}
                className="w-9 h-9 rounded-full bg-[#212633] text-blue-400 hover:bg-[#2b3242] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleStartVideoCall}
                disabled={!selectedConversationId || !selectedPeerId}
                className="w-9 h-9 rounded-full bg-[#212633] text-blue-400 hover:bg-[#2b3242] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Video className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-full bg-[#212633] text-gray-300 hover:bg-[#2b3242] flex items-center justify-center">
                <Info className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-full bg-[#212633] text-gray-300 hover:bg-[#2b3242] flex items-center justify-center">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-6 py-5 space-y-3 custom-scrollbar">
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}

            {isLoadingMessages && (
              <p className="text-sm text-gray-400">Đang tải tin nhắn...</p>
            )}

            {!isLoadingMessages && selectedConversation && messages.length === 0 && (
              <p className="text-sm text-gray-400">Chưa có tin nhắn nào. Hãy gửi tin nhắn đầu tiên.</p>
            )}

            {!selectedConversation && (
              <p className="text-sm text-gray-400">Chọn hội thoại ở bên trái để bắt đầu nhắn tin.</p>
            )}

            {messages.map((message) => {
              const isMine = currentUserId && message.senderId === currentUserId;
              const callLog = parseCallLog(message.content);
              const callPreview = getCallLogPreview(message.content, isMine);
              const imageUrl = parseImageMessage(message.content);
              const voiceInfo = parseVoiceMessage(message.content);

              return (
                <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[68%] rounded-[20px] px-3.5 py-2.5 ${
                      isMine
                        ? 'bg-[#1f7aff] text-white rounded-br-md'
                        : 'bg-[#262b39] text-gray-100 rounded-bl-md'
                    }`}
                  >
                    {callLog.isCallLog ? (
                      <div className="flex items-center gap-2">
                        {callLog.status === 'missed' ? (
                          <PhoneMissed className={`w-4 h-4 ${isMine ? 'text-blue-100' : 'text-red-300'}`} />
                        ) : (
                          <PhoneCall className={`w-4 h-4 ${isMine ? 'text-blue-100' : 'text-emerald-300'}`} />
                        )}
                        <p className="text-[14px]">{callPreview || 'Lịch sử cuộc gọi'}</p>
                      </div>
                    ) : imageUrl ? (
                      <div className="space-y-1">
                        <img
                          src={imageUrl}
                          alt="Sent media"
                          className="max-w-[280px] max-h-[280px] rounded-xl object-cover cursor-zoom-in"
                          referrerPolicy="no-referrer"
                          onClick={() => setPreviewImageUrl(imageUrl)}
                        />
                      </div>
                    ) : voiceInfo?.url ? (
                      <div className="space-y-1">
                        <audio controls src={voiceInfo.url} className="max-w-[260px]" />
                        {voiceInfo.duration ? (
                          <p className={`text-xs ${isMine ? 'text-blue-100/90' : 'text-gray-300'}`}>
                            Tin nhắn thoại {voiceInfo.duration}s
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[15px] leading-relaxed break-words">{message.content}</p>
                    )}
                    <span className={`mt-1 block text-right text-[10px] ${isMine ? 'text-blue-100/90' : 'text-gray-400'}`}>
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </main>

          <footer className="border-t border-[#242730] bg-[#16181f] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={!selectedConversation || isUploadingImage || isUploadingVoice}
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-full hover:bg-[#242730] text-blue-400 flex items-center justify-center disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-full hover:bg-[#242730] text-blue-400 flex items-center justify-center">
                <Sticker className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!selectedConversation || isUploadingVoice || isUploadingImage}
                onClick={() => void handleToggleVoiceRecord()}
                className={`w-8 h-8 rounded-full text-blue-400 flex items-center justify-center disabled:opacity-50 ${
                  isRecordingVoice ? 'bg-red-500/20 text-red-400' : 'hover:bg-[#242730]'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>
              {isRecordingVoice && (
                <button
                  type="button"
                  onClick={handleCancelVoiceRecord}
                  className="w-8 h-8 rounded-full hover:bg-[#242730] text-red-400 flex items-center justify-center"
                  title="Hủy ghi âm"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <div className="flex-1 flex items-center rounded-full bg-[#242730] px-4 py-2.5">
                <input
                  type="text"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={onMessageInputKeyDown}
                  placeholder={selectedConversation ? 'Aa' : 'Hãy chọn một hội thoại trước'}
                  disabled={!selectedConversation || isSending}
                  className="flex-1 bg-transparent text-white text-sm placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                />
                <button
                  type="button"
                  onClick={() => setIsEmojiOpen((prev) => !prev)}
                  className="w-7 h-7 rounded-full hover:bg-[#323746] text-blue-400 flex items-center justify-center"
                >
                  <Smile className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleSendMessage()}
                disabled={!selectedConversation || !draftMessage.trim() || isSending || isUploadingImage || isUploadingVoice}
                className="w-9 h-9 rounded-full bg-[#1f7aff] text-white hover:bg-[#2a84ff] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            {(isUploadingImage || isUploadingVoice || isRecordingVoice) && (
              <div className="mt-2">
                <p className="text-xs text-blue-300">
                  {isUploadingImage ? 'Đang tải ảnh...' : isUploadingVoice ? 'Đang gửi ghi âm...' : `Đang ghi âm... ${recordingSeconds}s`}
                </p>
                {isRecordingVoice && !isUploadingVoice && (
                  <div className="mt-1.5 flex items-end gap-1 h-7">
                    {voiceWaveBars.map((bar, idx) => (
                      <span
                        key={`${idx}-${bar}`}
                        className="w-1.5 rounded-full bg-blue-400/90 transition-all duration-100"
                        style={{ height: `${bar}px` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {isEmojiOpen && (
              <div className="mt-2 rounded-xl bg-[#242730] border border-[#313645] px-3 py-2 flex items-center gap-2 text-lg">
                {['😀', '😂', '😍', '😭', '😎', '👍', '❤️', '🔥', '🎉', '🙏'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setDraftMessage((prev) => `${prev}${emoji}`)}
                    className="hover:scale-110 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handlePickImage(event)}
            />
          </footer>
        </section>
      </div>
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewImageUrl}
            alt="Preview"
            className="max-w-[92vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}
