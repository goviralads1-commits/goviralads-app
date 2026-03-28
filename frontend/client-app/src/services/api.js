import axios from 'axios';

// API Base URL - MUST be set in environment variable
const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_URL is not defined. Set it in .env file.');
}

console.log('[API CONFIG] Base URL:', API_BASE_URL);

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds for mobile networks
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true // Important for CORS with credentials
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // For FormData, let the browser set Content-Type with correct boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    console.log('[API] Request:', config.method?.toUpperCase(), config.url, token ? '(with token)' : '(no token)');
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error.message);
    return Promise.reject(error);
  }
);

// Add response interceptor for handling 401 errors
api.interceptors.response.use(
  (response) => {
    console.log('[API] Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    const requestUrl = error.config?.url || 'unknown';
    console.error('[API] Response error:', error.message);
    console.error('[API] Status:', error.response?.status, 'URL:', requestUrl);
    console.error('[API] Data:', error.response?.data);
    
    if (error.response?.status === 401) {
      // IMPORTANT: Do NOT clear token or redirect for login/auth requests
      // 401 on login just means bad credentials, not session expiry
      const isAuthRequest = requestUrl.includes('/auth/') || requestUrl.includes('/login');
      
      if (isAuthRequest) {
        console.log('[API] 401 on auth request - NOT clearing token (bad credentials)');
      } else {
        console.log('[API] 401 on protected request - clearing token');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Only redirect if NOT already on login page (prevents reload loop)
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;