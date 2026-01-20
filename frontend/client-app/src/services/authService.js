import api from './api';

// Login function
export const login = async (email, password) => {
  try {
    // Trim whitespace and remove invisible characters
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    
    console.log('[AUTH SERVICE] Trimmed email:', cleanEmail);
    console.log('[AUTH SERVICE] Trimmed password length:', cleanPassword.length);
    console.log('[AUTH SERVICE] Making API request to /auth/login');
    
    const response = await api.post('/auth/login', { identifier: cleanEmail, password: cleanPassword });
    const { token, user } = response.data;
    
    console.log('[AUTH SERVICE] ✓ API response received');
    console.log('[AUTH SERVICE] Token length:', token ? token.length : 0);
    console.log('[AUTH SERVICE] User ID:', user.id);
    
    // Store token and user info in localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    console.log('[AUTH SERVICE] ✓ Token and user saved to localStorage');
    
    return { token, user };
  } catch (error) {
    console.error('[AUTH SERVICE] ❌ Login failed:', error.message);
    console.error('[AUTH SERVICE] Error response:', error.response?.data);
    console.error('[AUTH SERVICE] Status code:', error.response?.status);
    throw new Error(error.response?.data?.error || 'Login failed');
  }
};

// Logout function
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

// Get current user from localStorage
export const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    return JSON.parse(userStr);
  }
  return null;
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!localStorage.getItem('token');
};

// Check user role
export const getUserRole = () => {
  const user = getCurrentUser();
  return user?.role;
};