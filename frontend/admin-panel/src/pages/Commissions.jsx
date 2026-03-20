import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function Commissions() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [userSummary, setUserSummary] = useState([]);
  const [overallTotal, setOverallTotal] = useState(0);
  const [overallTaskCount, setOverallTaskCount] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [error, setError] = useState('');
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  
  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedUser) params.append('userId', selectedUser);
      
      const res = await api.get(`/admin/commissions?${params.toString()}`);
      const data = res.data;
      
      setLogs(data.logs || []);
      setUserSummary(data.userSummary || []);
      setOverallTotal(data.overallTotal || 0);
      setOverallTaskCount(data.overallTaskCount || 0);
      setAdminUsers(data.adminUsers || []);
      setIsMainAdmin(data.isMainAdmin || false);
    } catch (err) {
      console.error('[COMMISSIONS] Fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load commissions');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedUser]);
  
  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);
  
  const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN')}`;
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };
  
  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedUser('');
  };

  // Quick date filters
  const setQuickFilter = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const setTodayFilter = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  };

  const setThisMonthFilter = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
  };
  
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
          💰 Commissions
        </h1>
        <p style={{ color: '#64748b', marginTop: '4px' }}>
          Track earnings from completed tasks
        </p>
      </div>
      
      {/* Total Earnings Card */}
      <div style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        color: '#fff',
      }}>
        <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '8px' }}>
          {isMainAdmin ? 'TOTAL EARNINGS (ALL USERS)' : 'YOUR TOTAL EARNINGS'}
        </div>
        <div style={{ fontSize: '36px', fontWeight: '700' }}>
          {formatCurrency(overallTotal)}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.8, marginTop: '8px' }}>
          {overallTaskCount} task{overallTaskCount !== 1 ? 's' : ''} completed
        </div>
      </div>
      
      {/* Filters */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
        border: '1px solid #e2e8f0',
      }}>
        {/* Quick Filter Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={setTodayFilter}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#475569',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Today
          </button>
          <button
            onClick={() => setQuickFilter(7)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#475569',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setQuickFilter(30)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#475569',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Last 30 Days
          </button>
          <button
            onClick={setThisMonthFilter}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              color: '#475569',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            This Month
          </button>
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '12px', 
          alignItems: 'flex-end' 
        }}>
          {/* Date Range */}
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
              }}
            />
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
              }}
            />
          </div>
          
          {/* User Filter (Main Admin Only) */}
          {isMainAdmin && (
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                User
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  backgroundColor: '#fff',
                }}
              >
                <option value="">All Users</option>
                {adminUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.identifier}</option>
                ))}
              </select>
            </div>
          )}
          
          {/* Clear Button */}
          {(startDate || endDate || selectedUser) && (
            <button
              onClick={clearFilters}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                color: '#64748b',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      
      {/* User Summary Table (Main Admin Only) */}
      {isMainAdmin && userSummary.length > 0 && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          border: '1px solid #e2e8f0',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 16px 0' }}>
            👥 User Summary
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>User</th>
                  <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Tasks</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Total Earnings</th>
                </tr>
              </thead>
              <tbody>
                {userSummary.map((u, idx) => (
                  <tr key={u.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontSize: '14px', fontWeight: '500' }}>
                      {u.userIdentifier}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 8px', fontSize: '14px', color: '#64748b' }}>
                      {u.taskCount}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', fontWeight: '600', color: '#10b981' }}>
                      {formatCurrency(u.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Error */}
      {error && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#dc2626',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}
      
      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Loading...
        </div>
      )}
      
      {/* Commission Logs */}
      {!loading && logs.length === 0 && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>No commissions yet</div>
          <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
            Commissions are recorded when assigned tasks are completed
          </div>
        </div>
      )}
      
      {!loading && logs.length > 0 && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid #e2e8f0',
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: '0 0 16px 0' }}>
            📋 Commission Log
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Date</th>
                  {isMainAdmin && (
                    <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>User</th>
                  )}
                  <th style={{ textAlign: 'left', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Task</th>
                  <th style={{ textAlign: 'center', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Type</th>
                  <th style={{ textAlign: 'right', padding: '12px 8px', fontSize: '12px', fontWeight: '600', color: '#64748b' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', fontSize: '14px', color: '#64748b' }}>
                      {formatDate(log.createdAt)}
                    </td>
                    {isMainAdmin && (
                      <td style={{ padding: '12px 8px', fontSize: '14px', fontWeight: '500' }}>
                        {log.userIdentifier}
                      </td>
                    )}
                    <td style={{ padding: '12px 8px', fontSize: '14px' }}>
                      <div style={{ fontWeight: '500', color: '#1e293b' }}>{log.taskTitle}</div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: log.commissionType === 'percentage' ? '#dbeafe' : '#fef3c7',
                        color: log.commissionType === 'percentage' ? '#1d4ed8' : '#b45309',
                      }}>
                        {log.commissionType === 'percentage' ? `${log.commissionValue}%` : `₹${log.commissionValue} Fixed`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 8px', fontSize: '14px', fontWeight: '600', color: '#10b981' }}>
                      {formatCurrency(log.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
