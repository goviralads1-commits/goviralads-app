import React, { useState, useEffect, useCallback } from 'react';
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

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [view, setView] = useState('summary'); // 'summary' | 'logs'

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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 24px 0' }}>Earnings & Commissions</h1>

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
                {adminUsers.map(u => <option key={u.id} value={u.id}>{u.identifier}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setView('summary')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: view === 'summary' ? '2px solid #6366f1' : '1px solid #e2e8f0', backgroundColor: view === 'summary' ? '#eef2ff' : '#fff', color: view === 'summary' ? '#6366f1' : '#64748b', cursor: 'pointer' }}>By User</button>
            <button onClick={() => setView('logs')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: view === 'logs' ? '2px solid #6366f1' : '1px solid #e2e8f0', backgroundColor: view === 'logs' ? '#eef2ff' : '#fff', color: view === 'logs' ? '#6366f1' : '#64748b', cursor: 'pointer' }}>All Logs</button>
          </div>
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
        ) : (
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
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>₹{(l.amount || 0).toLocaleString('en-IN')}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', backgroundColor: '#f0fdf4', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {l.commissionType === 'percentage' ? `${l.commissionValue}%` : `₹${l.commissionValue}`}
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
        )}
      </div>
    </div>
  );
};

export default Earnings;
