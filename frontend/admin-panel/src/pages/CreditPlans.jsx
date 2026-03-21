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
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  editBtn: {
    width: '100%',
    padding: spacing.sm,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  deleteBtn: {
    width: '100%',
    padding: spacing.sm,
    backgroundColor: colors.error + '10',
    color: colors.error,
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  toggleBtn: {
    width: '100%',
    padding: spacing.sm,
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
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
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 1000,
    padding: spacing.sm,
    overflowY: 'auto',
  },
  modal: {
    backgroundColor: colors.background.secondary,
    borderRadius: '12px',
    padding: spacing.lg,
    width: '100%',
    maxWidth: '500px',
    margin: `${spacing.lg} auto`,
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  input: {
    width: '100%',
    padding: spacing.md,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '8px',
    fontSize: '1rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: spacing.md,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '8px',
    fontSize: '1rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    cursor: 'pointer',
  },
  textarea: {
    width: '100%',
    padding: spacing.md,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '8px',
    fontSize: '1rem',
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    minHeight: '100px',
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
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  cancelBtn: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.background.primary,
    color: colors.text.primary,
    border: `1px solid ${colors.border.light}`,
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitBtn: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
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
    validityDays: '30',
    visibility: 'public',
    visibleToUsers: [],
    isActive: true,
  });

  const [users, setUsers] = useState([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Loading/action states (Section 4 — button states)
  const [submitting, setSubmitting] = useState(false);
  const [couponSubmitting, setCouponSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null); // plan id being deleted
  const [togglingId, setTogglingId] = useState(null); // plan id being toggled
  const [deletingCouponId, setDeletingCouponId] = useState(null); // coupon id being deleted

  // Coupon state
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    type: 'discount',
    value: '',
    expiryDate: '',
    isActive: true,
  });

  useEffect(() => {
    fetchPlans();
    fetchCoupons();
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

  const fetchCoupons = async () => {
    setCouponsLoading(true);
    try {
      const res = await api.get('/admin/coupons');
      setCoupons(res.data.coupons || []);
    } catch (err) {
      console.error('[CreditPlans] fetchCoupons error:', err.response?.data || err.message);
      showToast('Failed to load coupons', 'error');
    } finally {
      setCouponsLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (usersLoaded) return;
    try {
      const res = await api.get('/admin/users?limit=200');
      setUsers(res.data.users || []);
      setUsersLoaded(true);
    } catch (err) {
      console.error('[CreditPlans] fetchUsers error:', err.message);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenModal = (plan = null) => {
    fetchUsers();
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
        validityDays: (plan.validityDays || 30).toString(),
        visibility: plan.visibility || 'public',
        visibleToUsers: plan.visibleToUsers || [],
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
        validityDays: '30',
        visibility: 'public',
        visibleToUsers: [],
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
    if (submitting) return; // prevent double-click
    
    // Validate required fields
    if (!formData.name.trim()) { showToast('Plan name is required', 'error'); return; }
    if (!formData.credits || parseInt(formData.credits) <= 0) { showToast('Base credits must be > 0', 'error'); return; }
    
    const priceValue = parseFloat(formData.price);
    if (!priceValue || priceValue < 1) {
      showToast('Price must be a positive number', 'error');
      return;
    }
    
    const payload = {
      name: formData.name.trim(),
      price: priceValue,
      credits: parseInt(formData.credits),
      bonusCredits: parseInt(formData.bonusCredits) || 0,
      type: formData.type,
      description: formData.description,
      displayOrder: parseInt(formData.displayOrder) || 0,
      validityDays: parseInt(formData.validityDays) || 30,
      visibility: formData.visibility,
      visibleToUsers: formData.visibility === 'selected' ? formData.visibleToUsers : [],
      isActive: formData.isActive,
    };

    console.log('[CreditPlans] handleSubmit', editingPlan ? 'PATCH' : 'POST', payload);
    setSubmitting(true);
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
      console.error('[CreditPlans] handleSubmit error:', err.response?.data || err.message);
      showToast(err.response?.data?.error || 'Failed to save credit plan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (plan) => {
    if (togglingId) return;
    console.log('[CreditPlans] toggleActive', plan.id, !plan.isActive);
    setTogglingId(plan.id);
    try {
      await api.patch(`/admin/credit-plans/${plan.id}`, { isActive: !plan.isActive });
      showToast(`Plan ${plan.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchPlans();
    } catch (err) {
      console.error('[CreditPlans] toggleActive error:', err.response?.data || err.message);
      showToast('Failed to update plan status', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (plan) => {
    if (deletingId) return;
    if (!window.confirm(`Are you sure you want to delete "${plan.name}"?`)) return;
    console.log('[CreditPlans] delete', plan.id);
    setDeletingId(plan.id);
    try {
      await api.delete(`/admin/credit-plans/${plan.id}`);
      showToast('Credit plan deleted successfully');
      fetchPlans();
    } catch (err) {
      console.error('[CreditPlans] delete error:', err.response?.data || err.message);
      showToast(err.response?.data?.error || 'Failed to delete credit plan', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Coupon handlers
  const handleOpenCouponModal = (coupon = null) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setCouponForm({
        code: coupon.code,
        type: coupon.type,
        value: coupon.value.toString(),
        expiryDate: coupon.expiryDate ? coupon.expiryDate.slice(0, 10) : '',
        isActive: coupon.isActive,
      });
    } else {
      setEditingCoupon(null);
      setCouponForm({ code: '', type: 'discount', value: '', expiryDate: '', isActive: true });
    }
    setShowCouponModal(true);
  };

  const handleCouponSubmit = async (e) => {
    e.preventDefault();
    if (couponSubmitting) return; // prevent double-click
    const val = parseFloat(couponForm.value);
    if (!couponForm.code.trim()) { showToast('Coupon code is required', 'error'); return; }
    if (isNaN(val) || val <= 0) { showToast('Value must be positive', 'error'); return; }
    if (couponForm.type === 'discount' && val > 100) { showToast('Discount cannot exceed 100%', 'error'); return; }
    const payload = {
      code: couponForm.code.toUpperCase().trim(),
      type: couponForm.type,
      value: val,
      expiryDate: couponForm.expiryDate || null,
      isActive: couponForm.isActive,
    };
    console.log('[CreditPlans] couponSubmit', editingCoupon ? 'PATCH' : 'POST', payload);
    setCouponSubmitting(true);
    try {
      if (editingCoupon) {
        await api.patch(`/admin/coupons/${editingCoupon.id}`, payload);
        showToast('Coupon updated');
      } else {
        await api.post('/admin/coupons', payload);
        showToast('Coupon created');
      }
      setShowCouponModal(false);
      setEditingCoupon(null);
      fetchCoupons();
    } catch (err) {
      console.error('[CreditPlans] couponSubmit error:', err.response?.data || err.message);
      showToast(err.response?.data?.error || 'Failed to save coupon', 'error');
    } finally {
      setCouponSubmitting(false);
    }
  };

  const handleDeleteCoupon = async (coupon) => {
    if (deletingCouponId) return;
    if (!window.confirm(`Delete coupon "${coupon.code}"?`)) return;
    console.log('[CreditPlans] deleteCoupon', coupon.id);
    setDeletingCouponId(coupon.id);
    try {
      await api.delete(`/admin/coupons/${coupon.id}`);
      showToast('Coupon deleted');
      fetchCoupons();
    } catch (err) {
      console.error('[CreditPlans] deleteCoupon error:', err.response?.data || err.message);
      showToast('Failed to delete coupon', 'error');
    } finally {
      setDeletingCouponId(null);
    }
  };

  const filteredPlans = plans.filter(p => p.type === activeTab);

  return (
    <div style={styles.container}>
      <Header />
      <main style={styles.main}>
        <div style={styles.pageHeader}>
          <h1 style={styles.pageTitle}>Credit Plans</h1>
          <button style={styles.addButton} onClick={() => activeTab === 'COUPON' ? handleOpenCouponModal() : handleOpenModal()}>
            + {activeTab === 'PLAN' ? 'Add Subscription Plan' : activeTab === 'PACK' ? 'Add Credit Pack' : 'Add Coupon'}
          </button>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'PLAN' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('PLAN')}
          >
            Subscription Plans
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'PACK' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('PACK')}
          >
            One-time Credit Packs
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'COUPON' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('COUPON')}
          >
            Coupons
          </button>
        </div>

        {/* Plans Grid */}
        {activeTab !== 'COUPON' && (
          <>
        {loading ? (
          <div style={styles.emptyState}>Loading...</div>
        ) : filteredPlans.length === 0 ? (
          <div style={{...styles.emptyState, padding: '60px 24px', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
            <div style={{width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="M12 12h.01"/>
              </svg>
            </div>
            <h3 style={{fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0'}}>No {activeTab === 'PLAN' ? 'subscription plans' : 'credit packs'} yet</h3>
            <p style={{fontSize: '14px', color: '#64748b', margin: '0 0 24px 0'}}>Start selling by creating your first {activeTab === 'PLAN' ? 'subscription plan' : 'credit pack'}</p>
            <button
              onClick={() => handleOpenModal()}
              style={{
                padding: '14px 28px', borderRadius: '14px', border: 'none',
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)'
              }}
            >
              + Create {activeTab === 'PLAN' ? 'Subscription Plan' : 'Credit Pack'}
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
                      {plan.type === 'PLAN' ? 'Subscription' : 'Credit Pack'}
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

                {/* Validity + Visibility info row */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {plan.type === 'PLAN' && plan.validityDays && (
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                      backgroundColor: '#e0e7ff', color: '#4338ca'
                    }}>
                      {plan.validityDays}d validity
                    </span>
                  )}
                  <span style={{
                    padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                    backgroundColor: plan.visibility === 'public' ? '#dcfce7' : plan.visibility === 'private' ? '#fee2e2' : '#fef3c7',
                    color: plan.visibility === 'public' ? '#15803d' : plan.visibility === 'private' ? '#dc2626' : '#92400e'
                  }}>
                    {plan.visibility === 'public' ? 'Public' : plan.visibility === 'private' ? 'Private' : `Selected (${(plan.visibleToUsers || []).length})`}
                  </span>
                </div>

                <div style={styles.cardActions}>
                  <button style={styles.editBtn} onClick={() => handleOpenModal(plan)}>
                    Edit
                  </button>
                  <button 
                    style={{
                      ...styles.toggleBtn,
                      backgroundColor: plan.isActive ? colors.warning + '20' : colors.success + '20',
                      color: plan.isActive ? colors.warning : colors.success,
                      opacity: togglingId === plan.id ? 0.6 : 1,
                      cursor: togglingId === plan.id ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => handleToggleActive(plan)}
                    disabled={togglingId === plan.id}
                  >
                    {togglingId === plan.id ? '...' : (plan.isActive ? 'Deactivate' : 'Activate')}
                  </button>
                  <button
                    style={{ ...styles.deleteBtn, opacity: deletingId === plan.id ? 0.6 : 1, cursor: deletingId === plan.id ? 'not-allowed' : 'pointer' }}
                    onClick={() => handleDelete(plan)}
                    disabled={deletingId === plan.id}
                  >
                    {deletingId === plan.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </>)}

        {/* Coupon Section */}
        {activeTab === 'COUPON' && (
          <div>
            {couponsLoading ? (
              <div style={styles.emptyState}>Loading coupons...</div>
            ) : coupons.length === 0 ? (
              <div style={styles.emptyState}>
                <p>No coupons created yet.</p>
                <button style={styles.addButton} onClick={() => handleOpenCouponModal()}>+ Create First Coupon</button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border.light}`, textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Code</th>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Type</th>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Value</th>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Expiry</th>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Status</th>
                      <th style={{ padding: '10px 12px', color: colors.text.secondary }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map(c => (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                        <td style={{ padding: '10px 12px', fontWeight: '600', fontFamily: 'monospace' }}>{c.code}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                            backgroundColor: c.type === 'discount' ? '#fef3c7' : '#dcfce7',
                            color: c.type === 'discount' ? '#92400e' : '#15803d' }}>
                            {c.type === 'discount' ? `${c.value}% OFF` : `+${c.value} Credits`}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>{c.value}</td>
                        <td style={{ padding: '10px 12px', color: colors.text.secondary }}>
                          {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString('en-IN') : 'No expiry'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                            backgroundColor: c.isActive ? '#dcfce7' : '#fee2e2',
                            color: c.isActive ? '#15803d' : '#dc2626' }}>
                            {c.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button style={styles.editBtn} onClick={() => handleOpenCouponModal(c)}>Edit</button>
                            <button style={{ ...styles.deleteBtn, opacity: deletingCouponId === c.id ? 0.6 : 1, cursor: deletingCouponId === c.id ? 'not-allowed' : 'pointer' }} onClick={() => handleDeleteCoupon(c)} disabled={deletingCouponId === c.id}>{deletingCouponId === c.id ? '...' : 'Delete'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Plan Modal */}
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
                  <option value="PLAN">Subscription Plan (with Bonus)</option>
                  <option value="PACK">One-time Credit Pack (Simple)</option>
                </select>
                <p style={{fontSize: '11px', color: '#64748b', margin: '4px 0 0 0'}}>This plan will be visible to clients based on visibility setting</p>
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
                <p style={{fontSize: '11px', color: '#64748b', margin: '4px 0 0 0'}}>Bonus credits added on purchase (typically for subscription plans)</p>
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
                <label style={styles.label}>Validity (days)</label>
                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={formData.validityDays}
                  onChange={e => setFormData({ ...formData, validityDays: e.target.value })}
                  placeholder="30"
                />
                <p style={{fontSize: '11px', color: '#64748b', margin: '4px 0 0 0'}}>Validity in days (for subscription plans only - credits expire after this period)</p>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Visibility</label>
                <select
                  style={styles.select}
                  value={formData.visibility}
                  onChange={e => setFormData({ ...formData, visibility: e.target.value, visibleToUsers: [] })}
                >
                  <option value="public">Public (visible to all)</option>
                  <option value="private">Private (hidden from all)</option>
                  <option value="selected">Selected Users only</option>
                </select>
              </div>

              {formData.visibility === 'selected' && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>
                    Visible To ({formData.visibleToUsers.length} selected)
                  </label>
                  <div style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    backgroundColor: '#f8fafc'
                  }}>
                    {users.length === 0 ? (
                      <p style={{ padding: '12px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Loading users...</p>
                    ) : (
                      users.map(u => {
                        const checked = formData.visibleToUsers.includes(u.id);
                        return (
                          <label key={u.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            backgroundColor: checked ? '#e0e7ff' : 'transparent',
                            fontSize: '13px',
                            borderBottom: '1px solid #f1f5f9'
                          }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const updated = checked
                                  ? formData.visibleToUsers.filter(id => id !== u.id)
                                  : [...formData.visibleToUsers, u.id];
                                setFormData({ ...formData, visibleToUsers: updated });
                              }}
                            />
                            <span style={{ fontWeight: '600', color: '#334155' }}>{u.name || u.identifier}</span>
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>{u.identifier}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {formData.visibleToUsers.length === 0 && (
                    <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>No users selected — plan will be hidden (treated as private)</p>
                  )}
                </div>
              )}

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
                <button type="submit" style={{ ...styles.submitBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }} disabled={submitting}>
                  {submitting ? 'Saving...' : (editingPlan ? 'Update Plan' : 'Create Plan')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {showCouponModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCouponModal(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingCoupon ? 'Edit Coupon' : 'Create Coupon'}</h2>
            <form onSubmit={handleCouponSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Coupon Code *</label>
                <input style={styles.input} type="text" value={couponForm.code}
                  onChange={e => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SAVE20" required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Type *</label>
                <select style={styles.select} value={couponForm.type}
                  onChange={e => setCouponForm({ ...couponForm, type: e.target.value })}>
                  <option value="discount">Discount (% off price)</option>
                  <option value="bonus">Bonus (extra credits)</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  {couponForm.type === 'discount' ? 'Discount %  (1-100) *' : 'Bonus Credits *'}
                </label>
                <input style={styles.input} type="number" min="1"
                  max={couponForm.type === 'discount' ? '100' : undefined}
                  value={couponForm.value}
                  onChange={e => setCouponForm({ ...couponForm, value: e.target.value })}
                  placeholder={couponForm.type === 'discount' ? 'e.g., 20' : 'e.g., 500'} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Expiry Date (optional)</label>
                <input style={styles.input} type="date" value={couponForm.expiryDate}
                  onChange={e => setCouponForm({ ...couponForm, expiryDate: e.target.value })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.checkbox}>
                  <input style={styles.checkboxInput} type="checkbox" checked={couponForm.isActive}
                    onChange={e => setCouponForm({ ...couponForm, isActive: e.target.checked })} />
                  Active
                </label>
              </div>
              <div style={styles.modalActions}>
                <button type="button" style={styles.cancelBtn} onClick={() => setShowCouponModal(false)}>Cancel</button>
                <button type="submit" style={{ ...styles.submitBtn, opacity: couponSubmitting ? 0.7 : 1, cursor: couponSubmitting ? 'not-allowed' : 'pointer' }} disabled={couponSubmitting}>{couponSubmitting ? 'Saving...' : (editingCoupon ? 'Update' : 'Create')}</button>
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
