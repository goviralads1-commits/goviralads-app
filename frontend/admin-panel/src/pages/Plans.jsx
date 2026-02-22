import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Plans = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  
  // Filters & View
  const [viewMode, setViewMode] = useState('grid');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sectionFilter, setSectionFilter] = useState('ALL');

  // Create Panel State
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [creating, setCreating] = useState(false);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    creditCost: '',
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
    isFeatured: false,
    isPopular: false,
    isNew: false,
    visibility: 'PUBLIC',
    allowedClients: []
  });

  // Premium gradient backgrounds for fallback cards
  const premiumGradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
    'linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)'
  ];

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, categoriesRes, usersRes] = await Promise.all([
        api.get('/admin/plans'),
        api.get('/admin/categories').catch(() => ({ data: { categories: [] } })),
        api.get('/admin/users').catch(() => ({ data: { users: [] } }))
      ]);
      setPlans(plansRes.data.plans || []);
      setCategories(categoriesRes.data.categories || []);
      setUsers(usersRes.data.users || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddMedia = () => {
    if (formData.planMedia.length >= 4) return;
    setFormData(prev => ({
      ...prev,
      planMedia: [...prev.planMedia, { type: 'image', url: '' }]
    }));
  };

  const handleMediaChange = (idx, field, value) => {
    const updated = [...formData.planMedia];
    updated[idx] = { ...updated[idx], [field]: value };
    setFormData(prev => ({ ...prev, planMedia: updated }));
  };

  const handleRemoveMedia = (idx) => {
    setFormData(prev => ({
      ...prev,
      planMedia: prev.planMedia.filter((_, i) => i !== idx)
    }));
  };

  const resetForm = () => {
    setFormData({
      title: '', description: '', creditCost: '', offerPrice: '', originalPrice: '',
      categoryId: '', progressTarget: 100, quantity: '', showQuantityToClient: true,
      showCreditsToClient: true, isActivePlan: true, publicNotes: '', planMedia: [],
      isFeatured: false, isPopular: false, isNew: false, visibility: 'PUBLIC', allowedClients: []
    });
  };

  const handleCreatePlan = async () => {
    if (!formData.title.trim()) {
      setToast({ type: 'error', message: 'Title is required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!formData.creditCost || formData.creditCost <= 0) {
      setToast({ type: 'error', message: 'Base price is required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setCreating(true);
    try {
      const cleanMedia = formData.planMedia.filter(m => m.url && m.url.trim());
      
      const payload = {
        isListedInPlans: true,
        title: formData.title.trim(),
        description: formData.description,
        creditCost: Number(formData.creditCost),
        progressTarget: Number(formData.progressTarget) || 100,
        categoryId: formData.categoryId || null,
        quantity: formData.quantity ? Number(formData.quantity) : undefined,
        showQuantityToClient: formData.showQuantityToClient,
        showCreditsToClient: formData.showCreditsToClient,
        isActivePlan: formData.isActivePlan,
        publicNotes: formData.publicNotes,
        planMedia: cleanMedia,
        isFeatured: formData.isFeatured,
        isPopular: formData.isPopular,
        isNew: formData.isNew,
        visibility: formData.visibility,
        allowedClients: formData.visibility === 'SELECTED' ? formData.allowedClients : []
      };
      
      if (formData.offerPrice) payload.offerPrice = Number(formData.offerPrice);
      if (formData.originalPrice) payload.originalPrice = Number(formData.originalPrice);

      const response = await api.post('/admin/tasks', payload);
      
      if (response.data.mode === 'PLAN') {
        setToast({ type: 'success', message: 'Plan created!' });
        setTimeout(() => setToast(null), 3000);
        setShowCreatePanel(false);
        resetForm();
        fetchData();
      }
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to create plan' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (planId, currentStatus) => {
    try {
      await api.patch(`/admin/tasks/${planId}`, { isActivePlan: !currentStatus });
      setToast({ type: 'success', message: currentStatus ? 'Plan hidden' : 'Plan published' });
      setTimeout(() => setToast(null), 3000);
      fetchData();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update plan' });
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Filter plans
  const filteredPlans = plans.filter(plan => {
    if (selectedCategory !== 'ALL' && plan.categoryId !== selectedCategory) return false;
    if (statusFilter === 'ACTIVE' && !plan.isActivePlan) return false;
    if (statusFilter === 'DRAFT' && plan.isActivePlan) return false;
    if (sectionFilter === 'FEATURED' && !plan.isFeatured) return false;
    if (sectionFilter === 'POPULAR' && !plan.isPopular) return false;
    if (sectionFilter === 'NEW' && !plan.isNew) return false;
    if (searchQuery && !plan.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Skeleton Loader - Premium Style
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <Header />
        <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ width: '100px', backgroundColor: '#fff', borderRight: '1px solid #eef2f6', position: 'sticky', top: '60px', alignSelf: 'flex-start', padding: '16px 0' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ width: '68px', height: '90px', backgroundColor: '#f1f5f9', borderRadius: '16px', margin: '8px auto', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
          <div style={{ flex: 1, padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
              {[1,2,3,4,5,6].map(i => (
                <div key={i} style={{ backgroundColor: '#fff', borderRadius: '18px', overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '1/1', backgroundColor: '#f1f5f9', animation: 'shimmer 1.5s infinite' }} />
                  <div style={{ padding: '18px' }}>
                    <div style={{ width: '70%', height: '16px', backgroundColor: '#f1f5f9', borderRadius: '8px', marginBottom: '12px', animation: 'shimmer 1.5s infinite' }} />
                    <div style={{ width: '40%', height: '20px', backgroundColor: '#f1f5f9', borderRadius: '8px', animation: 'shimmer 1.5s infinite' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", paddingBottom: '100px' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ 
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', 
          background: toast.type === 'error' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
          color: '#fff', padding: '14px 28px', borderRadius: '14px', 
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 
        }}>
          {toast.message}
        </div>
      )}
      
      {/* Main Layout: Left Category Rail + Right Content */}
      <div style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* LEFT VERTICAL CATEGORY RAIL - Premium Style (matches Client) */}
        <div style={{ 
          width: '100px', minWidth: '100px', maxWidth: '100px',
          backgroundColor: '#ffffff', 
          borderRight: '1px solid #eef2f6',
          position: 'sticky', top: '60px',
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto', overflowX: 'hidden',
          paddingTop: '16px', paddingBottom: '16px',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          boxShadow: '4px 0 24px rgba(0,0,0,0.03)'
        }}>
          {/* All Category Tab */}
          <div
            onClick={() => setSelectedCategory('ALL')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '16px 10px', margin: '6px 8px', borderRadius: '16px',
              cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              background: selectedCategory === 'ALL' ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'transparent',
              boxShadow: selectedCategory === 'ALL' ? '0 4px 16px rgba(59, 130, 246, 0.15), inset 0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none'
            }}
          >
            <div style={{ 
              width: '52px', height: '52px', borderRadius: '16px',
              background: selectedCategory === 'ALL' ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '8px', transition: 'all 0.25s',
              boxShadow: selectedCategory === 'ALL' ? '0 6px 20px rgba(59, 130, 246, 0.35)' : '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={selectedCategory === 'ALL' ? '#fff' : '#64748b'} strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ 
              fontSize: '11px', fontWeight: '600', textAlign: 'center',
              color: selectedCategory === 'ALL' ? '#1e40af' : '#475569',
              lineHeight: 1.2, letterSpacing: '0.01em'
            }}>All</span>
            <span style={{ 
              fontSize: '10px', fontWeight: '700', marginTop: '3px',
              color: selectedCategory === 'ALL' ? '#3b82f6' : '#94a3b8',
              backgroundColor: selectedCategory === 'ALL' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.04)',
              padding: '2px 8px', borderRadius: '10px'
            }}>{plans.length}</span>
          </div>
          
          {/* Dynamic Category Tabs */}
          {categories.map(cat => {
            const catId = cat.id || cat._id;
            const count = plans.filter(p => p.categoryId === catId).length;
            const isSelected = selectedCategory === catId;
            const themeColor = cat.color || '#6366f1';
            
            return (
              <div
                key={catId}
                onClick={() => setSelectedCategory(catId)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '16px 10px', margin: '6px 8px', borderRadius: '16px',
                  cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  backgroundColor: isSelected ? `${themeColor}12` : 'transparent',
                  boxShadow: isSelected ? `0 4px 16px ${themeColor}20, inset 0 0 0 2px ${themeColor}30` : 'none'
                }}
              >
                <div style={{ 
                  width: '52px', height: '52px', borderRadius: '16px',
                  backgroundColor: isSelected ? themeColor : '#f1f5f9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '8px', overflow: 'hidden', transition: 'all 0.25s',
                  boxShadow: isSelected ? `0 6px 20px ${themeColor}40` : '0 2px 8px rgba(0,0,0,0.04)',
                  border: cat.image && !isSelected ? '2px solid #e2e8f0' : 'none'
                }}>
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} style={{ 
                      width: '100%', height: '100%', objectFit: 'cover',
                      filter: isSelected ? 'brightness(1.15) saturate(1.1)' : 'none',
                      transition: 'filter 0.25s'
                    }} />
                  ) : (
                    <span style={{ fontSize: '24px', filter: isSelected ? 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'none' }}>{cat.icon || '📦'}</span>
                  )}
                </div>
                <span style={{ 
                  fontSize: '10px', fontWeight: '600', textAlign: 'center',
                  color: isSelected ? themeColor : '#475569',
                  lineHeight: 1.25, maxWidth: '80px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  letterSpacing: '0.01em'
                }}>{cat.name}</span>
                {count > 0 && (
                  <span style={{ 
                    fontSize: '10px', fontWeight: '700', marginTop: '3px',
                    color: isSelected ? themeColor : '#94a3b8',
                    backgroundColor: isSelected ? `${themeColor}15` : 'rgba(0,0,0,0.04)',
                    padding: '2px 8px', borderRadius: '10px'
                  }}>{count}</span>
                )}
              </div>
            );
          })}
          
          {/* Add Category Button */}
          <div
            onClick={() => navigate('/categories')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '16px 10px', margin: '16px 8px 6px', borderRadius: '16px',
              cursor: 'pointer', transition: 'all 0.25s',
              border: '2px dashed #cbd5e1'
            }}
          >
            <div style={{ 
              width: '52px', height: '52px', borderRadius: '16px',
              backgroundColor: '#f8fafc',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '8px'
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8' }}>Manage</span>
          </div>
        </div>
        
        {/* RIGHT CONTENT AREA */}
        <div style={{ flex: 1, padding: '24px 20px', paddingBottom: '100px', minWidth: 0 }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Marketplace Plans</h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0', fontWeight: '500' }}>
                {filteredPlans.length} of {plans.length} plans • {plans.filter(p => p.isActivePlan).length} live
              </p>
            </div>
            <button 
              onClick={() => setShowCreatePanel(true)} 
              style={{ 
                padding: '14px 24px', 
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer', 
                display: 'flex', alignItems: 'center', gap: '10px', 
                boxShadow: '0 6px 20px rgba(59,130,246,0.35)' 
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Create Plan
            </button>
          </div>

          {/* Search & Filters - Premium Style */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '400px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input 
                type="text" 
                placeholder="Search plans..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                style={{ 
                  width: '100%', padding: '16px 18px 16px 52px', fontSize: '15px', 
                  border: '2px solid #e2e8f0', borderRadius: '16px', outline: 'none', backgroundColor: '#fff',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.04)', transition: 'all 0.2s', fontWeight: '500'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)'; }}
              />
            </div>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)} 
              style={{ 
                padding: '14px 20px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '14px', 
                backgroundColor: '#fff', cursor: 'pointer', fontWeight: '600', color: '#475569',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Live Only</option>
              <option value="DRAFT">Drafts Only</option>
            </select>
            <select 
              value={sectionFilter} 
              onChange={(e) => setSectionFilter(e.target.value)} 
              style={{ 
                padding: '14px 20px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '14px', 
                backgroundColor: '#fff', cursor: 'pointer', fontWeight: '600', color: '#475569',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <option value="ALL">All Sections</option>
              <option value="FEATURED">Featured</option>
              <option value="POPULAR">Popular</option>
              <option value="NEW">New</option>
            </select>
            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#fff', borderRadius: '14px', padding: '5px', marginLeft: 'auto', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
              {['grid', 'list'].map(mode => (
                <button 
                  key={mode} 
                  onClick={() => setViewMode(mode)} 
                  style={{ 
                    padding: '10px 14px', border: 'none', borderRadius: '10px', cursor: 'pointer', 
                    backgroundColor: viewMode === mode ? '#0f172a' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  {mode === 'grid' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={viewMode === mode ? '#fff' : '#64748b'} strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={viewMode === mode ? '#fff' : '#64748b'} strokeWidth="2">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '16px 20px', backgroundColor: '#fef2f2', borderRadius: '14px', marginBottom: '24px', border: '1px solid #fecaca' }}>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '14px', fontWeight: '500' }}>{error}</p>
            </div>
          )}

          {/* Empty State */}
          {filteredPlans.length === 0 ? (
            <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#0f172a', marginBottom: '10px' }}>No plans found</h3>
              <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>
                {searchQuery || selectedCategory !== 'ALL' || statusFilter !== 'ALL' ? 'Try adjusting your filters' : 'Create your first marketplace plan'}
              </p>
              <button onClick={() => setShowCreatePanel(true)} style={{ padding: '14px 28px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
                Create Plan
              </button>
            </div>
          ) : (
            /* Plans Grid - Premium Style (matches Client) */
            <div style={{ 
              display: viewMode === 'grid' ? 'grid' : 'flex', 
              gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(260px, 1fr))' : undefined, 
              flexDirection: viewMode === 'list' ? 'column' : undefined, 
              gap: '20px' 
            }}>
              {filteredPlans.map((plan, planIndex) => {
                const mediaArray = Array.isArray(plan.planMedia) ? plan.planMedia : [];
                const firstMedia = mediaArray[0];
                const mediaUrl = firstMedia?.url || plan.featureImage;
                const mediaType = (firstMedia?.type || '').toLowerCase();
                const category = categories.find(c => c.id === plan.categoryId);
                const fallbackGradient = premiumGradients[planIndex % premiumGradients.length];
                const categoryColor = category?.color || '#6366f1';
                
                return (
                  <div 
                    key={plan.id} 
                    style={{ 
                      backgroundColor: '#fff', borderRadius: '18px', overflow: 'hidden', 
                      boxShadow: '0 2px 20px rgba(0,0,0,0.06)', 
                      display: viewMode === 'list' ? 'flex' : 'block', 
                      opacity: plan.isActivePlan ? 1 : 0.85,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      border: '1px solid rgba(0,0,0,0.04)'
                    }}
                    onMouseEnter={(e) => { 
                      e.currentTarget.style.transform = 'translateY(-6px)';
                      e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.12)';
                    }}
                    onMouseLeave={(e) => { 
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 20px rgba(0,0,0,0.06)';
                    }}
                  >
                    {/* Media Section - Premium Design */}
                    <div style={{ 
                      width: viewMode === 'list' ? '180px' : '100%', 
                      aspectRatio: viewMode === 'list' ? undefined : '1/1',
                      height: viewMode === 'list' ? '180px' : undefined,
                      background: mediaUrl ? '#f1f5f9' : fallbackGradient,
                      overflow: 'hidden', position: 'relative', flexShrink: 0 
                    }}>
                      {mediaUrl ? (
                        mediaType === 'video' ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
                            <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                                <polygon points="5,3 19,12 5,21" />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <>
                            <img src={mediaUrl} alt={plan.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to top, rgba(0,0,0,0.25) 0%, transparent 100%)' }} />
                          </>
                        )
                      ) : (
                        /* PREMIUM FALLBACK - No grey empty boxes */
                        <div style={{ 
                          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center', padding: '24px',
                          position: 'relative', overflow: 'hidden'
                        }}>
                          {/* Noise texture overlay */}
                          <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27/%3E%3C/svg%3E")', backgroundSize: 'cover' }} />
                          
                          {/* Category icon watermark */}
                          <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', fontSize: '120px', opacity: 0.1, transform: 'rotate(-15deg)' }}>
                            {category?.icon || '📦'}
                          </div>
                          
                          {/* Title on fallback card */}
                          <h4 style={{ 
                            fontSize: viewMode === 'list' ? '14px' : '16px', fontWeight: '700', color: '#ffffff', 
                            textAlign: 'center', margin: 0, lineHeight: 1.3,
                            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            position: 'relative', zIndex: 2
                          }}>
                            {plan.title}
                          </h4>
                          
                          {/* Price badge on fallback */}
                          <div style={{ 
                            marginTop: '12px', padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)',
                            borderRadius: '20px', backdropFilter: 'blur(8px)', position: 'relative', zIndex: 2
                          }}>
                            <span style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                              ₹{plan.offerPrice || plan.creditCost}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Media Count Badge */}
                      {mediaArray.length > 1 && (
                        <div style={{ position: 'absolute', top: '12px', left: '12px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backdropFilter: 'blur(4px)' }}>
                          {mediaArray.length} media
                        </div>
                      )}
                      
                      {/* Status Badge */}
                      <div style={{ 
                        position: 'absolute', top: '12px', right: '12px', 
                        background: plan.isActivePlan ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #64748b 0%, #475569 100%)', 
                        color: '#fff', padding: '6px 14px', borderRadius: '20px', 
                        fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                      }}>
                        {plan.isActivePlan ? 'LIVE' : 'DRAFT'}
                      </div>
                      
                      {/* Category Badge */}
                      {category && mediaUrl && (
                        <div style={{ 
                          position: 'absolute', bottom: '12px', left: '12px', 
                          backgroundColor: 'rgba(255,255,255,0.95)', color: categoryColor, 
                          padding: '6px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                          display: 'flex', alignItems: 'center', gap: '5px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', backdropFilter: 'blur(8px)'
                        }}>
                          {category.icon && <span style={{ fontSize: '12px' }}>{category.icon}</span>}
                          {category.name}
                        </div>
                      )}
                    </div>

                    {/* Content Section */}
                    <div style={{ padding: '18px', flex: 1 }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px', lineHeight: 1.35, letterSpacing: '-0.01em' }}>{plan.title}</h3>
                      
                      {/* Section Badges */}
                      {(plan.isFeatured || plan.isPopular || plan.isNew) && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          {plan.isFeatured && (
                            <span style={{ padding: '4px 10px', backgroundColor: '#dcfce7', color: '#166534', fontSize: '10px', fontWeight: '600', borderRadius: '8px' }}>Featured</span>
                          )}
                          {plan.isPopular && (
                            <span style={{ padding: '4px 10px', backgroundColor: '#fff7ed', color: '#c2410c', fontSize: '10px', fontWeight: '600', borderRadius: '8px' }}>Popular</span>
                          )}
                          {plan.isNew && (
                            <span style={{ padding: '4px 10px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '10px', fontWeight: '600', borderRadius: '8px' }}>New</span>
                          )}
                        </div>
                      )}
                      
                      {plan.description && viewMode === 'list' && (
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {plan.description}
                        </p>
                      )}
                      
                      {/* Pricing */}
                      <div style={{ marginBottom: '14px' }}>
                        {plan.offerPrice ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>₹{plan.offerPrice}</span>
                            <span style={{ fontSize: '14px', color: '#94a3b8', textDecoration: 'line-through', fontWeight: '500' }}>₹{plan.creditCost}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>₹{plan.creditCost || 0}</span>
                        )}
                      </div>
                      
                      {/* Action Buttons - Admin Specific */}
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => navigate(`/plans/${plan.id}`)} 
                          style={{ flex: 1, padding: '12px 10px', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '13px', fontWeight: '600', borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleToggleStatus(plan.id, plan.isActivePlan)} 
                          style={{ 
                            flex: 1, padding: '12px 10px', 
                            backgroundColor: plan.isActivePlan ? '#fef2f2' : '#f0fdf4', 
                            color: plan.isActivePlan ? '#dc2626' : '#16a34a', 
                            fontSize: '13px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' 
                          }}
                        >
                          {plan.isActivePlan ? 'Hide' : 'Publish'}
                        </button>
                        <button 
                          onClick={() => navigate(`/plans/${plan.id}/preview`)} 
                          style={{ 
                            padding: '12px 14px', backgroundColor: '#eff6ff', color: '#2563eb', 
                            fontSize: '13px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' 
                          }} 
                          title="Preview as client"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create Plan Panel */}
      {showCreatePanel && (
        <div 
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} 
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreatePanel(false); }}
        >
          <div style={{ width: '100%', maxWidth: '520px', height: '100%', backgroundColor: '#fff', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' }}>
            {/* Panel Header */}
            <div style={{ position: 'sticky', top: 0, backgroundColor: '#fff', padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Create New Plan</h2>
              <button onClick={() => setShowCreatePanel(false)} style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {/* Media Section */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Media (max 4)</label>
                  <button onClick={handleAddMedia} disabled={formData.planMedia.length >= 4} style={{ padding: '8px 16px', background: formData.planMedia.length >= 4 ? '#e2e8f0' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: formData.planMedia.length >= 4 ? '#94a3b8' : '#fff', borderRadius: '10px', border: 'none', cursor: formData.planMedia.length >= 4 ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    + Add
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {formData.planMedia.map((media, idx) => (
                    <div key={idx} style={{ border: '2px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden' }}>
                      <div style={{ height: '90px', backgroundColor: '#f1f5f9', position: 'relative' }}>
                        {media.url ? (
                          media.type === 'video' ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff', fontSize: '24px' }}>
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
                            </div>
                          ) : (
                            <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                          </div>
                        )}
                        <button onClick={() => handleRemoveMedia(idx)} style={{ position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>×</button>
                      </div>
                      <div style={{ padding: '10px' }}>
                        <select value={media.type} onChange={(e) => handleMediaChange(idx, 'type', e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                        </select>
                        <input type="text" placeholder="Paste URL..." value={media.url} onChange={(e) => handleMediaChange(idx, 'url', e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                      </div>
                    </div>
                  ))}
                </div>
                {formData.planMedia.length === 0 && (
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '8px 0 0' }}>Click + Add to add images or videos</p>
                )}
              </div>

              {/* Title */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Title *</label>
                <input type="text" value={formData.title} onChange={(e) => handleInputChange('title', e.target.value)} placeholder="Plan name" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Description</label>
                <textarea value={formData.description} onChange={(e) => handleInputChange('description', e.target.value)} placeholder="What's included?" rows={3} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', resize: 'vertical' }} />
              </div>

              {/* Category with link */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Category</label>
                  <button onClick={() => navigate('/categories')} style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>+ Create New</button>
                </div>
                <select value={formData.categoryId} onChange={(e) => handleInputChange('categoryId', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#fff', cursor: 'pointer' }}>
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
                {/* Category Preview */}
                {formData.categoryId && (() => {
                  const cat = categories.find(c => c.id === formData.categoryId);
                  return cat ? (
                    <div style={{ marginTop: '10px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: cat.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {cat.image ? <img src={cat.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '20px' }}>{cat.icon || '📦'}</span>}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{cat.name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>{cat.description || 'No description'}</p>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Pricing */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Base Price (₹) *</label>
                  <input type="number" value={formData.creditCost} onChange={(e) => handleInputChange('creditCost', e.target.value)} placeholder="0" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Offer Price (₹)</label>
                  <input type="number" value={formData.offerPrice} onChange={(e) => handleInputChange('offerPrice', e.target.value)} placeholder="Sale price" style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
                </div>
              </div>

              {/* Target (Internal - hidden from client) */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Target Goal (Internal)</label>
                <input type="number" value={formData.progressTarget} onChange={(e) => handleInputChange('progressTarget', e.target.value)} style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none' }} />
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>Used internally for tracking. Not shown to clients.</p>
              </div>

              {/* Visibility Controls */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Visibility</label>
                <select 
                  value={formData.visibility} 
                  onChange={(e) => handleInputChange('visibility', e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', backgroundColor: '#fff', cursor: 'pointer', marginBottom: '12px' }}
                >
                  <option value="PUBLIC">Public (All Clients)</option>
                  <option value="SELECTED">Selected Clients</option>
                  <option value="HIDDEN">Hidden (Draft)</option>
                </select>
                
                {formData.visibility === 'SELECTED' && (
                  <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '2px solid #e2e8f0' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '10px' }}>Select Clients</label>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                      {users.filter(u => u.role === 'CLIENT').map(user => (
                        <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.15s' }}>
                          <input 
                            type="checkbox" 
                            checked={formData.allowedClients.includes(user.id)} 
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleInputChange('allowedClients', [...formData.allowedClients, user.id]);
                              } else {
                                handleInputChange('allowedClients', formData.allowedClients.filter(id => id !== user.id));
                              }
                            }}
                            style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }} 
                          />
                          <span style={{ fontSize: '14px', color: '#334155' }}>{user.name || user.identifier}</span>
                        </label>
                      ))}
                    </div>
                    {formData.allowedClients.length > 0 && (
                      <p style={{ fontSize: '12px', color: '#64748b', margin: '10px 0 0' }}>
                        {formData.allowedClients.length} client{formData.allowedClients.length > 1 ? 's' : ''} selected
                      </p>
                    )}
                  </div>
                )}
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.isActivePlan} onChange={(e) => handleInputChange('isActivePlan', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>Publish immediately</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.showCreditsToClient} onChange={(e) => handleInputChange('showCreditsToClient', e.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#475569' }}>Show price to client</span>
                  </label>
                </div>
              </div>

              {/* Section Assignment */}
              <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f0f9ff', borderRadius: '14px', border: '2px solid #bae6fd' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#0369a1', marginBottom: '12px' }}>Home Dashboard Sections</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 14px', backgroundColor: formData.isFeatured ? '#dcfce7' : '#fff', borderRadius: '10px', border: formData.isFeatured ? '2px solid #22c55e' : '2px solid #e2e8f0' }}>
                    <input type="checkbox" checked={formData.isFeatured} onChange={(e) => handleInputChange('isFeatured', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#22c55e' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: formData.isFeatured ? '#166534' : '#64748b' }}>Featured</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 14px', backgroundColor: formData.isPopular ? '#fff7ed' : '#fff', borderRadius: '10px', border: formData.isPopular ? '2px solid #f97316' : '2px solid #e2e8f0' }}>
                    <input type="checkbox" checked={formData.isPopular} onChange={(e) => handleInputChange('isPopular', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#f97316' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: formData.isPopular ? '#c2410c' : '#64748b' }}>Popular</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px 14px', backgroundColor: formData.isNew ? '#eff6ff' : '#fff', borderRadius: '10px', border: formData.isNew ? '2px solid #3b82f6' : '2px solid #e2e8f0' }}>
                    <input type="checkbox" checked={formData.isNew} onChange={(e) => handleInputChange('isNew', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '12px', fontWeight: '600', color: formData.isNew ? '#1d4ed8' : '#64748b' }}>New</span>
                  </label>
                </div>
              </div>

              {/* Preview */}
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '16px', padding: '18px', marginBottom: '24px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Button Preview</p>
                <button disabled style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: 'none' }}>
                  Buy Now • ₹{formData.offerPrice || formData.creditCost || 0}
                </button>
              </div>

              {/* Submit */}
              <button 
                onClick={handleCreatePlan} 
                disabled={creating}
                style={{ 
                  width: '100%', padding: '16px',
                  background: creating ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: 'none',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  boxShadow: creating ? 'none' : '0 6px 20px rgba(59,130,246,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                {creating ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                    Creating...
                  </>
                ) : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default Plans;