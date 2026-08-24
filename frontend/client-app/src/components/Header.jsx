import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, logout } from '../services/authService';
import api from '../services/api';
import { useCart } from '../context/CartContext';
import { disablePushNotifications, isPushEnabled, enablePushNotifications } from '../services/pushService';
import { sanitizeHtml } from '../utils/sanitizeHtml';

const Header = ({ title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const { cartCount } = useCart();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [branding, setBranding] = useState({ appName: 'Client Portal', logoUrl: '', accentColor: '#22c55e' });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const bellButtonRef = useRef(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Public header navigation (admin-configurable, max 4) — UI-only, no polling
  const [navItems, setNavItems] = useState([]);
  const [navModalItem, setNavModalItem] = useState(null);
  const [navModalVisible, setNavModalVisible] = useState(false);
  const navCloseTimerRef = useRef(null);
  const navCloseBtnRef = useRef(null);
  
  // Notification sound refs
  const prevUnreadCountRef = useRef(null); // null = first load, not yet initialized
  const lastSoundPlayedRef = useRef(0);
  const lastPlayedNotificationIdRef = useRef(null); // Track last notification that triggered sound
  const audioContextRef = useRef(null); // Cached AudioContext to avoid creating new ones

  // Play notification sound (soft beep using Web Audio API)
  const playNotificationSound = useCallback(() => {
    try {
      // Check if sound is enabled (default: ON)
      if (localStorage.getItem('notificationSoundEnabled') === 'false') return;
      
      // Check if tab is active
      if (document.visibilityState !== 'visible') return;
      
      // Max once per 30 seconds
      const now = Date.now();
      if (now - lastSoundPlayedRef.current < 30000) return;
      lastSoundPlayedRef.current = now;
      
      // Reuse cached AudioContext (create only once)
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return; // Browser doesn't support Web Audio
        audioContextRef.current = new AudioCtx();
      }
      const audioContext = audioContextRef.current;
      
      // Resume if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') audioContext.resume();
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Soft tone
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Low volume
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
      
      console.log('[NOTIFICATION SOUND] Played');
    } catch (err) {
      console.log('[NOTIFICATION SOUND] Failed:', err.message);
    }
  }, []);

  // CRITICAL FIX: Fetch from /client/notifications (NOT /client/notices)
  const fetchNotifications = useCallback(async () => {
    try {
      console.log('[CLIENT NOTIFICATIONS] Fetching from /client/notifications...');
      const res = await api.get('/client/notifications');
      console.log('[CLIENT NOTIFICATIONS] Response:', res.data);
      const notifs = (res.data.notifications || []).map(n => ({
        id: n.id || n._id,
        type: n.type,
        title: n.title,
        subtitle: n.message,
        time: n.createdAt,
        isRead: n.isRead,
        relatedEntity: n.relatedEntity
      }));
      setNotifications(notifs.slice(0, 10));
      const newUnreadCount = notifs.filter(n => !n.isRead).length;
      
      // Play sound ONLY when a truly NEW notification arrives
      const latestNotification = notifs.find(n => !n.isRead); // First unread
      if (
        prevUnreadCountRef.current !== null && // Not first load
        newUnreadCount > prevUnreadCountRef.current && // Count increased
        latestNotification && // Has unread notification
        latestNotification.id !== lastPlayedNotificationIdRef.current // Not already played for this one
      ) {
        playNotificationSound();
        lastPlayedNotificationIdRef.current = latestNotification.id;
      }
      prevUnreadCountRef.current = newUnreadCount;
      
      setUnreadCount(newUnreadCount);
      console.log('[CLIENT NOTIFICATIONS] Loaded:', notifs.length, 'notifications,', newUnreadCount, 'unread');
    } catch (err) {
      console.log('[CLIENT NOTIFICATIONS] Fetch error:', err.message);
    }
  }, [playNotificationSound]);

  const fetchBranding = useCallback(async () => {
    try {
      // Use sessionStorage cache to avoid redundant API calls on every page navigation
      const cached = sessionStorage.getItem('clientBranding');
      if (cached) {
        try {
          setBranding(JSON.parse(cached));
          return;
        } catch (_) { /* invalid cache, fetch fresh */ }
      }
      const res = await api.get('/public/branding');
      if (res.data) {
        const brandingData = {
          appName: res.data.appName || 'Client Portal',
          logoUrl: res.data.logoUrl || '',
          accentColor: res.data.accentColor || '#22c55e'
        };
        setBranding(brandingData);
        try { sessionStorage.setItem('clientBranding', JSON.stringify(brandingData)); } catch (_) {}
      }
    } catch (err) {
      // Silent fail - use defaults
    }
  }, []);

  // Public header navigation — single lightweight request, cached in sessionStorage
  // (same pattern as branding) with a small TTL so admin edits never stay stale
  // indefinitely. No polling; failure simply hides the nav row.
  const fetchHeaderNav = useCallback(async () => {
    const NAV_CACHE_KEY = 'clientHeaderNav';
    const NAV_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    try {
      const raw = sessionStorage.getItem(NAV_CACHE_KEY);
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (cached && Array.isArray(cached.items)) {
            setNavItems(cached.items); // fast initial render
            if (typeof cached.ts === 'number' && Date.now() - cached.ts < NAV_CACHE_TTL_MS) {
              return; // fresh — no network call
            }
            // Stale: keep showing cached items while refreshing once below
          }
        } catch (_) { /* invalid cache, fetch fresh */ }
      }
      const res = await api.get('/public/header-nav');
      const items = (res.data?.items || []).slice(0, 4);
      setNavItems(items);
      try { sessionStorage.setItem(NAV_CACHE_KEY, JSON.stringify({ ts: Date.now(), items })); } catch (_) {}
    } catch (err) {
      // Silent fail — cached/stale items (if any) stay visible, otherwise the row stays hidden
    }
  }, []);

  const openNavModal = useCallback((item) => {
    // POPUP-FIRST: the modal always opens when the item has content.
    // The optional `link` field is a fallback ONLY for content-less items
    // (reserved for future routing, e.g. /legal/about) — it never silently
    // bypasses the popup when content exists.
    const hasContent = item.content && String(item.content).trim() !== '';
    if (!hasContent && item.link) { navigate(item.link); return; }
    if (navCloseTimerRef.current) { clearTimeout(navCloseTimerRef.current); navCloseTimerRef.current = null; }
    setNavModalItem(item);
    // Double rAF so the browser paints the initial (hidden) state before the transition starts
    requestAnimationFrame(() => requestAnimationFrame(() => setNavModalVisible(true)));
  }, [navigate]);

  const closeNavModal = useCallback(() => {
    setNavModalVisible(false);
    navCloseTimerRef.current = setTimeout(() => setNavModalItem(null), 240);
  }, []);

  // Modal lifecycle: body scroll lock + ESC to close + focus the close button
  useEffect(() => {
    if (!navModalItem) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => { if (e.key === 'Escape') closeNavModal(); };
    document.addEventListener('keydown', onKeyDown);
    if (navCloseBtnRef.current) navCloseBtnRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [navModalItem, closeNavModal]);

  useEffect(() => {
    // Branding is public — fetch for all users (logo, app name)
    fetchBranding();

    // Public header navigation — fetch for all users (logged-out + logged-in)
    fetchHeaderNav();
    
    // Notifications require auth — only fetch/poll if user is logged in
    if (user) {
      fetchNotifications();
    }
    
    // Visibility-aware polling: pause when tab is hidden to save bandwidth and battery
    let pollInterval = null;
    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(fetchNotifications, 30000);
    };
    const stopPolling = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    };
    
    // Start polling only if page is visible and user is logged in
    if (user && document.visibilityState === 'visible') startPolling();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (user) { fetchNotifications(); // Immediate fetch on tab focus
        startPolling(); }
      } else {
        stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for FCM foreground messages — triggers instant notification refetch without waiting for next poll
    const handleFCMMessage = () => {
      if (user) {
        console.log('[Header] FCM message received — fetching notifications immediately');
        fetchNotifications();
      }
    };
    window.addEventListener('gva-fcm-message', handleFCMMessage);

    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target) && 
          !e.target.closest('[data-notification-dropdown]')) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('gva-fcm-message', handleFCMMessage);
      document.removeEventListener('mousedown', handleClickOutside);
      if (navCloseTimerRef.current) clearTimeout(navCloseTimerRef.current);
    };
  }, [fetchNotifications, fetchBranding, fetchHeaderNav]);

  const handleLogout = async () => {
    // Clean up push token so stale sessions don't keep receiving notifications
    try {
      await disablePushNotifications();
    } catch (e) {
      // Silent fail — token cleanup is best-effort, logout should proceed regardless
    }
    logout();
    navigate('/login');
  };

  // Push notification toggle — reuses the SAME pushService functions as Profile Settings page
  const handlePushToggle = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await disablePushNotifications();
        setPushEnabled(false);
      } else {
        await enablePushNotifications();
        setPushEnabled(true);
      }
    } catch (e) {
      console.error('[Header] Push toggle error:', e.message);
      // Re-sync actual state on error
      setPushEnabled(isPushEnabled());
    } finally {
      setPushLoading(false);
    }
  };

  // Sync push state whenever the profile dropdown is opened
  useEffect(() => {
    if (showProfileMenu) {
      setPushEnabled(isPushEnabled());
    }
  }, [showProfileMenu]);

  const handleNotificationClick = async (notif) => {
    // LOG: Inspect notification object structure
    console.log("NOTIFICATION CLICK:", JSON.stringify(notif, null, 2));
    
    // Optimistic UI: Mark as read immediately
    if (!notif.isRead) {
      setNotifications(prev => prev.map(n => 
        n.id === notif.id ? { ...n, isRead: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      // Call API in background
      try {
        await api.patch(`/client/notifications/${notif.id}/read`);
      } catch (err) {
        console.log('[NOTIFICATION] Mark as read error:', err.message);
        // Revert on error
        setNotifications(prev => prev.map(n => 
          n.id === notif.id ? { ...n, isRead: false } : n
        ));
        setUnreadCount(prev => prev + 1);
      }
    }
    
    setShowNotifications(false);
    
    // Use exact field from notification schema
    const entityId = notif.relatedEntity?.entityId;
    const entityType = notif.relatedEntity?.entityType;
    
    // Navigate based on entity type
    if (entityType === 'ORDER') {
      navigate(`/orders?orderId=${entityId}`);
    } else if (entityType === 'TASK') {
      navigate(`/tasks/${entityId}?scrollToChat=true`);
    } else if (entityType === 'TICKET') {
      navigate(`/tickets/${entityId}`);
    } else if (entityType === 'RECHARGE_REQUEST' || notif.type?.includes('RECHARGE')) {
      navigate(`/wallet`);
    } else if (entityType === 'WALLET') {
      navigate(`/wallet`);
    } else if (entityType === 'NOTICE') {
      navigate(`/notifications`);
    } else if (notif.type?.includes('TASK')) {
      // Fallback for TASK types without entity
      if (entityId) {
        navigate(`/tasks/${entityId}?scrollToChat=true`);
      } else {
        navigate('/tasks');
      }
    } else {
      navigate('/dashboard');
    }
  };

  const handleBellClick = () => {
    // Calculate position for fixed dropdown
    if (bellButtonRef.current) {
      const rect = bellButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right)
      });
    }
    setShowNotifications(!showNotifications);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .header-inner { padding: 8px 12px !important; gap: 8px !important; }
          .header-brand { gap: 8px !important; }
          .header-logo { width: 32px !important; height: 32px !important; border-radius: 10px !important; }
          .header-appname { font-size: 15px !important; }
          .header-actions { gap: 4px !important; }
          .header-action-btn { border-radius: 10px !important; }
          .header-login { padding: 8px 14px !important; font-size: 13px !important; min-height: 44px !important; }
          .header-nav-row { justify-content: flex-start !important; padding: 0 12px 8px !important; gap: 6px !important; }
          .header-nav-item { padding: 7px 14px !important; font-size: 12px !important; }
        }
        .header-nav-row {
          max-width: 1400px; margin: 0 auto; padding: 0 20px 10px;
          display: flex; gap: 8px; justify-content: center; flex-wrap: nowrap;
          overflow-x: auto; scrollbar-width: none;
        }
        .header-nav-row::-webkit-scrollbar { display: none; }
        .header-nav-item {
          flex-shrink: 0; padding: 8px 18px; border-radius: 999px;
          border: 1px solid #e2e8f0; background: #f8fafc; color: #334155;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
          white-space: nowrap; font-family: inherit;
        }
        .header-nav-item:hover { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
      `}</style>
      {/* Premium Top Header */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div className="header-inner" style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}>
          {/* Left: Logo + App Name */}
          <Link to="/dashboard" className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div className="header-logo" style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: branding.logoUrl ? 'transparent' : `linear-gradient(135deg, ${branding.accentColor} 0%, #16a34a 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px ${branding.accentColor}30`,
              overflow: 'hidden'
            }}>
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: '800' }}>{branding.appName?.charAt(0) || 'C'}</span>
              )}
            </div>
            <span className="header-appname" style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {branding.appName || 'Client Portal'}
            </span>
          </Link>

          {/* Right: Actions */}
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            
            {/* Cart Icon */}
            <button
              className="header-action-btn"
              onClick={() => navigate('/cart')}
              style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: location.pathname === '/cart' ? '#f0fdf4' : '#f8fafc',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', transition: 'all 0.2s'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={location.pathname === '/cart' ? '#22c55e' : '#64748b'} strokeWidth="2">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {cartCount > 0 && (
                <span style={{
                  position: 'absolute', top: '6px', right: '6px',
                  minWidth: '18px', height: '18px', borderRadius: '50%',
                  backgroundColor: '#22c55e', color: '#fff',
                  fontSize: '10px', fontWeight: '700',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(34,197,94,0.4)',
                  padding: '0 4px'
                }}>
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>

            {/* Notification Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                ref={bellButtonRef}
                className="header-action-btn"
                onClick={handleBellClick}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  backgroundColor: showNotifications ? '#f0fdf4' : '#f8fafc',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', transition: 'all 0.2s'
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={showNotifications ? '#22c55e' : '#64748b'} strokeWidth="2">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '6px', right: '6px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    backgroundColor: '#ef4444', color: '#fff',
                    fontSize: '10px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(239,68,68,0.4)'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              
              {/* Notifications Dropdown - Portal to body with fixed positioning */}
              {showNotifications && ReactDOM.createPortal(
                <>
                  {/* Backdrop for mobile — visibility controlled by CSS media query */}
                  <div 
                    className="notif-backdrop"
                    onClick={() => setShowNotifications(false)}
                  />
                  {/* Dropdown positioning — controlled by CSS media query, not inline window.innerWidth */}
                  <style>{`
                    .notif-backdrop {
                      position: fixed; inset: 0; background-color: rgba(0,0,0,0.3);
                      z-index: 9998; display: none;
                    }
                    .notification-dropdown {
                      position: fixed;
                      top: ${dropdownPosition.top}px;
                      right: ${dropdownPosition.right}px;
                      width: min(340px, calc(100vw - 32px));
                      transform: none;
                    }
                    @media (max-width: 767px) {
                      .notif-backdrop { display: block; }
                      .notification-dropdown {
                        top: 70px !important; left: 50% !important;
                        transform: translateX(-50%) !important;
                        width: min(92vw, 420px) !important; right: auto !important;
                      }
                    }
                  `}</style>
                  <div
                    data-notification-dropdown
                    className="notification-dropdown"
                    style={{
                      maxHeight: '70vh',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      backgroundColor: '#fff',
                      borderRadius: '16px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                      border: '1px solid #f1f5f9',
                      zIndex: 9999
                    }}
                  >
                  <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>{unreadCount} new</span>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
                      <p style={{ fontSize: '13px', margin: 0 }}>No notifications</p>
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        style={{
                          padding: '14px 16px', cursor: 'pointer',
                          borderBottom: '1px solid #f8fafc',
                          backgroundColor: !notif.isRead ? '#f0fdf4' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            backgroundColor: notif.type?.includes('ORDER') ? '#fef3c7' : notif.type?.includes('TASK') ? '#dbeafe' : notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE') ? '#fef3c7' : '#f0fdf4',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '16px' }}>
                              {notif.type?.includes('ORDER') ? '📦' : notif.type?.includes('TASK') ? '📋' : notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE') ? '💰' : '🔔'}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notif.title}</p>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notif.subtitle}</p>
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{formatTime(notif.time)}</span>
                        </div>
                      </div>
                    ))
                  )}
                  <div style={{ padding: '12px 16px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                    <Link to="/notifications" onClick={() => setShowNotifications(false)} style={{ fontSize: '13px', fontWeight: '600', color: '#22c55e', textDecoration: 'none' }}>
                      View All →
                    </Link>
                  </div>
                </div>
                </>,
                document.body
              )}
            </div>

            {/* Profile Dropdown or Login Button */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              {user ? (
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '12px',
                  backgroundColor: showProfileMenu ? '#f0fdf4' : '#f8fafc',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: '700' }}>
                    {user?.identifier?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              ) : (
                <button
                  className="header-login"
                  onClick={() => navigate('/login')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 20px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: '#fff', fontSize: '14px', fontWeight: '700',
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Login
                </button>
              )}
              
              {/* Profile Menu */}
              {showProfileMenu && user && (
                <div style={{
                  position: 'absolute', top: '52px', right: 0,
                  width: '200px', backgroundColor: '#fff', borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                  border: '1px solid #f1f5f9', zIndex: 200, overflow: 'hidden'
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px' }}>{user?.identifier || 'User'}</p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Client Account</p>
                  </div>
                  <div style={{ padding: '8px' }}>
                    <Link to="/profile" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500' }}>
                      <span style={{ fontSize: '16px' }}>👤</span> My Profile
                    </Link>
                    <Link to="/wallet" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500' }}>
                      <span style={{ fontSize: '16px' }}>💰</span> My Wallet
                    </Link>
                    <Link to="/orders" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500' }}>
                      <span style={{ fontSize: '16px' }}>📦</span> My Orders
                    </Link>
                    <Link to="/earnings-ledger" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#22c55e', fontSize: '14px', fontWeight: '600' }}>
                      <span style={{ fontSize: '16px' }}>💰</span> Earnings & Redeem
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '10px', backgroundColor: '#f8fafc', margin: '4px 0' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🔔</span> Notifications
                      </span>
                      <button
                        onClick={handlePushToggle}
                        disabled={pushLoading}
                        style={{
                          width: '36px', height: '20px', borderRadius: '10px',
                          border: 'none', cursor: pushLoading ? 'wait' : 'pointer',
                          backgroundColor: pushEnabled ? '#22c55e' : '#cbd5e1',
                          position: 'relative', transition: 'background-color 0.2s',
                          padding: 0, flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: '2px',
                          left: pushEnabled ? '18px' : '2px',
                          width: '16px', height: '16px', borderRadius: '50%',
                          backgroundColor: '#fff', transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                    <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0', paddingTop: '4px' }}>
                      <Link to="/legal/privacy-policy" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', textDecoration: 'none', color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
                        <span style={{ fontSize: '16px' }}>📋</span> Privacy Policy
                      </Link>
                      <Link to="/legal/terms-of-service" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', textDecoration: 'none', color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
                        <span style={{ fontSize: '16px' }}>📋</span> Terms of Service
                      </Link>
                      <Link to="/legal/contact-us" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', textDecoration: 'none', color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
                        <span style={{ fontSize: '16px' }}>📞</span> Contact
                      </Link>
                    </div>
                    <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: '16px' }}>🚪</span> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Public header navigation row (admin-configurable) — hidden entirely when no enabled items */}
        {navItems.length > 0 && (
          <nav className="header-nav-row" aria-label="Site information menu">
            {navItems.map(item => (
              <button
                key={item.id}
                className="header-nav-item"
                onClick={() => openNavModal(item)}
              >
                {item.title}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Header navigation content modal — lightweight CSS animation, portal to body */}
      {navModalItem && ReactDOM.createPortal(
        <div
          className={`nav-modal-overlay${navModalVisible ? ' nav-modal-open' : ''}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeNavModal(); }}
        >
          <style>{`
            .nav-modal-overlay {
              position: fixed; inset: 0; z-index: 10000;
              background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
              display: flex; align-items: center; justify-content: center; padding: 20px;
              opacity: 0; transition: opacity 0.22s ease;
            }
            .nav-modal-overlay.nav-modal-open { opacity: 1; }
            .nav-modal-card {
              width: min(560px, 100%); max-height: min(80vh, 640px);
              background: #fff; border-radius: 20px;
              box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
              display: flex; flex-direction: column; overflow: hidden;
              transform: translateY(16px) scale(0.96);
              transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .nav-modal-overlay.nav-modal-open .nav-modal-card { transform: translateY(0) scale(1); }
            .nav-modal-content { overflow-y: auto; padding: 4px 24px 24px; color: #334155; font-size: 14px; line-height: 1.7; }
            .nav-modal-content h3 { color: #0f172a; margin: 20px 0 8px; font-size: 17px; font-weight: 700; }
            .nav-modal-content p { margin: 0 0 12px; }
            .nav-modal-content ul { margin: 0 0 12px; padding-left: 20px; }
            .nav-modal-content li { margin-bottom: 6px; }
            @media (max-width: 640px) {
              .nav-modal-overlay { padding: 12px; align-items: flex-end; }
              .nav-modal-card { max-height: 85vh; }
            }
          `}</style>
          <div className="nav-modal-card" role="dialog" aria-modal="true" aria-label={navModalItem.title}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>{navModalItem.title}</h2>
              <button
                ref={navCloseBtnRef}
                onClick={closeNavModal}
                aria-label="Close dialog"
                style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div
              className="nav-modal-content"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(navModalItem.content) || '<p>Content coming soon.</p>' }}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Bottom Navigation Bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        backgroundColor: 'rgba(255,255,255,0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 50,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: '64px',
          maxWidth: '500px',
          margin: '0 auto',
          padding: '0 8px'
        }}>
          {[
            { path: '/dashboard', label: 'Office', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { path: '/wallet', label: 'Wallet', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
            { path: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
            { path: '/plans', label: 'Plans', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
            { path: '/support', label: 'Support', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' }
          ].map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  height: '56px',
                  textDecoration: 'none',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                <svg
                  style={{
                    width: '24px',
                    height: '24px',
                    color: isActive ? '#22c55e' : '#9ca3af',
                    transition: 'color 0.15s ease'
                  }}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                <span style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: isActive ? '#22c55e' : '#6b7280',
                  transition: 'color 0.15s ease'
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default Header;
