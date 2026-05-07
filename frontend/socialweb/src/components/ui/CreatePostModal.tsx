import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Image,
  UserPlus,
  Smile,
  MapPin,
  MoreHorizontal,
  Globe,
  ChevronDown,
  Film,
} from 'lucide-react';
import type { UploadMediaType } from '@/api/posts';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    content: string;
    imageUrl?: string;
    postType?: 'POST' | 'SHORT_VIDEO';
    shortVideoUrl?: string;
  }) => Promise<void>;
  onUploadMedia: (file: File, mediaType: UploadMediaType) => Promise<string>;
}

export default function CreatePostModal({
  isOpen,
  onClose,
  onSubmit,
  onUploadMedia,
}: CreatePostModalProps) {
  const [postText, setPostText] = useState('');
  const [shortVideoUrl, setShortVideoUrl] = useState('');
  const [isShortVideoPost, setIsShortVideoPost] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setPostText('');
    setShortVideoUrl('');
    setIsShortVideoPost(false);
    setImageFile(null);
    setVideoFile(null);
    setImagePreviewUrl('');
    setVideoPreviewUrl('');
    setSubmitError('');
  };

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    resetForm();
    onClose();
  }, [isSubmitting, onClose]);

  const handleImagePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0];
    if (!pickedFile) {
      return;
    }

    setImageFile(pickedFile);
    setImagePreviewUrl(URL.createObjectURL(pickedFile));
    setSubmitError('');
  };

  const handleVideoPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFile = event.target.files?.[0];
    if (!pickedFile) {
      return;
    }

    setVideoFile(pickedFile);
    setVideoPreviewUrl(URL.createObjectURL(pickedFile));
    setSubmitError('');
  };

  const handleSubmit = async () => {
    const content = postText.trim();
    if (!content || isSubmitting) {
      return;
    }

    const trimmedVideoUrl = shortVideoUrl.trim();

    setIsSubmitting(true);
    setSubmitError('');

    try {
      let uploadedImageUrl: string | undefined;
      let uploadedVideoUrl: string | undefined;

      if (imageFile && !isShortVideoPost) {
        uploadedImageUrl = await onUploadMedia(imageFile, 'image');
      }

      if (isShortVideoPost && videoFile) {
        uploadedVideoUrl = await onUploadMedia(videoFile, 'video');
      }

      const finalShortVideoUrl = uploadedVideoUrl || trimmedVideoUrl;

      if (isShortVideoPost && !finalShortVideoUrl) {
        setSubmitError('Vui lòng chọn video short hoặc nhập URL video trước khi đăng.');
        return;
      }

      await onSubmit({
        content,
        imageUrl: uploadedImageUrl,
        postType: isShortVideoPost ? 'SHORT_VIDEO' : 'POST',
        shortVideoUrl: isShortVideoPost ? finalShortVideoUrl : undefined,
      });

      resetForm();
      onClose();
    } catch (error: any) {
      const message = error?.response?.data?.message;
      setSubmitError(Array.isArray(message) ? message.join(', ') : message || 'Không thể đăng bài viết.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close modal when clicking outside; lock document scroll while open
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, handleClose]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [imagePreviewUrl, videoPreviewUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/70 p-4">
      <div className="flex min-h-[100dvh] items-center justify-center py-4">
        <div 
          ref={modalRef}
          className="bg-[#242526] w-full max-w-[600px] max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain rounded-xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
        {/* Header */}
        <div className="relative flex items-center justify-center p-4 border-b border-[#3E4042]">
          <h2 className="text-xl font-bold text-[#E4E6EB]">Tạo bài viết</h2>
          <button 
            onClick={handleClose}
            className="absolute right-4 w-9 h-9 rounded-full bg-[#3A3B3C] hover:bg-[#4E4F50] flex items-center justify-center text-[#B0B3B8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info & Privacy */}
        <div className="p-4 flex items-center space-x-3">
          <img 
            src="https://picsum.photos/seed/user1/40/40" 
            alt="User" 
            className="w-10 h-10 rounded-full object-cover" 
            referrerPolicy="no-referrer" 
          />
          <div>
            <h3 className="text-[15px] font-semibold text-[#E4E6EB]">Người dùng</h3>
            <button className="flex items-center space-x-1 bg-[#3A3B3C] hover:bg-[#4E4F50] mt-1 px-2 py-1 rounded-md transition-colors">
              <Globe className="w-3 h-3 text-[#E4E6EB]" />
              <span className="text-xs font-semibold text-[#E4E6EB]">Công khai</span>
              <ChevronDown className="w-3 h-3 text-[#E4E6EB]" />
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="px-4">
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Bạn đang nghĩ gì?"
            className="w-full bg-transparent text-[#E4E6EB] text-2xl placeholder-[#B0B3B8] resize-none focus:outline-none min-h-[200px]"
            autoFocus
          />

          {!isShortVideoPost && imagePreviewUrl && (
            <div className="mb-3 rounded-lg border border-[#3E4042] bg-black/30 p-2">
              <img
                src={imagePreviewUrl}
                alt="Image preview"
                className="max-h-64 w-full rounded-md object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {isShortVideoPost && videoPreviewUrl && (
            <div className="mb-3 rounded-lg border border-[#3E4042] bg-black/30 p-2">
              <video
                src={videoPreviewUrl}
                controls
                className="max-h-72 w-full rounded-md object-contain"
              />
            </div>
          )}

          <div className="mt-3 rounded-lg border border-[#3E4042] bg-[#1E1F20] p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#E4E6EB]">
              <input
                type="checkbox"
                checked={isShortVideoPost}
                onChange={(event) => {
                  setIsShortVideoPost(event.target.checked);
                  if (event.target.checked) {
                    setImageFile(null);
                    setImagePreviewUrl('');
                  } else {
                    setVideoFile(null);
                    setVideoPreviewUrl('');
                    setShortVideoUrl('');
                  }
                  setSubmitError('');
                }}
                className="h-4 w-4"
              />
              Đăng dạng video short (hiển thị ở trang Videos)
            </label>

            {isShortVideoPost && (
              <div className="mt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full rounded-lg border border-[#3E4042] bg-[#242526] px-3 py-2 text-left text-sm text-[#E4E6EB] hover:bg-[#2F3031]"
                >
                  {videoFile
                    ? `Đã chọn video: ${videoFile.name}`
                    : 'Chọn video short để tải lên Cloudinary'}
                </button>
                <input
                  type="file"
                  accept="video/*"
                  ref={videoInputRef}
                  onChange={handleVideoPick}
                  className="hidden"
                />

                <input
                  type="url"
                  value={shortVideoUrl}
                  onChange={(event) => setShortVideoUrl(event.target.value)}
                  placeholder="Hoặc dán URL video có sẵn (https://...mp4)"
                  className="w-full rounded-lg border border-[#3E4042] bg-[#242526] px-3 py-2 text-sm text-[#E4E6EB] placeholder-[#B0B3B8] focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Add to your post */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between p-3 border border-[#3E4042] rounded-lg shadow-sm">
            <span className="text-[15px] font-semibold text-[#E4E6EB]">Thêm vào bài viết của bạn</span>
            <div className="flex space-x-1">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors"
                disabled={isShortVideoPost}
              >
                <Image className="w-6 h-6 text-green-500" />
              </button>
              <input
                type="file"
                accept="image/*"
                ref={imageInputRef}
                onChange={handleImagePick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors"
              >
                <Film className="w-6 h-6 text-red-500" />
              </button>
              <button className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors">
                <UserPlus className="w-6 h-6 text-blue-500" />
              </button>
              <button className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors">
                <Smile className="w-6 h-6 text-yellow-500" />
              </button>
              <button className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors hidden sm:flex">
                <MapPin className="w-6 h-6 text-red-500" />
              </button>
              <button className="w-9 h-9 rounded-full hover:bg-[#3A3B3C] flex items-center justify-center transition-colors">
                <MoreHorizontal className="w-6 h-6 text-[#B0B3B8]" />
              </button>
            </div>
          </div>
        </div>

        {/* Post Button */}
        <div className="p-4 pt-0">
          {submitError && (
            <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {submitError}
            </p>
          )}
          <button 
            onClick={() => void handleSubmit()}
            disabled={!postText.trim() || isSubmitting}
            className={`w-full py-2 rounded-lg font-semibold text-[15px] transition-colors ${
              postText.trim() && !isSubmitting
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-[#3A3B3C] text-[#B0B3B8] cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'Đang tải lên và đăng bài...' : 'Đăng'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
