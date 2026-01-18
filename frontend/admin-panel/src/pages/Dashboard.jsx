import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const Dashboard = () => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [clients, setClients] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeSection, setActiveSection] = useState('updates');
  const [currentBanner, setCurrentBanner] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'UPDATE',
    priority: 'NORMAL',
    targetType: 'ALL',
    targetClients: [],
    responseRequired: false,
    responseType: 'NONE',
    isActive: true,
    isPinned: false,
    imageUrl: '',
    linkUrl: '',
    linkText: '',
    expiresAt: '',
  });

  // Banner data - matches client
  const banners = [
    { id: 1, title: 'Premium Services', subtitle: 'Get started with our top plans', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 2, title: 'Special Offers', subtitle: 'Limited time deals available', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { id: 3, title: 'New Arrivals', subtitle: 'Check out the latest plans', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
  ];

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, noticesRes, clientsRes, plansRes, tasksRes] = await Promise.all([
        api.get('/admin/reports/overview'),
        api.get('/admin/notices'),
        api.get('/admin/clients'),
        api.get('/admin/plans').catch(() => ({ data: { plans: [] } })),
        api.get('/admin/tasks').catch(() => ({ data: { tasks: [] } })),
      ]);
      setDashboardData(overviewRes.data);
      setNotices(noticesRes.data.notices || []);
      setClients(clientsRes.data.clients || []);
      setPlans(plansRes.data.plans || []);
      setTasks(tasksRes.data.tasks || []);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-rotate banners
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const resetForm = () => {
    setFormData({
      title: '', content: '', type: 'UPDATE', priority: 'NORMAL',
      targetType: 'ALL', targetClients: [], responseRequired: false,
      responseType: 'NONE', isActive: true, isPinned: false,
      imageUrl: '', linkUrl: '', linkText: '', expiresAt: '',
    });
    setEditingNotice(null);
  };

  const handleCreateNotice = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      showToast('error', 'Title and content are required');
      return;
    }
    try {
      if (editingNotice) {
        await api.patch(`/admin/notices/${editingNotice.id}`, formData);
        showToast('success', 'Notice updated successfully');
      } else {
        await api.post('/admin/notices', formData);
        showToast('success', 'Notice created successfully');
      }
      setShowNoticeForm(false);
      resetForm();
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save notice');
    }
  };

  const handleDeleteNotice = async (noticeId) => {
    if (!confirm('Delete this notice?')) return;
    try {
      await api.delete(`/admin/notices/${noticeId}`);
      showToast('success', 'Notice deleted');
      fetchData();
    } catch (err) {
      showToast('error', 'Failed to delete notice');
    }
  };

  const handleTogglePin = async (notice) => {
    try {
      await api.patch(`/admin/notices/${notice.id}`, { isPinned: !notice.isPinned });
      fetchData();
    } catch (err) {
      showToast('error', 'Failed to update notice');
    }
  };

  const handleToggleActive = async (notice) => {
    try {
      await api.patch(`/admin/notices/${notice.id}`, { isActive: !notice.isActive });
      fetchData();
    } catch (err) {
      showToast('error', 'Failed to update notice');
    }
  };

  const handleEditNotice = (notice) => {
    setEditingNotice(notice);
    setFormData({
      title: notice.title,
      content: notice.content,
      type: notice.type,
      priority: notice.priority,
      targetType: notice.targetType,
      targetClients: notice.targetClients?.map(c => c.id) || [],
      responseRequired: notice.responseRequired,
      responseType: notice.responseType,
      isActive: notice.isActive,
      isPinned: notice.isPinned,
      imageUrl: notice.imageUrl || '',
      linkUrl: notice.linkUrl || '',
      linkText: notice.linkText || '',
      expiresAt: notice.expiresAt ? notice.expiresAt.split('T')[0] : '',
    });
    setShowNoticeForm(true);
  };

  const viewNoticeDetails = async (noticeId) => {
    try {
      const res = await api.get(`/admin/notices/${noticeId}`);
      setSelectedNotice(res.data.notice);
    } catch (err) {
      showToast('error', 'Failed to load notice details');
    }
  };

  const priorityColors = { LOW: '#6c757d', NORMAL: '#28a745', HIGH: '#fd7e14', URGENT: '#dc3545' };

  // Filter notices by type
  const updates = notices.filter(n => n.type === 'UPDATE');
  const requirements = notices.filter(n => n.type === 'REQUIREMENT');
  const promotions = notices.filter(n => n.type === 'PROMOTION');
  const featuredPlans = plans.filter(p => p.isFeatured).slice(0, 4);

  // Urgent Work - Tasks due Today/Tomorrow
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const urgentTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
    const due = new Date(t.dueDate);
    return due >= today && due < dayAfter;
  }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5);

  const getTaskPriorityColor = (priority) => {
    const colors = { LOW: '#94a3b8', NORMAL: '#22c55e', HIGH: '#f59e0b', URGENT: '#ef4444' };
    return colors[priority] || '#94a3b8';
  };

  const formatDueDate = (date) => {
    const d = new Date(date);
    const isToday = d.toDateString() === today.toDateString();
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    if (isToday) return 'Today';
    if (isTomorrow) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
          <div style={{ height: '160px', backgroundColor: '#e2e8f0', borderRadius: '24px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: '180px', backgroundColor: '#e2e8f0', borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', padding: '14px 28px', borderRadius: '16px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
        
        {/* Admin Header - Matches Client Design */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Admin Office</h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => navigate('/office-cms')}
              style={{ padding: '12px 20px', background: '#fff', color: '#6366f1', borderRadius: '12px', border: '2px solid #6366f1', fontWeight: '700', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span style={{ fontSize: '16px' }}>⚙️</span> Edit Client Office
            </button>
            <button
              onClick={() => { resetForm(); setShowNoticeForm(true); }}
              style={{ padding: '12px 20px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span style={{ fontSize: '18px' }}>+</span> New Notice
            </button>
          </div>
        </div>

        {/* QUICK ACCESS CARDS - Premium Design */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {/* Total Clients - Clickable → User Manager */}
          <div
            onClick={() => navigate('/profile', { state: { activeTab: 'users' } })}
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '20px', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 20px rgba(99,102,241,0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(99,102,241,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.25)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <p style={{ fontSize: '32px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>{dashboardData?.totalClients || clients.length || 0}</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>Total Clients</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>Click to manage →</p>
          </div>

          {/* Plans - Clickable */}
          <div
            onClick={() => navigate('/plans')}
            style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', borderRadius: '20px', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 20px rgba(34,197,94,0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(34,197,94,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(34,197,94,0.25)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              </div>
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <p style={{ fontSize: '32px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>{plans.length || 0}</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>Total Plans</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>Manage catalog →</p>
          </div>

          {/* Wallet Actions */}
          <div
            onClick={() => navigate('/wallet')}
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: '20px', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 20px rgba(245,158,11,0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(245,158,11,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(245,158,11,0.25)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
              </div>
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <p style={{ fontSize: '32px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>{dashboardData?.pendingRecharges || 0}</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>Pending Requests</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>Review wallet →</p>
          </div>

          {/* Notices */}
          <div
            onClick={() => setActiveSection('updates')}
            style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '20px', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 4px 20px rgba(139,92,246,0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(139,92,246,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(139,92,246,0.25)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              </div>
              <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <p style={{ fontSize: '32px', fontWeight: '800', color: '#fff', margin: '0 0 4px 0' }}>{notices.length || 0}</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>Total Notices</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0 0' }}>Manage below ↓</p>
          </div>
        </div>

        {/* ADDITIONAL STATS ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {/* Pending Approvals */}
          <div
            onClick={() => navigate('/tasks')}
            style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px' }}>⏳</span>
              </div>
            </div>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>{dashboardData?.pendingApprovals || 0}</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Pending Approvals</p>
          </div>

          {/* Active Tasks */}
          <div
            onClick={() => navigate('/tasks')}
            style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px' }}>📋</span>
              </div>
            </div>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>{dashboardData?.activeTasks || 0}</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Active Tasks</p>
          </div>

          {/* Client Responses */}
          <div
            onClick={() => setActiveSection('requirements')}
            style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px' }}>💬</span>
              </div>
            </div>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>{dashboardData?.unreadResponses || 0}</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Client Responses</p>
          </div>

          {/* Total Credits */}
          <div
            onClick={() => navigate('/wallet')}
            style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#fce7f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '16px' }}>💎</span>
              </div>
            </div>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 2px 0' }}>₹{dashboardData?.totalCredits || 0}</p>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Total Credits</p>
          </div>
        </div>

        {/* URGENT WORK PANEL */}
        {urgentTasks.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="8"/><path d="M9 5v4l2 2"/></svg>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Urgent Work</h3>
              <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{urgentTasks.length} due soon</span>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #fecaca', overflow: 'hidden', boxShadow: '0 4px 16px rgba(239,68,68,0.1)' }}>
              {urgentTasks.map((task, idx) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                  style={{ padding: '16px 20px', borderBottom: idx < urgentTasks.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: getTaskPriorityColor(task.priority), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0' }}>{task.client?.identifier || 'Client'}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: formatDueDate(task.dueDate) === 'Today' ? '#ef4444' : '#f59e0b', backgroundColor: formatDueDate(task.dueDate) === 'Today' ? '#fef2f2' : '#fffbeb', padding: '4px 10px', borderRadius: '8px' }}>
                      {formatDueDate(task.dueDate)}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: '600', color: getTaskPriorityColor(task.priority), backgroundColor: `${getTaskPriorityColor(task.priority)}15`, padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BANNER PREVIEW - Matches Client Layout */}
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <div style={{ position: 'absolute', top: '-10px', left: '16px', zIndex: 10, backgroundColor: '#6366f1', color: '#fff', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>
            BANNER PREVIEW
          </div>
          <div style={{ 
            background: banners[currentBanner].gradient,
            borderRadius: '24px', padding: '32px 24px', minHeight: '140px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            transition: 'background 0.5s ease', overflow: 'hidden', position: 'relative'
          }}>
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', margin: '0 0 8px', position: 'relative', zIndex: 1 }}>
              {banners[currentBanner].title}
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', margin: '0 0 16px', position: 'relative', zIndex: 1 }}>
              {banners[currentBanner].subtitle}
            </p>
            <button style={{ alignSelf: 'flex-start', padding: '12px 24px', backgroundColor: '#fff', color: '#0f172a', fontSize: '14px', fontWeight: '700', borderRadius: '12px', border: 'none', position: 'relative', zIndex: 1 }}>
              Explore Now
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
            {banners.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentBanner(idx)} style={{ width: idx === currentBanner ? '24px' : '8px', height: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: idx === currentBanner ? '#6366f1' : '#e2e8f0', transition: 'all 0.3s ease' }} />
            ))}
          </div>
        </div>

        {/* FEATURED PLANS PREVIEW */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⭐</span>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Featured Plans</h3>
              <span style={{ backgroundColor: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>PREVIEW</span>
            </div>
            <span style={{ fontSize: '14px', color: '#6366f1', fontWeight: '600' }}>See All →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            {(featuredPlans.length > 0 ? featuredPlans : [{title: 'Sample Plan 1', creditCost: 99}, {title: 'Sample Plan 2', creditCost: 149}]).slice(0, 4).map((plan, idx) => (
              <div key={plan.id || idx} style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ height: '100px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {plan.featureImage ? <img src={plan.featureImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '32px', opacity: 0.3 }}>📦</span>}
                </div>
                <div style={{ padding: '12px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 6px 0' }}>{plan.title}</p>
                  <p style={{ fontSize: '16px', fontWeight: '800', color: '#22c55e', margin: 0 }}>₹{plan.creditCost || plan.offerPrice || 0}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SEE MORE BUTTON PREVIEW */}
        <div style={{ marginBottom: '28px', position: 'relative' }}>
          <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', zIndex: 1 }}>PREVIEW</span>
          <button style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '16px', fontWeight: '700', borderRadius: '16px', border: 'none', boxShadow: '0 6px 20px rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            See More
          </button>
        </div>

        {/* SECTION TABS */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'updates', label: 'Updates', icon: '🔄', count: updates.length },
            { id: 'requirements', label: 'Requirements', icon: '📋', count: requirements.length },
            { id: 'promotions', label: 'Promotions', icon: '🎁', count: promotions.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
                borderRadius: '12px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                backgroundColor: activeSection === tab.id ? '#6366f1' : '#fff',
                color: activeSection === tab.id ? '#fff' : '#64748b',
                fontWeight: '600', fontSize: '14px',
                boxShadow: activeSection === tab.id ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
              <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', backgroundColor: activeSection === tab.id ? 'rgba(255,255,255,0.2)' : '#f1f5f9' }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* UPDATES MANAGER */}
        {activeSection === 'updates' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔄</span>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Updates Manager</h3>
              </div>
              <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'UPDATE'})); setShowNoticeForm(true); }} style={{ padding: '8px 16px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                + Add Update
              </button>
            </div>
            {updates.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>No updates created yet</p>
                <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'UPDATE'})); setShowNoticeForm(true); }} style={{ padding: '10px 20px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Create First Update
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {updates.map(notice => (
                  <div key={notice.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #3b82f6', border: '1px solid #f1f5f9', opacity: notice.isActive ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      {notice.imageUrl ? (
                        <img src={notice.imageUrl} alt="" style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '60px', height: '60px', borderRadius: '12px', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '24px' }}>🔄</span>
                        </div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{notice.title}</span>
                          {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌 Pinned</span>}
                          <span style={{ fontSize: '11px', backgroundColor: notice.targetType === 'ALL' ? '#dcfce7' : '#e0e7ff', color: notice.targetType === 'ALL' ? '#15803d' : '#4338ca', padding: '2px 8px', borderRadius: '6px' }}>
                            {notice.targetType === 'ALL' ? '👥 All' : `🎯 ${notice.targetClients?.length || 0}`}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#94a3b8' }}>
                          <span>📊 {notice.responsesCount || 0} responses</span>
                          <span>👁 {notice.viewCount || 0} views</span>
                          <span>{new Date(notice.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => viewNoticeDetails(notice.id)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="View">👁</button>
                        <button onClick={() => handleTogglePin(notice)} style={{ padding: '8px', backgroundColor: notice.isPinned ? '#fef3c7' : '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Pin">📌</button>
                        <button onClick={() => handleEditNotice(notice)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Edit">✏️</button>
                        <button onClick={() => handleToggleActive(notice)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title={notice.isActive ? 'Deactivate' : 'Activate'}>{notice.isActive ? '🟢' : '🔴'}</button>
                        <button onClick={() => handleDeleteNotice(notice.id)} style={{ padding: '8px', backgroundColor: '#fef2f2', borderRadius: '8px', border: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* REQUIREMENTS MANAGER */}
        {activeSection === 'requirements' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Requirements Manager</h3>
              </div>
              <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'REQUIREMENT', responseRequired: true})); setShowNoticeForm(true); }} style={{ padding: '8px 16px', backgroundColor: '#ffedd5', color: '#c2410c', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                + Add Requirement
              </button>
            </div>
            {requirements.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>No requirements created yet</p>
                <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'REQUIREMENT', responseRequired: true})); setShowNoticeForm(true); }} style={{ padding: '10px 20px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Create First Requirement
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {requirements.map(notice => (
                  <div key={notice.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `4px solid ${priorityColors[notice.priority] || '#28a745'}`, border: '1px solid #f1f5f9', opacity: notice.isActive ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: notice.responseRequired ? '#fee2e2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '22px' }}>📋</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#0f172a' }}>{notice.title}</span>
                          {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌</span>}
                          {notice.responseRequired && <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px' }}>Action Required</span>}
                          <span style={{ fontSize: '11px', backgroundColor: `${priorityColors[notice.priority]}20`, color: priorityColors[notice.priority], padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>{notice.priority}</span>
                          <span style={{ fontSize: '11px', backgroundColor: notice.targetType === 'ALL' ? '#dcfce7' : '#e0e7ff', color: notice.targetType === 'ALL' ? '#15803d' : '#4338ca', padding: '2px 8px', borderRadius: '6px' }}>
                            {notice.targetType === 'ALL' ? '👥 All' : `🎯 ${notice.targetClients?.length || 0}`}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#94a3b8' }}>
                          <span>📊 {notice.responsesCount || 0} responses</span>
                          <span>👁 {notice.viewCount || 0} views</span>
                          <span>{new Date(notice.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => viewNoticeDetails(notice.id)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="View">👁</button>
                        <button onClick={() => handleTogglePin(notice)} style={{ padding: '8px', backgroundColor: notice.isPinned ? '#fef3c7' : '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Pin">📌</button>
                        <button onClick={() => handleEditNotice(notice)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Edit">✏️</button>
                        <button onClick={() => handleToggleActive(notice)} style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title={notice.isActive ? 'Deactivate' : 'Activate'}>{notice.isActive ? '🟢' : '🔴'}</button>
                        <button onClick={() => handleDeleteNotice(notice.id)} style={{ padding: '8px', backgroundColor: '#fef2f2', borderRadius: '8px', border: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PROMOTIONS MANAGER */}
        {activeSection === 'promotions' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🎁</span>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Promotions Manager</h3>
              </div>
              <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'PROMOTION'})); setShowNoticeForm(true); }} style={{ padding: '8px 16px', backgroundColor: '#f3e8ff', color: '#7c3aed', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                + Add Promotion
              </button>
            </div>
            {promotions.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎁</div>
                <p style={{ color: '#64748b', margin: '0 0 16px 0' }}>No promotions created yet</p>
                <button onClick={() => { resetForm(); setFormData(f => ({...f, type: 'PROMOTION'})); setShowNoticeForm(true); }} style={{ padding: '10px 20px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '10px', border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Create First Promotion
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {promotions.map(notice => (
                  <div key={notice.id} style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #fdf2f8 100%)', borderRadius: '16px', padding: '16px', border: '1px solid #e9d5ff', opacity: notice.isActive ? 1 : 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '22px' }}>🎁</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '700', color: '#7c3aed' }}>{notice.title}</span>
                          {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌</span>}
                          <span style={{ fontSize: '11px', backgroundColor: notice.targetType === 'ALL' ? '#dcfce7' : '#e0e7ff', color: notice.targetType === 'ALL' ? '#15803d' : '#4338ca', padding: '2px 8px', borderRadius: '6px' }}>
                            {notice.targetType === 'ALL' ? '👥 All' : `🎯 ${notice.targetClients?.length || 0}`}
                          </span>
                        </div>
                        <p style={{ fontSize: '14px', color: '#6b21a8', margin: '0 0 8px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#a78bfa' }}>
                          <span>👁 {notice.viewCount || 0} views</span>
                          <span>{new Date(notice.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => viewNoticeDetails(notice.id)} style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="View">👁</button>
                        <button onClick={() => handleTogglePin(notice)} style={{ padding: '8px', backgroundColor: notice.isPinned ? '#fef3c7' : 'rgba(255,255,255,0.8)', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Pin">📌</button>
                        <button onClick={() => handleEditNotice(notice)} style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title="Edit">✏️</button>
                        <button onClick={() => handleToggleActive(notice)} style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '8px', border: 'none', cursor: 'pointer' }} title={notice.isActive ? 'Deactivate' : 'Activate'}>{notice.isActive ? '🟢' : '🔴'}</button>
                        <button onClick={() => handleDeleteNotice(notice.id)} style={{ padding: '8px', backgroundColor: '#fef2f2', borderRadius: '8px', border: 'none', cursor: 'pointer', color: '#dc2626' }} title="Delete">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notice Form Modal */}
      {showNoticeForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{editingNotice ? 'Edit Notice' : 'Create Notice'}</h3>
              <button onClick={() => { setShowNoticeForm(false); resetForm(); }} style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px', maxHeight: 'calc(90vh - 160px)', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="UPDATE">🔄 Update</option>
                    <option value="REQUIREMENT">📋 Requirement</option>
                    <option value="PROMOTION">🎁 Promotion</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Priority</label>
                  <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Enter title..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Content *</label>
                <textarea value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} placeholder="Enter content..." rows={4} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', resize: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Target Audience</label>
                  <select value={formData.targetType} onChange={e => setFormData({...formData, targetType: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="ALL">👥 All Clients</option>
                    <option value="SELECTED">🎯 Selected Clients</option>
                  </select>
                </div>
                {formData.targetType === 'SELECTED' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Select Clients</label>
                    <select multiple value={formData.targetClients} onChange={e => setFormData({...formData, targetClients: Array.from(e.target.selectedOptions, o => o.value)})} style={{ width: '100%', padding: '8px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '13px', height: '80px' }}>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.identifier}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="responseRequired" checked={formData.responseRequired} onChange={e => setFormData({...formData, responseRequired: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                  <label htmlFor="responseRequired" style={{ fontSize: '13px', color: '#374151' }}>Response Required</label>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Response Type</label>
                  <select value={formData.responseType} onChange={e => setFormData({...formData, responseType: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="NONE">No Response</option>
                    <option value="YES_NO">Yes/No</option>
                    <option value="RATING">Rating (1-5)</option>
                    <option value="TEXT">Text Input</option>
                    <option value="FILE">File Upload</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Image URL</label>
                  <input type="url" value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="https://..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Expires At</label>
                  <input type="date" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '13px', color: '#374151' }}>Active</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isPinned} onChange={e => setFormData({...formData, isPinned: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '13px', color: '#374151' }}>📌 Pin to Top</span>
                </label>
              </div>
            </div>
            <div style={{ padding: '20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => { setShowNoticeForm(false); resetForm(); }} style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateNotice} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>{editingNotice ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Notice Detail Modal */}
      {selectedNotice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Notice Details</h3>
              <button onClick={() => setSelectedNotice(null)} style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px', maxHeight: 'calc(90vh - 100px)', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>{selectedNotice.title}</h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{selectedNotice.type}</span>
                <span style={{ fontSize: '12px', backgroundColor: `${priorityColors[selectedNotice.priority]}20`, color: priorityColors[selectedNotice.priority], padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>{selectedNotice.priority}</span>
                <span style={{ fontSize: '12px', backgroundColor: selectedNotice.targetType === 'ALL' ? '#dcfce7' : '#e0e7ff', color: selectedNotice.targetType === 'ALL' ? '#15803d' : '#4338ca', padding: '4px 10px', borderRadius: '8px', fontWeight: '600' }}>
                  {selectedNotice.targetType === 'ALL' ? 'All Clients' : `${selectedNotice.targetClients?.length || 0} Selected`}
                </span>
              </div>
              <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.7, margin: '0 0 20px 0', whiteSpace: 'pre-wrap' }}>{selectedNotice.content}</p>
              {selectedNotice.imageUrl && <img src={selectedNotice.imageUrl} alt="" style={{ width: '100%', borderRadius: '12px', marginBottom: '20px' }} />}
              
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: '800', color: '#6366f1', margin: 0 }}>{selectedNotice.viewCount || 0}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Views</p>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: '800', color: '#22c55e', margin: 0 }}>{selectedNotice.responses?.length || 0}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Responses</p>
                </div>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '24px', fontWeight: '800', color: '#f59e0b', margin: 0 }}>{selectedNotice.viewedBy || 0}</p>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>Unique Views</p>
                </div>
              </div>

              {/* Responses */}
              {selectedNotice.responses?.length > 0 && (
                <div>
                  <h5 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' }}>📊 Responses ({selectedNotice.responses.length})</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedNotice.responses.map((r, idx) => (
                      <div key={idx} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{r.clientIdentifier || 'Client'}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(r.respondedAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#374151' }}>
                          {r.responseType === 'YES' && <span style={{ color: '#22c55e' }}>✅ Yes</span>}
                          {r.responseType === 'NO' && <span style={{ color: '#ef4444' }}>❌ No</span>}
                          {r.responseType === 'RATING' && <span>⭐ {r.value}/5</span>}
                          {r.responseType === 'TEXT' && <span>{r.value}</span>}
                          {r.responseType === 'FILE' && <a href={r.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>📎 View File</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

export default Dashboard;
