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
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
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

// Permissions helpers
export const savePermissions = (data) => {
  localStorage.setItem('permissions', JSON.stringify(data));
};

export const getPermissions = () => {
  const raw = localStorage.getItem('permissions');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export const hasPermission = (key) => {
  const data = getPermissions();
  if (!data) return true; // not yet loaded — default allow to avoid blocking
  if (data.isMainAdmin) return true;
  return data.permissions?.[key] === true;
};