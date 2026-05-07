import React, { useEffect } from 'react';
import { X, Image, Type, Settings } from 'lucide-react';

import { createPost, uploadPostMedia } from '@/api/posts';

interface CreateStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryCreated?: () => void;
}

export default function CreateStoryModal({ isOpen, onClose, onStoryCreated }: CreateStoryModalProps) {
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTextStory = async () => {
    const text = window.prompt('Nhập nội dung tin:');
    if (!text?.trim()) return;
    
    setLoading(true);
    try {
      await createPost({ content: text, postType: 'STORY' });
      onStoryCreated?.();
      onClose();
    } catch (e) {
      alert('Lỗi tạo tin!');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoStory = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading(true);
      try {
        const uploaded = await uploadPostMedia(file, 'image');
        await createPost({ content: 'My Story', imageUrl: uploaded.url, postType: 'STORY' });
        onStoryCreated?.();
        onClose();
      } catch (err) {
        alert('Lỗi tạo tin ảnh!');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#18191A] animate-in fade-in duration-200">
      {/* Header */}
      <div className="h-14 bg-[#242526] border-b border-[#3E4042] flex items-center px-4 shadow-sm shrink-0">
        <button 
          onClick={onClose} 
          className="w-10 h-10 rounded-full bg-[#3A3B3C] flex items-center justify-center hover:bg-[#4E4F50] transition-colors"
        >
          <X className="w-6 h-6 text-[#E4E6EB]" />
        </button>
        <h1 className="ml-4 text-xl font-bold text-[#E4E6EB]">Tạo tin {loading && '(Đang xử lý...)'}</h1>
        <div className="flex-1" />
        <button className="w-10 h-10 rounded-full bg-[#3A3B3C] flex items-center justify-center hover:bg-[#4E4F50] transition-colors">
          <Settings className="w-5 h-5 text-[#E4E6EB]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="flex flex-col sm:flex-row gap-6 max-w-3xl w-full justify-center">
          {/* Photo Story */}
          <button onClick={handlePhotoStory} disabled={loading} className="flex-1 h-[330px] max-w-[220px] rounded-xl bg-gradient-to-b from-blue-500 to-blue-700 flex flex-col items-center justify-center gap-4 hover:opacity-90 transition-opacity shadow-lg group">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <Image className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-white font-bold text-lg">Tạo tin ảnh</span>
          </button>

          {/* Text Story */}
          <button onClick={handleTextStory} disabled={loading} className="flex-1 h-[330px] max-w-[220px] rounded-xl bg-gradient-to-b from-purple-500 to-pink-500 flex flex-col items-center justify-center gap-4 hover:opacity-90 transition-opacity shadow-lg group">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <Type className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-white font-bold text-lg">Tạo tin dạng văn bản</span>
          </button>
        </div>
      </div>
    </div>
  );
}
