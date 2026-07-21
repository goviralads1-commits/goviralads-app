import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [roles, setRoles] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    phone: '',
    defaultRole: 'OTHER',
    commissionEnabled: false,
    commissionPercentage: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    fetchEmployees();
    fetchRoles();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/employees');
      setEmployees(res.data.employees || []);
    } catch (err) {
      showToast('Failed to load employees', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await api.get('/admin/employees/roles');
      setRoles(res.data.roles || []);
    } catch (err) {
      console.error('Failed to fetch roles', err);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleCreate = () => {
    setFormData({
      name: '',
      identifier: '',
      phone: '',
      defaultRole: 'OTHER',
      commissionEnabled: false,
      commissionPercentage: 0,
      notes: '',
    });
    setEditingEmployee(null);
    setShowCreateModal(true);
  };

  const handleEdit = (emp) => {
    setFormData({
      name: emp.name || '',
      identifier: emp.identifier || '',
      phone: emp.phone || '',
      defaultRole: emp.defaultRole || 'OTHER',
      commissionEnabled: emp.commissionSettings?.enabled || false,
      commissionPercentage: emp.commissionSettings?.percentage || 0,
      notes: emp.notes || '',
    });
    setEditingEmployee(emp);
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    if (!formData.identifier.trim()) {
      showToast('Email/Identifier is required', 'error');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: formData.name.trim(),
        identifier: formData.identifier.trim().toLowerCase(),
        phone: formData.phone.trim(),
        defaultRole: formData.defaultRole,
        commissionSettings: {
          enabled: formData.commissionEnabled,
          percentage: Number(formData.commissionPercentage) || 0,
        },
        notes: formData.notes.trim(),
      };

      if (editingEmployee) {
        await api.patch(`/admin/employees/${editingEmployee.id}`, payload);
        showToast('Employee updated');
      } else {
        await api.post('/admin/employees', payload);
        showToast('Employee created');
      }
      setShowCreateModal(false);
      fetchEmployees();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save employee', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.name}? This will remove all client assignments.`)) return;
    try {
      await api.delete(`/admin/employees/${emp.id}`);
      showToast('Employee deleted');
      fetchEmployees();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete employee', 'error');
    }
  };

  const getRoleName = (roleKey) => {
    const role = roles.find(r => r.key === roleKey);
    return role ? role.value.replace(/_/g, ' ') : roleKey;
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Employees</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Manage team members who can be assigned to clients</p>
          </div>
          <button
            onClick={handleCreate}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            }}
          >
            + Add Employee
          </button>
        </div>

        {/* Employee List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b' }}>Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px' }}>No Employees Yet</h3>
            <p style={{ color: '#64748b', margin: '0 0 20px' }}>Create employees to assign them to clients for task management and commission tracking.</p>
            <button
              onClick={handleCreate}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              + Add First Employee
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {employees.map(emp => (
              <div key={emp.id} style={{
                backgroundColor: '#fff',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{emp.name}</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0' }}>{emp.identifier}</p>
                  </div>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: emp.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                    color: emp.status === 'ACTIVE' ? '#166534' : '#991b1b',
                  }}>
                    {emp.status}
                  </span>
                </div>
                
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Designation</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{getRoleName(emp.defaultRole)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Commission</span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: emp.commissionSettings?.enabled ? '#166534' : '#64748b' }}>
                      {emp.commissionSettings?.enabled ? `${emp.commissionSettings.percentage}%` : 'Disabled'}
                    </span>
                  </div>
                </div>

                {emp.phone && (
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>📱 {emp.phone}</p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleEdit(emp)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#fff',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(emp)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #fee2e2',
                      backgroundColor: '#fff',
                      color: '#dc2626',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '16px',
            }}
          >
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px' }}>
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Rahul Sharma"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '2px solid #e2e8f0',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Email/Identifier */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Email / Identifier *
                  </label>
                  <input
                    type="email"
                    value={formData.identifier}
                    onChange={e => setFormData({ ...formData, identifier: e.target.value })}
                    placeholder="e.g., rahul@goviralads.com"
                    disabled={!!editingEmployee}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '2px solid #e2e8f0',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: editingEmployee ? '#f8fafc' : '#fff',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g., +91 9876543210"
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '2px solid #e2e8f0',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Designation/Role */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Designation *
                  </label>
                  <select
                    value={formData.defaultRole}
                    onChange={e => setFormData({ ...formData, defaultRole: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '2px solid #e2e8f0',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: '#fff',
                    }}
                  >
                    {roles.map(role => (
                      <option key={role.key} value={role.key}>
                        {role.value.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Commission */}
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: formData.commissionEnabled ? '12px' : '0' }}>
                    <input
                      type="checkbox"
                      checked={formData.commissionEnabled}
                      onChange={e => setFormData({ ...formData, commissionEnabled: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#334155' }}>Enable Commission</span>
                  </label>
                  {formData.commissionEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.commissionPercentage}
                        onChange={e => setFormData({ ...formData, commissionPercentage: e.target.value })}
                        style={{
                          width: '80px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '2px solid #e2e8f0',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onFocus={e => e.target.style.borderColor = '#6366f1'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      />
                      <span style={{ fontSize: '14px', color: '#64748b' }}>% per task</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Optional notes about this employee..."
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '2px solid #e2e8f0',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : editingEmployee ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast.show && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            borderRadius: '10px',
            backgroundColor: toast.type === 'error' ? '#dc2626' : '#16a34a',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            animation: 'slideIn 0.3s ease',
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

export default Employees;
