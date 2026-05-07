import axios from 'axios';

const userApiBaseUrl =
  import.meta.env.VITE_USER_API_BASE_URL?.trim() || 'http://localhost:3002/api';

const getStoredAccessToken = () =>
  localStorage.getItem('accessToken') ?? localStorage.getItem('token');

const clearStoredAuth = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('token');
};

/** Client gọi user-service (port 3002): luôn dùng path tương đối `/users/...` để không lệch query/hash với axios baseURL mặc định. */
export const userApiClient = axios.create({
  baseURL: userApiBaseUrl.replace(/\/+$/, ''),
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
  },
});

userApiClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) {
    if (!config.headers) {
      config.headers = {} as any;
    }
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    delete (config.headers as any)['Content-Type'];
  }
  return config;
});

userApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url ?? '');
    const base = String(error?.config?.baseURL ?? '');
    const fullUrl = requestUrl.startsWith('http') ? requestUrl : `${base}${requestUrl}`;
    const isAuthEndpoint =
      fullUrl.includes('/auth/login') || fullUrl.includes('/auth/register');

    if (status === 401 && !isAuthEndpoint) {
      clearStoredAuth();
      try {
        // Dùng absolute URL để tránh lỗi khi trang đang ở trạng thái chrome-error://
        const origin = window.location.origin;
        if (origin.startsWith('http') && window.location.pathname !== '/login') {
          window.location.replace(`${origin}/login`);
        }
      } catch {
        // Bỏ qua nếu không thể navigate (vd: trang đang bị lỗi)
      }
    }

    return Promise.reject(error);
  },
);

