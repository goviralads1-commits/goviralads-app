import api from './api';

// Login function
export const login = async (email, password) => {
  try {
    // Trim whitespace and remove invisible characters
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    
    const response = await api.post('/auth/login', { identifier: cleanEmail, password: cleanPassword });
    const { token, user } = response.data;
    
    // Store token and user info in localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    return { token, user };
  } catch (error) {
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