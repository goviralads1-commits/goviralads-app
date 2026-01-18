import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const OfficeCMS = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('banners');
  const [editingBanner, setEditingBanner] = useState(null);
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', gradient: '', imageUrl: '', ctaText: '', ctaLink: '', ctaLinkType: 'internal' });

  const fetchData = useCallback(async () => {
    try {
      const [configRes, plansRes] = await Promise.all([
        api.get('/admin/office-config'),
        api.get('/admin/plans').catch(() => ({ data: { plans: [] } }))
      ]);
      setConfig(configRes.data.config);
      setPlans(plansRes.data.plans || []);
    } catch (err) {
      showToast('error', 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const saveConfig = async (updates) => {
    setSaving(true);
    try {
      const res = await api.patch('/admin/office-config', updates);
      setConfig(res.data.config);
      showToast('success', 'Changes saved');
    } catch (err) {
      showToast('error', 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Banner handlers
  const handleAddBanner = async () => {
    if (!bannerForm.title.trim()) { showToast('error', 'Title required'); return; }
    try {
      const res = await api.post('/admin/office-config/banners', bannerForm);
      setConfig(res.data.config);
      setBannerForm({ title: '', subtitle: '', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', imageUrl: '', ctaText: 'Explore Now', ctaLink: '/plans', ctaLinkType: 'internal' });
      setEditingBanner(null);
      showToast('success', 'Banner added');
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to add banner');
    }
  };

  const handleUpdateBanner = async () => {
    if (!editingBanner) return;
    try {
      const res = await api.patch(`/admin/office-config/banners/${editingBanner}`, bannerForm);
      setConfig(res.data.config);
      setEditingBanner(null);
      setBannerForm({ title: '', subtitle: '', gradient: '', imageUrl: '', ctaText: '', ctaLink: '', ctaLinkType: 'internal' });
      showToast('success', 'Banner updated');
    } catch (err) {
      showToast('error', 'Failed to update banner');
    }
  };

  const handleDeleteBanner = async (bannerId) => {
    if (!confirm('Delete this banner?')) return;
    try {
      const res = await api.delete(`/admin/office-config/banners/${bannerId}`);
      setConfig(res.data.config);
      showToast('success', 'Banner deleted');
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleEditBanner = (banner) => {
    setEditingBanner(banner.id);
    setBannerForm({
      title: banner.title,
      subtitle: banner.subtitle || '',
      gradient: banner.gradient || '',
      imageUrl: banner.imageUrl || '',
      ctaText: banner.ctaText || 'Explore Now',
      ctaLink: banner.ctaLink || '/plans',
      ctaLinkType: banner.ctaLinkType || 'internal'
    });
  };

  const handleToggleBanner = async (banner) => {
    try {
      await api.patch(`/admin/office-config/banners/${banner.id}`, { isActive: !banner.isActive });
      fetchData();
    } catch (err) {
      showToast('error', 'Failed to update');
    }
  };

  const handleReorderBanners = async (direction, index) => {
    const newBanners = [...config.banners];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBanners.length) return;
    [newBanners[index], newBanners[targetIndex]] = [newBanners[targetIndex], newBanners[index]];
    const bannerIds = newBanners.map(b => b.id);
    try {
      const res = await api.post('/admin/office-config/banners/reorder', { bannerIds });
      setConfig(res.data.config);
    } catch (err) {
      showToast('error', 'Failed to reorder');
    }
  };

  // Section handlers
  const handleToggleSection = async (sectionId, isEnabled) => {
    const updatedSections = config.sections.map(s => s.id === sectionId ? { ...s, isEnabled } : s);
    await saveConfig({ sections: updatedSections });
  };

  const handleReorderSections = async (direction, index) => {
    const newSections = [...config.sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    newSections.forEach((s, i) => s.order = i);
    await saveConfig({ sections: newSections });
  };

  const handleUpdateSectionTitle = async (sectionId, title) => {
    const updatedSections = config.sections.map(s => s.id === sectionId ? { ...s, title } : s);
    await saveConfig({ sections: updatedSections });
  };

  // Featured Plans handlers
  const handleUpdateFeaturedConfig = async (updates) => {
    await saveConfig({ featuredPlansConfig: { ...config.featuredPlansConfig, ...updates } });
  };

  const handleTogglePlanSelection = (planId) => {
    const current = config.featuredPlansConfig.manualPlanIds || [];
    const updated = current.includes(planId) ? current.filter(id => id !== planId) : [...current, planId];
    handleUpdateFeaturedConfig({ manualPlanIds: updated });
  };

  // See More Button handlers
  const handleUpdateSeeMore = async (updates) => {
    await saveConfig({ seeMoreButtonConfig: { ...config.seeMoreButtonConfig, ...updates } });
  };

  const gradientPresets = [
    { name: 'Purple', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: 'Pink', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { name: 'Blue', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { name: 'Green', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
    { name: 'Orange', value: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' },
    { name: 'Indigo', value: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px' }}>
          <div style={{ height: '60px', backgroundColor: '#e2e8f0', borderRadius: '16px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ height: '300px', backgroundColor: '#e2e8f0', borderRadius: '20px', animation: 'pulse 1.5s infinite' }} />
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Header />
      
      {toast && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', padding: '14px 28px', borderRadius: '16px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>Office CMS</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Customize what clients see in their Office tab</p>
          </div>
          <button onClick={() => navigate('/')} style={{ padding: '10px 20px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '12px', border: 'none', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
            ← Back to Office
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'banners', label: '🖼️ Banners', desc: 'Hero slides' },
            { id: 'sections', label: '📑 Sections', desc: 'Order & visibility' },
            { id: 'featured', label: '⭐ Featured Plans', desc: 'Showcase' },
            { id: 'buttons', label: '🔘 Buttons', desc: 'CTAs' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 20px', borderRadius: '14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                backgroundColor: activeTab === tab.id ? '#6366f1' : '#fff',
                color: activeTab === tab.id ? '#fff' : '#64748b',
                boxShadow: activeTab === tab.id ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'all 0.2s', minWidth: '140px'
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '2px' }}>{tab.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>{tab.desc}</div>
            </button>
          ))}
        </div>

        {/* BANNERS TAB */}
        {activeTab === 'banners' && (
          <div>
            {/* Banner Form */}
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>
                {editingBanner ? '✏️ Edit Banner' : '➕ Add New Banner'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Title *</label>
                  <input type="text" value={bannerForm.title} onChange={e => setBannerForm({...bannerForm, title: e.target.value})} placeholder="Banner heading..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Subtitle</label>
                  <input type="text" value={bannerForm.subtitle} onChange={e => setBannerForm({...bannerForm, subtitle: e.target.value})} placeholder="Short description..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Gradient Background</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {gradientPresets.map(g => (
                    <button key={g.name} onClick={() => setBannerForm({...bannerForm, gradient: g.value})} style={{ width: '48px', height: '32px', borderRadius: '8px', background: g.value, border: bannerForm.gradient === g.value ? '3px solid #0f172a' : '2px solid #e2e8f0', cursor: 'pointer' }} title={g.name} />
                  ))}
                </div>
                <input type="text" value={bannerForm.gradient} onChange={e => setBannerForm({...bannerForm, gradient: e.target.value})} placeholder="Or paste custom gradient..." style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>CTA Button Text</label>
                  <input type="text" value={bannerForm.ctaText} onChange={e => setBannerForm({...bannerForm, ctaText: e.target.value})} placeholder="Explore Now" style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>CTA Link</label>
                  <input type="text" value={bannerForm.ctaLink} onChange={e => setBannerForm({...bannerForm, ctaLink: e.target.value})} placeholder="/plans or https://..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Link Type</label>
                  <select value={bannerForm.ctaLinkType} onChange={e => setBannerForm({...bannerForm, ctaLinkType: e.target.value})} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="internal">Internal (app page)</option>
                    <option value="external">External (new tab)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Image URL (optional)</label>
                  <input type="url" value={bannerForm.imageUrl} onChange={e => setBannerForm({...bannerForm, imageUrl: e.target.value})} placeholder="https://..." style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                {editingBanner ? (
                  <>
                    <button onClick={handleUpdateBanner} style={{ padding: '12px 24px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Update Banner</button>
                    <button onClick={() => { setEditingBanner(null); setBannerForm({ title: '', subtitle: '', gradient: '', imageUrl: '', ctaText: '', ctaLink: '', ctaLinkType: 'internal' }); }} style={{ padding: '12px 24px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '12px', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                  </>
                ) : (
                  <button onClick={handleAddBanner} style={{ padding: '12px 24px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '12px', border: 'none', fontWeight: '600', cursor: 'pointer' }}>+ Add Banner</button>
                )}
              </div>
            </div>

            {/* Banner List */}
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>Current Banners ({config?.banners?.length || 0})</h3>
              {config?.banners?.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: '40px 0' }}>No banners yet. Add one above.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {config.banners.map((banner, idx) => (
                    <div key={banner.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9', opacity: banner.isActive ? 1 : 0.5 }}>
                      <div style={{ width: '120px', height: '70px', borderRadius: '12px', background: banner.gradient || '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {banner.imageUrl ? <img src={banner.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#fff', fontSize: '20px' }}>🖼️</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>{banner.title}</p>
                        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 6px 0' }}>{banner.subtitle || 'No subtitle'}</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span style={{ fontSize: '11px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px' }}>{banner.ctaText || 'No CTA'}</span>
                          <span style={{ fontSize: '11px', backgroundColor: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px' }}>{banner.ctaLink}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button onClick={() => handleReorderBanners('up', idx)} disabled={idx === 0} style={{ padding: '6px 10px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                        <button onClick={() => handleReorderBanners('down', idx)} disabled={idx === config.banners.length - 1} style={{ padding: '6px 10px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: 'none', cursor: idx === config.banners.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === config.banners.length - 1 ? 0.3 : 1 }}>↓</button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleToggleBanner(banner)} style={{ padding: '8px 12px', backgroundColor: banner.isActive ? '#dcfce7' : '#fef2f2', color: banner.isActive ? '#16a34a' : '#dc2626', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>{banner.isActive ? 'Active' : 'Hidden'}</button>
                        <button onClick={() => handleEditBanner(banner)} style={{ padding: '8px 12px', backgroundColor: '#e0f2fe', color: '#0369a1', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Edit</button>
                        <button onClick={() => handleDeleteBanner(banner.id)} style={{ padding: '8px 12px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTIONS TAB */}
        {activeTab === 'sections' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Section Order & Visibility</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>Drag sections to reorder, toggle visibility. Updates/Requirements content comes from Notices.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {config?.sections?.sort((a, b) => a.order - b.order).map((section, idx) => (
                <div key={section.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '14px', border: '1px solid #f1f5f9', backgroundColor: section.isEnabled ? '#fff' : '#f8fafc' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button onClick={() => handleReorderSections('up', idx)} disabled={idx === 0} style={{ padding: '4px 8px', backgroundColor: '#f1f5f9', borderRadius: '6px', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: '12px' }}>↑</button>
                    <button onClick={() => handleReorderSections('down', idx)} disabled={idx === config.sections.length - 1} style={{ padding: '4px 8px', backgroundColor: '#f1f5f9', borderRadius: '6px', border: 'none', cursor: idx === config.sections.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === config.sections.length - 1 ? 0.3 : 1, fontSize: '12px' }}>↓</button>
                  </div>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{section.icon || '📦'}</div>
                  <div style={{ flex: 1 }}>
                    <input type="text" value={section.title} onChange={e => handleUpdateSectionTitle(section.id, e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', fontWeight: '600' }} />
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>Type: {section.type}</p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={section.isEnabled} onChange={e => handleToggleSection(section.id, e.target.checked)} style={{ width: '20px', height: '20px' }} />
                    <span style={{ fontSize: '13px', color: section.isEnabled ? '#16a34a' : '#dc2626', fontWeight: '600' }}>{section.isEnabled ? 'Visible' : 'Hidden'}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FEATURED PLANS TAB */}
        {activeTab === 'featured' && (
          <div>
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>Featured Plans Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Display Count</label>
                  <select value={config?.featuredPlansConfig?.displayCount || 4} onChange={e => handleUpdateFeaturedConfig({ displayCount: parseInt(e.target.value) })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    {[2, 4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} plans</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Selection Mode</label>
                  <select value={config?.featuredPlansConfig?.selectionMode || 'auto'} onChange={e => handleUpdateFeaturedConfig({ selectionMode: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }}>
                    <option value="auto">Auto (Featured flag + Recent)</option>
                    <option value="manual">Manual Selection</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>See All Button Text</label>
                  <input type="text" value={config?.featuredPlansConfig?.seeAllButtonText || 'See All'} onChange={e => handleUpdateFeaturedConfig({ seeAllButtonText: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={config?.featuredPlansConfig?.showSeeAllButton !== false} onChange={e => handleUpdateFeaturedConfig({ showSeeAllButton: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>Show "See All" Button</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Manual Plan Selection */}
            {config?.featuredPlansConfig?.selectionMode === 'manual' && (
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Select Plans to Feature</h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px 0' }}>Click to select/deselect plans. Selected: {config?.featuredPlansConfig?.manualPlanIds?.length || 0}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {plans.map(plan => {
                    const isSelected = config?.featuredPlansConfig?.manualPlanIds?.includes(plan.id);
                    return (
                      <div key={plan.id} onClick={() => handleTogglePlanSelection(plan.id)} style={{ padding: '14px', borderRadius: '14px', border: `2px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`, backgroundColor: isSelected ? '#eef2ff' : '#fff', cursor: 'pointer', transition: 'all 0.2s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '50px', height: '50px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {plan.featureImage ? <img src={plan.featureImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '24px' }}>📦</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</p>
                            <p style={{ fontSize: '13px', color: '#22c55e', fontWeight: '700', margin: '2px 0 0 0' }}>₹{plan.offerPrice || plan.creditCost || 0}</p>
                          </div>
                          <div style={{ width: '24px', height: '24px', borderRadius: '8px', border: `2px solid ${isSelected ? '#6366f1' : '#e2e8f0'}`, backgroundColor: isSelected ? '#6366f1' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: '14px' }}>✓</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BUTTONS TAB */}
        {activeTab === 'buttons' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>See More Plans Button</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Button Text</label>
                <input type="text" value={config?.seeMoreButtonConfig?.text || 'See More Plans'} onChange={e => handleUpdateSeeMore({ text: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Link</label>
                <input type="text" value={config?.seeMoreButtonConfig?.link || '/plans'} onChange={e => handleUpdateSeeMore({ link: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={config?.seeMoreButtonConfig?.isEnabled !== false} onChange={e => handleUpdateSeeMore({ isEnabled: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Show Button</span>
              </label>
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginRight: '8px' }}>Link Type:</label>
                <select value={config?.seeMoreButtonConfig?.linkType || 'internal'} onChange={e => handleUpdateSeeMore({ linkType: e.target.value })} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
            </div>

            <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #f1f5f9' }} />

            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px 0' }}>Page Settings</h3>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Page Title</label>
              <input type="text" value={config?.pageTitle || 'Office'} onChange={e => saveConfig({ pageTitle: e.target.value })} style={{ width: '100%', maxWidth: '300px', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
            </div>
          </div>
        )}

        {saving && (
          <div style={{ position: 'fixed', bottom: '20px', right: '20px', padding: '12px 20px', backgroundColor: '#0f172a', color: '#fff', borderRadius: '12px', fontSize: '14px', fontWeight: '600' }}>
            Saving...
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficeCMS;
