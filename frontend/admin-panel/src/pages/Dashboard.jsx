import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';
import { initPushNotifications, setupForegroundHandler } from '../services/pushService';
import { useAuth } from '../App';

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [notices, setNotices] = useState([]);
  const [pendingClients, setPendingClients] = useState([]);
  const [toast, setToast] = useState(null);
  const [activeSection, setActiveSection] = useState('updates');
  const [currentBanner, setCurrentBanner] = useState(0);
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [formData, setFormData] = useState({
    title: '', content: '', type: 'UPDATE', priority: 'NORMAL',
    targetType: 'ALL', targetClients: [], responseRequired: false,
    responseType: 'NONE', isActive: true, isPinned: false,
    imageUrl: '', linkUrl: '', linkText: '', expiresAt: '',
  });

  // Date filter
  const [dateFilter, setDateFilter] = useState({ type: 'month', label: 'This Month', startDate: '', endDate: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApproveClient = async (clientId) => {
    try {
      await api.post(`/admin/pending-clients/${clientId}/approve`);
      showToast('success', 'Client approved successfully');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to approve client');
    }
  };

  const handleRejectClient = async (clientId) => {
    if (!confirm('Reject this registration? The account will be disabled.')) return;
    try {
      await api.post(`/admin/pending-clients/${clientId}/reject`);
      showToast('success', 'Client registration rejected');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to reject client');
    }
  };

  const buildFilterParams = () => {
    const p = {};
    if (dateFilter.startDate) p.startDate = dateFilter.startDate;
    if (dateFilter.endDate) p.endDate = dateFilter.endDate;
    return p;
  };

  const applyDateFilter = (type) => {
    const now = new Date();
    let startDate = '', endDate = '', label = '';
    if (type === 'today') {
      startDate = now.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
      label = 'Today';
    } else if (type === '7days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
      label = 'Last 7 Days';
    } else if (type === '15days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 14);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
      label = 'Last 15 Days';
    } else if (type === '30days') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
      label = 'Last 30 Days';
    } else if (type === 'month') {
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
      label = 'This Month';
    } else if (type.startsWith('month-')) {
      // month-0 = January, month-11 = December
      const monthIdx = parseInt(type.split('-')[1]);
      const year = now.getUTCFullYear();
      const firstDay = new Date(Date.UTC(year, monthIdx, 1));
      const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0));
      startDate = firstDay.toISOString().split('T')[0];
      endDate = lastDay.toISOString().split('T')[0];
      label = firstDay.toLocaleString('en-US', { month: 'long' });
    }
    setDateFilter({ type, label, startDate, endDate });
    setShowDatePicker(false);
  };

  const applyCustomFilter = () => {
    if (customStart && customEnd) {
      setDateFilter({ type: 'custom', label: `${customStart} → ${customEnd}`, startDate: customStart, endDate: customEnd });
      setShowDatePicker(false);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const params = buildFilterParams();
      const [analyticsRes, noticesRes, pendingRes] = await Promise.all([
        api.get('/admin/analytics', { params }).catch(() => ({ data: null })),
        api.get('/admin/notices').catch(() => ({ data: { notices: [] } })),
        api.get('/admin/pending-clients').catch(() => ({ data: { clients: [] } })),
      ]);
      if (analyticsRes.data) setAnalytics(analyticsRes.data);
      setNotices(noticesRes.data.notices || []);
      setPendingClients(pendingRes.data?.clients || []);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Set default date filter to current month on mount
  useEffect(() => {
    const now = new Date();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];
    setDateFilter({ type: 'month', label: 'This Month', startDate, endDate });
    try { initPushNotifications(); setupForegroundHandler(); } catch(e) {}
  }, []);

  // Auto-rotate banners
  useEffect(() => {
    if (notices.length > 1) {
      const interval = setInterval(() => {
        setCurrentBanner(prev => (prev + 1) % Math.min(notices.length, 3));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [notices.length]);

  const formatCurrency = (val) => {
    if (!val || val === 0) return '₹0';
    return '₹' + val.toLocaleString('en-IN');
  };

  const formatNumber = (val) => {
    if (!val) return '0';
    return val.toLocaleString('en-IN');
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const metricCards = [
    // Row 1: Task Metrics
    { id: 'totalTasks', label: 'Total Tasks', value: analytics?.metrics?.totalTasks, format: 'number', icon: '📋', color: '#6366f1', bgColor: '#eef2ff' },
    { id: 'pendingTasks', label: 'Pending Tasks', value: analytics?.metrics?.pendingTasks, format: 'number', icon: '⏳', color: '#f59e0b', bgColor: '#fef3c7' },
    { id: 'inProgressTasks', label: 'In Progress Tasks', value: analytics?.metrics?.inProgressTasks, format: 'number', icon: '🔄', color: '#3b82f6', bgColor: '#dbeafe' },
    { id: 'completedTasks', label: 'Completed Tasks', value: analytics?.metrics?.completedTasks, format: 'number', icon: '✅', color: '#22c55e', bgColor: '#dcfce7' },
    // Row 2: Financial Metrics
    { id: 'amountReceived', label: 'Amount Received', value: analytics?.metrics?.amountReceived, format: 'currency', icon: '💰', color: '#22c55e', bgColor: '#dcfce7' },
    { id: 'creditSend', label: 'Credit Send', value: analytics?.metrics?.creditSend, format: 'currency', icon: '💳', color: '#8b5cf6', bgColor: '#ede9fe' },
    { id: 'commissionGenerate', label: 'Commission Generate', value: analytics?.metrics?.commissionGenerate, format: 'currency', icon: '🏆', color: '#ec4899', bgColor: '#fce7f3' },
    { id: 'expenses', label: 'Expenses / Tax / Other', value: (analytics?.metrics?.expenses || 0) + (analytics?.metrics?.tax || 0) + (analytics?.metrics?.other || 0), format: 'currency', icon: '📊', color: '#ef4444', bgColor: '#fee2e2' },
    // Row 3: Operational Metrics
    { id: 'activeClients', label: 'Active Clients', value: analytics?.metrics?.activeClients, format: 'number', icon: '👥', color: '#6366f1', bgColor: '#eef2ff', suffix: ' (Now)' },
    { id: 'upcomingRenewal', label: 'Upcoming Renewal', value: analytics?.metrics?.upcomingRenewal, format: 'number', icon: '📅', color: '#f59e0b', bgColor: '#fef3c7', suffix: ' (30 Days)' },
    { id: 'pendingOrders', label: 'Pending Orders', value: analytics?.metrics?.pendingOrders, format: 'number', icon: '🛒', color: '#3b82f6', bgColor: '#dbeafe' },
    { id: 'activeChats', label: 'Active Chats', value: analytics?.metrics?.activeChats, format: 'number', icon: '💬', color: '#06b6d4', bgColor: '#cffafe' },
  ];

  if (loading && !analytics) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ color: '#64748b', fontSize: '14px' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @media (max-width: 768px) { .metric-card { padding: 12px !important; } .metric-value { font-size: 20px !important; } .metric-label { font-size: 11px !important; } .metric-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; } .filter-dropdown { right: 8px !important; width: 240px !important; } .filter-btn { padding: 6px 12px !important; font-size: 12px !important; } }`}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {/* Date Filter Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: '700', color: '#1e293b', margin: 0 }}>Dashboard</h1>
          <div style={{ position: 'relative' }}>
            <button className="filter-btn" onClick={() => setShowDatePicker(!showDatePicker)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', color: '#475569', transition: 'all 0.2s' }}>
              <span>📅</span>
              <span>{dateFilter.label}</span>
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>
            {showDatePicker && (
              <div className="filter-dropdown" style={{ position: 'absolute', right: '0', top: 'calc(100% + 4px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', zIndex: 100, width: '280px', maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
                {/* Quick ranges */}
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Ranges</div>
                {[
                  { type: 'today', label: 'Today' },
                  { type: '7days', label: 'Last 7 Days' },
                  { type: '15days', label: 'Last 15 Days' },
                  { type: '30days', label: 'Last 30 Days' },
                  { type: 'month', label: 'This Month' },
                ].map(opt => (
                  <div key={opt.type} onClick={() => applyDateFilter(opt.type)}
                    style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: dateFilter.type === opt.type ? '#6366f1' : '#334155', fontWeight: dateFilter.type === opt.type ? 600 : 400, background: dateFilter.type === opt.type ? '#eef2ff' : 'transparent', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.target.style.background = dateFilter.type === opt.type ? '#eef2ff' : '#f8fafc'}
                    onMouseLeave={e => e.target.style.background = dateFilter.type === opt.type ? '#eef2ff' : 'transparent'}>
                    {opt.label}
                  </div>
                ))}
                {/* Months */}
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Months</div>
                {monthNames.map((m, idx) => (
                  <div key={idx} onClick={() => applyDateFilter(`month-${idx}`)}
                    style={{ padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: dateFilter.type === `month-${idx}` ? '#6366f1' : '#334155', fontWeight: dateFilter.type === `month-${idx}` ? 600 : 400, background: dateFilter.type === `month-${idx}` ? '#eef2ff' : 'transparent', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.target.style.background = dateFilter.type === `month-${idx}` ? '#eef2ff' : '#f8fafc'}
                    onMouseLeave={e => e.target.style.background = dateFilter.type === `month-${idx}` ? '#eef2ff' : 'transparent'}>
                    {m}
                  </div>
                ))}
                {/* Custom range */}
                <div style={{ padding: '4px 8px', fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Custom Range</div>
                <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ flex: 1, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <button onClick={applyCustomFilter} disabled={!customStart || !customEnd}
                    style={{ padding: '6px 12px', background: customStart && customEnd ? '#6366f1' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: customStart && customEnd ? 'pointer' : 'not-allowed' }}>
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 12 Metric Cards — 3 Rows */}
        {[0, 1, 2].map(rowIdx => (
          <div key={rowIdx} className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
            {metricCards.slice(rowIdx * 4, rowIdx * 4 + 4).map(card => {
              const displayValue = card.format === 'currency' ? formatCurrency(card.value) : formatNumber(card.value);
              return (
                <div key={card.id} className="metric-card"
                  style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'all 0.2s', position: 'relative', overflow: 'hidden' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: card.bgColor, opacity: 0.5 }} />
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: card.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                        {card.icon}
                      </div>
                      <span className="metric-label" style={{ fontSize: '13px', fontWeight: '500', color: '#64748b', lineHeight: 1.2 }}>
                        {card.label}{card.suffix && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{card.suffix}</span>}
                      </span>
                    </div>
                    <div className="metric-value" style={{ fontSize: '28px', fontWeight: '700', color: card.color, lineHeight: 1.2 }}>
                      {displayValue}
                    </div>
                    {/* Sub-breakdown for Expenses/Tax/Other */}
                    {card.id === 'expenses' && analytics?.metrics && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '11px', color: '#94a3b8' }}>
                        <span>Exp: {formatCurrency(analytics.metrics.expenses)}</span>
                        <span>Tax: {formatCurrency(analytics.metrics.tax)}</span>
                        <span>Other: {formatCurrency(analytics.metrics.other)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Active Clients / Upcoming Renewal note */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap' }}>
          <span>* Active Clients and Upcoming Renewal are current-state metrics (not affected by date filter).</span>
        </div>

        {/* Pending Client Registrations */}
        {pendingClients.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Pending Client Registrations ({pendingClients.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingClients.slice(0, 5).map(client => (
                <div key={client._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#334155' }}>{client.identifier}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: '8px' }}>{new Date(client.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleApproveClient(client._id)} style={{ padding: '4px 12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => handleRejectClient(client._id)} style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notices */}
        {notices.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>Recent Updates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {notices.slice(0, 5).map(notice => (
                <div key={notice._id} onClick={() => setSelectedNotice(notice)} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.target.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.target.style.background = '#f8fafc'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#334155' }}>{notice.title}</span>
                    {notice.isPinned && <span style={{ fontSize: '10px', padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: '4px' }}>Pinned</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{new Date(notice.createdAt).toLocaleDateString()} · {notice.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px', background: toast.type === 'success' ? '#22c55e' : '#ef4444', color: '#fff', borderRadius: '10px', fontSize: '14px', fontWeight: '500', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000 }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
