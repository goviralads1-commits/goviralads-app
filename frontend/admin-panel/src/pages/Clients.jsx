import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';
import { getPermissions } from '../services/authService';

const Clients = () => {
  const navigate = useNavigate();
  // SECURITY: default-deny until permissions load — destructive controls stay hidden for managers
  const isMainAdmin = getPermissions()?.isMainAdmin === true;
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUserData, setCreateUserData] = useState({ identifier: '', password: '', confirmPassword: '', name: '', phone: '', company: '' });
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);

  // Reset client data state
  const [resetTarget, setResetTarget] = useState(null); // { id, identifier, name }
  const [resetPhrase, setResetPhrase] = useState('');
  const [resetting, setResetting] = useState(false);

  // Permanent delete (single client) state — MAIN ADMIN ONLY
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, identifier, name }
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Fresh Start state — MAIN ADMIN ONLY
  const [freshStartModal, setFreshStartModal] = useState(false);
  const [freshPreview, setFreshPreview] = useState(null);
  const [freshPreviewLoading, setFreshPreviewLoading] = useState(false);
  const [freshPhrase, setFreshPhrase] = useState('');
  const [freshRunning, setFreshRunning] = useState(false);
  const [freshResult, setFreshResult] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/admin/users?role=CLIENT&limit=100');
        setClients(response.data.users || []);
      } catch (err) {
        console.error('Clients error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshClientList = async () => {
    const response = await api.get('/admin/users?role=CLIENT&limit=100');
    setClients(response.data.users || []);
  };

  const handleResetClient = async () => {
    if (!resetTarget) return;
    const expected = `RESET ${resetTarget.identifier}`;
    if (resetPhrase !== expected) {
      showToast(`Phrase must be exactly: ${expected}`, 'error');
      return;
    }
    try {
      setResetting(true);
      const res = await api.post(`/admin/clients/${resetTarget.id}/reset-data`, {
        confirmPhrase: resetPhrase,
      });
      showToast(res.data.message || 'Client data reset successfully');
      setResetTarget(null);
      setResetPhrase('');
      // Refresh list
      const response = await api.get('/admin/users?role=CLIENT&limit=100');
      setClients(response.data.users || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to reset client data', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    const expected = `DELETE ${deleteTarget.identifier}`;
    if (deletePhrase !== expected) {
      showToast(`Phrase must be exactly: ${expected}`, 'error');
      return;
    }
    try {
      setDeleting(true);
      const res = await api.delete(`/admin/client-data/clients/${deleteTarget.id}`, {
        data: { confirmPhrase: deletePhrase },
      });
      showToast(res.data.message || 'Client permanently deleted');
      setDeleteTarget(null);
      setDeletePhrase('');
      await refreshClientList();
    } catch (err) {
      showToast(err.response?.data?.error || 'Permanent deletion failed', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openFreshStart = async () => {
    setFreshStartModal(true);
    setFreshResult(null);
    setFreshPhrase('');
    setFreshPreview(null);
    setFreshPreviewLoading(true);
    try {
      const res = await api.get('/admin/client-data/preview');
      setFreshPreview(res.data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load fresh-start preview', 'error');
      setFreshStartModal(false);
    } finally {
      setFreshPreviewLoading(false);
    }
  };

  const closeFreshStart = () => {
    if (freshRunning) return; // never allow closing mid-deletion
    setFreshStartModal(false);
    setFreshPreview(null);
    setFreshPhrase('');
    setFreshResult(null);
  };

  const handleFreshStart = async () => {
    if (!freshPreview || freshPhrase !== freshPreview.freshStartPhrase) return;
    try {
      setFreshRunning(true);
      const res = await api.post('/admin/client-data/fresh-start', {
        confirmPhrase: freshPreview.freshStartPhrase,
      });
      setFreshResult(res.data);
      setFreshPhrase('');
      await refreshClientList();
    } catch (err) {
      showToast(err.response?.data?.error || 'Fresh start failed', 'error');
    } finally {
      setFreshRunning(false);
    }
  };

  const handleCreateClient = async () => {
    if (!createUserData.identifier.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createUserData.identifier.trim())) {
      showToast('Please enter a valid email', 'error');
      return;
    }
    if (!createUserData.password || createUserData.password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (createUserData.password !== createUserData.confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    try {
      setCreating(true);
      const { confirmPassword, ...userData } = createUserData;
      await api.post('/admin/users', { ...userData, role: 'CLIENT' });
      showToast('Client created successfully');
      setShowCreateModal(false);
      setCreateUserData({ identifier: '', password: '', confirmPassword: '', name: '', phone: '', company: '' });
      // Refresh list
      const response = await api.get('/admin/users?role=CLIENT&limit=100');
      setClients(response.data.users || []);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create client', 'error');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
              <div style={{ marginTop: '16px', fontSize: '14px', color: '#64748b' }}>Loading clients...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Clients</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0' }}>Manage your clients and their teams</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '12px 24px', borderRadius: '12px', border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            + Add Client
          </button>
        </div>

        {/* Clients Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {clients.map((client) => (
            <div
              key={client.id}
              onClick={() => navigate(`/clients/${client.id}`)}
              style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{client.name || client.identifier}</h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{client.identifier}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    backgroundColor: client.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                    color: client.status === 'ACTIVE' ? '#166534' : '#991b1b',
                  }}>
                    {client.status}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Joined</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                    {new Date(client.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>View</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#6366f1' }}>Details →</div>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setResetTarget({ id: client.id, identifier: client.identifier, name: client.name });
                }}
                style={{
                  marginTop: '12px', width: '100%', padding: '8px',
                  backgroundColor: '#fef2f2', color: '#dc2626',
                  fontSize: '12px', fontWeight: '600', borderRadius: '8px',
                  border: '1px solid #fecaca', cursor: 'pointer',
                }}
              >
                🗑 Reset Test Data
              </button>

              {isMainAdmin && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget({ id: client.id, identifier: client.identifier, name: client.name });
                  }}
                  style={{
                    marginTop: '8px', width: '100%', padding: '8px',
                    backgroundColor: '#7f1d1d', color: '#fff',
                    fontSize: '12px', fontWeight: '600', borderRadius: '8px',
                    border: '1px solid #7f1d1d', cursor: 'pointer',
                  }}
                >
                  ⛔ Permanently Delete Client
                </button>
              )}
            </div>
          ))}
        </div>

        {clients.length === 0 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px' }}>No Clients Yet</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px' }}>Create your first client to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              + Add First Client
            </button>
          </div>
        )}

        {/* MAIN ADMIN ONLY — Destructive client data controls (separated danger zone) */}
        {isMainAdmin && (
          <div style={{
            marginTop: '40px', backgroundColor: '#fff', borderRadius: '16px',
            border: '2px dashed #ef4444', padding: '24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#991b1b', margin: 0 }}>DANGER ZONE — Main Admin Only</h2>
            </div>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px 0' }}>
              Fresh Start permanently deletes <strong>all existing CLIENT accounts</strong> and their client-owned records
              (wallets, transactions, orders, tasks, tickets, notifications, etc.).
              ADMIN/staff accounts, Employees, Plans, marketplace and all business configuration remain untouched.
            </p>
            <button
              onClick={openFreshStart}
              style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none',
                background: 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)',
                color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(153, 27, 27, 0.3)',
              }}
            >
              🔥 Fresh Start — Remove All Existing Clients
            </button>
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      {showCreateModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px' }}>Add New Client</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Email *</label>
                <input
                  type="email"
                  value={createUserData.identifier}
                  onChange={e => setCreateUserData({ ...createUserData, identifier: e.target.value })}
                  placeholder="client@example.com"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Name</label>
                <input
                  type="text"
                  value={createUserData.name}
                  onChange={e => setCreateUserData({ ...createUserData, name: e.target.value })}
                  placeholder="Client name"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Password *</label>
                <input
                  type="password"
                  value={createUserData.password}
                  onChange={e => setCreateUserData({ ...createUserData, password: e.target.value })}
                  placeholder="Min 6 characters"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Confirm Password *</label>
                <input
                  type="password"
                  value={createUserData.confirmPassword}
                  onChange={e => setCreateUserData({ ...createUserData, confirmPassword: e.target.value })}
                  placeholder="Re-enter password"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Phone</label>
                <input
                  type="tel"
                  value={createUserData.phone}
                  onChange={e => setCreateUserData({ ...createUserData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creating}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}
              >
                {creating ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '12px',
          fontSize: '14px', fontWeight: '600', zIndex: 10000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)'
        }}>
          {toast.message}
        </div>
      )}

      {/* Reset Client Data Confirmation Modal */}
      {resetTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setResetTarget(null); setResetPhrase(''); } }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '16px' }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#dc2626', margin: 0 }}>RESET TEST CLIENT DATA</h2>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#991b1b', margin: 0, lineHeight: '1.5' }}>
                <strong>Target:</strong> {resetTarget.name ? `${resetTarget.name} (${resetTarget.identifier})` : resetTarget.identifier}
              </p>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '0 0 12px 0' }}>
              This will <strong>permanently delete</strong> all business data for this account:
              wallet balance, transactions, orders, tasks, commissions, invoices, recharge history, and all other client-specific records.
            </p>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px 0' }}>
              The login account itself will remain active. This <strong>cannot be undone</strong>.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                Type <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>RESET {resetTarget.identifier}</code> to confirm:
              </label>
              <input
                type="text"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                placeholder={`RESET ${resetTarget.identifier}`}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px',
                  border: `2px solid ${resetPhrase === `RESET ${resetTarget.identifier}` ? '#10b981' : '#e2e8f0'}`,
                  fontSize: '14px', fontWeight: '600', outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setResetTarget(null); setResetPhrase(''); }}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetClient}
                disabled={resetting || resetPhrase !== `RESET ${resetTarget.identifier}`}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: (resetting || resetPhrase !== `RESET ${resetTarget.identifier}`) ? 'not-allowed' : 'pointer',
                  opacity: (resetting || resetPhrase !== `RESET ${resetTarget.identifier}`) ? 0.5 : 1,
                }}
              >
                {resetting ? 'Resetting...' : '🗑 Reset All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Client Confirmation Modal — MAIN ADMIN ONLY */}
      {deleteTarget && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) { setDeleteTarget(null); setDeletePhrase(''); } }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '16px' }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '24px' }}>⛔</span>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#7f1d1d', margin: 0 }}>PERMANENT CLIENT DELETION</h2>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#991b1b', margin: 0, lineHeight: '1.5' }}>
                <strong>Target:</strong> {deleteTarget.name ? `${deleteTarget.name} (${deleteTarget.identifier})` : deleteTarget.identifier}
              </p>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', margin: '0 0 12px 0' }}>
              This <strong>permanently deletes the client account itself</strong> plus every record owned by it:
              wallet, wallet transactions, orders, tasks, tickets, notifications, invoices, receipts,
              subscription and recharge history, and device tokens.
            </p>
            <p style={{ fontSize: '13px', color: '#991b1b', fontWeight: '600', lineHeight: '1.6', margin: '0 0 16px 0' }}>
              Unlike "Reset Test Data", the login account is removed forever. This cannot be undone.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                Type <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>DELETE {deleteTarget.identifier}</code> to confirm:
              </label>
              <input
                type="text"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                placeholder={`DELETE ${deleteTarget.identifier}`}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '10px',
                  border: `2px solid ${deletePhrase === `DELETE ${deleteTarget.identifier}` ? '#10b981' : '#e2e8f0'}`,
                  fontSize: '14px', fontWeight: '600', outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeletePhrase(''); }}
                disabled={deleting}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={deleting || deletePhrase !== `DELETE ${deleteTarget.identifier}`}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                  background: 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)',
                  color: '#fff', fontSize: '14px', fontWeight: '600',
                  cursor: (deleting || deletePhrase !== `DELETE ${deleteTarget.identifier}`) ? 'not-allowed' : 'pointer',
                  opacity: (deleting || deletePhrase !== `DELETE ${deleteTarget.identifier}`) ? 0.5 : 1,
                }}
              >
                {deleting ? 'Deleting...' : '⛔ Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fresh Start Confirmation Modal — MAIN ADMIN ONLY */}
      {freshStartModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeFreshStart(); }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: '16px' }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            {freshResult ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '24px' }}>✅</span>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#166534', margin: 0 }}>FRESH START COMPLETE</h2>
                </div>
                <p style={{ fontSize: '14px', color: '#0f172a', fontWeight: '600', margin: '0 0 16px 0' }}>{freshResult.message}</p>
                {freshResult.verification && (
                  <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#166534', margin: '0 0 8px 0' }}>POST-DELETION VERIFICATION</p>
                    <ul style={{ fontSize: '12px', color: '#334155', margin: 0, paddingLeft: '18px', lineHeight: '1.8' }}>
                      <li>Captured clients remaining: <strong>{freshResult.verification.capturedClientsRemaining}</strong></li>
                      <li>Protected admin intact: <strong>{freshResult.verification.protectedAdminIntact ? 'YES' : 'CHECK FAILED'}</strong></li>
                      <li>Employees intact: <strong>{freshResult.verification.employeesIntact}</strong></li>
                      <li>Marketplace plans intact: <strong>{freshResult.verification.marketplacePlansIntact}</strong></li>
                      <li>Categories intact: <strong>{freshResult.verification.categoriesIntact}</strong></li>
                      <li>Credit plans intact: <strong>{freshResult.verification.creditPlansIntact}</strong></li>
                      <li>Notice embedded client refs remaining (documents kept): <strong>{freshResult.verification.noticeReferencesRemaining?.responses + freshResult.verification.noticeReferencesRemaining?.viewedBy + freshResult.verification.noticeReferencesRemaining?.targetClients || 0}</strong></li>
                    </ul>
                  </div>
                )}
                <button
                  onClick={closeFreshStart}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '24px' }}>🔥</span>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#7f1d1d', margin: 0 }}>FRESH START — REMOVE ALL EXISTING CLIENTS</h2>
                </div>

                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '13px', color: '#991b1b', margin: 0, lineHeight: '1.6' }}>
                    Delete all existing CLIENT accounts and their client-owned records.
                    ADMIN/staff and business data will remain.
                  </p>
                </div>

                {freshPreviewLoading && (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>Loading exact counts…</p>
                )}

                {freshPreview && (
                  <>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                      <p style={{ fontSize: '13px', margin: '0 0 10px 0', color: '#0f172a' }}>
                        <strong style={{ fontSize: '20px', color: '#dc2626' }}>{freshPreview.clientCount}</strong>
                        <strong> CLIENT account(s)</strong> will be permanently deleted.
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px', color: '#475569' }}>
                        <span>Wallets: <strong>{freshPreview.before.wallets}</strong></span>
                        <span>Wallet transactions: <strong>{freshPreview.before.walletTransactions}</strong></span>
                        <span>Orders: <strong>{freshPreview.before.orders}</strong></span>
                        <span>Client tasks: <strong>{freshPreview.before.clientTasks}</strong></span>
                        <span>Tickets: <strong>{freshPreview.before.tickets}</strong></span>
                        <span>Notifications: <strong>{freshPreview.before.notifications}</strong></span>
                        <span>Invoices: <strong>{freshPreview.before.invoices}</strong></span>
                        <span>Receipts: <strong>{freshPreview.before.receipts}</strong></span>
                        <span>Subscriptions: <strong>{freshPreview.before.userSubscriptions}</strong></span>
                        <span>Recharge requests: <strong>{freshPreview.before.rechargeRequests}</strong></span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#64748b', margin: '10px 0 0 0' }}>
                        Protected admin verified: <code>{freshPreview.protectedAdminId}</code> — excluded from every deletion set.
                        Clients signing up after you confirm are never affected (deletion uses the captured ID snapshot only).
                      </p>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                        Type <code style={{ backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{freshPreview.freshStartPhrase}</code> to confirm:
                      </label>
                      <input
                        type="text"
                        value={freshPhrase}
                        onChange={(e) => setFreshPhrase(e.target.value)}
                        placeholder={freshPreview.freshStartPhrase}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: '10px',
                          border: `2px solid ${freshPhrase === freshPreview.freshStartPhrase ? '#10b981' : '#e2e8f0'}`,
                          fontSize: '14px', fontWeight: '600', outline: 'none', boxSizing: 'border-box',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={closeFreshStart}
                    disabled={freshRunning}
                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: freshRunning ? 'not-allowed' : 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFreshStart}
                    disabled={freshRunning || freshPreviewLoading || !freshPreview || freshPhrase !== (freshPreview && freshPreview.freshStartPhrase)}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                      background: 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)',
                      color: '#fff', fontSize: '14px', fontWeight: '700',
                      cursor: (freshRunning || freshPreviewLoading || !freshPreview || freshPhrase !== freshPreview.freshStartPhrase) ? 'not-allowed' : 'pointer',
                      opacity: (freshRunning || freshPreviewLoading || !freshPreview || freshPhrase !== freshPreview.freshStartPhrase) ? 0.5 : 1,
                    }}
                  >
                    {freshRunning ? 'Deleting all captured clients...' : '🔥 Execute Fresh Start'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default Clients;