import api from './api';
import { clearPrivateCache } from './smartCache';

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
    // Clear any PREVIOUS session's private cache first (account switching / re-login)
    // so one client's saved data is never visible to another identity.
    clearPrivateCache();
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    // DEBUG: Verify token is actually saved
    const verifyToken = localStorage.getItem('token');
    console.log('[AUTH SERVICE] ✓ Token and user saved to localStorage');
    console.log('[AUTH SERVICE] DEBUG: Token verify immediately after save:', verifyToken ? `YES (${verifyToken.length} chars)` : 'NO - NOT SAVED!');
    console.log('[AUTH SERVICE] DEBUG: User verify:', localStorage.getItem('user') ? 'YES' : 'NO');
    
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
  // Clear this client's private cached data BEFORE the identity is removed, while
  // the cache namespace can still be resolved from the stored user record.
  clearPrivateCache();
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