import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

// All permission definitions with labels - GROUPED BY CATEGORY
const PERMISSION_GROUPS = [
  {
    name: 'TASKS',
    permissions: [
      { key: 'canCreateTasks', label: 'Create Tasks', desc: 'Can create new tasks for clients' },
      { key: 'canEditTasks', label: 'Edit Tasks', desc: 'Can update task details and progress' },
      { key: 'canDeleteTasks', label: 'Delete Tasks', desc: 'Can delete tasks permanently' },
      { key: 'canViewAllTasks', label: 'View All Tasks', desc: 'Can see all tasks (not just assigned)' },
      { key: 'canAssignTasks', label: 'Assign Tasks', desc: 'Can assign tasks to clients' },
    ]
  },
  {
    name: 'FINANCE',
    permissions: [
      { key: 'canViewWallet', label: 'View Wallet', desc: 'Can access wallet & transaction data' },
      { key: 'canApproveRecharge', label: 'Approve Recharge', desc: 'Can approve/reject recharge requests' },
    ]
  },
  {
    name: 'PLANS',
    permissions: [
      { key: 'canEditPlans', label: 'Edit Plans', desc: 'Can create, edit, and delete plans' },
    ]
  },
  {
    name: 'USERS',
    permissions: [
      { key: 'canAddUsers', label: 'Add Users', desc: 'Can create new admin/client accounts' },
      { key: 'canEditUsers', label: 'Edit Users', desc: 'Can edit user profiles and settings' },
    ]
  },
];

// Flat list for backward compatibility
const PERMISSION_DEFS = PERMISSION_GROUPS.flatMap(g => g.permissions);

const emptyPermissions = () =>
  PERMISSION_DEFS.reduce((acc, d) => ({ ...acc, [d.key]: false }), {});

// Toggle switch component
const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={() => !disabled && onChange(!checked)}
    style={{
      width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      backgroundColor: checked ? '#6366f1' : '#d1d5db', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      outline: 'none', opacity: disabled ? 0.5 : 1,
    }}
    aria-checked={checked}
  >
    <span style={{
      position: 'absolute', top: '3px', left: checked ? '23px' : '3px',
      width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff',
      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    }} />
  </button>
);

