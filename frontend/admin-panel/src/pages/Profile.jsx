import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';
import { useNavigate, useLocation } from 'react-router-dom';

const Profile = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeView, setActiveView] = useState(() => {
    // Check if navigated with state to open User Manager
    return location.state?.activeTab === 'users' ? 'userManager' : 'myProfile';
  });
  const [adminProfile, setAdminProfile] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState({ 
    name: '', 
    avatarUrl: '', 
    phone: '',
    designation: '',
    company: '',
    timezone: 'UTC',
    language: 'en',
    appName: '', 
    logoUrl: '', 
    tagline: '',
    accentColor: '#6366f1',
    secondaryColor: '#22c55e'
  });
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // User Manager State
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  // User Detail State
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [userTasks, setUserTasks] = useState([]);
  const [userWallet, setUserWallet] = useState({ balance: 0, transactions: [] });
  const [userPurchases, setUserPurchases] = useState([]);
  const [userResponses, setUserResponses] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeUserTab, setActiveUserTab] = useState('overview');

  // Modals
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAction, setWalletAction] = useState({ type: 'ADD', amount: '', description: '' });
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [noticeData, setNoticeData] = useState({ title: '', content: '', type: 'NOTICE', responseRequired: false, responseType: 'NONE' });
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskData, setTaskData] = useState({ title: '', description: '', creditCost: 0, priority: 'NORMAL' });
  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [createUserData, setCreateUserData] = useState({ identifier: '', password: '', role: 'CLIENT', name: '', phone: '', company: '' });
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    fetchAdminProfile();
    fetchPlans();
  }, []);

  useEffect(() => {
    if (activeView === 'userManager') {
      fetchUsers();
    }
  }, [activeView, searchQuery, statusFilter, sortBy, sortOrder, pagination.page]);

  const fetchAdminProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/profile');
      setAdminProfile(res.data.profile);
      setAdminStats(res.data.stats);
      // Initialize form with profile data
      const p = res.data.profile || {};
      setProfileForm({
        name: p.name || p.identifier || '',
        avatarUrl: p.avatarUrl || '',
        phone: p.phone || '',
        designation: p.designation || '',
        company: p.company || '',
        timezone: p.timezone || 'UTC',
        language: p.language || 'en',
        appName: p.appName || 'TaskFlow Pro',
        logoUrl: p.logoUrl || '',
        tagline: p.tagline || '',
        accentColor: p.accentColor || '#6366f1',
        secondaryColor: p.secondaryColor || '#22c55e',
      });
    } catch (err) {
      // Silent fail - show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      await api.patch('/admin/profile', profileForm);
      fetchAdminProfile();
      setEditMode(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save profile');
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
      await api.post('/admin/profile/change-password', {
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);
      params.append('sort', sortBy);
      params.append('order', sortOrder);
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/admin/users?${params.toString()}`);
      setUsers(res.data.users);
      setPagination(res.data.pagination);
    } catch (err) {
      // Silent fail - show empty state
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await api.get('/admin/tasks?isListedInPlans=true&limit=100');
      setPlans(res.data.tasks || []);
    } catch (err) {
      // Silent fail
    }
  };

  const fetchUserDetail = async (userId) => {
    try {
      setDetailLoading(true);
      const [detailRes, tasksRes, walletRes, purchasesRes, responsesRes] = await Promise.all([
        api.get(`/admin/users/${userId}`),
        api.get(`/admin/users/${userId}/tasks`),
        api.get(`/admin/users/${userId}/wallet`),
        api.get(`/admin/users/${userId}/purchases`),
        api.get(`/admin/users/${userId}/responses`),
      ]);
      setUserDetail(detailRes.data.user);
      setUserStats(detailRes.data.stats);
      setUserTasks(tasksRes.data.tasks);
      setUserWallet({ balance: walletRes.data.balance, transactions: walletRes.data.transactions });
      setUserPurchases(purchasesRes.data.purchases);
      setUserResponses(responsesRes.data.responses);
    } catch (err) {
      // Silent fail
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setActiveUserTab('overview');
    fetchUserDetail(user.id);
  };

  const handleBackToList = () => {
    setSelectedUser(null);
    setUserDetail(null);
    setActiveUserTab('overview');
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleSuspendUser = async (userId) => {
    setShowSuspendModal(false);
    try {
      setSaving(true);
      await api.post(`/admin/users/${userId}/suspend`);
      showToast('User suspended successfully');
      fetchUserDetail(userId);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to suspend user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateUser = async (userId) => {
    try {
      setSaving(true);
      await api.post(`/admin/users/${userId}/activate`);
      showToast('User activated successfully');
      fetchUserDetail(userId);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to activate user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    setShowDeleteModal(false);
    try {
      setSaving(true);
      await api.delete(`/admin/users/${userId}`);
      showToast('User deleted successfully');
      handleBackToList();
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleWalletAction = async () => {
    if (!walletAction.amount || isNaN(parseFloat(walletAction.amount))) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post(`/admin/users/${selectedUser.id}/wallet`, {
        type: walletAction.type,
        amount: parseFloat(walletAction.amount),
        description: walletAction.description,
      });
      setShowWalletModal(false);
      setWalletAction({ type: 'ADD', amount: '', description: '' });
      showToast('Wallet updated successfully');
      fetchUserDetail(selectedUser.id);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to modify wallet', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendNotice = async () => {
    if (!noticeData.title || !noticeData.content) {
      showToast('Title and content are required', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post(`/admin/users/${selectedUser.id}/notice`, noticeData);
      setShowNoticeModal(false);
      setNoticeData({ title: '', content: '', type: 'NOTICE', responseRequired: false, responseType: 'NONE' });
      showToast('Notice sent successfully');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send notice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskData.title) {
      showToast('Title is required', 'error');
      return;
    }
    try {
      setSaving(true);
      const response = await api.post(`/admin/users/${selectedUser.id}/create-task`, taskData);
      setShowTaskModal(false);
      setTaskData({ title: '', description: '', creditCost: 0, priority: 'NORMAL' });
      showToast('Task created successfully');
      fetchUserDetail(selectedUser.id);
      // Navigate to task detail
      if (response.data.task?.id) {
        navigate(`/tasks/${response.data.task.id}`);
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignPlan = async () => {
    if (!selectedPlanId) {
      showToast('Please select a plan', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post(`/admin/users/${selectedUser.id}/assign-plan`, { planId: selectedPlanId });
      setShowPlanModal(false);
      setSelectedPlanId('');
      showToast('Plan assigned successfully');
      fetchUserDetail(selectedUser.id);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to assign plan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createUserData.identifier || !createUserData.identifier.trim()) {
      showToast('Email/Identifier is required', 'error');
      return;
    }
    if (!createUserData.password || createUserData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    try {
      setSaving(true);
      await api.post('/admin/users', createUserData);
      setShowCreateUserModal(false);
      setCreateUserData({ identifier: '', password: '', role: 'CLIENT', name: '', phone: '', company: '' });
      showToast('User created successfully');
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create user', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Header />
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', backgroundColor: '#fff', borderRadius: '24px', padding: '32px', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', backgroundColor: '#e5e7eb', borderRadius: '50%', margin: '0 auto 16px' }} />
            <div style={{ width: '160px', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '8px', margin: '0 auto 8px' }} />
            <div style={{ width: '240px', height: '16px', backgroundColor: '#e5e7eb', borderRadius: '8px', margin: '0 auto' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <Header />
      
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' }}>
          <button
            onClick={() => { setActiveView('myProfile'); setSelectedUser(null); }}
            style={{ 
              padding: '12px 24px', 
              borderRadius: '16px', 
              fontWeight: '600', 
              transition: 'all 0.2s',
              backgroundColor: activeView === 'myProfile' ? '#6366f1' : '#fff',
              color: activeView === 'myProfile' ? '#fff' : '#4b5563',
              boxShadow: activeView === 'myProfile' ? '0 10px 15px -3px rgba(99, 102, 241, 0.3)' : 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            👤 My Profile
          </button>
          <button
            onClick={() => setActiveView('userManager')}
            style={{ 
              padding: '12px 24px', 
              borderRadius: '16px', 
              fontWeight: '600', 
              transition: 'all 0.2s',
              backgroundColor: activeView === 'userManager' ? '#6366f1' : '#fff',
              color: activeView === 'userManager' ? '#fff' : '#4b5563',
              boxShadow: activeView === 'userManager' ? '0 10px 15px -3px rgba(99, 102, 241, 0.3)' : 'none',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            👥 User Manager
          </button>
        </div>

        {/* MY PROFILE VIEW - PREMIUM DESIGN */}
        {activeView === 'myProfile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* SECTION 1: HERO PROFILE CARD */}
            <div style={{ 
              position: 'relative', overflow: 'hidden', borderRadius: '24px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #7c3aed 100%)',
              boxShadow: '0 25px 50px -12px rgba(99, 102, 241, 0.4)',
              padding: '40px'
            }}>
              {/* Decorative circles */}
              <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '300px', height: '300px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ position: 'absolute', bottom: '-50px', left: '-50px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
                {/* Avatar */}
                <div style={{ position: 'relative' }}>
                  {profileForm.avatarUrl || adminProfile?.avatarUrl ? (
                    <img 
                      src={profileForm.avatarUrl || adminProfile?.avatarUrl} 
                      alt="Avatar"
                      style={{ width: '120px', height: '120px', borderRadius: '24px', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
                    />
                  ) : (
                    <div style={{ 
                      width: '120px', height: '120px', borderRadius: '24px', 
                      background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '4px solid rgba(255,255,255,0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}>
                      <span style={{ fontSize: '48px', fontWeight: 'bold', color: '#fff' }}>
                        {adminProfile?.name?.charAt(0) || adminProfile?.identifier?.charAt(0) || 'A'}
                      </span>
                    </div>
                  )}
                  <div style={{ 
                    position: 'absolute', bottom: '-8px', right: '-8px',
                    width: '36px', height: '36px', borderRadius: '12px',
                    background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '3px solid #fff', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
                  }}>
                    <span style={{ color: '#fff', fontSize: '16px' }}>✓</span>
                  </div>
                </div>
                
                {/* Profile Info */}
                <div style={{ textAlign: 'center', color: '#fff' }}>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '8px 16px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)', fontSize: '13px', fontWeight: '700' }}>👑 ADMIN</span>
                    <span style={{ padding: '8px 16px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.3)', color: '#86efac', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }}></span>
                      Active
                    </span>
                  </div>
                  <h1 style={{ fontSize: '32px', fontWeight: '800', margin: '0 0 8px 0' }}>
                    {adminProfile?.name || adminProfile?.identifier?.split('@')[0] || 'Administrator'}
                  </h1>
                  <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.7)', margin: '0 0 16px 0' }}>{adminProfile?.identifier}</p>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                    📅 Member since {adminProfile?.createdAt ? new Date(adminProfile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
                  </p>
                </div>
                
                {/* Actions */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  {!editMode ? (
                    <button
                      onClick={() => setEditMode(true)}
                      style={{ 
                        padding: '14px 28px', background: '#fff', color: '#6366f1',
                        borderRadius: '16px', fontWeight: '700', fontSize: '15px',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                      }}
                    >
                      ✏️ Edit Profile
                    </button>
                  ) : (
                    <>
                      <button onClick={() => setEditMode(false)} style={{ padding: '14px 24px', background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: '16px', fontWeight: '600', border: 'none', cursor: 'pointer' }}>Cancel</button>
                      <button onClick={handleSaveProfile} disabled={saving} style={{ padding: '14px 28px', background: '#fff', color: '#6366f1', borderRadius: '16px', fontWeight: '700', border: 'none', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                        {saving ? 'Saving...' : '✓ Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Edit Form - Only show when editing */}
            {editMode && (
              <div style={{ background: '#fff', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>✏️</span> Edit Profile
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Display Name</label>
                    <input type="text" value={profileForm.name} onChange={e => setProfileForm({...profileForm, name: e.target.value})} placeholder="Your display name" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Avatar URL</label>
                    <input type="url" value={profileForm.avatarUrl} onChange={e => setProfileForm({...profileForm, avatarUrl: e.target.value})} placeholder="https://example.com/avatar.jpg" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Phone</label>
                    <input type="tel" value={profileForm.phone} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} placeholder="+1 234 567 8900" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Designation / Title</label>
                    <input type="text" value={profileForm.designation} onChange={e => setProfileForm({...profileForm, designation: e.target.value})} placeholder="e.g., Founder, Manager" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Company / Brand</label>
                    <input type="text" value={profileForm.company} onChange={e => setProfileForm({...profileForm, company: e.target.value})} placeholder="Your company name" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Timezone</label>
                    <select value={profileForm.timezone} onChange={e => setProfileForm({...profileForm, timezone: e.target.value})} style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', background: '#fff' }}>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time (US)</option>
                      <option value="America/Los_Angeles">Pacific Time (US)</option>
                      <option value="Europe/London">London</option>
                      <option value="Asia/Dubai">Dubai</option>
                      <option value="Asia/Kolkata">India (IST)</option>
                      <option value="Asia/Singapore">Singapore</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Language</label>
                    <select value={profileForm.language} onChange={e => setProfileForm({...profileForm, language: e.target.value})} style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', background: '#fff' }}>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="hi">Hindi</option>
                      <option value="ar">Arabic</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: BRAND SETTINGS CARD */}
            <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '20px' }}>🎨</span>
                    </div>
                    Brand Settings
                  </h3>
                  {!editMode && (
                    <button onClick={() => setEditMode(true)} style={{ padding: '10px 18px', color: '#6366f1', fontWeight: '600', background: 'transparent', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ✏️ Edit
                    </button>
                  )}
                </div>
              </div>
              
              <div style={{ padding: '28px' }}>
                {editMode ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
                    {/* Form Fields */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>App Name</label>
                        <input type="text" value={profileForm.appName} onChange={e => setProfileForm({...profileForm, appName: e.target.value})} placeholder="TaskFlow Pro" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Logo URL</label>
                        <input type="url" value={profileForm.logoUrl} onChange={e => setProfileForm({...profileForm, logoUrl: e.target.value})} placeholder="https://example.com/logo.png" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Tagline</label>
                        <input type="text" value={profileForm.tagline} onChange={e => setProfileForm({...profileForm, tagline: e.target.value})} placeholder="Your productivity partner" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Primary Color</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                            <input type="color" value={profileForm.accentColor} onChange={e => setProfileForm({...profileForm, accentColor: e.target.value})} style={{ width: '44px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer' }} />
                            <input type="text" value={profileForm.accentColor} onChange={e => setProfileForm({...profileForm, accentColor: e.target.value})} style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontFamily: 'monospace', fontSize: '13px', background: '#fff' }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Secondary Color</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '12px', border: '2px solid #e2e8f0', background: '#f8fafc' }}>
                            <input type="color" value={profileForm.secondaryColor} onChange={e => setProfileForm({...profileForm, secondaryColor: e.target.value})} style={{ width: '44px', height: '36px', borderRadius: '8px', border: 'none', cursor: 'pointer' }} />
                            <input type="text" value={profileForm.secondaryColor} onChange={e => setProfileForm({...profileForm, secondaryColor: e.target.value})} style={{ flex: 1, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontFamily: 'monospace', fontSize: '13px', background: '#fff' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Live Preview */}
                    <div style={{ background: '#f8fafc', borderRadius: '16px', padding: '24px', border: '2px dashed #e2e8f0' }}>
                      <p style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', marginBottom: '16px' }}>Live Preview</p>
                      <div style={{ background: '#fff', borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', padding: '20px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                          {profileForm.logoUrl ? (
                            <img src={profileForm.logoUrl} alt="Logo" style={{ width: '48px', height: '48px', borderRadius: '14px', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '18px', background: `linear-gradient(135deg, ${profileForm.accentColor}, ${profileForm.secondaryColor})` }}>
                              {profileForm.appName?.charAt(0) || 'T'}
                            </div>
                          )}
                          <div>
                            <p style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', margin: 0 }}>{profileForm.appName || 'TaskFlow Pro'}</p>
                            <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>{profileForm.tagline || 'Your productivity partner'}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button style={{ padding: '10px 18px', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600', border: 'none', backgroundColor: profileForm.accentColor }}>Primary</button>
                          <button style={{ padding: '10px 18px', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600', border: 'none', backgroundColor: profileForm.secondaryColor }}>Secondary</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {profileForm.logoUrl ? (
                        <img src={profileForm.logoUrl} alt="Logo" style={{ width: '64px', height: '64px', borderRadius: '18px', objectFit: 'cover', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', border: '3px solid #f1f5f9' }} />
                      ) : (
                        <div style={{ width: '64px', height: '64px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '800', fontSize: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', background: `linear-gradient(135deg, ${profileForm.accentColor}, ${profileForm.secondaryColor})` }}>
                          {profileForm.appName?.charAt(0) || 'T'}
                        </div>
                      )}
                      <div>
                        <p style={{ fontWeight: '700', fontSize: '20px', color: '#0f172a', margin: 0 }}>{profileForm.appName || 'TaskFlow Pro'}</p>
                        {profileForm.tagline && <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>{profileForm.tagline}</p>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', backgroundColor: profileForm.accentColor }} />
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Primary</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', backgroundColor: profileForm.secondaryColor }} />
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Secondary</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: SYSTEM STATS - ALWAYS VISIBLE */}
            <div style={{ background: '#fff', borderRadius: '20px', padding: '28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px' }}>📊</span>
                  </div>
                  System Overview
                </h3>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>Real-time stats</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', padding: '20px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff' }}>
                  <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                  <div style={{ position: 'relative' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '500', margin: '0 0 4px' }}>👥 Total Users</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>{adminStats?.totalUsers || 0}</p>
                  </div>
                </div>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', padding: '20px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff' }}>
                  <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                  <div style={{ position: 'relative' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '500', margin: '0 0 4px' }}>✅ Active Users</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>{adminStats?.activeUsers || 0}</p>
                  </div>
                </div>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', padding: '20px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff' }}>
                  <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                  <div style={{ position: 'relative' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '500', margin: '0 0 4px' }}>📋 Total Tasks</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>{adminStats?.totalTasks || 0}</p>
                  </div>
                </div>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', padding: '20px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#fff' }}>
                  <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                  <div style={{ position: 'relative' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '500', margin: '0 0 4px' }}>⏳ Pending</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>{adminStats?.pendingTasks || 0}</p>
                  </div>
                </div>
                <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', padding: '20px', background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', color: '#fff' }}>
                  <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                  <div style={{ position: 'relative' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: '500', margin: '0 0 4px' }}>📦 Total Plans</p>
                    <p style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>{adminStats?.totalPlans || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 4: ACCOUNT INFO CARD */}
            <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px' }}>👤</span>
                  </div>
                  Account Information
                </h3>
              </div>
              <div style={{ padding: '28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div style={{ padding: '18px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px' }}>📧</span>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Email / Username</span>
                    </div>
                    <p style={{ color: '#0f172a', fontWeight: '600', fontSize: '15px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminProfile?.identifier}</p>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', border: '1px solid #c7d2fe' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px' }}>👑</span>
                      <span style={{ fontSize: '13px', color: '#6366f1', fontWeight: '500' }}>Role</span>
                    </div>
                    <p style={{ color: '#4338ca', fontWeight: '700', fontSize: '15px', margin: 0 }}>{adminProfile?.role}</p>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }}></span>
                      <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: '500' }}>Status</span>
                    </div>
                    <p style={{ color: '#15803d', fontWeight: '700', fontSize: '15px', margin: 0 }}>{adminProfile?.status}</p>
                  </div>
                  <div style={{ padding: '18px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px' }}>📅</span>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Member Since</span>
                    </div>
                    <p style={{ color: '#0f172a', fontWeight: '600', fontSize: '15px', margin: 0 }}>
                      {adminProfile?.createdAt ? new Date(adminProfile.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 6: PERMISSIONS CARD */}
            <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px' }}>🛡️</span>
                  </div>
                  Permissions & Access
                </h3>
              </div>
              <div style={{ padding: '28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)', border: '1px solid #c7d2fe' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '18px' }}>✅</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', margin: '0 0 2px' }}>Full Access</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>All system features</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', border: '1px solid #a7f3d0' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '18px' }}>👥</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', margin: '0 0 2px' }}>User Management</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Create, edit, suspend</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)', border: '1px solid #ddd6fe' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '18px' }}>📝</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', margin: '0 0 2px' }}>Content Management</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Tasks, plans, notices</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px', borderRadius: '14px', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', border: '1px solid #fde68a' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '18px' }}>💰</span>
                    </div>
                    <div>
                      <p style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', margin: '0 0 2px' }}>Wallet Management</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Credits, transactions</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 5: SECURITY CARD */}
            <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '24px 28px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'linear-gradient(135deg, #ef4444 0%, #ec4899 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '20px' }}>🔒</span>
                  </div>
                  Security
                </h3>
              </div>
              <div style={{ padding: '28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px' }}>
                  {/* Change Password */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                      🔑 Change Password
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Current Password</label>
                        <input type="password" value={passwordData.currentPassword} onChange={e => setPasswordData({...passwordData, currentPassword: e.target.value})} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>New Password</label>
                        <input type="password" value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '6px' }}>Confirm New Password</label>
                        <input type="password" value={passwordData.confirmPassword} onChange={e => setPasswordData({...passwordData, confirmPassword: e.target.value})} placeholder="••••••••" style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }} />
                      </div>
                    </div>
                    {passwordError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                        <span style={{ fontSize: '16px' }}>⚠️</span>
                        <p style={{ color: '#dc2626', fontSize: '14px', fontWeight: '500', margin: 0 }}>{passwordError}</p>
                      </div>
                    )}
                    {passwordSuccess && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', borderRadius: '12px', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                        <span style={{ fontSize: '16px' }}>✅</span>
                        <p style={{ color: '#16a34a', fontSize: '14px', fontWeight: '500', margin: 0 }}>{passwordSuccess}</p>
                      </div>
                    )}
                    <button onClick={handleChangePassword} disabled={saving} style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', borderRadius: '14px', fontWeight: '600', fontSize: '15px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)' }}>
                      {saving ? '⏳ Updating...' : '🔒 Update Password'}
                    </button>
                  </div>
                  
                  {/* Session & Logout */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                      💻 Session Management
                    </h4>
                    <div style={{ padding: '20px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '20px' }}>🟢</span>
                        </div>
                        <div>
                          <p style={{ fontWeight: '600', color: '#0f172a', fontSize: '15px', margin: '0 0 2px' }}>Current Session</p>
                          <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '500', margin: 0 }}>Active now</p>
                        </div>
                      </div>
                      <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>You are currently logged in on this device. Clicking logout will end your session.</p>
                    </div>
                    
                    <button onClick={handleLogout} style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #fef2f2 0%, #fce7f3 100%)', color: '#dc2626', borderRadius: '14px', border: '2px solid #fecaca', fontWeight: '600', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      🚪 Sign Out of Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* USER MANAGER VIEW */}
        {activeView === 'userManager' && !selectedUser && (
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header with Add User Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>User Management</h2>
              <button
                onClick={() => setShowCreateUserModal(true)}
                style={{ 
                  padding: '12px 24px', 
                  backgroundColor: '#6366f1', 
                  color: '#fff', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  borderRadius: '12px', 
                  border: 'none', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4f46e5'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#6366f1'}
              >
                <span style={{ fontSize: '16px' }}>➕</span>
                Add User
              </button>
            </div>
            
            {/* Search & Filters */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '14px 18px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', transition: 'all 0.2s' }}
                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">All Status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    style={{ padding: '12px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '14px', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="createdAt">Join Date</option>
                    <option value="lastActivityAt">Last Activity</option>
                    <option value="identifier">Name</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    style={{ padding: '12px 20px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '14px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
                  >
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
              </div>
            </div>

            {/* Users Grid */}
            {usersLoading ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
                <p style={{ color: '#64748b', fontSize: '14px' }}>Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <p style={{ color: '#64748b', fontSize: '14px' }}>No users found</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                {users.map(user => (
                  <div
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ position: 'relative' }}>
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" style={{ width: '56px', height: '56px', borderRadius: '16px', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                        ) : (
                          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '2px solid #e2e8f0' }}>
                            <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '20px' }}>
                              {user.name?.charAt(0) || user.identifier?.charAt(0) || 'U'}
                            </span>
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '22px', height: '22px', borderRadius: '6px', background: user.status === 'ACTIVE' ? '#22c55e' : user.status === 'SUSPENDED' ? '#f59e0b' : '#94a3b8', border: '3px solid #fff' }}></div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.name || user.identifier}
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.identifier}</p>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: user.status === 'ACTIVE' ? '#ecfdf5' : user.status === 'SUSPENDED' ? '#fffbeb' : '#f8fafc',
                          color: user.status === 'ACTIVE' ? '#16a34a' : user.status === 'SUSPENDED' ? '#f59e0b' : '#64748b',
                          border: `1px solid ${user.status === 'ACTIVE' ? '#a7f3d0' : user.status === 'SUSPENDED' ? '#fde68a' : '#e2e8f0'}`
                        }}>
                          {user.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <p style={{ fontSize: '20px', fontWeight: '800', color: '#22c55e', margin: '0 0 4px 0' }}>{user.walletBalance || 0}</p>
                        <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Balance</p>
                      </div>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <p style={{ fontSize: '20px', fontWeight: '800', color: '#3b82f6', margin: '0 0 4px 0' }}>{user.activeTasks || 0}</p>
                        <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active</p>
                      </div>
                      <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <p style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>{user.totalTasks || 0}</p>
                        <p style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '32px' }}>
                <button
                  onClick={() => setPagination({...pagination, page: pagination.page - 1})}
                  disabled={pagination.page === 1}
                  style={{ padding: '12px 20px', borderRadius: '12px', backgroundColor: '#ffffff', border: '2px solid #e2e8f0', fontSize: '14px', fontWeight: '600', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', opacity: pagination.page === 1 ? 0.5 : 1, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { if (pagination.page !== 1) e.target.style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={(e) => { if (pagination.page !== 1) e.target.style.backgroundColor = '#ffffff'; }}
                >
                  Previous
                </button>
                <span style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500', color: '#64748b' }}>Page {pagination.page} of {pagination.totalPages}</span>
                <button
                  onClick={() => setPagination({...pagination, page: pagination.page + 1})}
                  disabled={pagination.page === pagination.totalPages}
                  style={{ padding: '12px 20px', borderRadius: '12px', backgroundColor: '#ffffff', border: '2px solid #e2e8f0', fontSize: '14px', fontWeight: '600', cursor: pagination.page === pagination.totalPages ? 'not-allowed' : 'pointer', opacity: pagination.page === pagination.totalPages ? 0.5 : 1, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { if (pagination.page !== pagination.totalPages) e.target.style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={(e) => { if (pagination.page !== pagination.totalPages) e.target.style.backgroundColor = '#ffffff'; }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* USER DETAIL VIEW */}
        {activeView === 'userManager' && selectedUser && (
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {/* Back Button */}
            <button
              onClick={handleBackToList}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', marginBottom: '24px', fontWeight: '500', color: '#475569', transition: 'all 0.2s' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
            >
              <span style={{ fontSize: '16px' }}>←</span>
              Back to Users
            </button>

            {detailLoading ? (
              <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
                <p style={{ color: '#64748b', fontSize: '14px' }}>Loading user details...</p>
              </div>
            ) : (
              <>
                {/* Header Card - Client Info */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
                    {/* Avatar */}
                    <div style={{ position: 'relative' }}>
                      {userDetail?.profile?.avatarUrl ? (
                        <img src={userDetail.profile.avatarUrl} alt="User" style={{ width: '80px', height: '80px', borderRadius: '20px', objectFit: 'cover', border: '2px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0' }}>
                          <span style={{ fontSize: '32px', fontWeight: '700', color: '#fff' }}>
                            {userDetail?.profile?.name?.charAt(0) || userDetail?.identifier?.charAt(0) || 'U'}
                          </span>
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '28px', height: '28px', borderRadius: '8px', background: userDetail?.status === 'ACTIVE' ? '#22c55e' : '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #fff' }}>
                        <span style={{ fontSize: '12px' }}>{userDetail?.status === 'ACTIVE' ? '✓' : '⏸'}</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>
                        {userDetail?.profile?.name || userDetail?.identifier}
                      </h2>
                      <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 12px 0' }}>{userDetail?.identifier}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '6px 14px', backgroundColor: userDetail?.status === 'ACTIVE' ? '#ecfdf5' : '#fffbeb', color: userDetail?.status === 'ACTIVE' ? '#16a34a' : '#f59e0b', fontSize: '12px', fontWeight: '600', borderRadius: '20px', border: `1px solid ${userDetail?.status === 'ACTIVE' ? '#a7f3d0' : '#fde68a'}` }}>
                          {userDetail?.status}
                        </span>
                        <span style={{ padding: '6px 14px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: '500', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                          CLIENT
                        </span>
                        {userDetail?.profile?.company && (
                          <span style={{ padding: '6px 14px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', fontWeight: '500', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                            🏢 {userDetail.profile.company}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {userDetail?.status === 'ACTIVE' ? (
                        <button
                          onClick={() => setShowSuspendModal(true)}
                          disabled={saving}
                          style={{ padding: '10px 18px', backgroundColor: '#fffbeb', color: '#f59e0b', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: '1px solid #fde68a', cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: saving ? 0.6 : 1 }}
                          onMouseEnter={(e) => !saving && (e.target.style.backgroundColor = '#fef3c7')}
                          onMouseLeave={(e) => !saving && (e.target.style.backgroundColor = '#fffbeb')}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivateUser(selectedUser.id)}
                          disabled={saving}
                          style={{ padding: '10px 18px', backgroundColor: '#ecfdf5', color: '#16a34a', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: '1px solid #a7f3d0', cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: saving ? 0.6 : 1 }}
                          onMouseEnter={(e) => !saving && (e.target.style.backgroundColor = '#d1fae5')}
                          onMouseLeave={(e) => !saving && (e.target.style.backgroundColor = '#ecfdf5')}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        disabled={saving}
                        style={{ padding: '10px 18px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: '1px solid #fecaca', cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: saving ? 0.6 : 1 }}
                        onMouseEnter={(e) => !saving && (e.target.style.backgroundColor = '#fee2e2')}
                        onMouseLeave={(e) => !saving && (e.target.style.backgroundColor = '#fef2f2')}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{userDetail?.profile?.phone || 'Not set'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Designation</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>{userDetail?.profile?.designation || 'Not set'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joined</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                        {userDetail?.createdAt ? new Date(userDetail.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Active</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                        {userDetail?.lastActivityAt ? new Date(userDetail.lastActivityAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>Quick Actions</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <button
                      onClick={() => setShowPlanModal(true)}
                      style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#eff6ff'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#f8fafc'; }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📦</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>Assign Plan</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Add service plan</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setShowTaskModal(true)}
                      style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#f0fdf4'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#f8fafc'; }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✏️</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>Create Task</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>New custom task</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setShowWalletModal(true)}
                      style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#fffbeb'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#f8fafc'; }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>💰</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>Wallet</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Add/deduct credits</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setShowNoticeModal(true)}
                      style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '12px' }}
                      onMouseEnter={(e) => { e.target.style.backgroundColor = '#faf5ff'; }}
                      onMouseLeave={(e) => { e.target.style.backgroundColor = '#f8fafc'; }}
                    >
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>📢</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '2px' }}>Send Notice</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Important message</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Stats Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Wallet Balance</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#22c55e', marginBottom: '4px' }}>{userStats?.walletBalance || 0}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>credits</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Tasks</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#3b82f6', marginBottom: '4px' }}>{userStats?.activeTasks || 0}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>in progress</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#f59e0b', marginBottom: '4px' }}>{userStats?.pendingTasks || 0}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>awaiting</div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', marginBottom: '4px' }}>{userStats?.completedTasks || 0}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>finished</div>
                  </div>
                </div>

                {/* Tabs Navigation */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {['overview', 'tasks', 'wallet', 'purchases', 'responses'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveUserTab(tab)}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '600',
                        borderRadius: '10px',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        backgroundColor: activeUserTab === tab ? '#6366f1' : '#f8fafc',
                        color: activeUserTab === tab ? '#ffffff' : '#64748b',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (activeUserTab !== tab) {
                          e.target.style.backgroundColor = '#f1f5f9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeUserTab !== tab) {
                          e.target.style.backgroundColor = '#f8fafc';
                        }
                      }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {activeUserTab === 'overview' && (
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '14px', color: '#64748b', textAlign: 'center', padding: '40px 0' }}>All key metrics displayed above</div>
                  </div>
                )}

                {/* Tasks Tab */}
                {activeUserTab === 'tasks' && (
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    {userTasks.length === 0 ? (
                      <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No tasks found</div>
                    ) : (
                      <div>
                        {userTasks.map(task => (
                          <div
                            key={task.id}
                            onClick={() => navigate(`/tasks/${task.id}`)}
                            style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8fafc'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{task.title}</h4>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{new Date(task.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '4px 10px',
                                  borderRadius: '20px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  backgroundColor: task.status === 'COMPLETED' ? '#ecfdf5' : task.status === 'ACTIVE' ? '#eff6ff' : '#f8fafc',
                                  color: task.status === 'COMPLETED' ? '#16a34a' : task.status === 'ACTIVE' ? '#3b82f6' : '#64748b'
                                }}>
                                  {task.status}
                                </span>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0 0' }}>{task.creditCost} credits</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Wallet Tab */}
                {activeUserTab === 'wallet' && (
                  <div>
                    <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', borderRadius: '16px', padding: '20px', marginBottom: '16px', color: '#ffffff' }}>
                      <p style={{ fontSize: '13px', opacity: 0.9, margin: '0 0 8px 0' }}>Current Balance</p>
                      <p style={{ fontSize: '32px', fontWeight: '800', margin: 0 }}>{userWallet.balance} credits</p>
                    </div>
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      {userWallet.transactions.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No transactions found</div>
                      ) : (
                        <div>
                          {userWallet.transactions.map(txn => (
                            <div key={txn.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{txn.description}</p>
                                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{new Date(txn.createdAt).toLocaleDateString()}</p>
                              </div>
                              <span style={{ fontSize: '16px', fontWeight: '700', color: txn.amount > 0 ? '#22c55e' : '#ef4444' }}>
                                {txn.amount > 0 ? '+' : ''}{txn.amount}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Purchases Tab */}
                {activeUserTab === 'purchases' && (
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    {userPurchases.length === 0 ? (
                      <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No purchases found</div>
                    ) : (
                      <div>
                        {userPurchases.map(p => (
                          <div key={p.taskId} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {p.planImage && (
                              <img src={p.planImage} alt="" style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover' }} loading="lazy" />
                            )}
                            <div style={{ flex: 1 }}>
                              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{p.planTitle}</h4>
                              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Purchased: {new Date(p.purchasedAt).toLocaleDateString()}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: '16px', fontWeight: '700', color: '#6366f1', margin: '0 0 6px 0' }}>{p.purchasePrice} credits</p>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: p.status === 'COMPLETED' ? '#ecfdf5' : '#eff6ff',
                                color: p.status === 'COMPLETED' ? '#16a34a' : '#3b82f6'
                              }}>
                                {p.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Responses Tab */}
                {activeUserTab === 'responses' && (
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    {userResponses.length === 0 ? (
                      <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No responses found</div>
                    ) : (
                      <div>
                        {userResponses.map((r, idx) => (
                          <div key={idx} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px 0' }}>{r.noticeTitle}</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#6366f1' }}>{r.noticeType}</span>
                              <span style={{ fontSize: '13px', color: '#64748b' }}>{r.value || r.responseType}</span>
                              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>{new Date(r.respondedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Wallet Modal */}
        {showWalletModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Modify Wallet</h3>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button onClick={() => setWalletAction({...walletAction, type: 'ADD'})} className={`flex-1 py-3 rounded-lg font-medium ${walletAction.type === 'ADD' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}>
                    Add Credits
                  </button>
                  <button onClick={() => setWalletAction({...walletAction, type: 'DEDUCT'})} className={`flex-1 py-3 rounded-lg font-medium ${walletAction.type === 'DEDUCT' ? 'bg-red-600 text-white' : 'bg-gray-100'}`}>
                    Deduct Credits
                  </button>
                </div>
                <input type="number" placeholder="Amount" value={walletAction.amount} onChange={e => setWalletAction({...walletAction, amount: e.target.value})} className="w-full px-4 py-3 rounded-lg border" />
                <input type="text" placeholder="Description (optional)" value={walletAction.description} onChange={e => setWalletAction({...walletAction, description: e.target.value})} className="w-full px-4 py-3 rounded-lg border" />
                <div className="flex gap-2">
                  <button onClick={() => setShowWalletModal(false)} className="flex-1 py-3 rounded-lg border">Cancel</button>
                  <button onClick={handleWalletAction} disabled={saving} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50">
                    {saving ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notice Modal */}
        {showNoticeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">Send Notice</h3>
              <div className="space-y-4">
                <input type="text" placeholder="Title" value={noticeData.title} onChange={e => setNoticeData({...noticeData, title: e.target.value})} className="w-full px-4 py-3 rounded-lg border" />
                <textarea placeholder="Content" value={noticeData.content} onChange={e => setNoticeData({...noticeData, content: e.target.value})} rows={4} className="w-full px-4 py-3 rounded-lg border" />
                <select value={noticeData.type} onChange={e => setNoticeData({...noticeData, type: e.target.value})} className="w-full px-4 py-3 rounded-lg border bg-white">
                  <option value="NOTICE">Notice</option>
                  <option value="UPDATE">Update</option>
                  <option value="REQUIREMENT">Requirement</option>
                  <option value="PROMOTION">Promotion</option>
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={noticeData.responseRequired} onChange={e => setNoticeData({...noticeData, responseRequired: e.target.checked})} />
                  <span>Requires Response</span>
                </label>
                {noticeData.responseRequired && (
                  <select value={noticeData.responseType} onChange={e => setNoticeData({...noticeData, responseType: e.target.value})} className="w-full px-4 py-3 rounded-lg border bg-white">
                    <option value="NONE">None</option>
                    <option value="YES_NO">Yes/No</option>
                    <option value="RATING">Rating</option>
                    <option value="TEXT">Text</option>
                  </select>
                )}
                <div className="flex gap-2">
                  <button onClick={() => setShowNoticeModal(false)} className="flex-1 py-3 rounded-lg border">Cancel</button>
                  <button onClick={handleSendNotice} disabled={saving} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50">
                    {saving ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Task Modal */}
        {showTaskModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Create Task</h3>
              <div className="space-y-4">
                <input type="text" placeholder="Task Title" value={taskData.title} onChange={e => setTaskData({...taskData, title: e.target.value})} className="w-full px-4 py-3 rounded-lg border" />
                <textarea placeholder="Description" value={taskData.description} onChange={e => setTaskData({...taskData, description: e.target.value})} rows={3} className="w-full px-4 py-3 rounded-lg border" />
                <input type="number" placeholder="Credit Cost" value={taskData.creditCost} onChange={e => setTaskData({...taskData, creditCost: parseInt(e.target.value) || 0})} className="w-full px-4 py-3 rounded-lg border" />
                <select value={taskData.priority} onChange={e => setTaskData({...taskData, priority: e.target.value})} className="w-full px-4 py-3 rounded-lg border bg-white">
                  <option value="LOW">Low Priority</option>
                  <option value="NORMAL">Normal Priority</option>
                  <option value="HIGH">High Priority</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowTaskModal(false)} className="flex-1 py-3 rounded-lg border">Cancel</button>
                  <button onClick={handleCreateTask} disabled={saving} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50">
                    {saving ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plan Assignment Modal */}
        {showPlanModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold mb-4">Assign Plan</h3>
              <div className="space-y-4">
                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} className="w-full px-4 py-3 rounded-lg border bg-white">
                  <option value="">Select a plan...</option>
                  {plans.map(plan => (
                    <option key={plan.id} value={plan.id}>{plan.title} - {plan.creditCost || plan.offerPrice} credits</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowPlanModal(false)} className="flex-1 py-3 rounded-lg border">Cancel</button>
                  <button onClick={handleAssignPlan} disabled={saving || !selectedPlanId} className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50">
                    {saving ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Suspend Confirmation Modal */}
        {showSuspendModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>⚠️</div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '12px', textAlign: 'center' }}>Suspend User?</h3>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', textAlign: 'center', lineHeight: '1.6' }}>
                This user will be unable to log in until reactivated. Are you sure you want to suspend this account?
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowSuspendModal(false)} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>Cancel</button>
                <button onClick={() => handleSuspendUser(selectedUser.id)} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f59e0b', color: '#ffffff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'Suspending...' : 'Yes, Suspend'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
            <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '48px', textAlign: 'center', marginBottom: '16px' }}>🗑️</div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626', marginBottom: '12px', textAlign: 'center' }}>Delete User?</h3>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', textAlign: 'center', lineHeight: '1.6' }}>
                This will soft-delete the user account. The data will be retained but the user will be removed from the system. This action cannot be easily undone.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowDeleteModal(false)} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '2px solid #e2e8f0', backgroundColor: '#ffffff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>Cancel</button>
                <button onClick={() => handleDeleteUser(selectedUser.id)} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#dc2626', color: '#ffffff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create User Modal */}
        {showCreateUserModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateUserModal(false); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4 flex items-center justify-between">
                <span>➕ Create New User</span>
                <button onClick={() => setShowCreateUserModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Email / Identifier *</label>
                  <input 
                    type="email" 
                    placeholder="user@example.com" 
                    value={createUserData.identifier} 
                    onChange={e => setCreateUserData({...createUserData, identifier: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Password *</label>
                  <input 
                    type="password" 
                    placeholder="Min. 6 characters" 
                    value={createUserData.password} 
                    onChange={e => setCreateUserData({...createUserData, password: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Role *</label>
                  <select 
                    value={createUserData.role} 
                    onChange={e => setCreateUserData({...createUserData, role: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none bg-white cursor-pointer transition"
                  >
                    <option value="CLIENT">Client</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Full Name</label>
                  <input 
                    type="text" 
                    placeholder="John Doe" 
                    value={createUserData.name} 
                    onChange={e => setCreateUserData({...createUserData, name: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Phone</label>
                  <input 
                    type="tel" 
                    placeholder="+1 234 567 8900" 
                    value={createUserData.phone} 
                    onChange={e => setCreateUserData({...createUserData, phone: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Company</label>
                  <input 
                    type="text" 
                    placeholder="Company name" 
                    value={createUserData.company} 
                    onChange={e => setCreateUserData({...createUserData, company: e.target.value})} 
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-indigo-500 outline-none transition"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => setShowCreateUserModal(false)} 
                    className="flex-1 py-3 rounded-lg border-2 border-gray-200 font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreateUser} 
                    disabled={saving} 
                    className="flex-1 py-3 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-50 hover:bg-indigo-700 transition"
                  >
                    {saving ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast.show && (
          <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 10000, backgroundColor: toast.type === 'error' ? '#fef2f2' : '#ecfdf5', color: toast.type === 'error' ? '#dc2626' : '#16a34a', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', border: `2px solid ${toast.type === 'error' ? '#fecaca' : '#a7f3d0'}`, display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '400px', animation: 'slideIn 0.3s ease-out' }}>
            <span style={{ fontSize: '20px' }}>{toast.type === 'error' ? '❌' : '✓'}</span>
            <span style={{ fontSize: '14px', fontWeight: '600' }}>{toast.message}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
