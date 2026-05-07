import { Activity, AlertTriangle, LogOut, ChevronRight, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto w-full pb-20 px-4 lg:px-0 mt-6">
      <h1 className="text-2xl font-bold text-white mb-6">Cài đặt</h1>

      {/* Standard Settings Section */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] overflow-hidden mb-8">
        <div className="p-4 border-b border-[#2A2A2A] hover:bg-[#222222] cursor-pointer flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-white font-medium">Thông tin cá nhân</h3>
              <p className="text-sm text-gray-400">Quản lý tài khoản của bạn</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </div>

        <div className="p-4 hover:bg-[#222222] cursor-pointer flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="text-white font-medium">Mật khẩu và bảo mật</h3>
              <p className="text-sm text-gray-400">Đổi mật khẩu, bảo mật 2 lớp</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-4">Hoạt động & Hỗ trợ</h2>
      
      {/* Requested Features Section */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-[#2A2A2A] overflow-hidden">
        
        {/* Lịch sử hoạt động */}
        <div className="p-4 border-b border-[#2A2A2A] hover:bg-[#222222] cursor-pointer flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="text-white font-medium">Lịch sử hoạt động</h3>
              <p className="text-sm text-gray-400">Xem lại các bài viết, bình luận và lượt thích của bạn</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </div>

        {/* Báo cáo sự cố */}
        <div className="p-4 border-b border-[#2A2A2A] hover:bg-[#222222] cursor-pointer flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-white font-medium">Báo cáo sự cố</h3>
              <p className="text-sm text-gray-400">Góp ý hoặc báo lỗi cho chúng tôi</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </div>

        {/* Đăng xuất */}
        <div onClick={() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('token');
          navigate('/login');
        }} className="p-4 hover:bg-[#222222] cursor-pointer flex items-center justify-between transition-colors group">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
              <LogOut className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-red-500 font-medium">Đăng xuất</h3>
              <p className="text-sm text-gray-400">Đăng xuất khỏi thiết bị này</p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
