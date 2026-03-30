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
      
      console.log('[Auth] Initializing auth state:', { hasToken: loggedIn, role });
      
      setAuthState({
        isReady: true,
        isLoggedIn: loggedIn,
        userRole: role
      });
    };

    // Check immediately
    initAuth();
    
    // Also listen for storage changes (when another tab logs in/out)
    const handleStorageChange = (e) => {
      if (e.key === 'token' || e.key === 'user') {
        console.log('[Auth] Storage changed, reinitializing');
        initAuth();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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

  if (!isLoggedIn) {
    // Store intended URL for redirect after login
    const intendedUrl = location.pathname + location.search;
    console.log('[ProtectedRoute] Not logged in, storing intended URL:', intendedUrl);
    sessionStorage.setItem('intendedUrl', intendedUrl);
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    console.log('[ProtectedRoute] Role mismatch:', userRole, 'not in', allowedRoles);
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Notification Click Handler - handles messages from service worker
const NotificationClickHandler = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        // Use url if provided, otherwise construct from taskId
        const url = event.data?.url || (event.data?.taskId ? `/support?taskId=${event.data.taskId}` : '/support');
        console.log('[Push] Notification clicked, navigating to:', url);
        
        if (isLoggedIn) {
          navigate(url);
        } else {
          console.log('[Push] Not logged in, saving intended URL');
          sessionStorage.setItem('intendedUrl', url);
          navigate('/login');
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
  }, [navigate, isLoggedIn]);

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