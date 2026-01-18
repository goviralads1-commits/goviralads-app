import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const PlanDetail = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    creditCost: 0,
    offerPrice: '',
    originalPrice: '',
    categoryId: '',
    progressTarget: 100,
    quantity: '',
    showQuantityToClient: true,
    showCreditsToClient: true,
    isActivePlan: true,
    publicNotes: '',
    planMedia: [],
    countdownEndDate: '',
    // Section assignments
    isFeatured: false,
    isPopular: false,
    isNew: false
  });

  const fetchData = useCallback(async () => {
    try {
      const [planRes, categoriesRes] = await Promise.all([
        api.get(`/admin/tasks/${planId}`),
        api.get('/admin/categories').catch(() => ({ data: { categories: [] } }))
      ]);
      
      const planData = planRes.data.task;
      
      // HARD GUARD: Must be a Plan, not a Task
      if (!planData.isListedInPlans || planData.status !== 'LISTED') {
        setError('This is not a Plan. Plans have status LISTED.');
        setLoading(false);
        return;
      }
      
      setPlan(planData);
      setCategories(categoriesRes.data.categories || []);
      
      setFormData({
        title: planData.title || '',
        description: planData.description || '',
        creditCost: planData.creditCost || 0,
        offerPrice: planData.offerPrice || '',
        originalPrice: planData.originalPrice || '',
        categoryId: planData.categoryId || '',
        progressTarget: planData.progressTarget || 100,
        quantity: planData.quantity || '',
        showQuantityToClient: planData.showQuantityToClient ?? true,
        showCreditsToClient: planData.showCreditsToClient ?? true,
        isActivePlan: planData.isActivePlan ?? true,
        publicNotes: planData.publicNotes || '',
        planMedia: planData.planMedia || [],
        countdownEndDate: planData.countdownEndDate ? planData.countdownEndDate.split('T')[0] : '',
        // Section assignments
        isFeatured: planData.isFeatured ?? false,
        isPopular: planData.isPopular ?? false,
        isNew: planData.isNew ?? false
      });
      
      setError(null);
    } catch (err) {
      console.error('Plan fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Media handlers
  const handleAddMedia = () => {
    if (formData.planMedia.length >= 4) {
      setToast({ type: 'error', message: 'Maximum 4 media items allowed' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setFormData(prev => ({
      ...prev,
      planMedia: [...prev.planMedia, { type: 'image', url: '' }]
    }));
    setHasChanges(true);
  };

  const handleMediaChange = (index, field, value) => {
    const updated = [...formData.planMedia];
    updated[index] = { ...updated[index], [field]: value };
    setFormData(prev => ({ ...prev, planMedia: updated }));
    setHasChanges(true);
  };

  const handleRemoveMedia = (index) => {
    setFormData(prev => ({
      ...prev,
      planMedia: prev.planMedia.filter((_, i) => i !== index)
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      setToast({ type: 'error', message: 'Title is required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setSaving(true);
    try {
      // Clean media array - remove empty URLs
      const cleanMedia = formData.planMedia.filter(m => m.url && m.url.trim());
      
      await api.patch(`/admin/tasks/${planId}`, {
        title: formData.title.trim(),
        description: formData.description,
        creditCost: Number(formData.creditCost) || 0,
        offerPrice: formData.offerPrice ? Number(formData.offerPrice) : undefined,
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : undefined,
        categoryId: formData.categoryId || null,
        progressTarget: Number(formData.progressTarget) || 100,
        quantity: formData.quantity ? Number(formData.quantity) : undefined,
        showQuantityToClient: formData.showQuantityToClient,
        showCreditsToClient: formData.showCreditsToClient,
        isActivePlan: formData.isActivePlan,
        publicNotes: formData.publicNotes,
        planMedia: cleanMedia,
        countdownEndDate: formData.countdownEndDate || null,
        // Section assignments
        isFeatured: formData.isFeatured,
        isPopular: formData.isPopular,
        isNew: formData.isNew
      });
      
      setToast({ type: 'success', message: 'Plan updated successfully' });
      setTimeout(() => setToast(null), 3000);
      setHasChanges(false);
      fetchData();
    } catch (err) {
      console.error('Update error:', err);
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update plan' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return url;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <div style={{ width: '80px', height: '40px', backgroundColor: '#e9ecef', borderRadius: '12px', animation: 'shimmer 1.5s infinite' }} />
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <div style={{ width: '100%', height: '200px', backgroundColor: '#e9ecef', borderRadius: '16px', marginBottom: '24px', animation: 'shimmer 1.5s infinite' }} />
            <div style={{ width: '60%', height: '24px', backgroundColor: '#e9ecef', borderRadius: '8px', marginBottom: '16px', animation: 'shimmer 1.5s infinite' }} />
            <div style={{ width: '100%', height: '100px', backgroundColor: '#e9ecef', borderRadius: '8px', animation: 'shimmer 1.5s infinite' }} />
          </div>
        </div>
        <style>{`@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Error</h2>
          <p style={{ fontSize: '15px', color: '#666', marginBottom: '24px' }}>{error}</p>
          <button onClick={() => navigate('/plans')} style={{ padding: '12px 24px', backgroundColor: '#1a1a1a', color: '#fff', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px' }}>
      <Header />
      
      {toast && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100 }}>
          {toast.message}
        </div>
      )}
      
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => navigate('/plans')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px', backgroundColor: '#fff', border: 'none', borderRadius: '14px', fontSize: '14px', fontWeight: '600', color: '#495057', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 18px', backgroundColor: plan?.isActivePlan ? '#e8f5e9' : '#f8f9fa', color: plan?.isActivePlan ? '#2e7d32' : '#6c757d', borderRadius: '12px', fontSize: '13px', fontWeight: '700' }}>
              {plan?.isActivePlan ? 'LIVE' : 'DRAFT'}
            </span>
          </div>
        </div>

        {/* Form */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Media Gallery */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a2e' }}>Media Gallery (max 4)</label>
              <button onClick={handleAddMedia} disabled={formData.planMedia.length >= 4} style={{ padding: '10px 18px', backgroundColor: formData.planMedia.length >= 4 ? '#e9ecef' : '#28a745', color: formData.planMedia.length >= 4 ? '#adb5bd' : '#fff', borderRadius: '10px', border: 'none', cursor: formData.planMedia.length >= 4 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                + Add Media
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {formData.planMedia.map((media, idx) => (
                <div key={idx} style={{ border: '2px solid #e9ecef', borderRadius: '16px', overflow: 'hidden' }}>
                  {/* Preview */}
                  <div style={{ height: '120px', backgroundColor: '#f8fafc', position: 'relative' }}>
                    {media.url ? (
                      media.type === 'video' ? (
                        (() => {
                          const embedUrl = getVideoEmbedUrl(media.url);
                          return embedUrl?.includes('embed') || embedUrl?.includes('player.vimeo') ? (
                            <iframe src={embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b', color: '#fff', fontSize: '24px' }}>🎬</div>
                          );
                        })()
                      ) : (
                        <img src={media.url} alt={`Media ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      )
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      </div>
                    )}
                    <button onClick={() => handleRemoveMedia(idx)} style={{ position: 'absolute', top: '8px', right: '8px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>×</button>
                  </div>
                  
                  {/* Controls */}
                  <div style={{ padding: '12px' }}>
                    <select value={media.type} onChange={(e) => handleMediaChange(idx, 'type', e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '8px' }}>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                    <input type="text" placeholder="Paste URL..." value={media.url} onChange={(e) => handleMediaChange(idx, 'url', e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '6px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Title *</label>
            <input type="text" value={formData.title} onChange={(e) => handleInputChange('title', e.target.value)} placeholder="Plan title" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e9ecef', borderRadius: '14px', outline: 'none' }} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Description</label>
            <textarea value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="What's included in this plan?" rows={4} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e9ecef', borderRadius: '14px', outline: 'none', resize: 'vertical' }} />
          </div>

          {/* Category */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '8px' }}>Category</label>
            <select value={formData.categoryId} onChange={(e) => handleInputChange('categoryId', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e9ecef', borderRadius: '14px', backgroundColor: '#fff', cursor: 'pointer' }}>
              <option value="">Select category</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
              ))}
            </select>
          </div>

          {/* Pricing Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Base Price (₹) *</label>
              <input type="number" value={formData.creditCost} onChange={(e) => handleInputChange('creditCost', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Offer Price (₹)</label>
              <input type="number" value={formData.offerPrice} onChange={(e) => handleInputChange('offerPrice', e.target.value)} placeholder="Sale price" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Strike-through (₹)</label>
              <input type="number" value={formData.originalPrice} onChange={(e) => handleInputChange('originalPrice', e.target.value)} placeholder="Original price" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
            </div>
          </div>

          {/* Target & Quantity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Target Goal *</label>
              <input type="number" value={formData.progressTarget} onChange={(e) => handleInputChange('progressTarget', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Quantity</label>
              <input type="number" value={formData.quantity} onChange={(e) => handleInputChange('quantity', e.target.value)} placeholder="Optional" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
            </div>
          </div>

          {/* Countdown */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Sale Countdown End</label>
            <input type="date" value={formData.countdownEndDate} onChange={(e) => handleInputChange('countdownEndDate', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
          </div>

          {/* Public Notes */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>What's Included (Public Notes)</label>
            <textarea value={formData.publicNotes} onChange={(e) => handleInputChange('publicNotes', e.target.value)} placeholder="List what the client gets..." rows={3} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', resize: 'vertical' }} />
          </div>

          {/* Visibility Toggles */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#1a1a2e', marginBottom: '12px' }}>Visibility</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.isActivePlan} onChange={(e) => handleInputChange('isActivePlan', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#28a745' }} />
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>Live on Marketplace</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.showCreditsToClient} onChange={(e) => handleInputChange('showCreditsToClient', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#28a745' }} />
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>Show Price</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formData.showQuantityToClient} onChange={(e) => handleInputChange('showQuantityToClient', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#28a745' }} />
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>Show Quantity</span>
              </label>
            </div>
          </div>

          {/* Section Assignment (Home Dashboard) */}
          <div style={{ marginBottom: '32px', padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '16px', border: '2px solid #bbf7d0' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '700', color: '#166534', marginBottom: '14px' }}>📍 Home Dashboard Sections</label>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>Assign this plan to appear in specific sections on the client home page</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 16px', backgroundColor: formData.isFeatured ? '#dcfce7' : '#fff', borderRadius: '12px', border: formData.isFeatured ? '2px solid #22c55e' : '2px solid #e5e7eb', transition: 'all 0.2s' }}>
                <input type="checkbox" checked={formData.isFeatured} onChange={(e) => handleInputChange('isFeatured', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#22c55e' }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: formData.isFeatured ? '#166534' : '#6b7280' }}>⭐ Featured</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 16px', backgroundColor: formData.isPopular ? '#fff7ed' : '#fff', borderRadius: '12px', border: formData.isPopular ? '2px solid #f97316' : '2px solid #e5e7eb', transition: 'all 0.2s' }}>
                <input type="checkbox" checked={formData.isPopular} onChange={(e) => handleInputChange('isPopular', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#f97316' }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: formData.isPopular ? '#c2410c' : '#6b7280' }}>🏆 Popular</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 16px', backgroundColor: formData.isNew ? '#eff6ff' : '#fff', borderRadius: '12px', border: formData.isNew ? '2px solid #3b82f6' : '2px solid #e5e7eb', transition: 'all 0.2s' }}>
                <input type="checkbox" checked={formData.isNew} onChange={(e) => handleInputChange('isNew', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }} />
                <span style={{ fontSize: '13px', fontWeight: '600', color: formData.isNew ? '#1d4ed8' : '#6b7280' }}>🆕 New Arrival</span>
              </label>
            </div>
          </div>

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button onClick={() => navigate('/plans')} style={{ padding: '14px 28px', backgroundColor: '#f8f9fa', color: '#495057', fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '14px 28px', backgroundColor: saving ? '#81c784' : '#28a745', color: '#fff', fontSize: '14px', fontWeight: '700', borderRadius: '14px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: saving ? 'none' : '0 6px 20px rgba(40,167,69,0.35)' }}>
              {saving ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Saving...
                </>
              ) : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default PlanDetail;
