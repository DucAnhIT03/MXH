import api from '@/api/axios';

// Đăng nhập
const login = (data: { email: string; password: string }) => {
  return api.post('/auth/login', data);
};

// Đăng ký
const register = (data: {
  email: string;
  password: string;
  username: string;
  otp: string;
}) => {
  return api.post('/auth/register', data);
};

// Gửi OTP
const sendOTP = (email: string) => {
  return api.post('/auth/send-otp', { email });
};

// Xác thực OTP
const verifyOTP = (email: string, otp: string) => {
  return api.post('/auth/verify-otp', { email, otp });
};

// Đổi mật khẩu
const changePassword = (data: { oldPassword: string; newPassword: string }) => {
  return api.post('/auth/change-password', data);
};

export { login, register, sendOTP, verifyOTP, changePassword };