const Roles = () => {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', displayName: '', permissions: emptyPermissions() });
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editRole, setEditRole] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: '', permissions: emptyPermissions() });
  const [saving, setSaving] = useState(false);

  // Assign modal state
  const [assignModal, setAssignModal] = useState(null); // { userId, currentRoleId }
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // role id being deleted

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRoles = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/roles');
      setRoles(data.roles || []);
    } catch {
      showToast('Failed to load roles', 'error');
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/admin-users');
      setUsers(data.users || []);
    } catch {
      // Users list is optional — silently ignore
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRoles(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchRoles, fetchUsers]);

  // ── CREATE ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.displayName.trim()) {
      showToast('Name and Display Name are required', 'error'); return;
    }
    setCreating(true);
    try {
      await api.post('/admin/roles', {
        name: createForm.name.trim().toUpperCase().replace(/\s+/g, '_'),
        displayName: createForm.displayName.trim(),
        permissions: createForm.permissions,
      });
      showToast('Role created');
      setShowCreate(false);
      setCreateForm({ name: '', displayName: '', permissions: emptyPermissions() });
      fetchRoles();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create role', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ── EDIT ────────────────────────────────────────────────────────────
  const openEdit = (role) => {
    setEditRole(role);
    setEditForm({
      displayName: role.displayName,
      permissions: { ...emptyPermissions(), ...role.permissions },
    });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/roles/${editRole.id}`, {
        displayName: editForm.displayName.trim(),
        permissions: editForm.permissions,
      });
      showToast('Role updated');
      setEditRole(null);
      fetchRoles();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update role', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE ───────────────────────────────────────────────────────────
  const handleDelete = async (role) => {
    if (deletingId) return;
    if (!window.confirm(`Delete role "${role.displayName}"? This cannot be undone.`)) return;
    console.log('[Roles] delete', role.id);
    setDeletingId(role.id);
    try {
      await api.delete(`/admin/roles/${role.id}`);
      showToast('Role deleted');
      fetchRoles();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete role', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── ASSIGN ────────────────────────────────────────────────────────────
  const openAssign = (user) => {
    setAssignModal(user);
    setAssignRoleId(user.customRole || '');
  };

  const handleAssign = async () => {
    setAssigning(true);
    try {
      await api.post(`/admin/users/${assignModal.id}/assign-role`, { roleId: assignRoleId || null });
      showToast('Role assigned');
      setAssignModal(null);
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to assign role', 'error');
    } finally {
      setAssigning(false);
    }
  };

  // ── PERMISSION FORM - GROUPED ─────────────────────────────────────────
  const PermissionToggles = ({ perms, onChange, disabled }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.name} style={{ backgroundColor: '#f8fafc', borderRadius: '16px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px 0' }}>{group.name}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {group.permissions.map((def) => (
              <div key={def.key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: '10px', backgroundColor: '#fff',
                border: `1px solid ${perms[def.key] ? '#c7d2fe' : '#e2e8f0'}`,
              }}>
                <div style={{ flex: 1, marginRight: '10px' }}>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>{def.label}</p>
                  <p style={{ margin: 0, fontSize: '10px', color: '#94a3b8', lineHeight: 1.3 }}>{def.desc}</p>
                </div>
                <Toggle checked={!!perms[def.key]} onChange={(v) => onChange({ ...perms, [def.key]: v })} disabled={disabled} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <p style={{ color: '#94a3b8' }}>Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', right: '24px', zIndex: 9999,
          padding: '14px 20px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
          backgroundColor: toast.type === 'error' ? '#fef2f2' : '#f0fdf4',
          color: toast.type === 'error' ? '#dc2626' : '#16a34a',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Roles & Permissions</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
              Create custom roles and assign them to admin users
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: '12px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600',
            }}
          >
            + Create Role
          </button>
        </div>

        {/* Role Cards */}
        {roles.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', borderRadius: '20px', padding: '60px', textAlign: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0',
          }}>
            <p style={{ fontSize: '16px', color: '#94a3b8', margin: 0 }}>No roles yet. Create your first custom role.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            {roles.map((role) => {
              const enabledCount = PERMISSION_DEFS.filter(d => role.permissions?.[d.key]).length;
              return (
                <div key={role.id} style={{
                  backgroundColor: '#fff', borderRadius: '20px', padding: '24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>{role.displayName}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0', fontFamily: 'monospace' }}>{role.name}</p>
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: '#eef2ff', color: '#6366f1',
                    }}>
                      {enabledCount}/{PERMISSION_DEFS.length} perms
                    </span>
                  </div>

                  {/* Permission badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                    {PERMISSION_DEFS.map((def) => (
                      <span key={def.key} style={{
                        padding: '3px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: role.permissions?.[def.key] ? '#f0fdf4' : '#f1f5f9',
                        color: role.permissions?.[def.key] ? '#16a34a' : '#94a3b8',
                      }}>
                        {role.permissions?.[def.key] ? '✓' : '✗'} {def.label}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                    <button
                      onClick={() => openEdit(role)}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0',
                        cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(role)}
                      disabled={deletingId === role.id}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #fee2e2',
                        cursor: deletingId === role.id ? 'not-allowed' : 'pointer',
                        backgroundColor: '#fff', fontSize: '13px', fontWeight: '600', color: '#dc2626',
                        opacity: deletingId === role.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === role.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin Users + Role Assignment */}
        {users.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 20px' }}>Assign Roles to Admin Users</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((user) => {
                const assignedRole = roles.find(r => r.id === user.customRole);
                return (
                  <div key={user.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                  }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{user.identifier}</p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                        {assignedRole ? assignedRole.displayName : 'No custom role (main admin access)'}
                      </p>
                    </div>
                    <button
                      onClick={() => openAssign(user)}
                      style={{
                        padding: '8px 16px', borderRadius: '10px', border: '1px solid #e2e8f0',
                        cursor: 'pointer', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600', color: '#374151',
                      }}
                    >
                      {assignedRole ? 'Change Role' : 'Assign Role'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE MODAL ────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Create New Role</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Display Name</label>
                <input
                  value={createForm.displayName}
                  onChange={(e) => {
                    const displayName = e.target.value;
                    const autoKey = displayName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
                    setCreateForm(f => ({ ...f, displayName, name: autoKey }));
                  }}
                  placeholder="e.g. Support Agent"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0 0' }}>This is shown in the UI</p>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Role Key (auto-generated)</label>
                <input
                  value={createForm.name}
                  readOnly
                  placeholder="AUTO_GENERATED"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', backgroundColor: '#f8fafc', color: '#64748b' }}
                />
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0 0' }}>Used internally, cannot be changed</p>
              </div>
            </div>

            <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>Permissions</p>
            <PermissionToggles
              perms={createForm.permissions}
              onChange={(p) => setCreateForm(f => ({ ...f, permissions: p }))}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating} style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', cursor: creating ? 'not-allowed' : 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', opacity: creating ? 0.7 : 1 }}>
                {creating ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ──────────────────────────────────────────────── */}
      {editRole && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Edit: {editRole.displayName}</h2>
              <button onClick={() => setEditRole(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Display Name</label>
              <input
                value={editForm.displayName}
                onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <p style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>Permissions</p>
            <PermissionToggles
              perms={editForm.permissions}
              onChange={(p) => setEditForm(f => ({ ...f, permissions: p }))}
            />

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setEditRole(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN MODAL ────────────────────────────────────────────── */}
      {assignModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '460px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Assign Role</h2>
              <button onClick={() => setAssignModal(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
              Assigning role to: <strong>{assignModal.identifier}</strong>
            </p>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '8px' }}>Select Role</label>
              <select
                value={assignRoleId}
                onChange={(e) => setAssignRoleId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="">-- No Role (Full Admin Access) --</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.displayName}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setAssignModal(null)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                Cancel
              </button>
              <button onClick={handleAssign} disabled={assigning} style={{ flex: 2, padding: '12px', borderRadius: '12px', border: 'none', cursor: assigning ? 'not-allowed' : 'pointer', backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', opacity: assigning ? 0.7 : 1 }}>
                {assigning ? 'Saving...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Roles;
