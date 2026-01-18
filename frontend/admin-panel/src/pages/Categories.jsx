import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import api from '../services/api';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    icon: '📦',
    image: '',
    color: '#6366f1',
    description: '',
    order: 0,
    isActive: true
  });

  const defaultIcons = ['📦', '🛒', '💼', '🏠', '🔧', '📱', '💡', '🎯', '⭐', '🎁', '🔥', '💎', '🚀', '📊', '🎨', '🍕', '🥗', '🧹', '🔌', '📚'];
  const defaultColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get('/admin/categories');
      setCategories(res.data.categories || []);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to load categories' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const resetForm = () => {
    setFormData({ name: '', icon: '📦', image: '', color: '#6366f1', description: '', order: 0, isActive: true });
    setEditingId(null);
    setShowForm(false);
  };

  const handleEdit = (cat) => {
    setFormData({
      name: cat.name || '',
      icon: cat.icon || '📦',
      image: cat.image || '',
      color: cat.color || '#6366f1',
      description: cat.description || '',
      order: cat.order || 0,
      isActive: cat.isActive !== false
    });
    setEditingId(cat.id || cat._id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setToast({ type: 'error', message: 'Category name is required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        icon: formData.icon || '📦',
        image: formData.image || null,
        color: formData.color || '#6366f1',
        description: formData.description || '',
        order: Number(formData.order) || 0,
        isActive: formData.isActive
      };

      if (editingId) {
        await api.patch(`/admin/categories/${editingId}`, payload);
        setToast({ type: 'success', message: 'Category updated successfully' });
      } else {
        await api.post('/admin/categories', payload);
        setToast({ type: 'success', message: 'Category created successfully' });
      }
      
      setTimeout(() => setToast(null), 3000);
      resetForm();
      fetchCategories();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to save category' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to disable this category?')) return;
    
    try {
      await api.delete(`/admin/categories/${id}`);
      setToast({ type: 'success', message: 'Category disabled' });
      setTimeout(() => setToast(null), 3000);
      fetchCategories();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to delete' });
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ marginBottom: '32px' }}>
            <div style={{ width: '200px', height: '32px', backgroundColor: '#e2e8f0', borderRadius: '8px', marginBottom: '12px', animation: 'shimmer 1.5s infinite' }} />
            <div style={{ width: '300px', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '6px', animation: 'shimmer 1.5s infinite' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ width: '64px', height: '64px', backgroundColor: '#e2e8f0', borderRadius: '16px', marginBottom: '16px', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ width: '60%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: '8px', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ width: '40%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '6px', animation: 'shimmer 1.5s infinite' }} />
              </div>
            ))}
          </div>
        </div>
        <style>{`@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ 
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', 
          backgroundColor: toast.type === 'error' ? '#dc2626' : '#059669', 
          color: '#fff', padding: '14px 28px', borderRadius: '12px', 
          fontSize: '14px', fontWeight: '600', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', zIndex: 1000 
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Category Manager
            </h1>
            <p style={{ fontSize: '15px', color: '#64748b', margin: '8px 0 0' }}>
              {categories.length} categories · Manage marketplace categories
            </p>
          </div>
          <button 
            onClick={() => { resetForm(); setShowForm(true); }}
            style={{ 
              padding: '14px 24px', backgroundColor: '#0f172a', color: '#fff',
              fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 4px 14px rgba(15,23,42,0.25)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New Category
          </button>
        </div>

        {/* Categories Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {categories.map(cat => (
            <div 
              key={cat.id || cat._id}
              style={{ 
                backgroundColor: '#fff', borderRadius: '16px', padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
                opacity: cat.isActive !== false ? 1 : 0.6,
                transition: 'all 0.2s'
              }}
            >
              {/* Category Visual */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                <div style={{ 
                  width: '64px', height: '64px', borderRadius: '16px',
                  backgroundColor: cat.image ? '#f1f5f9' : (cat.color || '#6366f1') + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0
                }}>
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '28px' }}>{cat.icon || '📦'}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: 0, marginBottom: '4px' }}>
                    {cat.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: cat.color || '#6366f1' }} />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{cat.planCount || 0} plans</span>
                    {cat.isActive === false && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontWeight: '600' }}>DISABLED</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              {cat.description && (
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
                  {cat.description}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => handleEdit(cat)}
                  style={{ 
                    flex: 1, padding: '10px', backgroundColor: '#f1f5f9', color: '#475569',
                    fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer'
                  }}
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleDelete(cat.id || cat._id)}
                  style={{ 
                    padding: '10px 16px', backgroundColor: '#fef2f2', color: '#dc2626',
                    fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer'
                  }}
                >
                  Disable
                </button>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {categories.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '60px 24px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>No categories yet</h3>
              <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>Create your first category to organize plans</p>
              <button 
                onClick={() => { resetForm(); setShowForm(true); }}
                style={{ padding: '12px 24px', backgroundColor: '#0f172a', color: '#fff', borderRadius: '10px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}
              >
                Create Category
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Category Form Modal */}
      {showForm && (
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}
        >
          <div style={{ 
            width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
            backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                {editingId ? 'Edit Category' : 'New Category'}
              </h2>
              <button onClick={resetForm} style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {/* Preview */}
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: '16px', 
                padding: '20px', backgroundColor: '#f8fafc', borderRadius: '16px', marginBottom: '24px'
              }}>
                <div style={{ 
                  width: '72px', height: '72px', borderRadius: '18px',
                  backgroundColor: formData.image ? '#fff' : (formData.color || '#6366f1') + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', border: '2px solid #e2e8f0'
                }}>
                  {formData.image ? (
                    <img src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span style={{ fontSize: '32px' }}>{formData.icon || '📦'}</span>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px' }}>
                    {formData.name || 'Category Name'}
                  </p>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Preview</p>
                </div>
              </div>

              {/* Name */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Name *</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Fresh Vegetables"
                  style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }}
                />
              </div>

              {/* Icon Picker */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Icon (fallback)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {defaultIcons.map(icon => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon }))}
                      style={{
                        width: '44px', height: '44px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                        backgroundColor: formData.icon === icon ? '#0f172a' : '#f1f5f9',
                        fontSize: '20px', transition: 'all 0.15s'
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image URL */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Image URL (recommended)</label>
                <input 
                  type="text" 
                  value={formData.image} 
                  onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                  placeholder="https://example.com/category-image.jpg"
                  style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }}
                />
                <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0' }}>Square images (400x400) work best</p>
              </div>

              {/* Color Picker */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Theme Color</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {defaultColors.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      style={{
                        width: '36px', height: '36px', borderRadius: '10px', border: formData.color === color ? '3px solid #0f172a' : '2px solid #e2e8f0',
                        backgroundColor: color, cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    />
                  ))}
                  <input 
                    type="color" 
                    value={formData.color} 
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    style={{ width: '36px', height: '36px', borderRadius: '10px', border: '2px solid #e2e8f0', cursor: 'pointer' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Description</label>
                <textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Short description for this category..."
                  rows={2}
                  style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              {/* Order & Active */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Sort Order</label>
                  <input 
                    type="number" 
                    value={formData.order} 
                    onChange={(e) => setFormData(prev => ({ ...prev, order: e.target.value }))}
                    style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Status</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', backgroundColor: formData.isActive ? '#f0fdf4' : '#f8fafc', borderRadius: '12px', border: '2px solid #e2e8f0', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={formData.isActive} 
                      onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                      style={{ width: '18px', height: '18px', accentColor: '#059669' }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: formData.isActive ? '#059669' : '#64748b' }}>
                      {formData.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={resetForm}
                  style={{ flex: 1, padding: '14px', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  style={{ 
                    flex: 2, padding: '14px', 
                    backgroundColor: saving ? '#94a3b8' : '#0f172a', 
                    color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', 
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                  }}
                >
                  {saving ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                      Saving...
                    </>
                  ) : editingId ? 'Update Category' : 'Create Category'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Categories;
