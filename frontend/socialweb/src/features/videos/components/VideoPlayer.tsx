import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  X,
  Volume2,
  VolumeX,
  Play,
  Video,
  MoreHorizontal,
} from 'lucide-react';
import {
  fetchShortVideoPosts,
  togglePostReaction,
  recordPostShare,
  type FeedPost,
} from '@/api/posts';
import { useUser } from '@/features/auth/context/UserContext';
import CommentPanel from '@/components/ui/CommentPanel';

/* ─── Types ─────────────────────────────────────────── */
type ShortVideoItem = {
  id: string;
  title: string;
  description: string;
  views: string;
  likes: number;
  comments: number;
  shares: number;
  time: string;
  likedByMe: boolean;
  user: { name: string; avatar: string };
  thumbnail: string;
  videoUrl: string;
};


/* ─── Helpers ────────────────────────────────────────── */
function fmtCount(n: number): string {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 10_000) return `${Math.round(x / 1000)}K`;
  if (x >= 1_000) return `${(x / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(x);
}

function mapApiToVideo(item: FeedPost): ShortVideoItem {
  return {
    id: item.id,
    title: item.content.slice(0, 80) || 'Short video',
    description: item.content,
    views: '0',
    likes: item.likeCount ?? 0,
    comments: item.commentCount ?? 0,
    shares: item.shareCount ?? 0,
    time: 'Vừa xong',
    likedByMe: item.likedByMe ?? false,
    user: {
      name: `@${item.author.username}`,
      avatar:
        item.author.avatar ||
        `https://picsum.photos/seed/${item.author.id}/50/50`,
    },
    thumbnail:
      item.imageUrl || `https://picsum.photos/seed/${item.id}-short/800/450`,
    videoUrl: item.shortVideoUrl || '',
  };
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */
export default function VideoPlayer() {

  const { user } = useUser();
  const containerRef = useRef<HTMLDivElement>(null);

  /* State */
  const [videos, setVideos] = useState<ShortVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  /* ── Load short videos from API ── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const res = await fetchShortVideoPosts(1, 50);
        if (cancelled) return;
        const apiVideos = res.items
          .filter((item: FeedPost) => Boolean(item.shortVideoUrl))
          .map(mapApiToVideo);
        setVideos(apiVideos);
      } catch {
        setVideos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  /* ── Keyboard navigation (↑↓) ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        containerRef.current.scrollBy({ top: containerRef.current.clientHeight, behavior: 'smooth' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        containerRef.current.scrollBy({ top: -containerRef.current.clientHeight, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  /* ── Toggle like ── */
  const handleToggleLike = async (videoId: string) => {
    if (!user?.id) return;

    // Optimistic update
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              likedByMe: !v.likedByMe,
              likes: Math.max(0, v.likes + (v.likedByMe ? -1 : 1)),
            }
          : v,
      ),
    );

    try {
      const res = await togglePostReaction(videoId);
      setVideos((prev) =>
        prev.map((v) => {
          if (v.id !== videoId) return v;
          const prevLiked = !res.liked; // before toggle
          const delta = res.liked ? 1 : -1;
          const wasWrong = v.likedByMe !== res.liked;
          return {
            ...v,
            likedByMe: res.liked,
            likes: wasWrong ? Math.max(0, v.likes + delta) : v.likes,
          };
        }),
      );
    } catch {
      // Rollback
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? {
                ...v,
                likedByMe: !v.likedByMe,
                likes: Math.max(0, v.likes + (v.likedByMe ? -1 : 1)),
              }
            : v,
        ),
      );
    }
  };

  /* ── Toggle comments panel ── */
  const openComments = (videoId: string) => {
    setActiveVideoId(prev => prev === videoId ? null : videoId);
  };

  /* ── Share ── */
  const handleShare = async (videoId: string) => {
    try {
      await recordPostShare(videoId);
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, shares: v.shares + 1 } : v)),
      );
    } catch {
      // Bỏ qua lỗi share
    }
  };

  const activeVideo = videos.find((v) => v.id === activeVideoId);

  return (
    <div className="flex h-full bg-[#121212] rounded-2xl overflow-hidden border border-[#2A2A2A]">
      {/* ── Main Feed ── */}
      <div
        ref={containerRef}
        className="flex-1 h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar relative focus:outline-none scroll-smooth"
        tabIndex={0}
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {!loading && videos.length === 0 && (
          <div className="flex items-center justify-center h-full flex-col space-y-4">
            <Video className="w-16 h-16 text-gray-500" />
            <p className="text-gray-400 text-lg">Chưa có video nào.</p>
          </div>
        )}
        {!loading &&
          videos.map((video) => (
            <ShortVideo
              key={video.id}
              video={video}
              userId={user?.id ?? null}
              onOpenComments={() => void openComments(video.id)}
              onToggleLike={() => void handleToggleLike(video.id)}
              onShare={() => void handleShare(video.id)}
            />
          ))}
      </div>

      {/* ── Comments Panel (sidebar) ── */}
      {activeVideoId && activeVideo && (
        <div className="w-96 bg-[#1A1A1A] border-l border-[#2A2A2A] flex flex-col h-full shrink-0 animate-in slide-in-from-right-8 duration-300">
          {/* Header */}
          <div className="h-16 border-b border-[#2A2A2A] flex items-center justify-between px-4 shrink-0">
            <h3 className="text-white font-semibold">
              Bình luận ({fmtCount(activeVideo.comments)})
            </h3>
            <button
              onClick={() => setActiveVideoId(null)}
              className="text-gray-400 hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CommentPanel takes the rest */}
          <CommentPanel
            postId={activeVideoId}
            isOpen={true}
            currentUser={user ? { id: user.id, username: user.username, avatar: user.avatar } : null}
            variant="panel"
            onCommentAdded={() =>
              setVideos(prev =>
                prev.map(v => v.id === activeVideoId ? { ...v, comments: v.comments + 1 } : v)
              )
            }
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ShortVideo card
   ═══════════════════════════════════════════════════════ */
const ShortVideo: React.FC<{
  video: ShortVideoItem;
  userId: string | null;
  onOpenComments: () => void;
  onToggleLike: () => void;
  onShare: () => void;
}> = ({
  video,
  userId,
  onOpenComments,
  onToggleLike,
  onShare,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isSaved, setIsSaved] = useState(false);

  /* ── Auto-play when intersecting ── */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            videoRef.current?.play().catch(() => {});
            setIsPlaying(true);
          } else {
            videoRef.current?.pause();
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.currentTime = 0;
          }
        });
      },
      { threshold: 0.6 },
    );
    if (videoRef.current) observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <div className="h-full w-full snap-center snap-always flex justify-center items-center py-4 bg-[#121212]">
      <div className="relative w-full max-w-[400px] h-full bg-black rounded-2xl overflow-hidden shadow-2xl group">
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnail}
          loop
          muted={isMuted}
          playsInline
          onClick={togglePlay}
          className="w-full h-full object-cover cursor-pointer"
        />

        {/* Play overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </div>
        )}

        {/* Mute toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
          className="absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center hover:bg-black/60 transition-colors z-10"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
        </button>

        {/* Bottom overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 pt-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none flex flex-col justify-end">
          <div className="flex items-center space-x-3 mb-3 pointer-events-auto">
            <img
              src={video.user.avatar}
              alt={video.user.name}
              className="w-10 h-10 rounded-full border border-gray-600 object-cover"
              referrerPolicy="no-referrer"
            />
            <span className="text-white font-semibold text-base">{video.user.name}</span>
          </div>
          <p className="text-white text-sm mb-3 pointer-events-auto line-clamp-3">
            {video.description}
          </p>
          {/* Stats chip */}
          <div className="flex items-center space-x-3 text-gray-300 text-xs font-medium pointer-events-auto bg-white/10 w-fit px-3 py-1.5 rounded-lg backdrop-blur-sm">
            <span>{fmtCount(video.likes)} Thích</span>
            <span>•</span>
            <span>{fmtCount(video.comments)} Bình luận</span>
            <span>•</span>
            <span>{fmtCount(video.shares)} Chia sẻ</span>
          </div>
        </div>
      </div>

      {/* Right action buttons (Outside video) */}
      <div className="flex flex-col justify-end items-center h-full pb-8 space-y-6 ml-4">
        {/* Like */}
        <button
          onClick={() => {
            if (userId) onToggleLike();
          }}
          className="flex flex-col items-center group/btn"
          title={userId ? undefined : 'Đăng nhập để thích'}
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors mb-1 ${
              video.likedByMe
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : 'bg-white/10 hover:bg-white/20'
            }`}
          >
            <Heart
              className={`w-6 h-6 ${video.likedByMe ? 'text-red-500 fill-red-500' : 'text-white'}`}
            />
          </div>
          <span className="text-gray-300 text-xs font-medium">
            {fmtCount(video.likes)}
          </span>
        </button>

        {/* Comment */}
        <button onClick={onOpenComments} className="flex flex-col items-center group/btn">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors mb-1">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-gray-300 text-xs font-medium">
            {fmtCount(video.comments)}
          </span>
        </button>

        {/* Save */}
        <button onClick={() => setIsSaved(!isSaved)} className="flex flex-col items-center group/btn">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors mb-1">
            <Bookmark
              className={`w-6 h-6 ${isSaved ? 'text-yellow-500 fill-yellow-500' : 'text-white'}`}
            />
          </div>
          <span className="text-gray-300 text-xs font-medium">Lưu</span>
        </button>

        {/* Share */}
        <button onClick={onShare} className="flex flex-col items-center group/btn">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors mb-1">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-gray-300 text-xs font-medium">
            {fmtCount(video.shares)}
          </span>
        </button>
      </div>
    </div>
  );
}
