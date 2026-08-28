import React, { useState, useEffect, createContext, useContext, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import { CartProvider } from './context/CartContext';
// Critical startup components stay eager (no lazy) so login/auth shell loads instantly
import ErrorBoundary from './components/ErrorBoundary';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import CookieConsent from './components/CookieConsent';
// Pages are code-split: each route chunk loads only when navigated to
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Wallet = React.lazy(() => import('./pages/Wallet'));
const Tasks = React.lazy(() => import('./pages/Tasks'));
const Plans = React.lazy(() => import('./pages/Plans'));
const PlanDetail = React.lazy(() => import('./pages/PlanDetail'));
const Cart = React.lazy(() => import('./pages/Cart'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Subscriptions = React.lazy(() => import('./pages/Subscriptions'));
const Profile = React.lazy(() => import('./pages/Profile'));
const TaskDetail = React.lazy(() => import('./pages/TaskDetail'));
const Tickets = React.lazy(() => import('./pages/Tickets'));
const TicketDetail = React.lazy(() => import('./pages/TicketDetail'));
const Support = React.lazy(() => import('./pages/Support'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const LegalPage = React.lazy(() => import('./pages/LegalPage'));
const Register = React.lazy(() => import('./pages/Register'));
const Earnings = React.lazy(() => import('./pages/Earnings'));
const EarningsLedgerPage = React.lazy(() => import('./pages/EarningsLedger'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
import { initPushNotifications, setupForegroundHandler } from './services/pushService';

// Lightweight Suspense fallback while a lazy route chunk loads (existing spinner style)
const RouteLoadingFallback = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '32px', height: '32px',
        border: '3px solid #e2e8f0', borderTopColor: '#6366f1',
        borderRadius: '50%', animation: 'spin 1s linear infinite',
        margin: '0 auto 12px'
      }} />
      <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Loading...</p>
    </div>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

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
    const initAuth = () => {
      try {
        const token = localStorage.getItem('token');
        const loggedIn = !!token;
        const role = getUserRole();
        
        console.log('[Auth] Initializing auth state:', { hasToken: loggedIn, role });
        
        setAuthState({
          isReady: true,
          isLoggedIn: loggedIn,
          userRole: role
        });
      } catch (err) {
        console.error('[Auth] Init error (non-fatal):', err.message);
        // Safety: always mark ready even if localStorage fails
        setAuthState({ isReady: true, isLoggedIn: false, userRole: null });
      }
    };

    // Check immediately
    initAuth();
    
    // Safety net: force isReady=true after 3s if not already set
    const safety = setTimeout(() => {
      setAuthState(prev => prev.isReady ? prev : { isReady: true, isLoggedIn: false, userRole: null });
    }, 3000);
    
    // Also listen for storage changes (when another tab logs in/out)
    const handleStorageChange = (e) => {
      if (e.key === 'token' || e.key === 'user') {
        console.log('[Auth] Storage changed, reinitializing');
        initAuth();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => {
      clearTimeout(safety);
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

  // Show loading while auth is initializing
  if (!isReady) {
    console.log('[ProtectedRoute] Waiting for auth initialization...');
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

  // Direct localStorage check as backup (context may be stale after same-tab login)
  const tokenExists = !!localStorage.getItem('token');
  let storedRole = null;
  try {
    const storedUser = localStorage.getItem('user');
    storedRole = storedUser ? JSON.parse(storedUser)?.role : null;
  } catch (e) {
    storedRole = null;
  }
  const actuallyLoggedIn = isLoggedIn || tokenExists;

  if (!actuallyLoggedIn) {
    // Store intended URL for redirect after login
    const intendedUrl = location.pathname + location.search;
    console.log('[ProtectedRoute] ========== NOT LOGGED IN ==========');
    console.log('[ProtectedRoute] Current URL:', intendedUrl);
    console.log('[ProtectedRoute] Storing in sessionStorage as intendedUrl');
    sessionStorage.setItem('intendedUrl', intendedUrl);
    console.log('[ProtectedRoute] Redirecting to /login');
    console.log('[ProtectedRoute] =====================================');
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole || storedRole)) {
    console.log('[ProtectedRoute] Role mismatch:', userRole || storedRole, 'not in', allowedRoles);
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
        // Explicit routing: taskId → task page, orderId → orders page, fallback → support
        let url;
        if (event.data?.taskId) {
          url = `/tasks/${event.data.taskId}?scrollToChat=true`;
        } else if (event.data?.orderId) {
          url = event.data.url || `/orders?orderId=${event.data.orderId}`;
        } else {
          url = event.data?.url || '/support';
        }
        
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

// Global Push Notification Manager — initializes FCM foreground handler at app level
// so notifications work regardless of which page is open (not just Dashboard).
// Dispatches a custom DOM event 'gva-fcm-message' that Header and Support listen to
// for instant notification refetch without polling delay.
const PushNotificationManager = () => {
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn) return;

    // Initialize FCM token + service worker registration
    initPushNotifications();

    // Register foreground handler: dispatches custom event for every FCM message received while app is open
    // The handler in pushService.js also shows a browser notification when the tab is hidden.
    const unsubscribe = setupForegroundHandler((payload) => {
      console.log('[FCM] Foreground message received:', payload?.data?.type || 'unknown');
      window.dispatchEvent(new CustomEvent('gva-fcm-message', { detail: payload }));
    });

    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [isLoggedIn]);

  return null;
};

// App shell — renders Router immediately so public routes (login) are never blocked
const AppShell = () => {
  return (
    <CartProvider>
      <Router>
        <NotificationClickHandler />
        <PushNotificationManager />
        <div className="App">
          <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginForm />} />
            <Route path="/register" element={<Register />} />
            <Route path="/legal/:slug" element={<LegalPage />} />
            
            {/* Public Browsing Routes (no auth required) */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/plans/:planId" element={<PlanDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/support" element={<Support />} />
            
            {/* Protected CLIENT Routes */}
          <Route path="/tasks/:taskId" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <TaskDetail />
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
          <Route path="/earnings" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <Earnings />
            </ProtectedRoute>
          } />
          <Route path="/earnings-ledger" element={
            <ProtectedRoute allowedRoles={['CLIENT']}>
              <EarningsLedgerPage />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          <CookieConsent />
        </div>
      </Router>
    </CartProvider>
  );
};

// Main App Component
const App = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;