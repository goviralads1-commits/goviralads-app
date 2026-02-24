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
    if (notif.relatedEntity?.entityType === 'TASK') {
      navigate(`/tasks/${notif.relatedEntity.entityId}`);
    } else if (notif.relatedEntity?.entityType === 'TICKET') {
      navigate('/tickets');
    } else if (notif.relatedEntity?.entityType === 'WALLET' || notif.type?.includes('WALLET') || notif.type?.includes('RECHARGE')) {
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
    if (type?.includes('TASK')) return '📋';
    if (type?.includes('WALLET') || type?.includes('RECHARGE')) return '💰';
    if (type?.includes('TICKET')) return '🎫';
    if (type?.includes('NOTICE')) return '📢';
    return '🔔';
  };

  const getNotificationColor = (type) => {
    if (type?.includes('TASK')) return '#3b82f6';
    if (type?.includes('WALLET') || type?.includes('RECHARGE')) return '#22c55e';
    if (type?.includes('TICKET')) return '#f59e0b';
    if (type?.includes('NOTICE')) return '#8b5cf6';
    return '#64748b';
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px', paddingBottom: '100px' }}>
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
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px', paddingBottom: '100px' }}>
        
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
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔔</div>
              <p style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px' }}>No notifications</p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                {filter === 'unread' ? 'All caught up!' : 'You have no notifications yet'}
              </p>
            </div>
          ) : (
            notifications.map((notif, idx) => (
              <div
                key={notif.id || idx}
                onClick={() => handleNotificationClick(notif)}
                style={{
                  padding: '16px', cursor: 'pointer',
                  borderBottom: idx < notifications.length - 1 ? '1px solid #f1f5f9' : 'none',
                  backgroundColor: !notif.isRead ? '#f0fdf4' : 'transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '12px',
                    backgroundColor: `${getNotificationColor(notif.type)}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <span style={{ fontSize: '20px' }}>{getNotificationIcon(notif.type)}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <p style={{
                        fontSize: '14px', fontWeight: !notif.isRead ? '600' : '500',
                        color: '#0f172a', margin: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {notif.title}
                      </p>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                        {formatTime(notif.createdAt)}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '13px', color: '#64748b', margin: '4px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                    }}>
                      {notif.message}
                    </p>
                    {!notif.isRead && (
                      <span style={{
                        display: 'inline-block', marginTop: '8px',
                        padding: '2px 8px', backgroundColor: '#22c55e',
                        color: '#fff', fontSize: '10px', fontWeight: '600',
                        borderRadius: '10px'
                      }}>
                        NEW
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
