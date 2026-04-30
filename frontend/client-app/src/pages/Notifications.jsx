import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const fetchNotifications = useCallback(async () => {
    try {
      const params = filter === 'unread' ? { unreadOnly: true } : {};
      const response = await api.get('/client/notifications', { params });
      setNotifications(response.data.notifications || []);
      setError('');
    } catch (err) {
      setError('Failed to load notifications');
      console.error('Notifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (notificationId) => {
    try {
      await api.patch(`/client/notifications/${notificationId}/read`);
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
      ));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/client/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read first
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }
    
    // Navigate based on entity type
    const entityType = notif.relatedEntity?.entityType;
    const entityId = notif.relatedEntity?.entityId;
    
    if (entityType === 'ORDER') {
      navigate('/orders');
    } else if (entityType === 'TASK' && entityId) {
      navigate(`/tasks/${entityId}?scrollToChat=true`);
    } else if (entityType === 'TICKET') {
      navigate('/tickets');
    } else if (entityType === 'WALLET' || notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE')) {
      navigate('/wallet');
    } else if (notif.type?.includes('TASK')) {
      navigate('/tasks');
    } else if (notif.type?.includes('NOTICE')) {
      navigate('/dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    if (type?.includes('ORDER')) return '📦';
    if (type?.includes('TASK')) return '📋';
    if (type?.includes('WALLET') || type?.includes('RECHARGE')) return '💰';
    if (type?.includes('TICKET')) return '🎫';
    if (type?.includes('NOTICE')) return '📢';
    return '🔔';
  };

  const getNotificationColor = (type) => {
    if (type?.includes('ORDER')) return '#6366f1';
    if (type?.includes('TASK')) return '#3b82f6';
    if (type?.includes('WALLET') || type?.includes('RECHARGE')) return '#22c55e';
    if (type?.includes('TICKET')) return '#f59e0b';
    if (type?.includes('NOTICE')) return '#8b5cf6';
    return '#64748b';
  };

  const getTypeLabel = (type) => {
    if (type?.includes('ORDER')) return 'ORDER';
    if (type?.includes('TASK')) return 'TASK';
    if (type?.includes('WALLET') || type?.includes('RECHARGE')) return 'WALLET';
    if (type?.includes('TICKET')) return 'TICKET';
    if (type?.includes('NOTICE')) return 'NOTICE';
    return 'UPDATE';
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px', paddingBottom: '100px' }}>
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ marginTop: '16px', color: '#64748b', fontSize: '14px' }}>Loading notifications...</p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px 16px', paddingBottom: '100px' }}>
        
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Notifications</h1>
              {unreadCount > 0 && (
                <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>{unreadCount} unread</p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  padding: '10px 16px', backgroundColor: '#f0fdf4', color: '#22c55e',
                  fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                Mark All Read
              </button>
            )}
          </div>
          
          {/* Filter */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'unread'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '8px 16px', borderRadius: '20px', border: 'none',
                  fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                  backgroundColor: filter === f ? '#0f172a' : '#f1f5f9',
                  color: filter === f ? '#fff' : '#64748b',
                  transition: 'all 0.2s'
                }}
              >
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '16px', backgroundColor: '#fef2f2', borderRadius: '12px', marginBottom: '16px' }}>
            <p style={{ color: '#dc2626', fontSize: '14px', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Notifications List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔔</div>
              <p style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px' }}>No notifications</p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                {filter === 'unread' ? 'All caught up!' : 'You have no notifications yet'}
              </p>
            </div>
          ) : (
            notifications.map((notif, idx) => {
              const color = getNotificationColor(notif.type);
              return (
                <div
                  key={notif.id || idx}
                  onClick={() => handleNotificationClick(notif)}
                  style={{
                    padding: '16px', cursor: 'pointer',
                    backgroundColor: '#fff',
                    borderRadius: '14px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    borderLeft: !notif.isRead ? `4px solid ${color}` : '4px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: `${color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: '20px' }}>{getNotificationIcon(notif.type)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <p style={{
                          fontSize: '14px', fontWeight: !notif.isRead ? '700' : '500',
                          color: '#0f172a', margin: 0
                        }}>
                          {notif.title}
                        </p>
                        <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>
                          {formatTime(notif.createdAt)}
                        </span>
                      </div>
                      <p style={{
                        fontSize: '13px', color: '#64748b', margin: '6px 0 0',
                        lineHeight: '1.5'
                      }}>
                        {notif.message}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px', backgroundColor: `${color}15`,
                          color: color, fontSize: '10px', fontWeight: '700',
                          borderRadius: '6px', letterSpacing: '0.5px'
                        }}>
                          {getTypeLabel(notif.type)}
                        </span>
                        {!notif.isRead && (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px', backgroundColor: '#22c55e',
                            color: '#fff', fontSize: '10px', fontWeight: '600',
                            borderRadius: '6px'
                          }}>
                            NEW
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
