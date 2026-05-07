import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Globe,
  MessageSquare,
  MoreHorizontal,
  Send,
  Share2,
  ThumbsUp,
  Users,
  Video,
  Image as ImageIcon,
  Smile,
  Search,
} from 'lucide-react';
import { useUser } from '@/features/auth/context/UserContext';
import {
  createPost,
  fetchFeedPosts,
  fetchFriendsFeedPosts,
  togglePostReaction,
  createPostComment,
  uploadPostMedia,
  fetchStories,
} from '@/api/posts';
import type { FeedPost, PostCommentItem, UploadMediaType } from '@/api/posts';
import { fetchFriends } from '@/api/friends';
import type { FriendItem } from '@/api/friends';
import CreatePostModal from '@/components/ui/CreatePostModal';
import CreateStoryModal from '@/components/ui/CreateStoryModal';
import PostOwnerMenu from '@/components/ui/PostOwnerMenu';
import ShareModal from '@/components/ui/ShareModal';
import CommentPanel from '@/components/ui/CommentPanel';

type HomePost = {
  id: string;
  authorId: string;
  user: { name: string; avatar: string; time: string; isPage: boolean };
  content: string;
  image?: string;
  postType?: string;
  shortVideoUrl?: string;
  stats: { likes: number; comments: number; shares: number };
  liked: boolean;
};

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Vừa xong';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

function formatEngagementCount(n: number): string {
  const x = Math.max(0, Math.floor(Number(n) || 0));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (x >= 10_000) return `${Math.round(x / 1000)}K`;
  if (x >= 1000) return `${(x / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(x);
}

function mapApiPostToHome(item: FeedPost): HomePost {
  return {
    id: item.id,
    authorId: item.author.id,
    user: {
      name: item.author.username,
      avatar: item.author.avatar || `https://picsum.photos/seed/${item.author.id}/50/50`,
      time: formatRelativeTime(item.createdAt),
      isPage: false,
    },
    content: item.content,
    image: item.imageUrl || undefined,
    postType: item.postType,
    shortVideoUrl: item.shortVideoUrl ?? undefined,
    stats: {
      likes: item.likeCount ?? 0,
      comments: item.commentCount ?? 0,
      shares: item.shareCount ?? 0,
    },
    liked: item.likedByMe ?? false,
  };
}

type StoryItem = {
  id: string;
  user: string;
  avatar: string;
  image: string;
  isUser?: boolean;
};

const DEFAULT_STORY: StoryItem = { 
  id: 'create-story', 
  user: 'Your Story', 
  avatar: 'https://picsum.photos/seed/user1/40/40', 
  image: 'https://picsum.photos/seed/story1/150/250', 
  isUser: true 
};

