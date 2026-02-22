import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, logout } from '../services/authService';
import api from '../services/api';

const Header = ({ title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [branding, setBranding] = useState({ appName: 'Client Portal', logoUrl: '', accentColor: '#22c55e' });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const bellButtonRef = useRef(null);

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
      setUnreadCount(notifs.filter(n => !n.isRead).length);
      console.log('[CLIENT NOTIFICATIONS] Loaded:', notifs.length, 'notifications,', notifs.filter(n => !n.isRead).length, 'unread');
    } catch (err) {
      console.log('[CLIENT NOTIFICATIONS] Fetch error:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchBranding();
    
    // Polling: Refresh notifications every 30 seconds
    const pollInterval = setInterval(fetchNotifications, 30000);
    
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target) && 
          !e.target.closest('[data-notification-dropdown]')) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearInterval(pollInterval);
    };
  }, [fetchNotifications]);

  const fetchBranding = async () => {
    try {
      const res = await api.get('/public/branding');
      if (res.data) {
        setBranding({
          appName: res.data.appName || 'Client Portal',
          logoUrl: res.data.logoUrl || '',
          accentColor: res.data.accentColor || '#22c55e'
        });
      }
    } catch (err) {
      // Silent fail - use defaults
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNotificationClick = (notif) => {
    setShowNotifications(false);
    // Navigate based on entity type
    if (notif.relatedEntity?.entityType === 'TASK') {
      navigate(`/tasks/${notif.relatedEntity.entityId}`);
    } else if (notif.relatedEntity?.entityType === 'TICKET') {
      navigate(`/tickets`);
    } else if (notif.type?.includes('TASK')) {
      navigate(`/tasks`);
    } else if (notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE')) {
      navigate(`/wallet`);
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
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
              {branding.appName || 'Client Portal'}
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
                <div
                  data-notification-dropdown
                  style={{
                    position: 'fixed',
                    top: dropdownPosition.top,
                    right: dropdownPosition.right,
                    width: 'min(320px, calc(100vw - 32px))',
                    maxHeight: '70vh',
                    overflowY: 'auto',
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
                            backgroundColor: notif.type?.includes('TASK') ? '#dbeafe' : notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE') ? '#fef3c7' : '#f0fdf4',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <span style={{ fontSize: '16px' }}>
                              {notif.type?.includes('TASK') ? '📋' : notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE') ? '💰' : '🔔'}
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
                    <Link to="/dashboard" onClick={() => setShowNotifications(false)} style={{ fontSize: '13px', fontWeight: '600', color: '#22c55e', textDecoration: 'none' }}>
                      View All →
                    </Link>
                  </div>
                </div>,
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
              
              {/* Profile Menu */}
              {showProfileMenu && (
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
                    <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '14px', fontWeight: '500', cursor: 'pointer', textAlign: 'left' }}>
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
            { path: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
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
