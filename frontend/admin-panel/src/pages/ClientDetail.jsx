import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const ClientDetail = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  // Client data states
  const [client, setClient] = useState(null);
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Team assignment states
  const [employeeAssignments, setEmployeeAssignments] = useState([]);
  const [employeeAssignmentsLoading, setEmployeeAssignmentsLoading] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [roleAssignments, setRoleAssignments] = useState({});
  const [roleSaving, setRoleSaving] = useState({});
  const [addingEmployeeForRole, setAddingEmployeeForRole] = useState(null);
  const [newEmployeeSelection, setNewEmployeeSelection] = useState({});
  const [editingCommission, setEditingCommission] = useState(null);

  // Toast state
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    fetchClientData();
    fetchEmployeeAssignments();
    fetchAvailableEmployees();
    fetchAvailableRoles();
  }, [clientId]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const [detailRes, tasksRes, walletRes, purchasesRes] = await Promise.all([
        api.get(`/admin/users/${clientId}`),
        api.get(`/admin/users/${clientId}/tasks`),
        api.get(`/admin/users/${clientId}/wallet`),
        api.get(`/admin/users/${clientId}/purchases`),
      ]);
      setClient(detailRes.data.user);
      setStats(detailRes.data.stats);
      setTasks(tasksRes.data.tasks);
      setWallet({ balance: walletRes.data.balance, transactions: walletRes.data.transactions });
      setPurchases(purchasesRes.data.purchases);
    } catch (err) {
      showToast('Failed to load client data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeAssignments = async () => {
    try {
      setEmployeeAssignmentsLoading(true);
      const res = await api.get(`/admin/employees/clients/${clientId}/assignments`);
      const assignments = res.data.assignments || [];
      setEmployeeAssignments(assignments);
      // Build roleAssignments map
      const roleMap = {};
      assignments.forEach(a => {
        if (a.role && a.status === 'ACTIVE') {
          if (!roleMap[a.role]) roleMap[a.role] = [];
          roleMap[a.role].push({
            employeeId: a.employee?.id || '',
            assignmentId: a.id,
            employee: a.employee,
            commissionSettings: a.commissionSettings || { enabled: false, percentage: 0 },
          });
        }
      });
      setRoleAssignments(roleMap);
    } catch (err) {
      setEmployeeAssignments([]);
      setRoleAssignments({});
    } finally {
      setEmployeeAssignmentsLoading(false);
    }
  };

  const fetchAvailableEmployees = async () => {
    try {
      const res = await api.get('/admin/employees?status=ACTIVE&linkedToUser=true');
      setAvailableEmployees(res.data.employees || []);
    } catch (err) {
      setAvailableEmployees([]);
    }
  };

  const fetchAvailableRoles = async () => {
    try {
      const res = await api.get('/admin/employees/roles');
      setAvailableRoles(res.data.roles || []);
    } catch (err) {
      setAvailableRoles([]);
    }
  };

  const handleRoleAssignment = async (roleKey, employeeId) => {
    if (!employeeId) return;
    const currentAssignments = roleAssignments[roleKey] || [];
    if (currentAssignments.some(a => a.employeeId === employeeId)) {
      showToast('Employee already assigned to this role', 'error');
      return;
    }
    try {
      setRoleSaving(prev => ({ ...prev, [roleKey]: true }));
      const res = await api.post(`/admin/employees/clients/${clientId}/assignments`, { employeeId });
      const newAssignment = res.data.assignment;
      setRoleAssignments(prev => ({
        ...prev,
        [roleKey]: [...(prev[roleKey] || []), {
          employeeId,
          assignmentId: newAssignment?.id || '',
          employee: newAssignment?.employee,
          commissionSettings: newAssignment?.commissionSettings || { enabled: false, percentage: 0 },
        }]
      }));
      showToast('Employee assigned');
      setAddingEmployeeForRole(null);
      setNewEmployeeSelection(prev => ({ ...prev, [roleKey]: '' }));
      fetchEmployeeAssignments();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to assign employee', 'error');
    } finally {
      setRoleSaving(prev => ({ ...prev, [roleKey]: false }));
    }
  };

  const handleRemoveEmployeeFromRole = async (roleKey, assignmentId) => {
    try {
      setRoleSaving(prev => ({ ...prev, [roleKey]: true }));
      await api.delete(`/admin/employees/clients/${clientId}/assignments/${assignmentId}`);
      setRoleAssignments(prev => ({
        ...prev,
        [roleKey]: (prev[roleKey] || []).filter(a => a.assignmentId !== assignmentId)
      }));
      showToast('Employee unassigned');
      fetchEmployeeAssignments();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to unassign employee', 'error');
    } finally {
      setRoleSaving(prev => ({ ...prev, [roleKey]: false }));
    }
  };

  const handleUpdateCommission = async () => {
    if (!editingCommission) return;
    const { assignmentId, roleKey, enabled, percentage } = editingCommission;
    const pct = Number(percentage);
    if (enabled && (isNaN(pct) || pct < 0 || pct > 100)) {
      showToast('Percentage must be between 0 and 100', 'error');
      return;
    }
    setEditingCommission(prev => ({ ...prev, saving: true }));
    try {
      const payload = { commissionSettings: { enabled, percentage: enabled ? pct : 0 } };
      const res = await api.patch(`/admin/employees/clients/${clientId}/assignments/${assignmentId}`, payload);
      const updated = res.data.assignment?.commissionSettings || payload.commissionSettings;
      setRoleAssignments(prev => ({
        ...prev,
        [roleKey]: (prev[roleKey] || []).map(a =>
          a.assignmentId === assignmentId ? { ...a, commissionSettings: updated } : a
        )
      }));
      setEditingCommission(null);
      showToast(enabled ? `Commission override set to ${pct}%` : 'Commission override removed');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update commission', 'error');
    } finally {
      setEditingCommission(prev => prev ? { ...prev, saving: false } : null);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b' }}>Loading client...</p>
          </div>
        </div>
      </>
    );
  }

  if (!client) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
          <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '16px' }}>
            <p style={{ color: '#64748b' }}>Client not found</p>
            <button onClick={() => navigate('/clients')} style={{ marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer' }}>
              Back to Clients
            </button>
          </div>
        </div>
      </>
    );
  }

  const totalTeamMembers = employeeAssignments.filter(a => a.status === 'ACTIVE').length;

  return (
    <>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Back Button */}
        <button onClick={() => navigate('/clients')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '14px', fontWeight: '500', color: '#64748b', cursor: 'pointer', marginBottom: '20px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Clients
        </button>

        {/* Client Header Card */}
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', borderRadius: '20px', padding: '32px', marginBottom: '24px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 8px' }}>{client.name || client.identifier}</h1>
              <p style={{ fontSize: '14px', opacity: 0.9, margin: '0 0 4px' }}>{client.identifier}</p>
              <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>Joined {new Date(client.createdAt).toLocaleDateString()}</p>
            </div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats?.walletBalance || wallet.balance}</div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Credits</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats?.activeTasks || 0}</div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Active Tasks</div>
              </div>
              <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: '700' }}>{totalTeamMembers}</div>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Team</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
          {['overview', 'team', 'tasks', 'purchases'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeTab === tab ? '#6366f1' : '#fff',
                color: activeTab === tab ? '#fff' : '#64748b',
                boxShadow: activeTab === tab ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px' }}>Account Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Email</div>
                <div style={{ fontSize: '14px', color: '#0f172a' }}>{client.identifier}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Phone</div>
                <div style={{ fontSize: '14px', color: '#0f172a' }}>{client.phone || client.profile?.phone || 'Not provided'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Status</div>
                <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', backgroundColor: client.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: client.status === 'ACTIVE' ? '#166534' : '#991b1b' }}>
                  {client.status}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Company</div>
                <div style={{ fontSize: '14px', color: '#0f172a' }}>{client.company || client.profile?.company || 'Not provided'}</div>
              </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '24px 0 16px' }}>Activity Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6' }}>{tasks.length}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Total Tasks</div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#22c55e' }}>{wallet.balance}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Wallet Balance</div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#6366f1' }}>{purchases.length}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Purchases</div>
              </div>
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#8b5cf6' }}>{totalTeamMembers}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Team Members</div>
              </div>
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>Assigned Team</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Assign employees to this client. Commission uses each employee's default, or an assignment-level override if configured.</p>
            </div>

            {employeeAssignmentsLoading ? (
              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: '#64748b' }}>Loading team...</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {availableRoles.map(role => {
                  const roleKey = role.key;
                  const roleName = role.value.replace(/_/g, ' ');
                  const assignments = roleAssignments[roleKey] || [];
                  const isSaving = roleSaving[roleKey] || false;
                  const isAdding = addingEmployeeForRole === roleKey;
                  const employeesForRole = availableEmployees.filter(emp => emp.defaultRole === roleKey);
                  const assignedEmployeeIds = assignments.map(a => a.employeeId);
                  const availableForAssignment = employeesForRole.filter(emp => !assignedEmployeeIds.includes(emp.id));

                  return (
                    <div key={roleKey} style={{
                      backgroundColor: '#fff',
                      borderRadius: '16px',
                      padding: '20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      border: assignments.length > 0 ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    }}>
                      {/* Role Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: assignments.length > 0 ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : '#f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: '16px' }}>{assignments.length > 0 ? '✓' : '👤'}</span>
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{roleName}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{assignments.length} assigned</div>
                          </div>
                        </div>
                        {assignments.length > 0 && availableForAssignment.length > 0 && (
                          <button
                            onClick={() => setAddingEmployeeForRole(isAdding ? null : roleKey)}
                            disabled={isSaving}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: isAdding ? '#f1f5f9' : '#fff', fontSize: '12px', fontWeight: '600', color: '#6366f1', cursor: 'pointer' }}
                          >
                            {isAdding ? 'Cancel' : '+ Add'}
                          </button>
                        )}
                      </div>

                      {/* Assigned Employees List */}
                      {assignments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: isAdding ? '12px' : '0' }}>
                          {assignments.map((assignment) => {
                            const emp = assignment.employee || availableEmployees.find(e => e.id === assignment.employeeId);
                            if (!emp) return null;
                            const comm = assignment.commissionSettings || {};
                            const empComm = emp.commissionSettings || {};
                            const isOverride = comm.enabled && empComm.enabled && comm.percentage !== empComm.percentage;
                            const effectiveComm = comm.enabled ? comm : empComm;
                            const commission = effectiveComm?.enabled ? `${effectiveComm.percentage}%` : 'No commission';
                            const isEditing = editingCommission && editingCommission.assignmentId === assignment.assignmentId;
                            return (
                              <div key={assignment.assignmentId} style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: isEditing ? '1px solid #6366f1' : '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{emp.name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                      {roleName} • {commission}
                                      {isOverride && <span style={{ color: '#6366f1', marginLeft: '4px' }}>(override)</span>}
                                      {!comm.enabled && empComm?.enabled && <span style={{ color: '#94a3b8', marginLeft: '4px' }}>(employee default)</span>}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      onClick={() => setEditingCommission(isEditing ? null : { assignmentId: assignment.assignmentId, roleKey, enabled: comm.enabled || false, percentage: comm.percentage || 0, saving: false })}
                                      disabled={isSaving}
                                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: isEditing ? '#6366f1' : '#fff', fontSize: '11px', fontWeight: '500', color: isEditing ? '#fff' : '#6366f1', cursor: isSaving ? 'not-allowed' : 'pointer' }}
                                    >
                                      {isEditing ? '✕' : '✎'}
                                    </button>
                                    <button
                                      onClick={() => handleRemoveEmployeeFromRole(roleKey, assignment.assignmentId)}
                                      disabled={isSaving}
                                      style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fff', fontSize: '11px', fontWeight: '500', color: '#dc2626', cursor: isSaving ? 'not-allowed' : 'pointer' }}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                {isEditing && (
                                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#475569', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={editingCommission.enabled}
                                        onChange={e => setEditingCommission(prev => ({ ...prev, enabled: e.target.checked }))}
                                        style={{ accentColor: '#6366f1' }}
                                      />
                                      Override
                                    </label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={editingCommission.percentage}
                                      onChange={e => setEditingCommission(prev => ({ ...prev, percentage: e.target.value }))}
                                      disabled={!editingCommission.enabled}
                                      placeholder="%"
                                      style={{ width: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', opacity: editingCommission.enabled ? 1 : 0.5 }}
                                    />
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>%</span>
                                    <button
                                      onClick={handleUpdateCommission}
                                      disabled={editingCommission.saving}
                                      style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontSize: '11px', fontWeight: '600', cursor: editingCommission.saving ? 'not-allowed' : 'pointer', opacity: editingCommission.saving ? 0.6 : 1 }}
                                    >
                                      {editingCommission.saving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => setEditingCommission(null)}
                                      disabled={editingCommission.saving}
                                      style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '11px', fontWeight: '500', color: '#64748b', cursor: editingCommission.saving ? 'not-allowed' : 'pointer' }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add Employee Selector */}
                      {(isAdding || assignments.length === 0) && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <select
                            value={newEmployeeSelection[roleKey] || ''}
                            onChange={e => setNewEmployeeSelection(prev => ({ ...prev, [roleKey]: e.target.value }))}
                            disabled={isSaving}
                            style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '13px', outline: 'none', backgroundColor: '#fff' }}
                          >
                            <option value="">Select employee...</option>
                            {availableForAssignment.map(emp => {
                              const commission = emp.commissionSettings?.enabled ? `${emp.commissionSettings.percentage}%` : 'No commission';
                              return <option key={emp.id} value={emp.id}>{emp.name} • {commission}</option>;
                            })}
                          </select>
                          <button
                            onClick={() => {
                              const selectedId = newEmployeeSelection[roleKey];
                              if (selectedId) handleRoleAssignment(roleKey, selectedId);
                            }}
                            disabled={isSaving || !newEmployeeSelection[roleKey]}
                            style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: isSaving || !newEmployeeSelection[roleKey] ? 'not-allowed' : 'pointer', opacity: isSaving || !newEmployeeSelection[roleKey] ? 0.5 : 1 }}
                          >
                            {isSaving ? '...' : 'Assign'}
                          </button>
                        </div>
                      )}

                      {/* Empty state */}
                      {assignments.length === 0 && !isAdding && (
                        <button
                          onClick={() => setAddingEmployeeForRole(roleKey)}
                          disabled={employeesForRole.length === 0}
                          style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px dashed #e2e8f0', backgroundColor: 'transparent', fontSize: '13px', fontWeight: '500', color: employeesForRole.length === 0 ? '#cbd5e1' : '#94a3b8', cursor: employeesForRole.length === 0 ? 'not-allowed' : 'pointer' }}
                        >
                          {employeesForRole.length === 0 ? `No ${roleName.toLowerCase()}s available` : `+ Assign ${roleName.toLowerCase()}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {tasks.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No tasks found for this client</div>
            ) : (
              <div>
                {tasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{task.title}</h4>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{new Date(task.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
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

        {/* Purchases Tab */}
        {activeTab === 'purchases' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {purchases.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No purchases found</div>
            ) : (
              <div>
                {purchases.map(p => (
                  <div key={p.taskId} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {p.planImage && <img src={p.planImage} alt="" style={{ width: '64px', height: '64px', borderRadius: '12px', objectFit: 'cover' }} loading="lazy" />}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>{p.planTitle}</h4>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Purchased: {new Date(p.purchasedAt).toLocaleDateString()}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '16px', fontWeight: '700', color: '#6366f1', margin: '0 0 6px 0' }}>{p.purchasePrice} credits</p>
                      <span style={{
                        display: 'inline-block', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
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

        {/* Toast */}
        {toast.show && (
          <div style={{
            position: 'fixed', bottom: '24px', right: '24px', padding: '12px 20px', borderRadius: '10px',
            backgroundColor: toast.type === 'error' ? '#dc2626' : '#16a34a', color: '#fff', fontSize: '14px', fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, animation: 'slideIn 0.3s ease',
          }}>
            {toast.message}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  );
};

export default ClientDetail;