export default function Home() {
  const { user, isLoading: userLoading } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharePostId, setSharePostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<HomePost[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([DEFAULT_STORY]);
  const [contacts, setContacts] = useState<FriendItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const loadFeed = useCallback(async (signal?: { cancelled: boolean }) => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      // Lấy feed chính
      let feedResponse: { items: any[] } = { items: [] };
      if (user?.id) {
        try {
          feedResponse = await fetchFriendsFeedPosts(1, 20);
        } catch (friendsErr: any) {
          // Fallback: nếu friends-feed lỗi, thử public feed
          console.warn('[Feed] friends-feed lỗi, fallback sang public feed:', friendsErr?.response?.data ?? friendsErr?.message);
          try {
            feedResponse = await fetchFeedPosts(1, 20);
          } catch (pubErr: any) {
            console.error('[Feed] public feed cũng lỗi:', pubErr?.response?.data ?? pubErr?.message);
            throw pubErr;
          }
        }
      } else {
        feedResponse = await fetchFeedPosts(1, 20);
      }

      const friendsResponse = user?.id
        ? await fetchFriends({ page: 1, limit: 20 }).catch(() => ({ items: [] as any[] }))
        : { items: [] as any[] };

      const storiesResponse = user?.id
        ? await fetchStories().catch(() => ({ items: [] }))
        : { items: [] };

      if (signal?.cancelled) return;
      setPosts(feedResponse?.items?.map(mapApiPostToHome) || []);
      
      const apiStories = storiesResponse.items.map((s: FeedPost) => ({
        id: s.id,
        user: s.author.username,
        avatar: s.author.avatar || `https://picsum.photos/seed/${s.author.id}/40/40`,
        image: s.imageUrl || `https://picsum.photos/seed/${s.id}/150/250`,
        isUser: s.author.id === user?.id
      }));

      setStories([
        { ...DEFAULT_STORY, avatar: user?.avatar || DEFAULT_STORY.avatar },
        ...apiStories.filter(s => s.id !== 'create-story')
      ]);

      setContacts(friendsResponse?.items || []);
    } catch (err: any) {
      if (!signal?.cancelled) {
        setPosts([]);
        setContacts([]);
        const msg = err?.response?.data?.message ?? err?.message ?? 'Lỗi kết nối máy chủ';
        setFeedError(Array.isArray(msg) ? msg.join(', ') : String(msg));
      }
    } finally {
      if (!signal?.cancelled) {
        setFeedLoading(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (searchParams.get('createPost') !== '1') {
      return;
    }

    setIsCreatePostOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('createPost');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    // Chờ UserContext xác thực xong trước khi fetch feed
    if (userLoading) return;

    const signal = { cancelled: false };
    void loadFeed(signal);
    return () => { signal.cancelled = true; };
  }, [userLoading, loadFeed]);

  const handleCreatePost = async (payload: {
    content: string;
    imageUrl?: string;
    postType?: 'POST' | 'SHORT_VIDEO';
    shortVideoUrl?: string;
  }) => {
    const created = await createPost(payload);

    // Optimistic: thêm bài ngay để UX mượt
    const newPost = mapApiPostToHome({
      ...created,
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      likedByMe: false,
    });
    setPosts((prev) => [newPost, ...prev]);

    // Refetch từ server để đồng bộ (tránh mất bài khi reload)
    void loadFeed();
  };


  const handleUploadMedia = async (file: File, mediaType: UploadMediaType) => {
    const uploaded = await uploadPostMedia(file, mediaType);
    return uploaded.url;
  };

  const toggleComment = (postId: string) => {
    setActiveCommentPostId(prev => prev === postId ? null : postId);
  };

  const handleToggleLike = async (postId: string) => {
    if (!user?.id) return;
    const prev = posts.find((p) => p.id === postId);
    if (!prev) return;
    const prevLiked = prev.liked;

    setPosts((list) =>
      list.map((p) =>
        p.id === postId
          ? {
              ...p,
              liked: !p.liked,
              stats: {
                ...p.stats,
                likes: Math.max(0, p.stats.likes + (p.liked ? -1 : 1)),
              },
            }
          : p,
      ),
    );

    try {
      const res = await togglePostReaction(postId);
      const likes =
        res.liked && !prevLiked
          ? prev.stats.likes + 1
          : !res.liked && prevLiked
            ? Math.max(0, prev.stats.likes - 1)
            : prev.stats.likes;
      setPosts((list) =>
        list.map((p) =>
          p.id === postId ? { ...p, liked: res.liked, stats: { ...p.stats, likes } } : p,
        ),
      );
    } catch {
      setPosts((list) =>
        list.map((p) =>
          p.id === postId
            ? { ...p, liked: prevLiked, stats: { ...p.stats, likes: prev.stats.likes } }
            : p,
        ),
      );
    }
  };



  const openShare = (postId: string) => {
    setSharePostId(postId);
    setIsShareModalOpen(true);
  };

  const bumpShareCount = (postId: string) => {
    setPosts((list) =>
      list.map((p) =>
        p.id === postId ? { ...p, stats: { ...p.stats, shares: p.stats.shares + 1 } } : p,
      ),
    );
  };

  return (
    <div className="flex justify-center gap-8 h-full">
      {/* Center Feed Column */}
      <div className="flex-1 max-w-[680px] overflow-y-auto custom-scrollbar pb-20 space-y-6">
        
        {/* Stories Section */}
        <div className="flex space-x-2 overflow-x-auto custom-scrollbar pb-2">
          {stories.map((story) => (
            <div 
              key={story.id} 
              className="relative w-28 h-48 rounded-xl overflow-hidden shrink-0 cursor-pointer group"
              onClick={() => story.isUser && setIsCreateStoryOpen(true)}
            >
              <img src={story.image} alt="Story" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80"></div>
              
              {story.isUser ? (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex flex-col items-center w-full">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-[#1A1A1A] -mb-4 z-10">
                    <span className="text-white text-lg font-bold leading-none">+</span>
                  </div>
                  <div className="bg-[#1A1A1A] w-full pt-5 pb-2 text-center">
                    <span className="text-white text-xs font-medium">Create Story</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="absolute top-3 left-3 w-10 h-10 rounded-full border-4 border-blue-500 overflow-hidden">
                    <img src={story.avatar} alt={story.user} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <span className="absolute bottom-3 left-3 text-white text-sm font-medium leading-tight pr-2">
                    {story.user}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Create Post Box */}
        <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-4 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <img
              src={user?.avatar || 'https://picsum.photos/seed/user1/40/40'}
              alt="User"
              className="w-10 h-10 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div 
              onClick={() => setIsCreatePostOpen(true)}
              className="flex-1 bg-[#2A2A2A] hover:bg-[#333333] text-gray-400 rounded-full px-4 py-2.5 cursor-pointer transition-colors flex items-center"
            >
              Bạn đang nghĩ gì?
            </div>
          </div>
          <div className="border-t border-[#2A2A2A] pt-3 flex justify-between">
            <button 
              onClick={() => setIsCreatePostOpen(true)}
              className="flex-1 flex items-center justify-center space-x-2 hover:bg-[#2A2A2A] py-2 rounded-lg transition-colors text-gray-400 font-medium"
            >
              <Video className="w-6 h-6 text-red-500" />
              <span>Video trực tiếp</span>
            </button>
            <button 
              onClick={() => setIsCreatePostOpen(true)}
              className="flex-1 flex items-center justify-center space-x-2 hover:bg-[#2A2A2A] py-2 rounded-lg transition-colors text-gray-400 font-medium"
            >
              <ImageIcon className="w-6 h-6 text-green-500" />
              <span>Ảnh/Video</span>
            </button>
            <button 
              onClick={() => setIsCreatePostOpen(true)}
              className="flex-1 flex items-center justify-center space-x-2 hover:bg-[#2A2A2A] py-2 rounded-lg transition-colors text-gray-400 font-medium hidden sm:flex"
            >
              <Smile className="w-6 h-6 text-yellow-500" />
              <span>Cảm xúc/Hoạt động</span>
            </button>
          </div>
        </div>

        {/* Feed Posts */}
        <div className="space-y-6">
          {feedLoading && (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] p-4 animate-pulse">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#2A2A2A]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-[#2A2A2A] rounded w-1/3" />
                      <div className="h-2 bg-[#2A2A2A] rounded w-1/4" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-[#2A2A2A] rounded w-full" />
                    <div className="h-3 bg-[#2A2A2A] rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!feedLoading && feedError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
              <p className="text-red-400 text-sm font-medium mb-1">Không thể tải bảng tin</p>
              <p className="text-red-400/70 text-xs mb-4 font-mono break-all">{feedError}</p>
              <button
                onClick={() => void loadFeed()}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-semibold rounded-lg transition-colors"
              >
                Thử lại
              </button>
            </div>
          )}
          {!feedLoading && !feedError && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 font-medium mb-1">Chưa có bài viết nào</p>
              <p className="text-gray-600 text-sm mb-4">Hãy đăng bài hoặc kết bạn để xem thêm nội dung</p>
              <button
                onClick={() => void loadFeed()}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333] text-gray-400 text-sm rounded-lg transition-colors"
              >
                Tải lại
              </button>
            </div>
          )}
          {posts.map((post) => (
            <div key={post.id} className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] shadow-sm overflow-hidden">
              {/* Post Header */}
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img src={post.user.avatar} alt={post.user.name} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                  <div>
                    <h3 className="text-white font-semibold text-[15px] hover:underline cursor-pointer">
                      {post.user.name}
                    </h3>
                    <div className="flex items-center text-gray-400 text-xs space-x-1">
                      <span>{post.user.time}</span>
                      <span>•</span>
                      {post.user.isPage ? <Globe className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
                {user?.id && post.authorId === user.id ? (
                  <PostOwnerMenu
                    postId={String(post.id)}
                    viewerId={user.id}
                    authorId={post.authorId}
                    onRemoved={() =>
                      setPosts((prev) => prev.filter((p) => String(p.id) !== String(post.id)))
                    }
                    onHiddenUpdated={(hidden) => {
                      if (hidden) {
                        setPosts((prev) => prev.filter((p) => String(p.id) !== String(post.id)));
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="w-8 h-8 rounded-full hover:bg-[#2A2A2A] flex items-center justify-center text-gray-400 transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Post Content */}
              <div className="px-4 pb-3">
                <p className="text-gray-200 text-[15px] leading-relaxed whitespace-pre-line">
                  {post.content}
                </p>
              </div>

              {/* Post Image */}
              {post.image && (
                <div className="w-full max-h-[600px] overflow-hidden bg-black flex items-center justify-center cursor-pointer">
                  <img src={post.image} alt="Post content" className="w-full object-contain max-h-[600px]" referrerPolicy="no-referrer" />
                </div>
              )}

              {post.shortVideoUrl && (
                <div className="w-full max-h-[600px] overflow-hidden bg-black flex items-center justify-center">
                  <video
                    src={post.shortVideoUrl}
                    controls
                    playsInline
                    className="w-full object-contain max-h-[600px]"
                  />
                </div>
              )}

              {/* Post Stats */}
              <div className="px-4 py-3 flex items-center justify-between text-gray-400 text-sm border-b border-[#2A2A2A] mx-4">
                <div className="flex items-center space-x-1.5 cursor-pointer hover:underline">
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <ThumbsUp className="w-3 h-3 text-white fill-white" />
                  </div>
                  <span>{formatEngagementCount(post.stats.likes)}</span>
                </div>
                <div className="flex space-x-3">
                  <span className="cursor-pointer hover:underline">
                    {formatEngagementCount(post.stats.comments)} bình luận
                  </span>
                  <span className="cursor-pointer hover:underline">
                    {formatEngagementCount(post.stats.shares)} lượt chia sẻ
                  </span>
                </div>
              </div>

              {/* Post Actions */}
              <div className="px-4 py-1 flex justify-between">
                <button
                  type="button"
                  disabled={!user?.id}
                  onClick={() => void handleToggleLike(post.id)}
                  className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors font-medium disabled:opacity-40 disabled:cursor-not-allowed ${post.liked ? 'text-blue-500 hover:bg-blue-500/10' : 'text-gray-400 hover:bg-[#2A2A2A]'}`}
                >
                  <ThumbsUp className={`w-5 h-5 ${post.liked ? 'fill-blue-500' : ''}`} />
                  <span>Thích</span>
                </button>
                <button 
                  type="button"
                  onClick={() => toggleComment(post.id)}
                  className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors text-gray-400 font-medium hover:bg-[#2A2A2A]"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>Bình luận</span>
                </button>
                <button 
                  type="button"
                  onClick={() => openShare(post.id)}
                  className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors text-gray-400 font-medium hover:bg-[#2A2A2A]"
                >
                  <Share2 className="w-5 h-5" />
                  <span>Chia sẻ</span>
                </button>
              </div>

              {/* Comment Section */}
              {activeCommentPostId === post.id && (
                <CommentPanel
                  postId={post.id}
                  isOpen={true}
                  currentUser={user ? { id: user.id, username: user.username, avatar: user.avatar } : null}
                  variant="inline"
                  onCommentAdded={() =>
                    setPosts(list =>
                      list.map(p =>
                        p.id === post.id
                          ? { ...p, stats: { ...p.stats, comments: p.stats.comments + 1 } }
                          : p,
                      ),
                    )
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Sidebar (Contacts & Sponsored) */}
      <div className="hidden xl:block w-[320px] shrink-0 overflow-y-auto custom-scrollbar pb-20 pr-2 space-y-6">
        {/* Sponsored */}
        <div>
          <h3 className="text-gray-400 font-semibold text-[15px] mb-4">Sponsored</h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-3 cursor-pointer group">
              <img src="https://picsum.photos/seed/ad1/120/120" alt="Ad" className="w-28 h-28 rounded-lg object-cover" referrerPolicy="no-referrer" />
              <div>
                <h4 className="text-white font-medium text-[15px] group-hover:underline">Learn React Fast</h4>
                <p className="text-gray-400 text-xs mt-1">react-mastery.com</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 cursor-pointer group">
              <img src="https://picsum.photos/seed/ad2/120/120" alt="Ad" className="w-28 h-28 rounded-lg object-cover" referrerPolicy="no-referrer" />
              <div>
                <h4 className="text-white font-medium text-[15px] group-hover:underline">Premium UI Kits</h4>
                <p className="text-gray-400 text-xs mt-1">design-assets.io</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#2A2A2A] my-2"></div>

        {/* Contacts */}
        <div>
          <div className="flex items-center justify-between mb-4 text-gray-400">
            <h3 className="font-semibold text-[15px]">Contacts</h3>
            <div className="flex space-x-2">
              <button className="w-8 h-8 rounded-full hover:bg-[#2A2A2A] flex items-center justify-center transition-colors">
                <Search className="w-4 h-4" />
              </button>
              <button className="w-8 h-8 rounded-full hover:bg-[#2A2A2A] flex items-center justify-center transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {contacts.map((contact) => (
              <div key={contact.user.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors">
                <div className="relative">
                  <img src={contact.user.avatar || `https://picsum.photos/seed/${contact.user.id}/36/36`} alt={contact.user.username} className="w-9 h-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                  {contact.user.isOnline && (
                    <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-[#121212]" />
                  )}
                </div>
                <span className="text-gray-200 font-medium text-[15px]">{contact.user.username}</span>
              </div>
            ))}
            {user?.id && contacts.length === 0 && (
              <p className="text-gray-500 text-sm p-2">Chưa có bạn bè.</p>
            )}
            {!user?.id && (
              <p className="text-gray-500 text-sm p-2">Đăng nhập để xem.</p>
            )}
          </div>
        </div>
      </div>

      <CreatePostModal 
        isOpen={isCreatePostOpen} 
        onClose={() => setIsCreatePostOpen(false)} 
        onSubmit={handleCreatePost}
        onUploadMedia={handleUploadMedia}
      />
      <CreateStoryModal 
        isOpen={isCreateStoryOpen} 
        onClose={() => setIsCreateStoryOpen(false)}
        onStoryCreated={() => void loadFeed()}
      />
      <ShareModal 
        isOpen={isShareModalOpen} 
        onClose={() => {
          setIsShareModalOpen(false);
          setSharePostId(null);
        }}
        postId={sharePostId}
        onShareRecorded={() => {
          if (sharePostId) bumpShareCount(sharePostId);
        }}
      />
    </div>
  );
}
