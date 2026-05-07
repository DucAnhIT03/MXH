/**
 * CommentPanel — tái sử dụng trên Home feed và VideoPlayer.
 * Props:
 *   postId        – ID bài viết cần load bình luận
 *   isOpen        – có mở panel không
 *   currentUser   – user hiện tại (null nếu chưa đăng nhập)
 *   onCommentAdded – callback khi bình luận mới được thêm
 *   variant       – 'inline' (dưới post) | 'panel' (sidebar của video)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Loader2, MessageCircle, Smile } from 'lucide-react';
import { fetchPostComments, createPostComment } from '@/api/posts';
import type { PostCommentItem } from '@/api/posts';

/* ─── Helpers ────────────────────────────────────────────────────── */
const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=10B981&color=fff&size=64&name=';

function timeAgo(dateStr: string | Date): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ─── Types ──────────────────────────────────────────────────────── */
export type CommentPanelUser = {
  id: string;
  username: string;
  avatar?: string | null;
};

type Props = {
  postId: string;
  isOpen: boolean;
  currentUser: CommentPanelUser | null;
  onCommentAdded?: () => void;
  variant?: 'inline' | 'panel';
  initialCount?: number;
};

/* ─── Component ──────────────────────────────────────────────────── */
export default function CommentPanel({
  postId,
  isOpen,
  currentUser,
  onCommentAdded,
  variant = 'inline',
  initialCount = 0,
}: Props) {
  const [comments, setComments] = useState<PostCommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Load comments when opened */
  const loadComments = useCallback(async () => {
    if (!postId || loaded) return;
    setLoading(true);
    try {
      const res = await fetchPostComments(postId, 1, 50);
      setComments(res.items ?? []);
      setLoaded(true);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [postId, loaded]);

  useEffect(() => {
    if (isOpen) {
      void loadComments();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, loadComments]);

  /* Reset when postId changes */
  useEffect(() => {
    setComments([]);
    setLoaded(false);
    setDraft('');
  }, [postId]);

  /* Submit */
  const handleSubmit = async () => {
    if (!currentUser?.id || !draft.trim() || submitting) return;
    const text = draft.trim();
    setSubmitting(true);
    try {
      const created = await createPostComment(postId, text);
      setDraft('');
      setComments(prev => [created, ...prev]);
      onCommentAdded?.();
      // scroll to top of list
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // giữ draft
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const avatarSrc = currentUser?.avatar
    ? currentUser.avatar
    : `${DEFAULT_AVATAR}${encodeURIComponent(currentUser?.username ?? 'U')}`;

  /* ── Inline variant (trong feed) ── */
  if (variant === 'inline') {
    return (
      <div className="border-t border-[#2A2A2A] bg-[#161616] px-4 pt-3 pb-4 space-y-4">
        {/* Input row */}
        <div className="flex items-center gap-2.5">
          {currentUser ? (
            <img
              src={avatarSrc}
              alt={currentUser.username}
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#3A3B3C]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#2A2A2A] shrink-0" />
          )}
          <div className="flex-1 flex items-center bg-[#2A2A2A] hover:bg-[#303030] rounded-full px-3 py-2 gap-2 border border-transparent focus-within:border-[#555] transition-colors">
            <input
              ref={inputRef}
              type="text"
              placeholder={currentUser ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
              disabled={!currentUser || submitting}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) void handleSubmit(); }}
              className="flex-1 bg-transparent text-[14px] text-[#E4E6EB] placeholder-[#8A8D91] focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!currentUser || !draft.trim() || submitting}
              onClick={() => void handleSubmit()}
              className="text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-30 shrink-0"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Comment list */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-4">
            <MessageCircle className="w-8 h-8 mx-auto mb-1.5 text-gray-700" />
            <p className="text-gray-600 text-sm">Chưa có bình luận nào. Hãy là người đầu tiên!</p>
          </div>
        ) : (
          <div ref={listRef} className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2 group">
                <img
                  src={c.author.avatar || `${DEFAULT_AVATAR}${encodeURIComponent(c.author.username)}`}
                  alt={c.author.username}
                  className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#2A2A2A]"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <div className="bg-[#2A2A2A] rounded-2xl rounded-tl-sm px-3 py-2 inline-block max-w-full">
                    <span className="block font-semibold text-[13px] text-emerald-400 hover:underline cursor-pointer">
                      {c.author.username}
                    </span>
                    <p className="text-[14px] text-[#E4E6EB] whitespace-pre-wrap break-words leading-relaxed">
                      {c.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-3">
                    <span className="text-[11px] text-gray-500">{timeAgo(c.createdAt)}</span>
                    <button type="button" className="text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors">
                      Thích
                    </button>
                    <button type="button" className="text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors">
                      Phản hồi
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Panel variant (sidebar của video) ── */
  return (
    <div className="flex flex-col h-full">
      {/* Comments list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-4 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageCircle className="w-10 h-10 mb-2 text-gray-700" />
            <p className="text-gray-500 text-sm">Chưa có bình luận nào</p>
            <p className="text-gray-700 text-xs mt-1">Hãy là người đầu tiên bình luận!</p>
          </div>
        ) : (
          comments.map(c => (
            <div key={c.id} className="flex gap-3 group">
              <img
                src={c.author.avatar || `${DEFAULT_AVATAR}${encodeURIComponent(c.author.username)}`}
                alt={c.author.username}
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-[#333]"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <div className="bg-[#2A2A2A] rounded-2xl rounded-tl-sm px-3 py-2">
                  <span className="block font-semibold text-[12px] text-emerald-400 hover:underline cursor-pointer">
                    {c.author.username}
                  </span>
                  <p className="text-[13px] text-white whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
                    {c.content}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-1 ml-3">
                  <span className="text-[11px] text-gray-600">{timeAgo(c.createdAt)}</span>
                  <button type="button" className="text-[11px] font-semibold text-gray-600 hover:text-gray-400 transition-colors">
                    Thích
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#2A2A2A] bg-[#1A1A1A] shrink-0">
        <div className="flex items-center gap-2">
          {currentUser && (
            <img
              src={avatarSrc}
              alt={currentUser.username}
              className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#333]"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 flex items-center bg-[#2A2A2A] rounded-full px-3 py-2 gap-2 border border-transparent focus-within:border-[#555] transition-colors">
            <input
              ref={inputRef}
              type="text"
              placeholder={currentUser ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
              disabled={!currentUser || submitting}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSubmit(); }}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-gray-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!currentUser || !draft.trim() || submitting}
              onClick={() => void handleSubmit()}
              className="text-blue-500 hover:text-blue-400 transition-colors disabled:opacity-30 shrink-0"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
