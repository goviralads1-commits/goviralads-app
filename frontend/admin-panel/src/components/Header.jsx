import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, logout, getPermissions, savePermissions } from '../services/authService';
import api from '../services/api';
import { disablePushNotifications, isPushEnabled, enablePushNotifications } from '../services/pushService';

const Header = ({ title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const permissions = getPermissions();
  const isMainAdmin = permissions?.isMainAdmin === true; // SECURITY: default-deny until permissions load
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [brandSettings, setBrandSettings] = useState({ appName: 'Admin Panel', logoUrl: '', accentColor: '#6366f1' });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const bellButtonRef = useRef(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Fetch notifications with proper API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/admin/notifications');
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
      setUnreadCount(notifs.filter(n => !n.isRead).length);
    } catch (err) {
      console.log('[NOTIFICATIONS] Fetch error:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchBranding();
    
    // Visibility-aware polling: pause when tab is hidden to save bandwidth and battery
    let pollInterval = null;
    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(fetchNotifications, 30000);
    };
    const stopPolling = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    };
    if (document.visibilityState === 'visible') startPolling();
    
    // SECURITY: Refresh permissions when tab regains focus + resume polling
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications(); // Immediate fetch on tab focus
        startPolling();
        api.get('/admin/me/permissions').then(res => {
          savePermissions(res.data);
        }).catch(() => {});
      } else {
        stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Listen for FCM foreground messages — triggers instant notification refetch
    const handleFCMMessage = () => {
      console.log('[Admin Header] FCM message received — fetching notifications immediately');
      fetchNotifications();
    };
    window.addEventListener('gva-fcm-message', handleFCMMessage);
    
    // Close dropdowns on outside click
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
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('gva-fcm-message', handleFCMMessage);
    };
  }, [fetchNotifications]);

  const fetchBranding = async () => {
    try {
      const res = await api.get('/public/branding');
      if (res.data) {
        setBrandSettings({
          appName: res.data.appName || 'Admin Panel',
          logoUrl: res.data.logoUrl || '',
          accentColor: res.data.accentColor || '#6366f1'
        });
      }
    } catch (err) {
      // Silent fail - use defaults
    }
  };

  const handleLogout = async () => {
    // Clean up push token so stale sessions don't keep receiving notifications
    try {
      await disablePushNotifications();
    } catch (e) {
      // Silent fail — token cleanup is best-effort
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
        await api.patch(`/admin/notifications/${notif.id}/read`);
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
    } else if (entityType === 'RECHARGE_REQUEST') {
      navigate(`/recharges`);
    } else if (entityType === 'SUBSCRIPTION_REQUEST') {
      navigate(`/wallet`);
    } else if (notif.type === 'SUBSCRIPTION_REQUEST_SUBMITTED' || notif.type?.includes('SUBSCRIPTION')) {
      // ISSUE 4 FIX: Handle subscription notification types
      navigate(`/wallet`);
    } else if (entityType === 'NOTICE') {
      navigate(`/notifications`);
    } else if (notif.type === 'NOTICE_RESPONSE') {
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
      {/* Premium Top Header */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        }}>
          {/* Left: Logo + App Name */}
          <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)'
            }}>
              {brandSettings.logoUrl ? (
                <img src={brandSettings.logoUrl} alt="Logo" style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />
              ) : (
                <span style={{ color: '#fff', fontSize: '18px', fontWeight: '800' }}>A</span>
              )}
            </div>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {brandSettings.appName}
            </span>
          </Link>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            
            {/* Notification Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                ref={bellButtonRef}
                onClick={handleBellClick}
                style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  backgroundColor: showNotifications ? '#f0f5ff' : '#f8fafc',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', transition: 'all 0.2s'
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={showNotifications ? '#6366f1' : '#64748b'} strokeWidth="2">
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
                  {/* Backdrop for mobile */}
                  <div 
                    onClick={() => setShowNotifications(false)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      zIndex: 9998,
                      display: window.innerWidth < 768 ? 'block' : 'none'
                    }}
                  />
                  <div
                    data-notification-dropdown
                    className="notification-dropdown"
                    style={{
                      position: 'fixed',
                      ...(window.innerWidth < 768 ? {
                        top: '70px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 'min(92vw, 420px)',
                        right: 'auto'
                      } : {
                        top: dropdownPosition.top,
                        right: dropdownPosition.right,
                        width: 'min(340px, calc(100vw - 32px))',
                        transform: 'none'
                      }),
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
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>{unreadCount} unread</span>
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
                          backgroundColor: !notif.isRead ? '#f0f5ff' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            backgroundColor: notif.type?.includes('ORDER') ? '#fef3c7' : notif.type?.includes('TASK') ? '#dbeafe' : notif.type?.includes('TICKET') ? '#fef3c7' : '#f0fdf4',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '16px' }}>
                              {notif.type?.includes('ORDER') ? '📦' : notif.type?.includes('TASK') ? '📋' : notif.type?.includes('TICKET') ? '🎫' : '🔔'}
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
                    <Link to="/notifications" onClick={() => setShowNotifications(false)} style={{ fontSize: '13px', fontWeight: '600', color: '#6366f1', textDecoration: 'none' }}>
                      View All →
                    </Link>
                  </div>
                </div>
                </>,
                document.body
              )}
            </div>

            {/* Profile Dropdown */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '12px',
                  backgroundColor: showProfileMenu ? '#f0f5ff' : '#f8fafc',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: '700' }}>
                    {user?.identifier?.charAt(0)?.toUpperCase() || 'A'}
                  </span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              
              {/* Profile Menu */}
              {showProfileMenu && (
                <div style={{
                  position: 'absolute', top: '52px', right: 0,
                  width: '220px', backgroundColor: '#fff', borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                  border: '1px solid #f1f5f9', zIndex: 200, overflow: 'hidden'
                }}>
                  <div style={{ padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px' }}>{user?.identifier || 'Admin'}</p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Administrator</p>
                  </div>
                  <div style={{ padding: '8px' }}>
                    <Link to="/profile" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>👤</span> My Profile
                    </Link>
                    <Link to="/orders" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>📦</span> Orders
                    </Link>
                    <Link to="/settings" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>⚙️</span> Settings
                    </Link>
                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '8px 0' }} />
                    <Link to="/employees" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>👥</span> Employees
                    </Link>
                    <Link to="/earnings" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>💰</span> Earnings
                    </Link>
                    <Link to="/earnings-redeems" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#7c3aed', fontSize: '14px', fontWeight: '600', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>🏦</span> Redeem Requests
                    </Link>
                    <Link to="/billing" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>🧾</span> Billing
                    </Link>
                    <Link to="/credit-plans" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>💳</span> Subscription
                    </Link>
                    <Link to="/legal-pages" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#374151', fontSize: '14px', fontWeight: '500', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>📄</span> Content Management
                    </Link>
                    {isMainAdmin && (
                      <>
                        <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '8px 0' }} />
                        <Link to="/roles" onClick={() => setShowProfileMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', textDecoration: 'none', color: '#6366f1', fontSize: '14px', fontWeight: '600', transition: 'background 0.2s' }}>
                          <span style={{ fontSize: '16px' }}>🔑</span> Roles & Permissions
                        </Link>
                      </>
                    )}
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
                          backgroundColor: pushEnabled ? '#6366f1' : '#cbd5e1',
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
                    <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '8px 0' }} />
                    <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s' }}>
                      <span style={{ fontSize: '16px' }}>🚪</span> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Bottom Navigation Bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '72px',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 50
      }}>
        {/* Smooth raised center - one continuous premium component */}
        <svg
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            height: '72px'
          }}
          viewBox="0 0 500 72"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="baseShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
              <feOffset dx="0" dy="-1" result="offsetblur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.14" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Navigation with smooth raised center */}
          <path
            d="M 0,16 L 0,72 L 500,72 L 500,16 Q 450,16 425,15.5 Q 400,15 375,14 Q 350,13 325,11.5 Q 300,10 275,9 Q 250,8 225,9 Q 200,10 175,11.5 Q 150,13 125,14 Q 100,15 75,15.5 Q 50,16 0,16 Z"
            fill="rgba(255,255,255,0.98)"
            filter="url(#baseShadow)"
          />
        </svg>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: '72px',
          maxWidth: '500px',
          margin: '0 auto',
          padding: '0 16px',
          position: 'relative',
          zIndex: 1
        }}>
          {[
            { path: '/dashboard', label: 'Office', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
            { path: '/wallet', label: 'Wallet', icon: 'M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z' },
            { path: '/tasks', label: 'Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', isHero: true },
            { path: '/plans', label: 'Plans', icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
            { path: '/support', label: 'Support', icon: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z' }
          ].map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const isHeroTab = item.isHero === true;
            
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
                  gap: '7px',
                  height: '64px',
                  textDecoration: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                  padding: isHeroTab ? '4px 0 8px 0' : '5px 0 7px 0',
                  borderRadius: '14px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isHeroTab ? 'translateY(-1px)' : 'translateY(0)'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isHeroTab ? '42px' : '38px',
                  height: isHeroTab ? '42px' : '38px',
                  borderRadius: '11px',
                  background: 'transparent',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                  <svg
                    style={{
                      width: isHeroTab ? '23px' : '21px',
                      height: isHeroTab ? '23px' : '21px',
                      color: isActive ? '#6366f1' : (isHeroTab ? '#6B7280' : '#9CA3AF'),
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      strokeWidth: isActive ? '2.25' : '2'
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: isActive ? '600' : '500',
                  color: isActive ? '#6366f1' : '#6B7280',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  letterSpacing: '0.02em',
                  lineHeight: 1
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
