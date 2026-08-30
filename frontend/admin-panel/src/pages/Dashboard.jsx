import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';
import { initPushNotifications, setupForegroundHandler } from '../services/pushService';
import { useAuth } from '../App';

const Dashboard = () => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [notices, setNotices] = useState([]);
  const [clients, setClients] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commissionData, setCommissionData] = useState({ overallTotal: 0, overallTaskCount: 0, logs: [], userSummary: [], isMainAdmin: false });
  const [analytics, setAnalytics] = useState(null);
  const [officeConfig, setOfficeConfig] = useState(null);
  // Date filter
  const [dateFilter, setDateFilter] = useState(() => {
    const now = new Date();
    const monthIdx = now.getMonth();
    const startDate = new Date(Date.UTC(now.getUTCFullYear(), monthIdx, 1)).toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return { type: `month-${monthIdx}`, label: monthNames[monthIdx], startDate, endDate };
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  // Client filter (WHO) — '' means All Clients; otherwise the selected client's User ObjectId
  const [clientFilter, setClientFilter] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientDropdownRef = useRef(null);
  // Analytics-only loading flag so switching client/date never shows stale numbers
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Drill-down modal state
  const [drillModal, setDrillModal] = useState(null); // { type: 'commission'|'tasks'|'revenue', title, items }
  const [drillLoading, setDrillLoading] = useState(false);
  // Client workflow timeline (date-wise ORDER -> START -> END) — client-scoped only
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(false);
  const [timelineDate, setTimelineDate] = useState(null); // selected day key (YYYY-MM-DD, UTC)
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeSection, setActiveSection] = useState('updates');
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

  const [rejectingOrderId, setRejectingOrderId] = useState(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  // Pending client registrations
  const [pendingClients, setPendingClients] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const handleRejectOrder = async (orderId) => {
    if (!confirm('Are you sure you want to reject this order? The client will be refunded.')) return;
    
    setRejectLoading(true);
    try {
      await api.post(`/admin/tasks/${orderId}/reject`, { reason: 'Rejected by admin from dashboard' });
      showToast('success', 'Order rejected and wallet refunded');
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to reject order');
    } finally {
      setRejectLoading(false);
      setRejectingOrderId(null);
    }
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
    if (type === 'alltime') {
      // All Time: no date restriction
      label = 'All Time';
    } else if (type === 'today') {
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
    } else if (type.startsWith('month-')) {
      const monthIdx = parseInt(type.split('-')[1]);
      const year = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth();
      const firstDay = new Date(Date.UTC(year, monthIdx, 1));
      const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0));
      startDate = firstDay.toISOString().split('T')[0];
      // If selected month is current month, end date is today; otherwise last day of month
      endDate = monthIdx === currentMonth ? now.toISOString().split('T')[0] : lastDay.toISOString().split('T')[0];
      label = firstDay.toLocaleString('en-US', { month: 'long' });
    }
    setDateFilter({ type, label, startDate, endDate });
  };

  const applyCustomFilter = () => {
    if (customStart && customEnd) {
      setDateFilter({ type: 'custom', label: `${customStart} → ${customEnd}`, startDate: customStart, endDate: customEnd });
      setShowDatePicker(false);
    }
  };

  // Date dropdown options — the same set as before (All Time / Today / 7d / 15d / 30d / Month / Custom)
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateOptions = [
    { value: 'alltime', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: '7days', label: '7 Days' },
    { value: '15days', label: '15 Days' },
    { value: '30days', label: '30 Days' },
    ...MONTH_NAMES.map((m, i) => ({ value: `month-${i}`, label: m })),
    { value: 'custom', label: 'Custom…' },
  ];

  const handleDateDropdownChange = (value) => {
    if (value === 'custom') {
      setShowDatePicker(prev => !prev);
      return;
    }
    setShowDatePicker(false);
    applyDateFilter(value);
  };

  const selectedClient = clientFilter ? clients.find(c => c.id === clientFilter) : null;
  const filteredClients = clients.filter(c => (c.identifier || '').toLowerCase().includes(clientSearch.toLowerCase()));

  // Close the client dropdown on outside click
  useEffect(() => {
    if (!clientDropdownOpen) return;
    const onDocClick = (e) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) setClientDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [clientDropdownOpen]);

  // Analytics fetch is scoped by BOTH filters (WHO + WHEN) against the same query logic.
  // analyticsReqRef guards against stale responses so Client A's numbers can never
  // render after Client B was selected.
  const analyticsReqRef = useRef(0);
  const loadAnalytics = useCallback(async () => {
    const reqId = ++analyticsReqRef.current;
    setAnalyticsLoading(true);
    try {
      const params = buildFilterParams();
      const res = clientFilter
        ? await api.get('/admin/analytics/client', { params: { ...params, clientId: clientFilter } })
        : await api.get('/admin/analytics', { params });
      if (reqId === analyticsReqRef.current) setAnalytics(res.data || null);
    } catch (err) {
      if (reqId === analyticsReqRef.current) setAnalytics(null);
    } finally {
      if (reqId === analyticsReqRef.current) setAnalyticsLoading(false);
    }
  }, [dateFilter, clientFilter]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Timeline fetch — applies the SAME client + date filters together. timelineReqRef
  // is the same sequence-protection pattern as analyticsReqRef: a slow response for
  // Client A can never overwrite the UI after Client B was selected.
  const timelineReqRef = useRef(0);
  const loadTimeline = useCallback(async () => {
    const reqId = ++timelineReqRef.current;
    // Timeline needs a concrete date range. All Time has no axis, so skip the
    // request entirely instead of firing an unnecessary API call.
    // All Clients = office-wide aggregate endpoint; specific client = scoped endpoint.
    if (!dateFilter.startDate || !dateFilter.endDate) {
      setTimeline(null);
      setTimelineDate(null);
      return;
    }
    setTimelineLoading(true);
    setTimelineError(false);
    try {
      const params = buildFilterParams();
      const res = clientFilter
        ? await api.get('/admin/analytics/client/timeline', { params: { ...params, clientId: clientFilter } })
        : await api.get('/admin/analytics/timeline', { params });
      if (reqId === timelineReqRef.current) {
        setTimeline(res.data || null);
        setTimelineDate(null);
      }
    } catch (err) {
      if (reqId === timelineReqRef.current) {
        setTimeline(null);
        setTimelineError(true);
      }
    } finally {
      if (reqId === timelineReqRef.current) setTimelineLoading(false);
    }
  }, [dateFilter, clientFilter]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const fetchData = useCallback(async () => {
    try {
      const params = buildFilterParams();
      // Analytics is fetched separately by loadAnalytics (client+date scoped); everything else
      // on this dashboard is office-wide admin data and keeps its existing endpoints.
      const [overviewRes, noticesRes, clientsRes, plansRes, tasksRes, commissionsRes, pendingRes, officeConfigRes] = await Promise.all([
        api.get('/admin/reports/overview'),
        api.get('/admin/notices'),
        api.get('/admin/clients'),
        api.get('/admin/plans').catch(() => ({ data: { plans: [] } })),
        api.get('/admin/tasks').catch(() => ({ data: { tasks: [] } })),
        api.get('/admin/commissions', { params }).catch(() => ({ data: { overallTotal: 0, overallTaskCount: 0, logs: [], userSummary: [], isMainAdmin: false } })),
        api.get('/admin/pending-clients').catch(() => ({ data: { clients: [] } })),
        api.get('/admin/office-config').catch(() => ({ data: { config: null } })),
      ]);
      setDashboardData(overviewRes.data);
      setNotices(noticesRes.data.notices || []);
      setClients(clientsRes.data.clients || []);
      setPlans(plansRes.data.plans || []);
      setTasks(tasksRes.data.tasks || []);
      setPendingClients(pendingRes.data?.clients || []);
      const cd = commissionsRes.data || {};
      setCommissionData({
        overallTotal: cd.overallTotal || 0,
        overallTaskCount: cd.overallTaskCount || 0,
        logs: (cd.logs || []).slice(0, 5),
        userSummary: cd.userSummary || [],
        isMainAdmin: cd.isMainAdmin || false,
      });
      setOfficeConfig(officeConfigRes.data?.config);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Drill-down fetch handlers
  const openDrillModal = async (type, title) => {
    setDrillModal({ type, title, items: [], loading: true });
    setDrillLoading(true);
    try {
      const params = buildFilterParams();
      if (clientFilter) {
        // Selected-client mode: drill-downs come from the same client-scoped query logic
        const res = await api.get('/admin/analytics/client/drill', { params: { ...params, clientId: clientFilter, type } });
        let items = [];
        if (type === 'commission') {
          items = (res.data?.logs || []).map(l => ({
            user: 'Staff',
            amount: l.amount || 0,
            task: l.taskTitle || 'N/A',
            date: l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
          }));
        } else if (type === 'tasks') {
          items = (res.data?.tasks || []).map(t => ({
            name: t.title || 'N/A',
            client: selectedClient?.identifier || 'N/A',
            cost: t.creditCost || 0,
            date: t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
          }));
        } else if (type === 'revenue') {
          items = [
            ...(res.data?.transactions || []).map(t => ({
              label: `Recharge ${t.type}`,
              amount: t.amount || 0,
              client: selectedClient?.identifier || '—',
              date: t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
            })),
            ...(res.data?.orders || []).map(o => ({
              label: `Order ${o.orderId || ''}`,
              amount: o.totalAmount || 0,
              client: selectedClient?.identifier || '—',
              date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
            }))
          ];
        }
        setDrillModal({ type, title, items, loading: false });
        return;
      }
      if (type === 'commission') {
        const res = await api.get('/admin/commissions', { params });
        const logs = (res.data?.logs || []).map(l => ({
          user: l.userIdentifier || 'Unknown',
          amount: l.amount || 0,
          task: l.taskTitle || 'N/A',
          date: l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
        }));
        setDrillModal({ type, title, items: logs, loading: false });
      } else if (type === 'tasks') {
        const res = await api.get('/admin/tasks', { params });
        const completed = (res.data?.tasks || []).filter(t => t.status === 'COMPLETED').map(t => ({
          name: t.title || 'N/A',
          client: t.clientName || t.assignedTo || 'N/A',
          cost: t.creditCost || 0,
          date: t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
        }));
        setDrillModal({ type, title, items: completed, loading: false });
      } else if (type === 'revenue') {
        const [wtRes, ordRes] = await Promise.all([
          api.get('/admin/wallet-transactions', { params }).catch(() => ({ data: { transactions: [] } })),
          api.get('/admin/orders', { params }).catch(() => ({ data: { orders: [] } }))
        ]);
        const items = [
          ...(wtRes.data?.transactions || []).filter(t => ['RECHARGE_APPROVED', 'CREDIT'].includes(t.type)).map(t => ({
            label: `Recharge ${t.type}`,
            amount: t.amount || 0,
            client: '—',
            date: t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
          })),
          ...(ordRes.data?.orders || []).filter(o => o.orderStatus !== 'REJECTED').map(o => ({
            label: `Order ${o.orderNumber || ''}`,
            amount: o.totalAmount || 0,
            client: '—',
            date: o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'
          }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));
        setDrillModal({ type, title, items, loading: false });
      }
    } catch (err) {
      setDrillModal({ type, title, items: [], loading: false });
    } finally {
      setDrillLoading(false);
    }
  };

  const closeDrillModal = () => setDrillModal(null);

  // Initialize push notifications after login
  useEffect(() => {
    initPushNotifications();
    // Register foreground message handler so notifications show when tab is open
    const unsubscribe = setupForegroundHandler(null);
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  // Scroll lock for modals
  useEffect(() => {
    if (showNoticeForm || selectedNotice) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [showNoticeForm, selectedNotice]);

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

  // ===== CLIENT WORKFLOW TIMELINE (date-wise ORDER -> START -> END view) =====
  // Status legend colors. endDate is displayed strictly as END DATE with the task's
  // current status — never as a completion date. The ACTUAL completion event is
  // plotted only when the server provides completedAt (the persisted TASK_COMPLETED
  // notification time); no completedAt => no completion bar (never from endDate or
  // updatedAt).
  const TIMELINE_STATUS_META = {
    COMPLETED: { color: '#22c55e', label: 'Completed' },
    ACTIVE: { color: '#3b82f6', label: 'Active / In Progress' },
    IN_PROGRESS: { color: '#3b82f6', label: 'Active / In Progress' },
    PENDING: { color: '#eab308', label: 'Scheduled' },
    PENDING_APPROVAL: { color: '#f97316', label: 'Pending Approval' },
    CANCELLED: { color: '#94a3b8', label: 'Cancelled' },
  };
  const TIMELINE_ORDER_COLOR = '#8b5cf6';
  // Workflow graph lanes (bottom -> top): a task's bar rises to the lane of its CURRENT
  // status, anchored at its startDate. endDate renders as a separate HOLLOW rising bar
  // (END DATE) — never as a completion date. An ACTUAL completion (completedAt) renders
  // as a separate SOLID green bar rising to the COMPLETED lane.
  const STAGE_ORDER = ['PENDING', 'SCHEDULED', 'ACTIVE', 'COMPLETED'];
  const STAGE_META = {
    PENDING: { color: '#f97316', label: 'Pending', h: 26 },
    SCHEDULED: { color: '#eab308', label: 'Scheduled', h: 56 },
    ACTIVE: { color: '#3b82f6', label: 'Active / In Progress', h: 86 },
    COMPLETED: { color: '#22c55e', label: 'Completed', h: 116 },
  };
  const TIMELINE_STATUS_LANE = { PENDING_APPROVAL: 'PENDING', PENDING: 'SCHEDULED', ACTIVE: 'ACTIVE', IN_PROGRESS: 'ACTIVE', COMPLETED: 'COMPLETED' };
  // Day keys are UTC day strings — the same convention as the backend date filters,
  // so an event is bucketed into exactly the day the server-side range includes.
  const utcDayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  const fmtTimelineDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');

  let timelineDays = [];
  const timelineEvents = {};
  // day -> ordered list of INDIVIDUAL rising bars (every order / task start / task end
  // keeps its own bar — same-date events are never collapsed into a single mark).
  const timelineGraph = {};
  const timelineSummary = { orders: 0, starts: 0, ends: 0, completed: 0 };
  let timelineRangeTooLong = false;
  if (timeline && dateFilter.startDate && dateFilter.endDate) {
    // Each event is independent by ITS OWN DATE: a start/end/completed event is
    // plotted/counted only when that specific date falls inside the selected
    // range. A task included via its completion date can never contribute an
    // out-of-range START or END DATE bar/count (dates stay available as detail
    // context only).
    const inTimelineRange = (day) => day >= dateFilter.startDate && day <= dateFilter.endDate;
    (timeline.orders || []).forEach((o) => {
      const day = utcDayKey(o.createdAt);
      if (!day) return;
      (timelineEvents[day] = timelineEvents[day] || []).push({ kind: 'order', order: o });
      (timelineGraph[day] = timelineGraph[day] || []).push({ kind: 'order' });
      timelineSummary.orders += 1;
    });
    (timeline.tasks || []).forEach((t) => {
      const startDay = utcDayKey(t.startDate);
      const endDay = utcDayKey(t.endDate);
      const lane = TIMELINE_STATUS_LANE[t.status]; // CANCELLED/LISTED plot no bar
      if (startDay && inTimelineRange(startDay)) {
        (timelineEvents[startDay] = timelineEvents[startDay] || []).push({ kind: 'start', task: t });
        if (lane) (timelineGraph[startDay] = timelineGraph[startDay] || []).push({ kind: 'start', lane });
        timelineSummary.starts += 1;
      }
      if (endDay && inTimelineRange(endDay)) {
        (timelineEvents[endDay] = timelineEvents[endDay] || []).push({ kind: 'end', task: t });
        if (lane) (timelineGraph[endDay] = timelineGraph[endDay] || []).push({ kind: 'end', lane });
        timelineSummary.ends += 1;
      }
      // ACTUAL COMPLETION — plotted only when the server returned a real completedAt
      // (TASK_COMPLETED notification time). Never falls back to endDate/updatedAt:
      // no completedAt => no completion event.
      const completedDay = utcDayKey(t.completedAt);
      if (completedDay && inTimelineRange(completedDay)) {
        (timelineEvents[completedDay] = timelineEvents[completedDay] || []).push({ kind: 'completed', task: t });
        (timelineGraph[completedDay] = timelineGraph[completedDay] || []).push({ kind: 'completed' });
        timelineSummary.completed += 1;
      }
    });
    // Date axis generated from the SELECTED range (inclusive on both ends)
    const rangeStart = new Date(dateFilter.startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(dateFilter.endDate + 'T00:00:00.000Z');
    const MAX_TIMELINE_DAYS = 366;
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      if (timelineDays.length >= MAX_TIMELINE_DAYS) { timelineRangeTooLong = true; break; }
      timelineDays.push(d.toISOString().slice(0, 10));
    }
  }
  const firstTimelineEventDay = Object.keys(timelineEvents).sort()[0] || null;
  const activeTimelineDay = timelineDate || firstTimelineEventDay;

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

        {/* BUSINESS ANALYTICS SECTION */}
        {(analytics || analyticsLoading) && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>📊 Business Analytics{selectedClient && <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366f1', backgroundColor: '#eef2ff', padding: '3px 8px', borderRadius: '6px', marginLeft: '8px' }}>{selectedClient.identifier}</span>}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Client filter — WHO */}
                <div ref={clientDropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setClientDropdownOpen(o => !o); setClientSearch(''); }}
                    style={{
                      padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                      border: clientFilter ? '1px solid #6366f1' : '1px solid #e2e8f0',
                      background: clientFilter ? '#eef2ff' : '#fff',
                      color: clientFilter ? '#6366f1' : '#64748b',
                      display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '180px'
                    }}
                  >
                    <span style={{ fontSize: '12px' }}>👤</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedClient ? selectedClient.identifier : 'All Clients'}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>▼</span>
                  </button>
                  {clientDropdownOpen && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: '240px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,0.12)', zIndex: 50, overflow: 'hidden' }}>
                      <div style={{ padding: '8px', borderBottom: '1px solid #f1f5f9' }}>
                        <input
                          autoFocus
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          placeholder="Search name / email…"
                          style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px', outline: 'none' }}
                        />
                      </div>
                      <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        <button
                          onClick={() => { setClientFilter(''); setClientDropdownOpen(false); }}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '12.5px', fontWeight: clientFilter ? '500' : '700', cursor: 'pointer', border: 'none', background: clientFilter ? '#fff' : '#f8fafc', color: '#0f172a' }}
                        >
                          All Clients
                        </button>
                        {filteredClients.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setClientFilter(c.id); setClientDropdownOpen(false); }}
                            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '12.5px', fontWeight: clientFilter === c.id ? '700' : '500', cursor: 'pointer', border: 'none', background: clientFilter === c.id ? '#eef2ff' : '#fff', color: clientFilter === c.id ? '#6366f1' : '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {c.identifier}
                          </button>
                        ))}
                        {filteredClients.length === 0 && (
                          <p style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8', margin: 0 }}>No clients match</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* Date filter — WHEN (compact dropdown, same options as before) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px' }}>🗓️</span>
                  <select
                    value={dateFilter.type}
                    onChange={e => handleDateDropdownChange(e.target.value)}
                    style={{
                      padding: '7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                      border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', maxWidth: '150px'
                    }}
                  >
                    {dateOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>{dateFilter.label}</span>
              </div>
            </div>
            {showDatePicker && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>→</span>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                <button onClick={applyCustomFilter} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: 'none', background: '#6366f1', color: '#fff' }}>Apply</button>
                <button onClick={() => setShowDatePicker(false)} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>Cancel</button>
              </div>
            )}
            {/* CLIENT WORKFLOW TIMELINE — selected client AND selected date range only.
                ORDER (order createdAt) -> START (startDate) -> END (endDate, shown with the
                task's current status; the data model has no reliable completion timestamp).
                All existing Business Analytics cards below remain untouched. */}
            {(
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '18px 16px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <style>{`@keyframes gvaTlPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workflow Timeline</h4>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[{ color: '#f97316', label: 'Pending' }, { color: '#eab308', label: 'Scheduled' }, { color: '#3b82f6', label: 'Active' }, { color: '#22c55e', label: 'Completed' }].map(l => (
                      <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
                        <span style={{ width: '7px', height: '10px', borderRadius: '3px', background: l.color }} />{l.label}
                      </span>
                    ))}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
                      <span style={{ width: '7px', height: '10px', borderRadius: '3px', border: '1.5px solid #64748b', boxSizing: 'border-box' }} />End date
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
                      <span style={{ width: '7px', height: '10px', borderRadius: '3px 3px 0 0', background: TIMELINE_ORDER_COLOR }} />Order
                    </span>
                  </div>
                </div>
                {timelineLoading ? (
                  <div style={{ height: '120px', backgroundColor: '#f1f5f9', borderRadius: '10px', animation: 'gvaTlPulse 1.5s infinite' }} />
                ) : timelineError ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>Timeline failed to load.</p>
                    <button onClick={loadTimeline} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>↻ Retry</button>
                  </div>
                ) : !dateFilter.startDate || !dateFilter.endDate ? (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Select a date range (Today, 7 Days, Month or Custom) to see {selectedClient ? selectedClient.identifier : 'this client'}’s date-wise workflow.</p>
                ) : (
                  <>
                    {/* In-range event counts — timeline-specific; the status/financial metric
                        cards below already own the standard Business Analytics numbers. */}
                    <p style={{ fontSize: '11px', fontWeight: '500', color: '#94a3b8', margin: '0 0 12px 0' }}>
                      {timelineSummary.orders} order{timelineSummary.orders === 1 ? '' : 's'} placed · {timelineSummary.starts} task start{timelineSummary.starts === 1 ? '' : 's'} · {timelineSummary.completed} completed · {timelineSummary.ends} task end{timelineSummary.ends === 1 ? '' : 's'}
                      {timelineRangeTooLong && ' · showing first 366 days'}
                    </p>
                    {timelineDays.length === 0 ? (
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Invalid date range.</p>
                    ) : (
                      <>
                        {/* WORKFLOW GRAPH — X: dates of the selected range; Y: workflow
                            stages (bottom->top Pending/Scheduled/Active/Completed).
                            Solid rising bars = tasks anchored at startDate, rising to the
                            lane of their CURRENT status. Hollow bars = END DATE markers.
                            Short purple bars = orders placed. Every event keeps its own
                            bar — busy dates widen their column instead of collapsing.
                            Horizontally scrollable on mobile; no numeric Y labels. */}
                        <div style={{ display: 'flex', alignItems: 'stretch' }}>
                          {/* Fixed stage-label gutter — compact so the plot gets more
                              usable width; labels stay right-aligned to the plot edge
                              and ACTIVE / IN PROGRESS wraps to two clean lines without
                              colliding with bars. */}
                          <div style={{ width: '80px', flexShrink: 0 }}>
                            {['COMPLETED', 'ACTIVE / IN PROGRESS', 'SCHEDULED', 'PENDING'].map(l => (
                              <div key={l} style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '6px', fontSize: '8.5px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.45, textAlign: 'right' }}>{l}</div>
                            ))}
                            <div style={{ height: '26px' }} />
                          </div>
                          {/* Scrollable plot */}
                          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
                            <div style={{ position: 'relative', minWidth: timelineDays.reduce((w, d) => w + Math.max(26, (timelineGraph[d] || []).length * 6 + 8), 0), height: '146px' }}>
                              {[0, 30, 60, 90].map(y => (
                                <div key={y} style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: '1px dashed #e2e8f0' }} />
                              ))}
                              <div style={{ position: 'absolute', left: 0, right: 0, top: 120, borderTop: '1px solid #cbd5e1' }} />
                              <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, bottom: 0 }}>
                                {timelineDays.map(day => {
                                  const bars = timelineGraph[day] || [];
                                  const shown = bars.slice(0, 40);
                                  // Bars narrow slightly as a date gets busier, and the
                                  // date column itself WIDENS to fit every event — events
                                  // are never collapsed into one bar or hidden behind a
                                  // "+N" unless an extreme single-day count overflows.
                                  const bw = shown.length <= 4 ? 5 : 3;
                                  const bgap = shown.length <= 4 ? 2 : 1;
                                  const colW = Math.max(26, bars.length * (bw + bgap) + 8);
                                  const isSelected = day === activeTimelineDay;
                                  const dObj = new Date(day + 'T00:00:00.000Z');
                                  const nOrders = bars.filter(b => b.kind === 'order').length;
                                  const nStarts = bars.filter(b => b.kind === 'start').length;
                                  const nEnds = bars.filter(b => b.kind === 'end').length;
                                  const nCompleted = bars.filter(b => b.kind === 'completed').length;
                                  return (
                                    <button
                                      key={day}
                                      onClick={() => setTimelineDate(day)}
                                      title={`${dObj.getUTCDate()}: ${nOrders} orders · ${nStarts} starts · ${nCompleted} completed · ${nEnds} ends`}
                                      style={{ width: `${colW}px`, flexShrink: 0, position: 'relative', border: 'none', background: isSelected ? '#eef2ff' : 'transparent', cursor: 'pointer', padding: 0 }}
                                    >
                                      {/* Rising bars from the date axis — one bar per event:
                                          solid = order placed / task started / task ACTUALLY
                                          COMPLETED (completedAt, always the green COMPLETED
                                          lane); hollow = task END DATE (planned deadline).
                                          Multiple events on a date render as separate adjacent
                                          bars, never collapsed. */}
                                      {bars.length > 0 && (
                                        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '120px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: `${bgap}px` }}>
                                          {shown.map((b, i) => b.kind === 'order' ? (
                                            <div key={i} style={{ width: `${Math.max(bw - 1, 2)}px`, height: '18px', background: TIMELINE_ORDER_COLOR, borderRadius: '2px 2px 0 0' }} />
                                          ) : b.kind === 'start' ? (
                                            <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META[b.lane].h}px`, background: STAGE_META[b.lane].color, borderRadius: '3px 3px 0 0' }} />
                                          ) : b.kind === 'completed' ? (
                                            <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META.COMPLETED.h}px`, background: STAGE_META.COMPLETED.color, borderRadius: '3px 3px 0 0' }} />
                                          ) : (
                                            <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META[b.lane].h}px`, border: `1.5px solid ${STAGE_META[b.lane].color}`, borderRadius: '3px 3px 0 0', boxSizing: 'border-box', background: 'transparent' }} />
                                          ))}
                                          {bars.length > 40 && (
                                            <div style={{ width: `${bw}px`, height: '8px', background: '#cbd5e1', borderRadius: '3px 3px 0 0' }} title={`${bars.length - 40} more events`} />
                                          )}
                                        </div>
                                      )}
                                      {/* Day number */}
                                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: isSelected ? '700' : '500', color: isSelected ? '#6366f1' : '#94a3b8' }}>{dObj.getUTCDate()}</div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Day detail panel */}
                        <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                          {!activeTimelineDay ? (
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No workflow events for {selectedClient ? selectedClient.identifier : 'this client'} in {dateFilter.label}. Events appear here as orders are placed and tasks start/end.</p>
                          ) : (timelineEvents[activeTimelineDay] || []).length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No events on {fmtTimelineDate(activeTimelineDay)}.</p>
                          ) : (
                            <div>
                              <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{fmtTimelineDate(activeTimelineDay)}</p>
                              {(timelineEvents[activeTimelineDay] || []).map((ev, i) => ev.kind === 'order' ? (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: TIMELINE_ORDER_COLOR, marginTop: '5px', flexShrink: 0 }} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Order {ev.order.orderId || ''} placed</p>
                                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>{(ev.order.services || []).join(', ') || '—'} · ₹{(ev.order.totalAmount || 0).toLocaleString('en-IN')}</p>
                                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Status: {ev.order.orderStatus}</p>
                                  </div>
                                </div>
                              ) : (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: TIMELINE_STATUS_META[ev.task.status]?.color || '#94a3b8', marginTop: '5px', flexShrink: 0 }} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{ev.task.title}</p>
                                    {/* "End date" is reported honestly — it is the planned endDate with the
                                        current status, never a claimed completion date. "Completed" is the
                                        actual completion time recorded by the server (completedAt). */}
                                    <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
                                      {ev.kind === 'start' ? 'Started' : ev.kind === 'completed' ? `Completed ${fmtTimelineDate(ev.task.completedAt)}` : 'End date'} · Status: {TIMELINE_STATUS_META[ev.task.status]?.label || ev.task.status} · {(ev.task.creditCost || 0).toLocaleString('en-IN')} credits
                                    </p>
                                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Start: {fmtTimelineDate(ev.task.startDate)} → End: {fmtTimelineDate(ev.task.endDate)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {analyticsLoading ? (
              /* Skeleton while client/date-scoped analytics load — prevents showing the
                 previous selection's numbers under the new selection */
              <div>
                <style>{`@keyframes gvaPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  {[1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} style={{ height: '110px', backgroundColor: '#e2e8f0', borderRadius: '16px', animation: 'gvaPulse 1.5s infinite' }} />
                  ))}
                </div>
                <div style={{ height: '90px', backgroundColor: '#e2e8f0', borderRadius: '12px', animation: 'gvaPulse 1.5s infinite' }} />
              </div>
            ) : analytics && (<>
            <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              {/* Row 1: Task Metrics */}
              {/* Total Tasks */}
              <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>📋</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.totalTasks || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Total Tasks</p>
              </div>
              {/* Pending Tasks */}
              <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>⏳</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.pendingTasks || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Pending Tasks</p>
              </div>
              {/* In Progress Tasks */}
              <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🔄</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.inProgressTasks || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>In Progress</p>
              </div>
              {/* Completed Tasks - CLICKABLE (same drill-down as old Open Tasks card) */}
              <div onClick={() => openDrillModal('tasks', 'Completed Tasks')} style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', borderRadius: '16px', padding: '16px', color: '#fff', cursor: 'pointer', position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>✅</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.completedTasks || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Completed Tasks</p>
                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '14px', opacity: 0.5 }}>↗</span>
              </div>

              {/* Row 2: Financial Metrics */}
              {/* Amount Received - CLICKABLE (same drill-down as old Total Revenue card) */}
              <div onClick={() => openDrillModal('revenue', 'Revenue Breakdown')} style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', borderRadius: '16px', padding: '16px', color: '#fff', cursor: 'pointer', position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💰</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>₹{(analytics.metrics?.amountReceived || 0).toLocaleString('en-IN')}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Amount Received</p>
                <p style={{ fontSize: '10px', opacity: 0.7, margin: '2px 0 0 0' }}>Recharge approved only</p>
                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '14px', opacity: 0.5 }}>↗</span>
              </div>
              {/* Credit Send */}
              <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💳</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>₹{(analytics.metrics?.creditSend || 0).toLocaleString('en-IN')}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Credit Send</p>
              </div>
              {/* Commission Generate - CLICKABLE (same drill-down as old Commission Paid card) */}
              <div onClick={() => openDrillModal('commission', 'Commission Breakdown')} style={{ background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', borderRadius: '16px', padding: '16px', color: '#fff', cursor: 'pointer', position: 'relative' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🏆</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>₹{(analytics.metrics?.commissionGenerate || 0).toLocaleString('en-IN')}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Commission Generate</p>
                <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '14px', opacity: 0.5 }}>↗</span>
              </div>
              {/* Expenses / Tax / Other */}
              <div style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>📊</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>₹{((analytics.metrics?.expenses || 0) + (analytics.metrics?.tax || 0) + (analytics.metrics?.other || 0)).toLocaleString('en-IN')}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Expenses / Tax / Other</p>
                <p style={{ fontSize: '10px', opacity: 0.7, margin: '2px 0 0 0' }}>Exp ₹{(analytics.metrics?.expenses || 0).toLocaleString('en-IN')} · Tax ₹{(analytics.metrics?.tax || 0).toLocaleString('en-IN')} · Other ₹{(analytics.metrics?.other || 0).toLocaleString('en-IN')}</p>
                <p style={{ fontSize: '9px', opacity: 0.6, margin: '2px 0 0 0' }}>From completed tasks only</p>
              </div>

              {/* Row 3: Operational Metrics */}
              {/* Active Clients — current-state, cross-client metric; hidden in single-client mode */}
              {analytics.metrics?.activeClients != null && (
              <div style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>👥</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.activeClients || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Active Clients <span style={{ fontSize: '9px', opacity: 0.7 }}>(Now)</span></p>
                <p style={{ fontSize: '9px', opacity: 0.6, margin: '2px 0 0 0' }}>Current state — not date-filtered</p>
              </div>
              )}
              {/* Upcoming Renewal — forward-looking, not date-filtered */}
              <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>📅</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.upcomingRenewal || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Upcoming Renewal <span style={{ fontSize: '9px', opacity: 0.7 }}>(30 Days)</span></p>
                <p style={{ fontSize: '9px', opacity: 0.6, margin: '2px 0 0 0' }}>Forward-looking — not date-filtered</p>
              </div>
              {/* Pending Orders */}
              <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🛒</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.pendingOrders || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Pending Orders</p>
              </div>
              {/* Active Chats */}
              <div style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)', borderRadius: '16px', padding: '16px', color: '#fff' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💬</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 2px 0' }}>{analytics.metrics?.activeChats || 0}</p>
                <p style={{ fontSize: '11px', opacity: 0.85, margin: 0 }}>Active Chats</p>
                <p style={{ fontSize: '9px', opacity: 0.6, margin: '2px 0 0 0' }}>Awaiting client response</p>
              </div>
            </div>

            {/* Recent Activity */}
            {(analytics.recentActivity || []).length > 0 && (
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Activity</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(analytics.recentActivity || []).map((item, idx) => {
                    const dateObj = item.date ? new Date(item.date) : null;
                    const dateStr = dateObj ? `${dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}` : '-';
                    return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < analytics.recentActivity.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0,
                          backgroundColor: item.type === 'order' ? '#dbeafe' : item.type === 'task' ? '#dcfce7' : '#fef3c7'
                        }}>
                          {item.type === 'order' ? '🛒' : item.type === 'task' ? '✅' : '💳'}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {item.clientName && <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.clientName}</p>}
                          <p style={{ fontSize: '12px', fontWeight: '500', color: '#334155', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</p>
                          <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{item.status} · {dateStr}</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px' }}>
                        <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{item.type === 'order' || item.type === 'task' ? `${(item.value || 0).toLocaleString('en-IN')} credits` : `₹${(item.value || 0).toLocaleString('en-IN')}`}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Clients + Top Services side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Top Clients */}
              {(analytics.top10 || []).length > 0 && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Clients</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Client</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Recharge</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Spend</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.top10 || []).map((c, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 4px', fontSize: '12px', fontWeight: '500', color: '#334155' }}>{c.identifier}</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#22c55e', fontWeight: '600' }}>₹{(c.totalRecharge || 0).toLocaleString('en-IN')}</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#3b82f6' }}>{(c.totalSpend || 0).toLocaleString('en-IN')} credits</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#f59e0b' }}>{(c.totalCommission || 0).toLocaleString('en-IN')} credits</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top Services */}
              {(analytics.services?.top5 || []).length > 0 && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Services</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Service</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Orders</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.services?.top5 || []).map((s, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 4px', fontSize: '12px', fontWeight: '500', color: '#334155', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.serviceName}</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#3b82f6', fontWeight: '600' }}>{s.totalOrders}</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontSize: '12px', color: '#22c55e', fontWeight: '600' }}>₹{(s.totalRevenue || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            </>)}
          </div>
        )}

        {/* DRILL-DOWN MODAL */}
        {drillModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={closeDrillModal}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{drillModal.title}</h3>
                <button onClick={closeDrillModal} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: '#f1f5f9', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              {/* Content */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 16px' }}>
                {drillModal.loading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</div>
                ) : drillModal.items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No records found</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {drillModal.items.map((item, idx) => (
                      <div key={idx} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 2px 0' }}>
                            {item.user || item.name || item.label || '—'}
                          </p>
                          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                            {item.task || item.client || ''} • {item.date}
                          </p>
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', margin: 0 }}>
                          {drillModal.type === 'revenue' ? `₹${(item.amount || item.cost || 0).toLocaleString('en-IN')}` : `${(item.amount || item.cost || 0).toLocaleString('en-IN')} credits`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* COMMISSION EARNINGS SECTION */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '12px' }}>💰 Commission Earnings <span style={{ fontSize: '12px', fontWeight: '500', color: '#94a3b8' }}>(Total: All Time · Entries & Logs: Date-filtered)</span></h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {/* Total Revenue — main admin only */}
            {commissionData?.isMainAdmin && (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💎</span>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '800', color: '#6366f1', margin: '0 0 2px 0' }}>{(commissionData?.overallTotal || 0).toLocaleString('en-IN')} credits</p>
                <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>Total Commission (All Time)</p>
              </div>
            )}
            {/* Top Commission Earners */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '14px' }}>🏆</span>
                </div>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Earners</p>
              </div>
              {(analytics?.topCommissionEarners || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(analytics?.topCommissionEarners || []).map((earner, idx) => (
                    <div key={earner.userId || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{idx + 1}. {earner.identifier}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#f59e0b', flexShrink: 0, paddingLeft: '6px' }}>{(earner.totalCommission || 0).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No commission generated in this period</p>
              )}
            </div>
          </div>

          {/* Recent Commission Logs */}
          {(commissionData?.logs || []).length > 0 ? (
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Commission Earnings</h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {commissionData?.isMainAdmin && <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>User</th>}
                      <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Task</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Amount</th>
                      <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: '11px', fontWeight: '600', color: '#94a3b8' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(commissionData?.logs || []).map((log) => (
                      <tr key={log?.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        {commissionData?.isMainAdmin && <td style={{ padding: '8px 6px', fontSize: '13px', fontWeight: '500', color: '#334155' }}>{log?.userIdentifier || 'Unknown'}</td>}
                        <td style={{ padding: '8px 6px', fontSize: '13px', color: '#475569', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log?.taskTitle || 'N/A'}</td>
                        <td style={{ textAlign: 'right', padding: '8px 6px', fontSize: '13px', fontWeight: '600', color: '#10b981' }}>{(log?.amount || 0).toLocaleString('en-IN')} credits</td>
                        <td style={{ textAlign: 'right', padding: '8px 6px', fontSize: '12px', color: '#94a3b8' }}>{log?.createdAt ? new Date(log.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>📭 No earnings yet. Commissions appear when assigned tasks are completed.</p>
            </div>
          )}
        </div>

        {/* QUICK ACCESS CARDS - Compact */}
        <style>{`@media (max-width: 768px) { .quick-access-grid { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
        <div className="quick-access-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {/* Registered Clients → User Manager */}
          <div onClick={() => navigate('/profile', { state: { activeTab: 'users' } })} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', borderRadius: '12px', padding: '10px', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              <p style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{dashboardData?.totalClients || clients.length || 0}</p>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Registered Clients</p>
          </div>

          {/* Total Plans → Plans page */}
          <div onClick={() => navigate('/plans')} style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', borderRadius: '12px', padding: '10px', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <p style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{plans.length || 0}</p>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Total Plans</p>
          </div>

          {/* Pending Requests → Wallet */}
          <div onClick={() => navigate('/wallet')} style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderRadius: '12px', padding: '10px', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>
              <p style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{dashboardData?.pendingRecharges || 0}</p>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Pending Requests</p>
          </div>

          {/* Total Notices → Updates Manager */}
          <div onClick={() => setActiveSection('updates')} style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', borderRadius: '12px', padding: '10px', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              <p style={{ fontSize: '18px', fontWeight: '800', color: '#fff', margin: 0 }}>{notices.length || 0}</p>
            </div>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Total Notices</p>
          </div>
        </div>

        {/* ADDITIONAL STATS ROW - Compact */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {/* Pending Approvals → Tasks */}
          <div onClick={() => navigate('/tasks')} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', transition: 'background-color 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px' }}>⏳</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{dashboardData?.pendingApprovals || 0}</p>
            </div>
            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Pending Approvals</p>
          </div>

          {/* Client Responses → Requirements Manager */}
          <div onClick={() => setActiveSection('requirements')} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', transition: 'background-color 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px' }}>💬</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{dashboardData?.unreadResponses || 0}</p>
            </div>
            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Client Responses</p>
          </div>

          {/* Total Credits → Wallet */}
          <div onClick={() => navigate('/wallet')} style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', transition: 'background-color 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px' }}>💎</span>
              <p style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{dashboardData?.totalCredits || 0}</p>
            </div>
            <p style={{ fontSize: '10px', color: '#64748b', margin: 0 }}>Total Credits</p>
          </div>
        </div>

        {/* PENDING PLAN ORDERS PANEL */}
        {(() => {
          const pendingPlanOrders = tasks.filter(t => 
            t.status === 'PENDING_APPROVAL' && 
            !t.isListedInPlans && 
            t.planId
          );
          
          if (pendingPlanOrders.length === 0) return null;
          
          return (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2L2 7v8a2 2 0 002 2h10a2 2 0 002-2V7l-7-5z"/><path d="M9 22V12"/></svg>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Pending Plan Orders</h3>
                <span style={{ backgroundColor: '#eef2ff', color: '#6366f1', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{pendingPlanOrders.length} awaiting review</span>
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e0e7ff', overflow: 'hidden', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }}>
                {/* Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 180px', gap: '12px', padding: '14px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontWeight: '600', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
                  <span>Client</span>
                  <span>Plan</span>
                  <span>Purchase Date</span>
                  <span>Price</span>
                  <span style={{ textAlign: 'center' }}>Actions</span>
                </div>
                {/* Table Rows */}
                {pendingPlanOrders.map((order, idx) => (
                  <div
                    key={order.id}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 180px', gap: '12px', padding: '16px 20px', borderBottom: idx < pendingPlanOrders.length - 1 ? '1px solid #f1f5f9' : 'none', alignItems: 'center', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fafaff'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {/* Client Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#6366f1' }}>
                        {(order.clientIdentifier || 'C')[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{order.clientIdentifier || `Client #${order.clientId?.slice(-6)}`}</span>
                    </div>
                    {/* Plan Title */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>{order.icon || '📦'}</span>
                      <span style={{ fontSize: '14px', color: '#374151', fontWeight: '500' }}>{order.title}</span>
                    </div>
                    {/* Purchase Date */}
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    {/* Price */}
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#22c55e' }}>{order.creditCost} credits</span>
                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button
                        onClick={() => navigate('/tasks')}
                        style={{ padding: '7px 12px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Review & Approve"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectOrder(order.id)}
                        disabled={rejectLoading}
                        style={{ padding: '7px 12px', backgroundColor: rejectLoading ? '#94a3b8' : '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: rejectLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Reject & Refund"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '10px', textAlign: 'center' }}>
                Approve to review task details • Reject will refund wallet
              </p>
            </div>
          );
        })()}

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

        {/* FEATURED PLANS - Compact Manager */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '16px' }}>⭐</span>
            </div>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Featured Plans</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>{officeConfig?.featuredPlansConfig?.manualPlanIds?.length || 0} of 4 plans featured</p>
            </div>
          </div>
          <button onClick={() => navigate('/office-cms')} style={{ padding: '8px 16px', backgroundColor: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Manage →</button>
        </div>

        {/* SEE MORE BUTTON PREVIEW */}
        <div style={{ marginBottom: '28px', position: 'relative' }}>
          <span style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#6366f1', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', zIndex: 1 }}>PREVIEW</span>
          <button style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '16px', fontWeight: '700', borderRadius: '16px', border: 'none', boxShadow: '0 6px 20px rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            See More
          </button>
        </div>

        {/* SECTION TABS */}
        <style>{`
          .premium-tab-bar {
            display: grid !important;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            overflow: visible !important;
            padding-bottom: 0 !important;
          }
          .premium-tab {
            justify-content: center;
            white-space: normal;
            padding: 10px 8px !important;
            font-size: 13px !important;
          }
          @media (min-width: 640px) {
            .premium-tab-bar {
              display: flex !important;
            }
            .premium-tab {
              white-space: nowrap;
              padding: 12px 20px !important;
              font-size: 14px !important;
            }
          }
        `}</style>
        <div className="premium-tab-bar" data-theme="indigo" style={{ marginBottom: '20px' }}>
          {[
            { id: 'updates', label: 'Updates', icon: '🔄', count: updates.length },
            { id: 'requirements', label: 'Requirements', icon: '📋', count: requirements.length },
            { id: 'promotions', label: 'Promotions', icon: '🎁', count: promotions.length },
            { id: 'pending', label: 'Pending Clients', icon: '⏳', count: pendingClients.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`premium-tab${activeSection === tab.id ? ' active' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                borderRadius: '12px',
                fontWeight: '600',
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

        {/* PENDING CLIENT REGISTRATIONS */}
        {activeSection === 'pending' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '20px' }}>⏳</span>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Pending Client Registrations</h3>
            </div>
            {pendingClients.length === 0 ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                <p style={{ color: '#64748b', margin: 0 }}>No pending registrations</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {pendingClients.map(client => (
                  <div key={client.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #fef3c7', borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      {/* Avatar */}
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: '20px', fontWeight: '700' }}>
                          {client.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>
                          {client.name || 'Unknown'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px', color: '#64748b' }}>
                          <span>✉️ {client.email}</span>
                          {client.company && <span>🏢 {client.company}</span>}
                          {client.phone && <span>📞 {client.phone}</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                          Registered: {new Date(client.registeredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => handleApproveClient(client.id)}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#16a34a',
                            color: '#fff',
                            borderRadius: '10px',
                            border: 'none',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleRejectClient(client.id)}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            borderRadius: '10px',
                            border: '1px solid #fecaca',
                            fontWeight: '600',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          ✕ Reject
                        </button>
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', animation: 'fadeIn 0.2s ease' }} onClick={(e) => { if (e.target === e.currentTarget) setShowNoticeForm(false); }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: 'min(90vh, calc(100vh - 100px))', overflow: 'hidden', animation: 'slideIn 0.3s ease', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{editingNotice ? 'Edit Notice' : 'Create Notice'}</h3>
              <button onClick={() => { setShowNoticeForm(false); resetForm(); }} style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
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
            <div style={{ padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexShrink: 0, backgroundColor: '#fff' }}>
              <button onClick={() => { setShowNoticeForm(false); resetForm(); }} style={{ padding: '12px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleCreateNotice} style={{ padding: '12px 24px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>{editingNotice ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Notice Detail Modal */}
      {selectedNotice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', animation: 'fadeIn 0.2s ease' }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedNotice(null); }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', width: '100%', maxWidth: '600px', maxHeight: 'min(90vh, calc(100vh - 100px))', overflow: 'hidden', animation: 'slideIn 0.3s ease', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Notice Details</h3>
              <button onClick={() => setSelectedNotice(null)} style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', flex: 1, overflowY: 'auto' }}>
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

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @media (max-width: 768px) {
          .analytics-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
