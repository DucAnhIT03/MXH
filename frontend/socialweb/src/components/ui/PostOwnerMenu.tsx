import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { deleteMyPost, patchMyPostHidden } from '@/api/posts';

type Props = {
  postId: string;
  /** User đang đăng nhập — chỉ khớp với authorId mới hiển thị menu. */
  viewerId: string;
  /** Chủ bài viết */
  authorId: string;
  /** When true, show “Hiện lại” instead of “Ẩn”. */
  hidden?: boolean;
  onRemoved: () => void;
  onHiddenUpdated: (nextHidden: boolean) => void;
  /** Tailwind for trigger button */
  buttonClassName?: string;
};

export default function PostOwnerMenu({
  postId,
  viewerId,
  authorId,
  hidden = false,
  onRemoved,
  onHiddenUpdated,
  buttonClassName = 'w-8 h-8 rounded-full hover:bg-[#2A2A2A] flex items-center justify-center text-gray-400 transition-colors',
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const v = viewerId?.trim();
  const a = authorId?.trim();
  const isOwner = Boolean(v && a && v === a);

  const handleHideToggle = async () => {
    const next = !hidden;
    const msg = next
      ? 'Ẩn bài này khỏi trang chủ và tab Video? Bạn vẫn xem được trong trang cá nhân.'
      : 'Hiển thị lại bài viết trên trang chủ và tab Video?';
    if (!window.confirm(msg)) return;
    try {
      await patchMyPostHidden(postId, next);
      onHiddenUpdated(next);
      setOpen(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      window.alert(
        status === 403
          ? 'Bạn chỉ có thể ẩn hoặc hiện bài viết của chính mình.'
          : 'Không thể cập nhật trạng thái bài viết.',
      );
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Xóa bài viết này vĩnh viễn?')) return;
    try {
      await deleteMyPost(postId);
      onRemoved();
      setOpen(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      window.alert(
        status === 403
          ? 'Bạn chỉ có thể xóa bài viết của chính mình.'
          : 'Không thể xóa bài viết.',
      );
    }
  };

  if (!isOwner) {
    return null;
  }

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName}
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[130] mt-1 min-w-[220px] rounded-xl border border-[#3A3B3C] bg-[#242526] py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-4 py-2.5 text-left text-sm text-[#E4E6EB] hover:bg-[#3A3B3C]"
            onClick={() => void handleHideToggle()}
          >
            {hidden ? 'Hiện lại bài viết' : 'Ẩn bài viết'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#3A3B3C]"
            onClick={() => void handleDelete()}
          >
            Xóa bài viết
          </button>
        </div>
      )}
    </div>
  );
}
