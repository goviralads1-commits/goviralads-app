import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUserRole } from './services/authService';
import ErrorBoundary from './components/ErrorBoundary';
import LoginForm from './components/LoginForm';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Recharges from './pages/Recharges';
import Tasks from './pages/Tasks';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Plans from './pages/Plans';
import Categories from './pages/Categories';
import Profile from './pages/Profile';
import TaskDetail from './pages/TaskDetail';
import PlanDetail from './pages/PlanDetail';
import PlanPreview from './pages/PlanPreview';
import Wallet from './pages/Wallet';
import Billing from './pages/Billing';
import CreditPlans from './pages/CreditPlans';
import OfficeCMS from './pages/OfficeCMS';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import Roles from './pages/Roles';
import Commissions from './pages/Commissions';
import SubscriptionRequests from './pages/SubscriptionRequests';
import ProgressIcons from './pages/ProgressIcons';
import Support from './pages/Support';
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
  
  // CRITICAL: Double-check localStorage directly as backup
  const tokenExists = !!localStorage.getItem('token');

  if (!isReady) {
    console.log('[ProtectedRoute] Waiting for auth initialization...');
    console.log('[ProtectedRoute] Direct localStorage check - token:', tokenExists ? 'YES' : 'NO');
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

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    console.log('[ProtectedRoute] Role mismatch:', userRole, 'not in', allowedRoles);
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
        // Navigate directly to task page — ?scrollToChat=true triggers auto-scroll in TaskDetail
        const url = event.data?.taskId
          ? `/tasks/${event.data.taskId}?scrollToChat=true`
          : (event.data?.url || '/support');
        
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
  console.log('Admin app loaded');
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <NotificationClickHandler />
          <div className="App">
            <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginForm />} />
          
          {/* Protected ADMIN Routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/clients" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Clients />
            </ProtectedRoute>
          } />
          <Route path="/recharges" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Recharges />
            </ProtectedRoute>
          } />
          <Route path="/tasks" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Tasks />
            </ProtectedRoute>
          } />
          <Route path="/tasks/:taskId" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <TaskDetail />
            </ProtectedRoute>
          } />
          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/notifications" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Notifications />
            </ProtectedRoute>
          } />
          <Route path="/plans" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Plans />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <PlanDetail />
            </ProtectedRoute>
          } />
          <Route path="/plans/:planId/preview" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <PlanPreview />
            </ProtectedRoute>
          } />
          <Route path="/categories" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Categories />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="/wallet" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Wallet />
            </ProtectedRoute>
          } />
          <Route path="/billing" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Billing />
            </ProtectedRoute>
          } />
          <Route path="/credit-plans" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <CreditPlans />
            </ProtectedRoute>
          } />
          <Route path="/office-cms" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <OfficeCMS />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="/roles" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Roles />
            </ProtectedRoute>
          } />
          <Route path="/commissions" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Commissions />
            </ProtectedRoute>
          } />
          <Route path="/orders" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Orders />
            </ProtectedRoute>
          } />
          <Route path="/progress-icons" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <ProgressIcons />
            </ProtectedRoute>
          } />
          <Route path="/support" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Support />
            </ProtectedRoute>
          } />
          <Route path="/subscription-requests" element={
            <Navigate to="/wallet" replace />
          } />
          
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;