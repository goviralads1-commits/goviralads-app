import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAuthenticated, getUserRole, getPermissions, savePermissions } from './services/authService';
import api from './services/api';
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
import ProgressIcons from './pages/ProgressIcons';
import Support from './pages/Support';
import Earnings from './pages/Earnings';
import EarningsRedeems from './pages/EarningsRedeems';
import Employees from './pages/Employees';
import NotFound from './pages/NotFound';

// Branding Context — shared across app (preloader + login + anywhere)
const BrandingContext = createContext({
  appName: 'Go Viral Ads',
  tagline: 'Admin Portal',
  logoUrl: '',
  accentColor: '#6366f1',
  secondaryColor: '#22c55e',
  isLoaded: false
});

export const useBranding = () => useContext(BrandingContext);

// Branding Provider — fetches /public/branding once, shares via context
const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({
    appName: 'Go Viral Ads',
    tagline: 'Admin Portal',
    logoUrl: '',
    accentColor: '#6366f1',
    secondaryColor: '#22c55e',
    isLoaded: false
  });

  useEffect(() => {
    let timeout;
    const fetchBranding = async () => {
      try {
        const res = await api.get('/public/branding');
        if (res.data) {
          setBranding({
            appName: res.data.appName || 'Go Viral Ads',
            tagline: res.data.tagline || 'Admin Portal',
            logoUrl: res.data.logoUrl || '',
            accentColor: res.data.accentColor || '#6366f1',
            secondaryColor: res.data.secondaryColor || '#22c55e',
            isLoaded: true
          });
          return;
        }
      } catch (err) {
        // Silent fail — use defaults
      }
      setBranding(prev => ({ ...prev, isLoaded: true }));
    };
    // Hard timeout: never wait more than 2s for branding
    timeout = setTimeout(() => {
      setBranding(prev => prev.isLoaded ? prev : { ...prev, isLoaded: true });
    }, 2000);
    fetchBranding();
    return () => clearTimeout(timeout);
  }, []);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
};

// Branded Preloader — shows admin logo + spinner until branding is loaded
const BrandedPreloader = ({ children }) => {
  const branding = useBranding();
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Only fade out when branding is loaded AND either:
    // - the logo image has finished loading (onLoad fired), OR
    // - there is no logo URL (SVG fallback is fine), OR
    // - the image failed to load (onError fired, fallback to SVG)
    if (branding.isLoaded && (!branding.logoUrl || imageLoaded || imageError)) {
      setFadeOut(true);
      const t = setTimeout(() => setHidden(true), 300);
      return () => clearTimeout(t);
    }
  }, [branding.isLoaded, branding.logoUrl, imageLoaded, imageError]);

  // Safety net: force hide after 4s regardless (prevents stuck preloader)
  useEffect(() => {
    const safety = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => setHidden(true), 300);
    }, 4000);
    return () => clearTimeout(safety);
  }, []);

  if (hidden) return children;

  const accent = branding.accentColor || '#6366f1';
  const showLogo = branding.logoUrl && !imageError;

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.3s ease',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          {showLogo ? (
            <img
              src={branding.logoUrl}
              alt="Logo"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                objectFit: 'cover',
                margin: '0 auto 20px',
                display: 'block',
                boxShadow: `0 8px 24px ${accent}40`
              }}
            />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              background: `linear-gradient(135deg, ${accent} 0%, #4f46e5 100%)`,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: `0 8px 24px ${accent}40`
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
            {branding.appName || 'Go Viral Ads'}
          </h2>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #e2e8f0',
            borderTopColor: accent,
            borderRadius: '50%',
            animation: 'preloader-spin .8s linear infinite',
            margin: '16px auto 0'
          }} />
        </div>
      </div>
      <style>{`@keyframes preloader-spin { to { transform: rotate(360deg); } }`}</style>
      {/* Mount children behind preloader so auth init starts immediately */}
      <div style={{ visibility: 'hidden', position: 'absolute' }}>{children}</div>
    </>
  );
};

// Auth Context for managing auth state
const AuthContext = createContext({
  isReady: false,
  isLoggedIn: false,
  userRole: null,
  permissionsLoaded: false
});

export const useAuth = () => useContext(AuthContext);

// Auth Provider that waits for localStorage to be ready AND permissions to be loaded
const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    isReady: false,
    isLoggedIn: false,
    userRole: null,
    permissionsLoaded: false
  });

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      const loggedIn = !!token;
      const role = getUserRole();
      
      console.log('[Auth] ========== INIT AUTH ==========');
      console.log('[Auth] Token in localStorage:', token ? `YES (${token.length} chars)` : 'NO');
      console.log('[Auth] isLoggedIn:', loggedIn);
      console.log('[Auth] Role:', role);

      if (loggedIn) {
        // Check if permissions already in localStorage
        const cached = getPermissions();
        if (cached) {
          console.log('[Auth] Permissions found in localStorage');
          setAuthState({ isReady: true, isLoggedIn: true, userRole: role, permissionsLoaded: true });
        } else {
          // Fetch from API before marking ready
          try {
            console.log('[Auth] No cached permissions — fetching from API...');
            const permRes = await api.get('/admin/me/permissions');
            savePermissions(permRes.data);
            console.log('[Auth] Permissions fetched and saved');
          } catch (err) {
            console.log('[Auth] Permissions fetch failed (non-fatal):', err.message);
          }
          setAuthState({ isReady: true, isLoggedIn: true, userRole: role, permissionsLoaded: true });
        }
      } else {
        // Not logged in — no permissions to load
        setAuthState({ isReady: true, isLoggedIn: false, userRole: role, permissionsLoaded: false });
      }
      
      console.log('[Auth] ================================');
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

// Protected Route Component - waits for auth AND permissions to be ready
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isReady, isLoggedIn, userRole, permissionsLoaded } = useAuth();
  const location = useLocation();
  
  // CRITICAL: Double-check localStorage directly as backup
  const tokenExists = !!localStorage.getItem('token');
  const permsCached = !!localStorage.getItem('permissions');
  let storedRole = null;
  try {
    const storedUser = localStorage.getItem('user');
    storedRole = storedUser ? JSON.parse(storedUser)?.role : null;
  } catch (e) {
    storedRole = null;
  }

  // Wait for BOTH auth init AND permissions load before rendering
  // permsCached covers the post-login case where context hasn't re-initialized yet
  if (!isReady || (tokenExists && !permissionsLoaded && !permsCached)) {
    console.log('[ProtectedRoute] Waiting for auth + permissions...');
    console.log('[ProtectedRoute] isReady:', isReady, '| permissionsLoaded:', permissionsLoaded, '| token:', tokenExists ? 'YES' : 'NO');
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

// Main App Component
const App = () => {
  console.log('Admin app loaded');
  return (
    <ErrorBoundary>
      <BrandingProvider>
      <AuthProvider>
        <BrandedPreloader>
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
          <Route path="/earnings" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Earnings />
            </ProtectedRoute>
          } />
          <Route path="/earnings-redeems" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <EarningsRedeems />
            </ProtectedRoute>
          } />
          <Route path="/employees" element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <Employees />
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
        </BrandedPreloader>
      </AuthProvider>
      </BrandingProvider>
    </ErrorBoundary>
  );
};

export default App;