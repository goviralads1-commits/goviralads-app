import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import { colors, spacing, shadows } from '../styles';

// Styles
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.background.primary,
    paddingBottom: spacing.xxl,
  },
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: `${spacing.lg} ${spacing.md}`,
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: colors.text.primary,
    margin: 0,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: shadows.sm,
  },
  tabs: {
    display: 'flex',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    borderBottom: `1px solid ${colors.border.light}`,
    paddingBottom: spacing.sm,
  },
  tab: {
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: '0.95rem',
    fontWeight: '500',
    color: colors.text.secondary,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: colors.primary,
    backgroundColor: colors.background.secondary,
    fontWeight: '600',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: '12px',
    padding: spacing.lg,
    boxShadow: shadows.sm,
    border: `1px solid ${colors.border.light}`,
    transition: 'all 0.2s',
    position: 'relative',
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  planName: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: colors.text.primary,
    margin: 0,
  },
  badge: {
    display: 'inline-block',
    padding: `2px ${spacing.sm}`,
    fontSize: '0.7rem',
    fontWeight: '600',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  planBadge: {
    backgroundColor: colors.primary + '20',
    color: colors.primary,
  },
  packBadge: {
    backgroundColor: colors.secondary + '20',
    color: colors.secondary,
  },
  inactiveBadge: {
    backgroundColor: colors.text.muted + '20',
    color: colors.text.muted,
    marginLeft: spacing.xs,
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  price: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: colors.text.primary,
  },
  credits: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.background.primary,
    borderRadius: '8px',
  },
  creditRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9rem',
  },
  bonus: {
    color: colors.success,
    fontWeight: '600',
  },
  total: {
    fontWeight: '700',
    color: colors.primary,
    borderTop: `1px solid ${colors.border.light}`,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
  },
  description: {
    fontSize: '0.85rem',
    color: colors.text.secondary,
    marginBottom: spacing.md,
    lineHeight: 1.5,
  },
  cardActions: {
    display: 'flex',
    gap: spacing.sm,
    marginTop: 'auto',
  },
  editBtn: {
    flex: 1,
    padding: spacing.sm,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteBtn: {
    padding: spacing.sm,
    backgroundColor: colors.error + '10',
    color: colors.error,
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleBtn: {
    padding: spacing.sm,
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  emptyState: {
    textAlign: 'center',
    padding: spacing.xxl,
    color: colors.text.secondary,
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: spacing.md,
  },
  modal: {
    backgroundColor: colors.background.secondary,
    borderRadius: '12px',
    padding: spacing.xl,
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    padding: spacing.sm,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '6px',
    fontSize: '0.95rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: spacing.sm,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '6px',
    fontSize: '0.95rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: spacing.sm,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '6px',
    fontSize: '0.95rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    minHeight: '80px',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    cursor: 'pointer',
  },
  checkboxInput: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitBtn: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  toast: {
    position: 'fixed',
    bottom: spacing.lg,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: `${spacing.sm} ${spacing.lg}`,
    borderRadius: '8px',
    fontSize: '0.95rem',
    fontWeight: '500',
    zIndex: 2000,
    boxShadow: shadows.lg,
  },
  toastSuccess: {
    backgroundColor: colors.success,
    color: '#fff',
  },
  toastError: {
    backgroundColor: colors.error,
    color: '#fff',
  },
};

const CreditPlans = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PLAN');
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    credits: '',
    bonusCredits: '0',
    type: 'PLAN',
    description: '',
    displayOrder: '0',
    isActive: true,
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/credit-plans');
      setPlans(res.data.plans || []);
    } catch (err) {
      showToast('Failed to load credit plans', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        price: plan.price.toString(),
        credits: plan.credits.toString(),
        bonusCredits: plan.bonusCredits.toString(),
        type: plan.type,
        description: plan.description || '',
        displayOrder: plan.displayOrder.toString(),
        isActive: plan.isActive,
      });
    } else {
      setEditingPlan(null);
      setFormData({
        name: '',
        price: '',
        credits: '',
        bonusCredits: activeTab === 'PLAN' ? '' : '0',
        type: activeTab,
        description: '',
        displayOrder: '0',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPlan(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate price >= 100 (matches backend recharge validation)
    const priceValue = parseFloat(formData.price);
    if (!priceValue || priceValue < 100) {
      showToast('Price must be at least ₹100', 'error');
      return;
    }
    
    const payload = {
      name: formData.name,
      price: priceValue,
      credits: parseInt(formData.credits),
      bonusCredits: parseInt(formData.bonusCredits) || 0,
      type: formData.type,
      description: formData.description,
      displayOrder: parseInt(formData.displayOrder) || 0,
      isActive: formData.isActive,
    };

    try {
      if (editingPlan) {
        await api.patch(`/admin/credit-plans/${editingPlan.id}`, payload);
        showToast('Credit plan updated successfully');
      } else {
        await api.post('/admin/credit-plans', payload);
        showToast('Credit plan created successfully');
      }
      handleCloseModal();
      fetchPlans();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save credit plan', 'error');
    }
  };

  const handleToggleActive = async (plan) => {
    try {
      await api.patch(`/admin/credit-plans/${plan.id}`, { isActive: !plan.isActive });
      showToast(`Plan ${plan.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchPlans();
    } catch (err) {
      showToast('Failed to update plan status', 'error');
    }
  };

  const handleDelete = async (plan) => {
    if (!window.confirm(`Are you sure you want to delete "${plan.name}"?`)) return;
    
    try {
      await api.delete(`/admin/credit-plans/${plan.id}`);
      showToast('Credit plan deleted successfully');
      fetchPlans();
    } catch (err) {
      showToast('Failed to delete credit plan', 'error');
    }
  };

  const filteredPlans = plans.filter(p => p.type === activeTab);

  return (
    <div style={styles.container}>
      <Header />
      <main style={styles.main}>
        <div style={styles.pageHeader}>
          <h1 style={styles.pageTitle}>Credit Plans</h1>
          <button style={styles.addButton} onClick={() => handleOpenModal()}>
            + Add {activeTab === 'PLAN' ? 'Plan' : 'Pack'}
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'PLAN' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('PLAN')}
          >
            Plans (with Bonus)
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'PACK' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('PACK')}
          >
            Credit Packs (Simple)
          </button>
        </div>

        {/* Plans Grid */}
        {loading ? (
          <div style={styles.emptyState}>Loading...</div>
        ) : filteredPlans.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No {activeTab.toLowerCase()}s created yet.</p>
            <button style={styles.addButton} onClick={() => handleOpenModal()}>
              + Create First {activeTab === 'PLAN' ? 'Plan' : 'Pack'}
            </button>
          </div>
        ) : (
          <div style={styles.grid}>
            {filteredPlans.map(plan => (
              <div 
                key={plan.id} 
                style={{ ...styles.card, ...(!plan.isActive ? styles.cardInactive : {}) }}
              >
                <div style={styles.cardHeader}>
                  <h3 style={styles.planName}>{plan.name}</h3>
                  <div>
                    <span style={{ ...styles.badge, ...(plan.type === 'PLAN' ? styles.planBadge : styles.packBadge) }}>
                      {plan.type}
                    </span>
                    {!plan.isActive && (
                      <span style={{ ...styles.badge, ...styles.inactiveBadge }}>Inactive</span>
                    )}
                  </div>
                </div>

                <div style={styles.priceRow}>
                  <span style={styles.price}>₹{plan.price.toLocaleString()}</span>
                </div>

                <div style={styles.credits}>
                  <div style={styles.creditRow}>
                    <span>Base Credits</span>
                    <span>{plan.credits.toLocaleString()}</span>
                  </div>
                  {plan.bonusCredits > 0 && (
                    <div style={{ ...styles.creditRow, ...styles.bonus }}>
                      <span>Bonus Credits</span>
                      <span>+{plan.bonusCredits.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ ...styles.creditRow, ...styles.total }}>
                    <span>Total Credits</span>
                    <span>{plan.totalCredits.toLocaleString()}</span>
                  </div>
                </div>

                {plan.description && (
                  <p style={styles.description}>{plan.description}</p>
                )}

                <div style={styles.cardActions}>
                  <button style={styles.editBtn} onClick={() => handleOpenModal(plan)}>
                    Edit
                  </button>
                  <button 
                    style={{
                      ...styles.toggleBtn,
                      backgroundColor: plan.isActive ? colors.warning + '20' : colors.success + '20',
                      color: plan.isActive ? colors.warning : colors.success,
                    }}
                    onClick={() => handleToggleActive(plan)}
                  >
                    {plan.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button style={styles.deleteBtn} onClick={() => handleDelete(plan)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={handleCloseModal}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {editingPlan ? 'Edit Credit Plan' : `Create New ${formData.type === 'PLAN' ? 'Plan' : 'Credit Pack'}`}
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Plan Name *</label>
                <input
                  style={styles.input}
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Starter Pack"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Type</label>
                <select
                  style={styles.select}
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="PLAN">Plan (with Bonus)</option>
                  <option value="PACK">Credit Pack (Simple)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Price (₹) * (min ₹100)</label>
                <input
                  style={styles.input}
                  type="number"
                  min="100"
                  value={formData.price}
                  onChange={e => setFormData({ ...formData, price: e.target.value })}
                  placeholder="e.g., 500"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Base Credits *</label>
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  value={formData.credits}
                  onChange={e => setFormData({ ...formData, credits: e.target.value })}
                  placeholder="e.g., 1000"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Bonus Credits (0 for packs)</label>
                <input
                  style={styles.input}
                  type="number"
                  min="0"
                  value={formData.bonusCredits}
                  onChange={e => setFormData({ ...formData, bonusCredits: e.target.value })}
                  placeholder="e.g., 200"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Description (optional)</label>
                <textarea
                  style={styles.textarea}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this plan..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Display Order</label>
                <input
                  style={styles.input}
                  type="number"
                  value={formData.displayOrder}
                  onChange={e => setFormData({ ...formData, displayOrder: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.checkbox}>
                  <input
                    style={styles.checkboxInput}
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  Active (visible to clients)
                </label>
              </div>

              <div style={styles.modalActions}>
                <button type="button" style={styles.cancelBtn} onClick={handleCloseModal}>
                  Cancel
                </button>
                <button type="submit" style={styles.submitBtn}>
                  {editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          ...styles.toast,
          ...(toast.type === 'error' ? styles.toastError : styles.toastSuccess)
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default CreditPlans;
