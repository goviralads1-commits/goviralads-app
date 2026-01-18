import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';
import { getCurrentUser, logout } from '../services/authService';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({});
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [activity, setActivity] = useState({ tasks: [], transactions: [], responses: [] });
  const [activityLoading, setActivityLoading] = useState(false);
  // Support/Tickets state
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: '', category: 'GENERAL', priority: 'NORMAL', message: '' });
  const [ticketReply, setTicketReply] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/client/profile');
      setProfile(res.data.profile);
      setStats(res.data.stats);
      setFormData({
        name: res.data.profile.name || '',
        phone: res.data.profile.phone || '',
        company: res.data.profile.company || '',
        timezone: res.data.profile.timezone || 'UTC',
        language: res.data.profile.language || 'en',
        emailNotifications: res.data.profile.preferences?.emailNotifications ?? true,
        inAppNotifications: res.data.profile.preferences?.inAppNotifications ?? true,
      });
    } catch (err) {
      // Silent fail - show empty state
    } finally {
      setLoading(false);
    }
  };

  const fetchActivity = async () => {
    try {
      setActivityLoading(true);
      const res = await api.get('/client/profile/activity');
      setActivity(res.data);
    } catch (err) {
      // Silent fail
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'activity' && activity.tasks.length === 0) {
      fetchActivity();
    }
    if (activeTab === 'support' && tickets.length === 0) {
      fetchTickets();
    }
  }, [activeTab]);

  // Fetch tickets
  const fetchTickets = async () => {
    try {
      setTicketsLoading(true);
      const res = await api.get('/client/tickets');
      setTickets(res.data.tickets || []);
    } catch (err) {
      // Silent fail
    } finally {
      setTicketsLoading(false);
    }
  };

  // Fetch single ticket
  const fetchTicketDetails = async (ticketId) => {
    try {
      const res = await api.get(`/client/tickets/${ticketId}`);
      setSelectedTicket(res.data.ticket);
    } catch (err) {
      // Silent fail
    }
  };

  // Create new ticket
  const handleCreateTicket = async () => {
    if (!newTicket.subject || !newTicket.message) return;
    try {
      setSubmitting(true);
      await api.post('/client/tickets', newTicket);
      setShowNewTicket(false);
      setNewTicket({ subject: '', category: 'GENERAL', priority: 'NORMAL', message: '' });
      fetchTickets();
    } catch (err) {
      // Silent fail
    } finally {
      setSubmitting(false);
    }
  };

  // Reply to ticket
  const handleTicketReply = async () => {
    if (!ticketReply.trim() || !selectedTicket) return;
    try {
      setSubmitting(true);
      await api.post(`/client/tickets/${selectedTicket.id}/reply`, { message: ticketReply });
      setTicketReply('');
      fetchTicketDetails(selectedTicket.id);
    } catch (err) {
      // Silent fail
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await api.patch('/client/profile', {
        name: formData.name,
        phone: formData.phone,
        company: formData.company,
        timezone: formData.timezone,
        language: formData.language,
        preferences: {
          emailNotifications: formData.emailNotifications,
          inAppNotifications: formData.inAppNotifications,
        },
      });
      await fetchProfile();
      setEditMode(false);
    } catch (err) {
      // Silent fail - error handled via UI
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    
    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setPasswordError('Please fill in all fields');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    try {
      setSaving(true);
      await api.post('/client/profile/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordSuccess('Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px', paddingBottom: '100px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', backgroundColor: '#e2e8f0', borderRadius: '50%', margin: '0 auto 20px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '50%', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '6px', margin: '0 auto 12px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '60%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', margin: '0 auto', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'My Profile', icon: '👤' },
    { id: 'wallet', label: 'My Wallet', icon: '💰' },
    { id: 'activity', label: 'My Activity', icon: '📊' },
    { id: 'support', label: 'Support', icon: '🎧' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px', paddingBottom: '100px' }}>
        {/* Profile Header */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', textAlign: 'center' }}>
          <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
            {profile?.photoUrl ? (
              <img src={profile.photoUrl} alt="Profile" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} loading="lazy" />
            ) : (
              <span style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                {profile?.name?.charAt(0)?.toUpperCase() || profile?.identifier?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>
            {profile?.name || profile?.identifier || 'Client User'}
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 16px 0' }}>{profile?.identifier}</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '8px 16px', borderRadius: '12px', backgroundColor: profile?.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7', color: profile?.status === 'ACTIVE' ? '#15803d' : '#b45309', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
              {profile?.status === 'ACTIVE' ? '✓ Active' : profile?.status || 'Active'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
                borderRadius: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                backgroundColor: activeTab === tab.id ? '#6366f1' : '#fff',
                color: activeTab === tab.id ? '#fff' : '#64748b',
                fontWeight: '600', fontSize: '14px',
                boxShadow: activeTab === tab.id ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* MY PROFILE TAB */}
        {activeTab === 'profile' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Basic Information</h2>
              {!editMode ? (
                <button onClick={() => setEditMode(true)} style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', color: '#6366f1', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Edit
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setEditMode(false)} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveProfile} disabled={saving} style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Full Name</label>
                {editMode ? (
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                ) : (
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>{profile?.name || 'Not set'}</div>
                )}
              </div>

              {/* Email (read-only) */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Email</label>
                <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>{profile?.identifier || 'N/A'}</div>
              </div>

              {/* Phone */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Phone</label>
                {editMode ? (
                  <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                ) : (
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>{profile?.phone || 'Not set'}</div>
                )}
              </div>

              {/* Company */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Company / Brand</label>
                {editMode ? (
                  <input type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                ) : (
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>{profile?.company || 'Not set'}</div>
                )}
              </div>

              {/* Timezone */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Timezone</label>
                {editMode ? (
                  <select value={formData.timezone} onChange={e => setFormData({...formData, timezone: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none', backgroundColor: '#fff' }}>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">Eastern Time (US)</option>
                    <option value="America/Los_Angeles">Pacific Time (US)</option>
                    <option value="Europe/London">London</option>
                    <option value="Asia/Dubai">Dubai</option>
                    <option value="Asia/Singapore">Singapore</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                  </select>
                ) : (
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>{profile?.timezone || 'UTC'}</div>
                )}
              </div>

              {/* Member Since */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Member Since</label>
                <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '15px', color: '#0f172a' }}>
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MY WALLET TAB */}
        {activeTab === 'wallet' && (
          <div>
            {/* Balance Card */}
            <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '24px', padding: '28px', marginBottom: '20px', color: '#fff' }}>
              <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>Current Balance</p>
              <h2 style={{ fontSize: '36px', fontWeight: '800', margin: '0 0 20px 0' }}>
                {stats?.walletBalance?.toLocaleString() || 0} <span style={{ fontSize: '18px', fontWeight: '500' }}>credits</span>
              </h2>
              <button onClick={() => navigate('/wallet')} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
                Manage Wallet →
              </button>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Active Tasks</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{stats?.activeTasks || 0}</p>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Completed</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: '#15803d', margin: 0 }}>{stats?.completedTasks || 0}</p>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Purchased Plans</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: '#6366f1', margin: 0 }}>{stats?.purchasedPlans || 0}</p>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Responses</p>
                <p style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>{stats?.responseCount || 0}</p>
              </div>
            </div>
          </div>
        )}

        {/* MY ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div>
            {activityLoading ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '40px', textAlign: 'center' }}>
                <p style={{ color: '#64748b' }}>Loading activity...</p>
              </div>
            ) : (
              <>
                {/* Recent Tasks */}
                <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>📋 My Tasks</h3>
                    <button onClick={() => navigate('/tasks')} style={{ fontSize: '13px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>View All →</button>
                  </div>
                  {activity.tasks.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>No tasks yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {activity.tasks.slice(0, 5).map(task => (
                        <div key={task.id} onClick={() => navigate(`/tasks/${task.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', cursor: 'pointer' }}>
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{task.title}</p>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{new Date(task.createdAt).toLocaleDateString()}</p>
                          </div>
                          <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', backgroundColor: task.status === 'COMPLETED' ? '#dcfce7' : '#dbeafe', color: task.status === 'COMPLETED' ? '#15803d' : '#1d4ed8' }}>
                            {task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Transactions */}
                <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>💳 Recent Transactions</h3>
                    <button onClick={() => navigate('/wallet')} style={{ fontSize: '13px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>View All →</button>
                  </div>
                  {activity.transactions.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>No transactions yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {activity.transactions.slice(0, 5).map(txn => (
                        <div key={txn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{txn.description}</p>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{new Date(txn.createdAt).toLocaleDateString()}</p>
                          </div>
                          <span style={{ fontWeight: '700', fontSize: '14px', color: txn.amount > 0 ? '#15803d' : '#dc2626' }}>
                            {txn.amount > 0 ? '+' : ''}{txn.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Responses */}
                <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>📝 My Responses</h3>
                  {activity.responses.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '14px' }}>No responses yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {activity.responses.slice(0, 5).map((r, idx) => (
                        <div key={idx} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{r.noticeTitle}</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: '#e0e7ff', color: '#4338ca' }}>{r.noticeType}</span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>{r.value || r.responseType}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* SUPPORT TAB */}
        {activeTab === 'support' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
            {/* Back from ticket detail */}
            {selectedTicket && (
              <div>
                <button onClick={() => setSelectedTicket(null)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>
                  ← Back to Tickets
                </button>
                
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>{selectedTicket.subject}</h3>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>#{selectedTicket.ticketNumber}</p>
                    </div>
                    <span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', backgroundColor: selectedTicket.status === 'OPEN' ? '#dbeafe' : selectedTicket.status === 'RESOLVED' ? '#dcfce7' : selectedTicket.status === 'CLOSED' ? '#f1f5f9' : '#fef9c3', color: selectedTicket.status === 'OPEN' ? '#1d4ed8' : selectedTicket.status === 'RESOLVED' ? '#15803d' : selectedTicket.status === 'CLOSED' ? '#64748b' : '#a16207' }}>
                      {selectedTicket.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569' }}>{selectedTicket.category}</span>
                    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', backgroundColor: selectedTicket.priority === 'URGENT' ? '#fef2f2' : selectedTicket.priority === 'HIGH' ? '#fff7ed' : '#f0fdf4', color: selectedTicket.priority === 'URGENT' ? '#dc2626' : selectedTicket.priority === 'HIGH' ? '#ea580c' : '#16a34a' }}>{selectedTicket.priority}</span>
                  </div>
                </div>

                {/* Messages */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px', maxHeight: '400px', overflowY: 'auto', padding: '4px' }}>
                  {selectedTicket.messages?.map((msg, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.senderRole === 'CLIENT' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '80%', padding: '12px 16px', borderRadius: '16px', backgroundColor: msg.senderRole === 'CLIENT' ? '#6366f1' : '#f1f5f9', color: msg.senderRole === 'CLIENT' ? '#fff' : '#0f172a' }}>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>{msg.message}</p>
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                        {msg.senderRole === 'ADMIN' ? 'Support' : 'You'} • {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Reply Input */}
                {selectedTicket.status !== 'CLOSED' && (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input type="text" value={ticketReply} onChange={e => setTicketReply(e.target.value)} placeholder="Type your reply..." style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none' }} onKeyDown={e => e.key === 'Enter' && handleTicketReply()} />
                    <button onClick={handleTicketReply} disabled={submitting || !ticketReply.trim()} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: submitting || !ticketReply.trim() ? 0.6 : 1 }}>Send</button>
                  </div>
                )}
              </div>
            )}

            {/* New Ticket Form */}
            {showNewTicket && !selectedTicket && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>New Support Ticket</h3>
                  <button onClick={() => setShowNewTicket(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Subject *</label>
                    <input type="text" value={newTicket.subject} onChange={e => setNewTicket({...newTicket, subject: e.target.value})} placeholder="Brief description" style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Category</label>
                      <select value={newTicket.category} onChange={e => setNewTicket({...newTicket, category: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', backgroundColor: '#fff' }}>
                        <option value="GENERAL">General</option>
                        <option value="BILLING">Billing</option>
                        <option value="TECHNICAL">Technical</option>
                        <option value="TASK_ISSUE">Task Issue</option>
                        <option value="ACCOUNT">Account</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Priority</label>
                      <select value={newTicket.priority} onChange={e => setNewTicket({...newTicket, priority: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', backgroundColor: '#fff' }}>
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Message *</label>
                    <textarea value={newTicket.message} onChange={e => setNewTicket({...newTicket, message: e.target.value})} placeholder="Describe your issue..." rows={4} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <button onClick={handleCreateTicket} disabled={submitting || !newTicket.subject || !newTicket.message} style={{ padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '700', fontSize: '15px', cursor: 'pointer', opacity: submitting || !newTicket.subject || !newTicket.message ? 0.6 : 1 }}>
                    {submitting ? 'Submitting...' : 'Submit Ticket'}
                  </button>
                </div>
              </div>
            )}

            {/* Tickets List */}
            {!showNewTicket && !selectedTicket && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Support Tickets</h3>
                  <button onClick={() => setShowNewTicket(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>+ New Ticket</button>
                </div>
                {ticketsLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1,2,3].map(i => (<div key={i} style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}><div style={{ width: '60%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite' }} /><div style={{ width: '40%', height: '12px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} /></div>))}
                  </div>
                ) : tickets.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎧</div>
                    <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>No tickets yet</h4>
                    <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Create a support ticket if you need help</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {tickets.map(ticket => (
                      <div key={ticket.id} onClick={() => fetchTicketDetails(ticket.id)} style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '14px', cursor: 'pointer', border: '2px solid transparent', transition: 'all 0.2s ease' }} onMouseOver={e => e.currentTarget.style.borderColor = '#e2e8f0'} onMouseOut={e => e.currentTarget.style.borderColor = 'transparent'}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{ticket.subject}</h4>
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>#{ticket.ticketNumber}</p>
                          </div>
                          <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', backgroundColor: ticket.status === 'OPEN' ? '#dbeafe' : ticket.status === 'RESOLVED' ? '#dcfce7' : ticket.status === 'CLOSED' ? '#f1f5f9' : '#fef9c3', color: ticket.status === 'OPEN' ? '#1d4ed8' : ticket.status === 'RESOLVED' ? '#15803d' : ticket.status === 'CLOSED' ? '#64748b' : '#a16207' }}>{ticket.status.replace('_', ' ')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                          <span>{ticket.category}</span><span>•</span><span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                          {ticket.lastReplyBy && (<><span>•</span><span style={{ color: ticket.lastReplyBy === 'ADMIN' ? '#6366f1' : '#64748b' }}>{ticket.lastReplyBy === 'ADMIN' ? 'Admin replied' : 'You replied'}</span></>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            {/* Security */}
            <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0' }}>🔒 Security</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Current Password</label>
                <input type="password" value={passwordData.currentPassword} onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>New Password</label>
                <input type="password" value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Confirm New Password</label>
                <input type="password" value={passwordData.confirmPassword} onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
              </div>
              
              {passwordError && <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>{passwordError}</p>}
              {passwordSuccess && <p style={{ color: '#15803d', fontSize: '13px', marginBottom: '12px' }}>{passwordSuccess}</p>}
              
              <button onClick={handleChangePassword} disabled={saving} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Changing...' : 'Change Password'}
              </button>
            </div>

            {/* Preferences */}
            <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0' }}>🔔 Notification Preferences</h3>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Email Notifications</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Receive updates via email</p>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '28px' }}>
                  <input type="checkbox" checked={formData.emailNotifications} onChange={e => setFormData({...formData, emailNotifications: e.target.checked})} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: formData.emailNotifications ? '#6366f1' : '#e2e8f0', borderRadius: '28px', transition: '0.3s' }}>
                    <span style={{ position: 'absolute', height: '22px', width: '22px', left: formData.emailNotifications ? '23px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '0.3s' }} />
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>In-App Notifications</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Show notifications in app</p>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '28px' }}>
                  <input type="checkbox" checked={formData.inAppNotifications} onChange={e => setFormData({...formData, inAppNotifications: e.target.checked})} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, backgroundColor: formData.inAppNotifications ? '#6366f1' : '#e2e8f0', borderRadius: '28px', transition: '0.3s' }}>
                    <span style={{ position: 'absolute', height: '22px', width: '22px', left: formData.inAppNotifications ? '23px' : '3px', bottom: '3px', backgroundColor: '#fff', borderRadius: '50%', transition: '0.3s' }} />
                  </span>
                </label>
              </div>

              <button onClick={handleSaveProfile} disabled={saving} style={{ marginTop: '16px', padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>

            {/* Logout */}
            <button onClick={handleLogout} style={{ width: '100%', padding: '16px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: '2px solid #fecaca', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign Out
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '24px' }}>
          Client Portal v1.0.0
        </p>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

export default Profile;
