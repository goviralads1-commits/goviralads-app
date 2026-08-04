import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const EmployeeDetail = () => {
  const { employeeId } = useParams();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Assigned clients
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  // Commission history
  const [commissions, setCommissions] = useState([]);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [commissionLoading, setCommissionLoading] = useState(false);

  // Redeem history
  const [redeems, setRedeems] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);

  // Roles lookup
  const [roles, setRoles] = useState([]);

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch employee detail
  const fetchEmployee = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/employees/${employeeId}`);
      setEmployee(res.data.employee);
    } catch (err) {
      showToast('Failed to load employee', 'error');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get('/admin/employees/roles');
      setRoles(res.data.roles || []);
    } catch (err) { /* silent */ }
  }, []);

  // Fetch assigned clients
  const fetchAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    try {
      const res = await api.get(`/admin/employees/${employeeId}/assignments`);
      setAssignments(res.data.assignments || []);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [employeeId]);

  // Fetch commission history
  const fetchCommissions = useCallback(async () => {
    if (!employee?.userId) return;
    setCommissionLoading(true);
    try {
      const res = await api.get('/admin/commissions', { params: { userId: employee.userId } });
      setCommissions(res.data.logs || []);
      setCommissionTotal(res.data.overallTotal || 0);
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
    } finally {
      setCommissionLoading(false);
    }
  }, [employee?.userId]);

  // Fetch redeem history
  const fetchRedeems = useCallback(async () => {
    if (!employee?.userId) return;
    setRedeemLoading(true);
    try {
      const res = await api.get('/admin/earnings/redeem-requests', { params: { userId: employee.userId } });
      setRedeems(res.data.requests || []);
    } catch (err) {
      console.error('Failed to fetch redeems:', err);
    } finally {
      setRedeemLoading(false);
    }
  }, [employee?.userId]);

  useEffect(() => {
    fetchEmployee();
    fetchRoles();
    fetchAssignments();
  }, [fetchEmployee, fetchRoles, fetchAssignments]);

  useEffect(() => {
    if (activeTab === 'commission' && employee) fetchCommissions();
    if (activeTab === 'redeems' && employee) fetchRedeems();
  }, [activeTab, employee, fetchCommissions, fetchRedeems]);

  const getRoleName = (roleKey) => {
    const role = roles.find(r => r.key === roleKey);
    return role ? role.value.replace(/_/g, ' ') : roleKey || 'Unknown';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ color: '#64748b', marginTop: '16px' }}>Loading employee...</p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!employee) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h2 style={{ color: '#0f172a', margin: '0 0 8px' }}>Employee Not Found</h2>
          <p style={{ color: '#64748b', margin: '0 0 24px' }}>This employee may have been deleted.</p>
          <button onClick={() => navigate('/employees')} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Back to Employees
          </button>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'clients', label: 'Assigned Clients', count: assignments.length },
    { key: 'commission', label: 'Commission' },
    { key: 'redeems', label: 'Redeems' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Back button */}
        <button onClick={() => navigate('/employees')} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#6366f1', fontSize: '14px', fontWeight: '500', cursor: 'pointer', padding: '0 0 16px 0' }}>
          ← Back to Employees
        </button>

        {/* Header Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>{employee.name}</h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px' }}>{employee.identifier}</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backgroundColor: employee.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: employee.status === 'ACTIVE' ? '#166534' : '#991b1b' }}>
                  {employee.status}
                </span>
                <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                  {getRoleName(employee.defaultRole)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ padding: '12px 20px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: employee.commissionSettings?.enabled ? '#166534' : '#94a3b8' }}>
                  {employee.commissionSettings?.enabled ? `${employee.commissionSettings.percentage}%` : 'Off'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Commission</div>
              </div>
              <div style={{ padding: '12px 20px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', minWidth: '100px' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>{assignments.length}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Clients</div>
              </div>
            </div>
          </div>
          {employee.phone && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: '12px 0 0' }}>📱 {employee.phone}</p>
          )}
          {employee.notes && (
            <p style={{ fontSize: '13px', color: '#64748b', margin: '8px 0 0' }}>📝 {employee.notes}</p>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: activeTab === tab.key ? '600' : '400',
                color: activeTab === tab.key ? '#6366f1' : '#64748b',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: '-2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span style={{ backgroundColor: '#ede9fe', color: '#6366f1', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 16px' }}>Employee Details</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Full Name</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{employee.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Email / ID</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{employee.identifier}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Phone</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{employee.phone || '-'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Designation</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{getRoleName(employee.defaultRole)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Status</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: employee.status === 'ACTIVE' ? '#166534' : '#991b1b' }}>{employee.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Joined</span>
                  <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{new Date(employee.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 16px' }}>Commission Settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Commission Enabled</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: employee.commissionSettings?.enabled ? '#166534' : '#94a3b8' }}>
                    {employee.commissionSettings?.enabled ? 'Yes' : 'No'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>Percentage</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                    {employee.commissionSettings?.enabled ? `${employee.commissionSettings.percentage}%` : '-'}
                  </span>
                </div>
                {employee.commissionSettings?.notes && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>Notes</span>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{employee.commissionSettings.notes}</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Total Earned (Ledger Balance)</div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#166534' }}>
                  ₹{commissionTotal.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 16px' }}>Linked User Account</h3>
              {employee.userId ? (
                <>
                  <div style={{ padding: '12px', backgroundColor: '#dcfce7', borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>✓</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>User Account Linked</div>
                        <div style={{ fontSize: '12px', color: '#166534', marginTop: '2px' }}>User ID: {employee.userId}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Unlink User from this Employee?')) return;
                      try {
                        await api.patch(`/admin/employees/${employeeId}/unlink-user`);
                        showToast('User unlinked successfully');
                        fetchEmployee();
                      } catch (err) {
                        showToast(err.response?.data?.error || 'Failed to unlink user', 'error');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: '1px solid #fef3c7',
                      backgroundColor: '#fff',
                      color: '#d97706',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Unlink User
                  </button>
                </>
              ) : (
                <>
                  <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>No User Account Linked</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Link an existing User account to enable commission tracking for this Employee</div>
                  </div>
                  <button
                    onClick={async () => {
                      const userId = prompt('Enter User ID to link (find it in Users page):');
                      if (!userId || !userId.trim()) return;
                      try {
                        await api.patch(`/admin/employees/${employeeId}/link-user`, { userId: userId.trim() });
                        showToast('User linked successfully');
                        fetchEmployee();
                      } catch (err) {
                        showToast(err.response?.data?.error || 'Failed to link user', 'error');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Link User Account
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {assignmentsLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: '#64748b', fontSize: '13px' }}>Loading clients...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>👥</div>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No clients assigned yet</p>
                <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>Assign this employee to clients from the Client Detail page</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Client</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Role</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Assigned</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: '500', color: '#0f172a' }}>{a.clientName}</div>
                          {a.clientIdentifier && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.clientIdentifier}</div>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', backgroundColor: '#ede9fe', color: '#5b21b6', padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                            {getRoleName(a.role)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: '12px' }}>
                          {new Date(a.assignedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => navigate(`/clients/${a.clientId}`)}
                            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '500', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff', color: '#6366f1', cursor: 'pointer' }}
                          >
                            View Client
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'commission' && (
          <div>
            {/* Commission summary */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>Total Commission Earned</div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#166534' }}>₹{commissionTotal.toLocaleString('en-IN')}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{commissions.length} commission entries</div>
            </div>

            {/* Commission logs */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {commissionLoading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ color: '#64748b', fontSize: '13px' }}>Loading commissions...</p>
                </div>
              ) : commissions.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>💰</div>
                  <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No commission entries yet</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Task</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Type</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Amount</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>
                            {log.taskTitle || 'Unknown Task'}
                            {log.taskId && (
                              <div>
                                <button
                                  onClick={() => navigate(`/tasks/${log.taskId}`)}
                                  style={{ fontSize: '11px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                >
                                  View Task →
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', backgroundColor: '#f0fdf4', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontWeight: '500' }}>
                              {log.commissionType || 'COMMISSION'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#166534' }}>
                            ₹{log.amount?.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>
                            {new Date(log.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'redeems' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {redeemLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: '#64748b', fontSize: '13px' }}>Loading redeems...</p>
              </div>
            ) : redeems.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎁</div>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No redeem requests found</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Amount</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Method</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Note / Ref</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redeems.map(req => {
                      const statusColors = {
                        PENDING: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
                        APPROVED_WALLET: { bg: '#dcfce7', text: '#166534', label: 'Approved (Wallet)' },
                        APPROVED_EXTERNAL: { bg: '#dbeafe', text: '#1e40af', label: 'Approved (External)' },
                        REJECTED: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
                      };
                      const sc = statusColors[req.status] || { bg: '#f1f5f9', text: '#475569', label: req.status };
                      return (
                        <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                            ₹{req.requestedAmount?.toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', backgroundColor: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                            {req.payoutMethod || '-'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.transactionReference && <span>Ref: {req.transactionReference} </span>}
                            {req.adminNote || '-'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>
                            {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px', borderRadius: '10px',
          backgroundColor: toast.type === 'error' ? '#dc2626' : '#16a34a', color: '#fff', fontSize: '14px',
          fontWeight: '500', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
        }}>
          {toast.message}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default EmployeeDetail;
