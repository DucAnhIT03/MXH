import React, { useState, useEffect, useRef } from 'react';
import { Camera, Edit2, ChevronDown, MoreHorizontal, ImageIcon, Video, Smile, Globe, Users, X, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import * as userApi from '@/api/user';
import type { UserProfile, FriendItem } from '@/api/user';
import { useUser } from '@/features/auth/context/UserContext';
import {
  createPost,
  fetchFeedPosts,
  fetchMyPosts,
  fetchPostsByUserId,
  fetchShortVideoPosts,
  uploadPostMedia,
  type FeedPost,
} from '@/api/posts';
import PostOwnerMenu from '@/components/ui/PostOwnerMenu';

const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=10B981&color=fff&size=200&name=';
const DEFAULT_COVER = 'https://picsum.photos/seed/cover_default/1200/400';

function getAvatar(user: UserProfile | null) {
  if (user?.avatar) return user.avatar;
  return `${DEFAULT_AVATAR}${encodeURIComponent(user?.username ?? 'U')}`;
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ profile, onClose, onSave }: {
  profile: UserProfile;
  onClose: () => void;
  onSave: (data: userApi.UpdateProfilePayload) => Promise<void>;
}) {
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave({ username, bio });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Lỗi cập nhật');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#242526] rounded-xl shadow-2xl w-full max-w-[500px] mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3A3B3C]">
          <h2 className="text-xl font-bold text-[#E4E6EB]">Chỉnh sửa trang cá nhân</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#3A3B3C] flex items-center justify-center text-[#E4E6EB] hover:bg-[#4E4F50]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#E4E6EB] mb-1.5">Tên người dùng</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              maxLength={20} minLength={3}
              className="w-full px-3 py-2 rounded-lg border border-[#3A3B3C] bg-[#3A3B3C] text-[#E4E6EB] focus:outline-none focus:ring-2 focus:ring-[#10B981] text-[15px]"
            />
            <p className="text-xs text-[#B0B3B8] mt-1">{username.length}/20 ký tự</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#E4E6EB] mb-1.5">Tiểu sử</label>
            <textarea
              value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={200}
              placeholder="Giới thiệu về bản thân..."
              className="w-full px-3 py-2 rounded-lg border border-[#3A3B3C] bg-[#3A3B3C] text-[#E4E6EB] focus:outline-none focus:ring-2 focus:ring-[#10B981] text-[15px] resize-none"
            />
            <p className="text-xs text-[#B0B3B8] mt-1">{bio.length}/200 ký tự</p>
          </div>
          {error && <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-3 py-2">⚠️ {error}</p>}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#3A3B3C] text-[#E4E6EB] font-semibold hover:bg-[#4E4F50]">Hủy</button>
          <button onClick={handleSave} disabled={saving || username.trim().length < 3}
            className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-semibold disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Profile() {
  const { user: currentUser, refreshUser } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileUserId = searchParams.get('userId') ?? '';
  const isViewingOtherProfile = Boolean(profileUserId);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsTotal, setFriendsTotal] = useState(0);
  const [followers, setFollowers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Bài viết');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postDraft, setPostDraft] = useState('');
  const [postMediaFile, setPostMediaFile] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const postMediaInputRef = useRef<HTMLInputElement>(null);
  const tabs = ['Bài viết', 'Giới thiệu', 'Bạn bè', 'Ảnh', 'Video'];

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        if (isViewingOtherProfile && profileUserId) {
          const [otherProfile, followersRes, followingRes] = await Promise.all([
            userApi.getProfile(profileUserId),
            userApi.getFollowers(profileUserId, 1, 1),
            userApi.getFollowing(profileUserId, 1, 1),
          ]);
          setProfile(otherProfile);
          setFriends([]);
          setFriendsTotal(followingRes.total);
          setFollowers(followersRes.total);
        } else {
          const [me, friendsRes, followersRes] = await Promise.all([
            userApi.getMe(),
            userApi.getFriends(1, 6),
            userApi.getMe().then(u => userApi.getFollowers(u.id, 1, 1)),
          ]);
          setProfile(me);
          setFriends(friendsRes.items);
          setFriendsTotal(friendsRes.total);
          setFollowers(followersRes.total);
        }
      } catch (err) {
        console.error('Load profile error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isViewingOtherProfile, profileUserId]);

  useEffect(() => {
    const loadPosts = async () => {
      if (!profile?.id) return;
      try {
        const merged = new Map<string, FeedPost>();

        try {
          const feed = await fetchFeedPosts(1, 50);
          for (const p of feed.items) {
            if (p.author?.id === profile.id) merged.set(p.id, p);
          }
        } catch {
          /* Giữ các nguồn khác nếu feed lỗi */
        }

        try {
          const shorts = await fetchShortVideoPosts(1, 50);
          for (const p of shorts.items) {
            if (p.author?.id === profile.id) merged.set(p.id, p);
          }
        } catch {
          /* ignore */
        }

        if (isViewingOtherProfile) {
          try {
            const pub = await fetchPostsByUserId(profile.id, 1, 50);
            for (const p of pub.items) merged.set(p.id, p);
          } catch {
            /* ignore */
          }
        } else {
          try {
            const mine = await fetchMyPosts(1, 50);
            for (const p of mine.items) merged.set(p.id, p);
          } catch {
            /* JWT/API “me/posts” lỗi vẫn còn bài từ feed/video phía trên */
          }
        }

        setPosts(
          Array.from(merged.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch {
        setPosts([]);
      }
    };
    void loadPosts();
  }, [profile?.id, isViewingOtherProfile]);

  const resetPostModal = () => {
    setPostDraft('');
    setPostMediaFile(null);
    setIsPostModalOpen(false);
    if (postMediaInputRef.current) {
      postMediaInputRef.current.value = '';
    }
  };

  const handleSubmitPost = async () => {
    if (isPosting) return;
    const content = postDraft.trim();
    if (!content && !postMediaFile) return;

    setIsPosting(true);
    setSaveError('');
    try {
      let imageUrl: string | undefined;
      let shortVideoUrl: string | undefined;
      let postType: 'POST' | 'SHORT_VIDEO' = 'POST';

      if (postMediaFile) {
        const isVideo = postMediaFile.type.startsWith('video/');
        const uploaded = await uploadPostMedia(postMediaFile, isVideo ? 'video' : 'image');
        if (isVideo) {
          postType = 'SHORT_VIDEO';
          shortVideoUrl = uploaded.url;
        } else {
          imageUrl = uploaded.url;
        }
      }

      const created = await createPost({
        content: content || ' ',
        imageUrl,
        postType,
        shortVideoUrl,
      });

      setPosts((prev) => [created, ...prev]);
      resetPostModal();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Không đăng được bài viết');
    } finally {
      setIsPosting(false);
    }
  };

  const handleSaveProfile = async (data: userApi.UpdateProfilePayload) => {
    const updated = await userApi.updateProfile(data);
    setProfile(updated);
    // Cập nhật tên mới lên toàn app (TopBar, Sidebar...) ngay lập tức
    await refreshUser();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    setSaveError('');
    try {
      const { url } = await userApi.uploadMedia(file, 'image');
      const updated = await userApi.updateProfile({ avatar: url });
      setProfile(updated);
      // Cập nhật TopBar và toàn app ngay lập tức
      await refreshUser();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Lỗi upload ảnh đại diện');
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingCover(true);
    setSaveError('');
    try {
      const { url } = await userApi.uploadMedia(file, 'image');
      const updated = await userApi.updateProfile({ cover: url });
      setProfile(updated);
      await refreshUser();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message ?? 'Lỗi upload ảnh bìa');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-[#18191A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-12 h-12 text-[#10B981] animate-spin" />
          <p className="text-[#B0B3B8] text-sm">Đang tải trang cá nhân...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#18191A] min-h-screen overflow-y-auto custom-scrollbar pb-20">
      {showEditModal && profile && !isViewingOtherProfile && (
        <EditModal profile={profile} onClose={() => setShowEditModal(false)} onSave={handleSaveProfile} />
      )}

      {isPostModalOpen && profile && !isViewingOtherProfile && (
        <_PostModal
          avatar={getAvatar(profile)}
          username={profile.username}
          draft={postDraft}
          setDraft={setPostDraft}
          mediaFile={postMediaFile}
          setMediaFile={setPostMediaFile}
          isPosting={isPosting}
          onClose={resetPostModal}
          onSubmit={handleSubmitPost}
          mediaInputRef={postMediaInputRef}
        />
      )}

      {saveError && (
        <div className="fixed top-4 right-4 z-50 bg-red-900/90 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span>⚠️ {saveError}</span>
          <button onClick={() => setSaveError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#242526] shadow-sm">
        <div className="max-w-5xl mx-auto w-full">
          {/* Cover */}
          <div className="relative w-full h-[350px] sm:h-[400px] rounded-b-lg overflow-hidden group">
            <img src={profile?.cover ?? DEFAULT_COVER} alt="Ảnh bìa" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
            {uploadingCover && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-white animate-spin" />
              </div>
            )}
            {!isViewingOtherProfile && (
              <>
                <button
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploadingCover}
                  className="absolute bottom-4 right-4 bg-white/10 hover:bg-white/25 text-white px-3 py-1.5 rounded-md font-semibold text-[15px] flex items-center gap-2 transition-colors backdrop-blur-sm disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Chỉnh sửa ảnh bìa</span>
                </button>
                <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
              </>
            )}
          </div>

          {/* Profile Info */}
          <div className="px-4 sm:px-8 pb-4 relative z-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
              <div className="flex flex-col md:flex-row items-center md:items-end gap-4">
                {/* Avatar */}
                <div className="relative shrink-0 -mt-20 sm:-mt-24 z-20">
                  <div className="w-[160px] h-[160px] sm:w-[180px] sm:h-[180px] rounded-full border-4 border-[#242526] overflow-hidden bg-[#3A3B3C] shadow-md">
                    {uploadingAvatar ? (
                      <div className="w-full h-full flex items-center justify-center bg-[#3A3B3C]">
                        <Loader2 className="w-8 h-8 text-[#10B981] animate-spin" />
                      </div>
                    ) : (
                      <img src={getAvatar(profile)} alt={profile?.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    )}
                  </div>
                  {!isViewingOtherProfile && (
                    <>
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="absolute bottom-2 right-2 w-10 h-10 bg-[#3A3B3C] hover:bg-[#4E4F50] rounded-full flex items-center justify-center text-[#E4E6EB] border-2 border-[#242526] shadow-sm cursor-pointer z-30 disabled:opacity-50"
                        title="Đổi ảnh đại diện"
                      >
                        <Camera className="w-5 h-5" />
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                    </>
                  )}
                </div>

                {/* Name + stats */}
                <div className="text-center md:text-left pb-2 md:pb-4 mt-2 md:mt-0">
                  <h1 className="text-[32px] sm:text-[36px] font-bold text-[#E4E6EB] leading-tight">
                    {profile?.username ?? 'Người dùng'}
                  </h1>
                  {profile?.bio && (
                    <p className="text-[15px] text-[#B0B3B8] mt-1 max-w-sm">{profile.bio}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2 flex-col md:flex-row">
                    <p className="text-[15px] text-[#B0B3B8] font-semibold">
                      <span className="text-[#E4E6EB]">{followers}</span> người theo dõi ·{' '}
                      <span className="text-[#E4E6EB]">{friendsTotal}</span> bạn bè
                    </p>
                    {friends.length > 0 && (
                      <div className="flex -space-x-2 mt-1 md:mt-0 md:ml-2">
                        {friends.slice(0, 6).map(f => (
                          <img key={f.user.id} src={f.user.avatar ?? `${DEFAULT_AVATAR}${encodeURIComponent(f.user.username)}`}
                            alt={f.user.username} className="w-8 h-8 rounded-full border-2 border-[#242526] object-cover" referrerPolicy="no-referrer" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {!isViewingOtherProfile && (
                <div className="flex items-center justify-center md:justify-end gap-2 pb-2 md:pb-4">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="bg-[#10B981] hover:bg-[#059669] text-white px-4 py-2 rounded-lg font-semibold text-[15px] flex items-center gap-2 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                    Chỉnh sửa trang cá nhân
                  </button>
                  <button className="bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] px-3 py-2 rounded-lg font-semibold transition-colors">
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="border-t border-[#3A3B3C] mt-2 flex items-center justify-between">
              <div className="flex overflow-x-auto">
                {tabs.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3.5 font-semibold text-[15px] transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'text-[#10B981] border-b-[3px] border-[#10B981]'
                        : 'text-[#B0B3B8] hover:bg-[#3A3B3C] rounded-lg my-1'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button className="w-10 h-9 bg-[#3A3B3C] hover:bg-[#4E4F50] rounded-md flex items-center justify-center text-[#E4E6EB] transition-colors shrink-0 ml-2">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto w-full flex flex-col lg:flex-row gap-4 py-4 px-4">
        {/* Left */}
        <div className="w-full lg:w-[40%] space-y-4">
          {/* Intro */}
          <div className="bg-[#242526] rounded-xl shadow-sm p-4">
            <h2 className="text-xl font-bold text-[#E4E6EB] mb-4">Giới thiệu</h2>
            {profile?.bio
              ? <p className="text-[15px] text-[#E4E6EB] text-center mb-4">{profile.bio}</p>
              : <p className="text-[15px] text-[#B0B3B8] text-center mb-4 italic">Chưa có tiểu sử</p>
            }
            {!isViewingOtherProfile && (
              <button
                onClick={() => setShowEditModal(true)}
                className="w-full bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] font-semibold py-2 rounded-lg transition-colors text-[15px] mb-4"
              >
                Chỉnh sửa tiểu sử
              </button>
            )}
            <div className="space-y-3 text-[15px] text-[#E4E6EB]">
              {profile?.email && (
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-[#8c939d] shrink-0" />
                  <span>{profile.email}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-[#8c939d] shrink-0" />
                <span><strong>{followers}</strong> người theo dõi · <strong>{friendsTotal}</strong> bạn bè</span>
              </div>
              {profile?.isOnline !== undefined && (
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${profile.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <span>{profile.isOnline ? 'Đang hoạt động' : 'Không hoạt động'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Friends */}
          <div className="bg-[#242526] rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-[#E4E6EB]">Bạn bè</h2>
                <p className="text-[15px] text-[#B0B3B8]">{friendsTotal} người bạn</p>
              </div>
              <button
                onClick={() => setActiveTab('Bạn bè')}
                className="text-[#10B981] hover:bg-[#3A3B3C] px-2 py-1 rounded-md text-[15px] transition-colors"
              >
                Xem tất cả
              </button>
            </div>
            {friends.length === 0 ? (
              <p className="text-[#B0B3B8] text-sm text-center py-4">Chưa có bạn bè nào</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {friends.map(f => (
                  <div
                    key={f.user.id}
                    className="text-center cursor-pointer group"
                    onClick={() => navigate(`/profile?userId=${f.user.id}`)}
                  >
                    <div className="relative">
                      <img
                        src={f.user.avatar ?? `${DEFAULT_AVATAR}${encodeURIComponent(f.user.username)}`}
                        alt={f.user.username}
                        className="w-full aspect-square object-cover rounded-lg group-hover:opacity-90 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                      {f.user.isOnline && (
                        <span className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 border-2 border-[#242526] rounded-full" />
                      )}
                    </div>
                    <p className="text-[13px] font-semibold text-[#E4E6EB] mt-1 truncate group-hover:underline">
                      {f.user.username}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="w-full lg:w-[60%] space-y-4">
          {!isViewingOtherProfile && (
            <div className="bg-[#242526] rounded-xl shadow-sm p-4">
              <div className="flex gap-2 mb-3">
                <img src={getAvatar(profile)} alt="Tôi" className="w-10 h-10 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                <div
                  onClick={() => setIsPostModalOpen(true)}
                  className="flex-1 bg-[#3A3B3C] rounded-full px-4 py-2.5 cursor-pointer hover:bg-[#4E4F50] transition-colors"
                >
                  <span className="text-[#B0B3B8] text-[15px]">Bạn đang nghĩ gì thế?</span>
                </div>
              </div>
              <div className="border-t border-[#3A3B3C] pt-3 flex justify-between">
                <button
                  onClick={() => setIsPostModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 hover:bg-[#3A3B3C] py-2 rounded-lg transition-colors"
                >
                  <Video className="w-6 h-6 text-[#F3425F]" />
                  <span className="text-[15px] font-semibold text-[#B0B3B8] hidden sm:inline">Video trực tiếp</span>
                </button>
                <button
                  onClick={() => setIsPostModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 hover:bg-[#3A3B3C] py-2 rounded-lg transition-colors"
                >
                  <ImageIcon className="w-6 h-6 text-[#45BD62]" />
                  <span className="text-[15px] font-semibold text-[#B0B3B8] hidden sm:inline">Ảnh/Video</span>
                </button>
                <button
                  onClick={() => setIsPostModalOpen(true)}
                  className="flex-1 flex items-center justify-center gap-2 hover:bg-[#3A3B3C] py-2 rounded-lg transition-colors"
                >
                  <Smile className="w-6 h-6 text-[#F7B928]" />
                  <span className="text-[15px] font-semibold text-[#B0B3B8] hidden sm:inline">Sự kiện</span>
                </button>
              </div>
            </div>
          )}

          {/* Posts header */}
          <div className="bg-[#242526] rounded-xl shadow-sm p-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#E4E6EB]">Bài viết</h2>
            <div className="flex gap-2">
              <button className="bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] px-3 py-1.5 rounded-md font-semibold text-[15px] transition-colors">Bộ lọc</button>
              <button className="bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] px-3 py-1.5 rounded-md font-semibold text-[15px] transition-colors">Quản lý</button>
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="bg-[#242526] rounded-xl shadow-sm p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-[#3A3B3C] rounded-full flex items-center justify-center mb-3">
                <ImageIcon className="w-8 h-8 text-[#B0B3B8]" />
              </div>
              <h3 className="text-[17px] font-semibold text-[#E4E6EB]">Chưa có bài viết nào</h3>
              <p className="text-[#B0B3B8] text-sm mt-1">Hãy chia sẻ điều gì đó với bạn bè của bạn!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div key={post.id} className="bg-[#242526] rounded-xl shadow-sm overflow-hidden border border-[#3A3B3C]">
                  <div className="p-4 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={post.author.avatar ?? `${DEFAULT_AVATAR}${encodeURIComponent(post.author.username)}`}
                        alt={post.author.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="text-[#E4E6EB] font-semibold truncate">{post.author.username}</p>
                        <p className="text-xs text-[#B0B3B8]">{new Date(post.createdAt).toLocaleString('vi-VN')}</p>
                      </div>
                    </div>
                    <PostOwnerMenu
                      postId={post.id}
                      viewerId={currentUser?.id ?? ''}
                      authorId={post.author?.id ?? ''}
                      hidden={Boolean(post.hidden)}
                      buttonClassName="w-9 h-9 rounded-full hover:bg-[#4E4F50] flex items-center justify-center text-[#B0B3B8] shrink-0"
                      onRemoved={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
                      onHiddenUpdated={(nextHidden) =>
                        setPosts((prev) =>
                          prev.map((p) => (p.id === post.id ? { ...p, hidden: nextHidden } : p)),
                        )
                      }
                    />
                  </div>
                  {post.hidden && (
                    <div className="px-4 pb-2">
                      <span className="inline-block rounded-md bg-amber-500/15 text-amber-400 text-xs font-semibold px-2 py-1">
                        Đã ẩn khỏi trang chủ / Video
                      </span>
                    </div>
                  )}
                  <div className="px-4 pb-3 text-[#E4E6EB] text-[15px] whitespace-pre-wrap">
                    {post.content}
                  </div>
                  {post.imageUrl && (
                    <img
                      src={post.imageUrl}
                      alt="Post media"
                      className="w-full max-h-[720px] object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {post.shortVideoUrl && (
                    <video
                      src={post.shortVideoUrl}
                      controls
                      className="w-full max-h-[720px] bg-black"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Post modal (inline for now)
// eslint-disable-next-line react/no-unstable-nested-components
function _PostModal({
  avatar,
  username,
  draft,
  setDraft,
  mediaFile,
  setMediaFile,
  isPosting,
  onClose,
  onSubmit,
  mediaInputRef,
}: {
  avatar: string;
  username: string;
  draft: string;
  setDraft: (v: string) => void;
  mediaFile: File | null;
  setMediaFile: (f: File | null) => void;
  isPosting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  mediaInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-[#242526] border border-[#3A3B3C] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#3A3B3C] flex items-center justify-between">
          <p className="text-lg font-bold text-[#E4E6EB]">Tạo bài viết</p>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] flex items-center justify-center text-[#E4E6EB]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <img src={avatar} alt={username} className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
            <div>
              <p className="text-[#E4E6EB] font-semibold">{username}</p>
              <p className="text-xs text-[#B0B3B8]">Công khai</p>
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Bạn đang nghĩ gì thế?"
            rows={5}
            className="w-full rounded-xl bg-[#3A3B3C] border border-[#3A3B3C] text-[#E4E6EB] p-3 focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none text-[15px]"
          />

          <div className="mt-4 rounded-xl border border-[#3A3B3C] bg-[#2B2C2E] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[#E4E6EB] font-semibold text-sm">Thêm vào bài viết</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => mediaInputRef.current?.click()}
                  className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center"
                  title="Ảnh/Video"
                >
                  <ImageIcon className="w-5 h-5 text-[#45BD62]" />
                </button>
              </div>
            </div>
            {mediaFile && (
              <div className="mt-3 text-sm text-[#B0B3B8] flex items-center justify-between gap-3">
                <span className="truncate">{mediaFile.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMediaFile(null);
                    if (mediaInputRef.current) mediaInputRef.current.value = '';
                  }}
                  className="text-red-300 hover:underline"
                >
                  Gỡ
                </button>
              </div>
            )}
          </div>

          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            disabled={isPosting || (!draft.trim() && !mediaFile)}
            onClick={onSubmit}
            className="mt-4 w-full rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-semibold py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPosting ? 'Đang đăng...' : 'Đăng'}
          </button>
        </div>
      </div>
    </div>
  );
}
