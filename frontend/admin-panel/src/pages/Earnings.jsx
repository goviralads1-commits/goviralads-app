import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const Earnings = () => {
  const [logs, setLogs] = useState([]);
  const [userSummary, setUserSummary] = useState([]);
  const [overallTotal, setOverallTotal] = useState(0);
  const [overallTaskCount, setOverallTaskCount] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerBalances, setLedgerBalances] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('');

  // Adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjUserId, setAdjUserId] = useState('');
  const [adjType, setAdjType] = useState('ADMIN_BONUS');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Config state
  const [earningsConfig, setEarningsConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [view, setView] = useState('summary'); // 'summary' | 'logs' | 'ledger'

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedUser) params.userId = selectedUser;
      const res = await api.get('/admin/commissions', { params });
      const d = res.data || {};
      setLogs(d.logs || []);
      setUserSummary(d.userSummary || []);
      setOverallTotal(d.overallTotal || 0);
      setOverallTaskCount(d.overallTaskCount || 0);
      setAdminUsers(d.adminUsers || []);
      setIsMainAdmin(d.isMainAdmin || false);
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch ledger data
  const fetchLedger = useCallback(async () => {
    setLedgerLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedUser) params.userId = selectedUser;
      if (ledgerTypeFilter) params.type = ledgerTypeFilter;
      const res = await api.get('/admin/earnings/ledger', { params });
      setLedgerEntries(res.data?.entries || []);
      setLedgerBalances(res.data?.userBalances || []);
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [startDate, endDate, selectedUser, ledgerTypeFilter]);

  useEffect(() => {
    if (view === 'ledger') fetchLedger();
  }, [view, fetchLedger]);

  // Fetch earnings config
  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/admin/earnings/config');
      setEarningsConfig(res.data?.config || null);
    } catch (err) {
      console.error('Failed to fetch earnings config:', err);
    }
  }, []);

  useEffect(() => {
    if (view === 'ledger' && !earningsConfig) fetchConfig();
  }, [view, earningsConfig, fetchConfig]);

  const handleConfigSave = async () => {
    if (!earningsConfig) return;
    setConfigLoading(true);
    try {
      const res = await api.put('/admin/earnings/config', earningsConfig);
      setEarningsConfig(res.data?.config || earningsConfig);
      setToast({ type: 'success', message: 'Earnings config updated.' });
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update config.' });
    } finally {
      setConfigLoading(false);
    }
  };

  // Handle adjustment
  const handleAdjust = async () => {
    if (!adjUserId || !adjAmount || Number(adjAmount) <= 0) return;
    setAdjLoading(true);
    try {
      const res = await api.post('/admin/earnings/adjust', {
        userId: adjUserId,
        type: adjType,
        amount: Number(adjAmount),
        note: adjNote,
      });
      setToast({ type: 'success', message: `Adjustment created. New balance: \u20b9${res.data.newBalance}` });
      setShowAdjustModal(false);
      setAdjUserId(''); setAdjAmount(''); setAdjNote('');
      if (view === 'ledger') fetchLedger();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to create adjustment.' });
    } finally {
      setAdjLoading(false);
    }
  };

  // Auto-clear toast
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 24px 0' }}>Earnings & Commissions</h1>

        {/* Earnings Redeem Settings - ALWAYS VISIBLE FOR MAIN ADMIN */}
        {isMainAdmin && earningsConfig && (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '2px solid #7c3aed', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#7c3aed', margin: 0 }}>🏦 Earnings Redeem Settings</h3>
              <button onClick={handleConfigSave} disabled={configLoading} style={{ padding: '8px 20px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', border: 'none', backgroundColor: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: configLoading ? 0.6 : 1 }}>
                {configLoading ? 'Saving...' : '💾 Save Settings'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: '500' }}>
                <input type="checkbox" checked={earningsConfig.redeemEnabled || false} onChange={(e) => setEarningsConfig({ ...earningsConfig, redeemEnabled: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                Redeem Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: '500' }}>
                <input type="checkbox" checked={earningsConfig.walletConversionEnabled || false} onChange={(e) => setEarningsConfig({ ...earningsConfig, walletConversionEnabled: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                Wallet Conversion
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', fontWeight: '500' }}>
                <input type="checkbox" checked={earningsConfig.externalPayoutEnabled || false} onChange={(e) => setEarningsConfig({ ...earningsConfig, externalPayoutEnabled: e.target.checked })} style={{ width: '16px', height: '16px' }} />
                External Payout
              </label>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Minimum Redeem Amount (₹)</label>
                <input type="number" value={earningsConfig.minimumRedeemAmount || ''} onChange={(e) => setEarningsConfig({ ...earningsConfig, minimumRedeemAmount: Number(e.target.value) })} style={{ padding: '8px 12px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '140px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Maximum Redeem Amount (₹)</label>
                <input type="number" value={earningsConfig.maximumRedeemAmount || ''} onChange={(e) => setEarningsConfig({ ...earningsConfig, maximumRedeemAmount: Number(e.target.value) })} style={{ padding: '8px 12px', fontSize: '14px', border: '1px solid #e2e8f0', borderRadius: '8px', width: '140px' }} />
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', fontWeight: '600' }}>Total Earned</p>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', margin: 0 }}>₹{overallTotal.toLocaleString('en-IN')}</p>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', fontWeight: '600' }}>Tasks with Commission</p>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#334155', margin: 0 }}>{overallTaskCount}</p>
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', fontWeight: '600' }}>Users Earning</p>
            <p style={{ fontSize: '24px', fontWeight: '800', color: '#334155', margin: 0 }}>{userSummary.length}</p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
          </div>
          {isMainAdmin && adminUsers.length > 0 && (
            <div>
              <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>User</label>
              <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '160px' }}>
                <option value="">All Users</option>
                {adminUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.identifier}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setView('summary')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: view === 'summary' ? '2px solid #6366f1' : '1px solid #e2e8f0', backgroundColor: view === 'summary' ? '#eef2ff' : '#fff', color: view === 'summary' ? '#6366f1' : '#64748b', cursor: 'pointer' }}>By User</button>
            <button onClick={() => setView('logs')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: view === 'logs' ? '2px solid #6366f1' : '1px solid #e2e8f0', backgroundColor: view === 'logs' ? '#eef2ff' : '#fff', color: view === 'logs' ? '#6366f1' : '#64748b', cursor: 'pointer' }}>All Logs</button>
            <button onClick={() => setView('ledger')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: view === 'ledger' ? '2px solid #22c55e' : '1px solid #e2e8f0', backgroundColor: view === 'ledger' ? '#f0fdf4' : '#fff', color: view === 'ledger' ? '#16a34a' : '#64748b', cursor: 'pointer' }}>Ledger</button>
            <Link to="/earnings-redeems" style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#7c3aed', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>Redeems</Link>
          </div>
          {view === 'ledger' && (
            <select value={ledgerTypeFilter} onChange={(e) => setLedgerTypeFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <option value="">All Types</option>
              <option value="COMMISSION_EARNED">Commission</option>
              <option value="ADMIN_BONUS">Bonus</option>
              <option value="ADMIN_DEDUCT">Deduction</option>
              <option value="ADMIN_CORRECTION">Correction</option>
            </select>
          )}
          {isMainAdmin && (
            <button onClick={() => setShowAdjustModal(true)} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#6366f1', cursor: 'pointer', marginLeft: 'auto' }}>+ Adjust</button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Loading commissions...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : view === 'summary' ? (
          /* User Summary View */
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>User</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Tasks</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Total Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {userSummary.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No commission data found.</td></tr>
                  ) : userSummary.map((u) => (
                    <tr key={u.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>{u.userIdentifier}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b' }}>{u.taskCount}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>₹{u.totalAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : view === 'logs' ? (
          /* All Logs View */
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>User</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Task</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Type</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No commission logs found.</td></tr>
                  ) : logs.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>{l.userIdentifier || 'Unknown'}</td>
                      <td style={{ padding: '12px 16px', color: '#475569', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.taskTitle || '-'}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>{String.fromCharCode(8377)}{(l.amount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', backgroundColor: '#f0fdf4', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {l.commissionType === 'percentage' ? `${l.commissionValue}%` : `${String.fromCharCode(8377)}${l.commissionValue}`}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>
                        {l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Ledger View */
          ledgerLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Loading ledger...</p>
            </div>
          ) : (
            <>
              {/* User Balances */}
              {ledgerBalances.length > 0 && !selectedUser && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '16px' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#15803d', margin: 0 }}>User Balances (Ledger)</p>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>User</th>
                          <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Entries</th>
                          <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerBalances.map(u => (
                          <tr key={u.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 16px', fontWeight: '500', color: '#0f172a' }}>{u.userIdentifier}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b' }}>{u.entries}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>{String.fromCharCode(8377)}{u.balance.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Ledger Entries */}
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>User</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Type</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Amount</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Note</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerEntries.length === 0 ? (
                        <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No ledger entries found.</td></tr>
                      ) : ledgerEntries.map(e => (
                        <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>{e.userIdentifier}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', backgroundColor: e.type === 'COMMISSION_EARNED' ? '#f0fdf4' : e.type === 'ADMIN_DEDUCT' ? '#fef2f2' : '#eff6ff', color: e.type === 'COMMISSION_EARNED' ? '#15803d' : e.type === 'ADMIN_DEDUCT' ? '#dc2626' : '#1d4ed8' }}>
                              {e.type.replace('_', ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: e.amount >= 0 ? '#16a34a' : '#dc2626' }}>{e.amount >= 0 ? '+' : ''}{String.fromCharCode(8377)}{Math.abs(e.amount).toLocaleString('en-IN')}</td>
                          <td style={{ padding: '12px 16px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )
        )}

        {/* Adjustment Modal */}
        {showAdjustModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', margin: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 20px 0' }}>Earnings Adjustment</h3>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>User</label>
                <select value={adjUserId} onChange={(e) => setAdjUserId(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }}>
                  <option value="">Select user...</option>
                  {adminUsers.map(u => <option key={u.id} value={u.id}>{u.name || u.identifier}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Type</label>
                <select value={adjType} onChange={(e) => setAdjType(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }}>
                  <option value="ADMIN_BONUS">Bonus (+)</option>
                  <option value="ADMIN_DEDUCT">Deduct (-)</option>
                  <option value="ADMIN_CORRECTION">Correction</option>
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Amount</label>
                <input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="Enter amount" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Note / Reason</label>
                <input type="text" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} placeholder="Reason for adjustment" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAdjustModal(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleAdjust} disabled={adjLoading || !adjUserId || !adjAmount} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: adjLoading ? 0.6 : 1 }}>{adjLoading ? 'Saving...' : 'Submit'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '10px', backgroundColor: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', fontSize: '14px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Earnings;
