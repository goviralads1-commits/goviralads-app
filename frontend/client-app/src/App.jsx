import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import { CartProvider } from './context/CartContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import CookieConsent from './components/CookieConsent';
import Dashboard from './pages/Dashboard';
import Wallet from './pages/Wallet';
import Tasks from './pages/Tasks';
import Plans from './pages/Plans';
import PlanDetail from './pages/PlanDetail';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Subscriptions from './pages/Subscriptions';
import Profile from './pages/Profile';
import TaskDetail from './pages/TaskDetail';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Support from './pages/Support';
import Notifications from './pages/Notifications';
import LegalPage from './pages/LegalPage';
import NotFound from './pages/NotFound';

// Auth Context for managing auth state
const AuthContext = createContext({
  isReady: false,
  isLoggedIn: false,
  userRole: null
});

export const useAuth = () => useContext(AuthContext);

// Auth Provider that waits for localStorage to be ready
const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    isReady: false,
    isLoggedIn: false,
    userRole: null
  });

  useEffect(() => {
    // Small delay to ensure localStorage is fully hydrated (important for new window/tab)
    const initAuth = () => {
      const token = localStorage.getItem('token');
      const loggedIn = !!token;
      const role = getUserRole();
      
      console.log('[Auth] ========== INIT AUTH ==========');
      console.log('[Auth] Token in localStorage:', token ? `YES (${token.length} chars)` : 'NO');
      console.log('[Auth] isLoggedIn:', loggedIn);
      console.log('[Auth] Role:', role);
      console.log('[Auth] ================================');
      
      setAuthState({
        isReady: true,
        isLoggedIn: loggedIn,
        userRole: role
      });
    };

    // Add small delay for localStorage hydration on new tabs
    const timer = setTimeout(initAuth, 50);
    
    // Also listen for storage changes (when another tab logs in/out)
    const handleStorageChange = (e) => {
      if (e.key === 'token' || e.key === 'user') {
        console.log('[Auth] Storage changed, reinitializing');
        initAuth();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route Component - waits for auth to be ready
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isReady, isLoggedIn, userRole } = useAuth();
  const location = useLocation();
  
  // CRITICAL: Double-check localStorage directly as backup for BOTH token AND role
  const tokenExists = !!localStorage.getItem('token');
  
  // SAFE JSON parse with try-catch to prevent crashes
  let storedUser = {};
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      storedUser = JSON.parse(userStr);
    }
  } catch (e) {
    console.error('[ProtectedRoute] Failed to parse user from localStorage:', e);
  }
  const directRole = storedUser?.role;
  
  // Use context role OR direct localStorage role as backup
  const actualRole = userRole || directRole;
  
  // DEBUG: Log role sources
  console.log('[ProtectedRoute]', {
    contextRole: userRole,
    localStorageRole: directRole,
    finalRole: actualRole
  });

  // Show loading while auth is initializing
  if (!isReady) {
    console.log('[ProtectedRoute] Waiting for auth initialization...');
    console.log('[ProtectedRoute] Direct localStorage check - token:', tokenExists ? 'YES' : 'NO', 'role:', directRole);
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#64748b', fontSize: '14px' }}>Loading...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Use context isLoggedIn OR direct localStorage check as backup
  const actuallyLoggedIn = isLoggedIn || tokenExists;
  
  if (!actuallyLoggedIn) {
    // Store intended URL for redirect after login
    const intendedUrl = location.pathname + location.search;
    console.log('[ProtectedRoute] ========== NOT LOGGED IN ==========');
    console.log('[ProtectedRoute] Context isLoggedIn:', isLoggedIn);
    console.log('[ProtectedRoute] Direct localStorage token:', tokenExists ? 'YES' : 'NO');
    console.log('[ProtectedRoute] Current URL:', intendedUrl);
    console.log('[ProtectedRoute] Storing in sessionStorage as intendedUrl');
    sessionStorage.setItem('intendedUrl', intendedUrl);
    console.log('[ProtectedRoute] Redirecting to /login');
    console.log('[ProtectedRoute] =====================================');
    return <Navigate to="/login" replace />;
  }

  // Use actualRole (with localStorage fallback) for role check
  if (allowedRoles && !allowedRoles.includes(actualRole)) {
    console.log('[ProtectedRoute] Role mismatch:', actualRole, 'not in', allowedRoles);
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Notification Click Handler - ALWAYS store URL first, then navigate
const NotificationClickHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Handler for service worker messages
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const url = event.data?.url || (event.data?.taskId ? `/support?taskId=${event.data.taskId}` : '/support');
        
        console.log('[Push] ========== NOTIFICATION CLICK ==========');
        console.log('[Push] URL from notification:', url);
        
        // ALWAYS store the redirect URL first (never lose it)
        sessionStorage.setItem('intendedUrl', url);
        console.log('[Push] Stored intendedUrl in sessionStorage');
        
        // Check auth directly from localStorage (not context - context can be stale)
        const token = localStorage.getItem('token');
        console.log('[Push] Token in localStorage:', token ? 'YES' : 'NO');
        
        if (token) {
          console.log('[Push] Logged in - navigating directly to:', url);
          sessionStorage.removeItem('intendedUrl'); // Clear since we're navigating directly
          navigate(url);
        } else {
          console.log('[Push] Not logged in - redirecting to login');
          navigate('/login');
        }
        
        console.log('[Push] ========================================');
      }
    };

    // Listen for messages from service worker
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    
    // Also listen on window for cases where postMessage goes to window
    window.addEventListener('message', handleServiceWorkerMessage);
    
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
      window.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [navigate]);

  return null;
};

// Main App Component
const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <Router>
            <NotificationClickHandler />
            <div className="App">
              <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginForm />} />
            <Route path="/legal/:slug" element={<LegalPage />} />
            
            {/* Protected CLIENT Routes */}
            <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/wallet" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Wallet />
            </ProtectedRoute>
          } />
          <Route path="/tasks" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Tasks />
            </ProtectedRoute>
          } />
          <Route path="/tasks/:taskId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <TaskDetail />
            </ProtectedRoute>
          } />
          <Route path="/plans" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Plans />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <PlanDetail />
            </ProtectedRoute>
          } />
          <Route path="/subscriptions" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Subscriptions />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/tickets" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Tickets />
            </ProtectedRoute>
          } />
          <Route path="/tickets/:ticketId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <TicketDetail />
            </ProtectedRoute>
          } />
          <Route path="/support" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Support />
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Notifications />
            </ProtectedRoute>
          } />
          <Route path="/cart" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Cart />
            </ProtectedRoute>
          } />
          <Route path="/orders" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Orders />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <CookieConsent />
        </div>
      </Router>
    </CartProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;