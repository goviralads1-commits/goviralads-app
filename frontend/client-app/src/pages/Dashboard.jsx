import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';
import { initPushNotifications, setupForegroundHandler } from '../services/pushService';

// Helper: Extract video thumbnail URL
const getVideoThumbnail = (url) => {
  if (!url) return null;
  
  // YouTube: youtube.com/watch?v= or youtu.be/
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (ytMatch) {
    return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }
  
  // Cloudinary video: /video/upload/ → convert to thumbnail
  if (url.includes('/video/upload/')) {
    // Insert so_0 (first frame) and change extension to .jpg
    return url.replace('/video/upload/', '/video/upload/so_0/').replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
  }
  
  // Vimeo: Extract ID and use vumbnail service
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://vumbnail.com/${vimeoMatch[1]}.jpg`;
  }
  
  // Direct video file - no thumbnail available
  return null;
};

// Helper: Get display URL for media (thumbnail for video, direct URL for image)
const getMediaDisplayUrl = (media) => {
  if (!media?.url) return null;
  if (media.type === 'video') {
    return getVideoThumbnail(media.url);
  }
  return media.url;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [featuredPlans, setFeaturedPlans] = useState([]);
  const [notices, setNotices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentBanner, setCurrentBanner] = useState(0);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [responding, setResponding] = useState(false);
  const [responseValue, setResponseValue] = useState('');
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, noticesRes, tasksRes] = await Promise.all([
        api.get('/client/office-config').catch(() => ({ data: { config: null, featuredPlans: [] } })),
        api.get('/client/notices').catch(() => ({ data: { notices: [] } })),
        api.get('/client/tasks').catch(() => ({ data: { tasks: [] } }))
      ]);
      setConfig(configRes.data.config);
      setFeaturedPlans(configRes.data.featuredPlans || []);
      setNotices(noticesRes.data.notices || []);
      setTasks(tasksRes.data.tasks || []);
    } catch (err) {
      // Silent fail - show empty states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize push notifications after login
  useEffect(() => {
    initPushNotifications();
    // Register foreground message handler so notifications show when tab is open
    const unsubscribe = setupForegroundHandler(null);
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  // Auto-rotate banners
  useEffect(() => {
    if (!config?.banners?.length || !config.bannerAutoRotate) return;
    const interval = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % config.banners.length);
    }, config.bannerRotateInterval || 5000);
    return () => clearInterval(interval);
  }, [config?.banners?.length, config?.bannerAutoRotate, config?.bannerRotateInterval]);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleViewNotice = async (notice) => {
    try {
      // Mark as viewed
      await api.post(`/client/notices/${notice.id}/view`).catch(() => {});
      setSelectedNotice(notice);
      setResponseValue('');
    } catch (err) {
      setSelectedNotice(notice);
    }
  };

  const handleSubmitResponse = async (responseType, value) => {
    if (!selectedNotice) return;
    setResponding(true);
    try {
      await api.post(`/client/notices/${selectedNotice.id}/respond`, {
        responseType,
        value
      });
      showToast('success', 'Response submitted!');
      setSelectedNotice(null);
      fetchData();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to submit response');
    } finally {
      setResponding(false);
    }
  };

  const updates = notices.filter(n => n.type === 'UPDATE').sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  const requirements = notices.filter(n => n.type === 'REQUIREMENT').sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  const promotions = notices.filter(n => n.type === 'PROMOTION').sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  // Filter tasks by status
  const pendingTasks = tasks.filter(t => t.status === 'PENDING_APPROVAL');
  const activeTasks = tasks.filter(t => ['ACTIVE', 'IN_PROGRESS', 'PENDING', 'SCHEDULED'].includes(t.status));
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').slice(0, 3); // Show only recent 3

  // Get banners from config or fallback
  const banners = config?.banners?.length > 0 ? config.banners : [
    { id: 'default1', title: 'Premium Services', subtitle: 'Get started with our top plans', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', ctaText: 'Explore Now', ctaLink: '/plans', ctaLinkType: 'internal' }
  ];

  // Get sections config
  const getSectionConfig = (type) => config?.sections?.find(s => s.type === type) || { isEnabled: true, title: type };
  const featuredSection = getSectionConfig('FEATURED_PLANS');
  const seeMoreSection = getSectionConfig('SEE_MORE_BUTTON');
  const updatesSection = getSectionConfig('UPDATES');
  const requirementsSection = getSectionConfig('REQUIREMENTS');
  const promotionsSection = getSectionConfig('PROMOTIONS');
  
  // Get specific section configs
  const updatesSectionConfig = config?.updatesSectionConfig || { title: 'Updates', icon: '🔄', emptyText: 'No updates at the moment', emptyIcon: '📭' };
  const requirementsSectionConfig = config?.requirementsSectionConfig || { title: 'Requirements', icon: '📋', emptyText: 'All caught up! No requirements pending.', emptyIcon: '✅' };
  const promotionsSectionConfig = config?.promotionsSectionConfig || { title: 'Promotions', icon: '🎁', emptyText: 'No promotions available', emptyIcon: '🎉' };

  // Handle CTA clicks
  const handleCtaClick = (banner) => {
    if (banner.ctaLinkType === 'external' && banner.ctaLink) {
      window.open(banner.ctaLink, '_blank');
    } else {
      navigate(banner.ctaLink || '/plans');
    }
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
          <div style={{ height: '160px', backgroundColor: '#e2e8f0', borderRadius: '24px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: '160px', backgroundColor: '#e2e8f0', borderRadius: '16px', animation: 'pulse 1.5s infinite' }} />
            ))}
          </div>
          <div style={{ height: '56px', backgroundColor: '#e2e8f0', borderRadius: '16px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
          {[1,2].map(i => (
            <div key={i} style={{ height: '100px', backgroundColor: '#e2e8f0', borderRadius: '16px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#ef4444' : '#22c55e', color: '#fff', padding: '14px 28px', borderRadius: '16px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000 }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px', paddingBottom: '100px' }}>
        
        {/* Page Title */}
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '0 0 20px 0' }}>{config?.pageTitle || 'Office'}</h1>

        {/* BANNER CAROUSEL */}
        {banners.length > 0 && (
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <div 
            className="banner-container"
            style={{ 
              background: banners[currentBanner]?.imageUrl ? `url(${banners[currentBanner].imageUrl})` : (banners[currentBanner]?.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
              borderRadius: '24px',
              padding: '32px 24px',
              aspectRatio: '16 / 6',
              minHeight: '140px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              transition: 'background 0.5s ease',
              overflow: 'hidden',
              position: 'relative',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            <style>{`
              @media (max-width: 768px) {
                .banner-container {
                  aspect-ratio: 16 / 7 !important;
                  background-size: contain !important;
                }
              }
            `}</style>
            <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            {banners[currentBanner]?.title && (
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#fff', margin: '0 0 8px', position: 'relative', zIndex: 1 }}>
                {banners[currentBanner].title}
              </h2>
            )}
            {banners[currentBanner]?.subtitle && (
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.9)', margin: '0 0 16px', position: 'relative', zIndex: 1 }}>
                {banners[currentBanner].subtitle}
              </p>
            )}
            {(banners[currentBanner]?.ctaText && banners[currentBanner]?.ctaLink) && (
              <button 
                onClick={() => handleCtaClick(banners[currentBanner])}
                style={{ alignSelf: 'flex-start', padding: '12px 24px', backgroundColor: '#fff', color: '#0f172a', fontSize: '14px', fontWeight: '700', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', zIndex: 1 }}
              >
                {banners[currentBanner].ctaText}
              </button>
            )}
          </div>
          {banners.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '14px' }}>
            {banners.map((_, idx) => (
              <button key={idx} onClick={() => setCurrentBanner(idx)} style={{ width: idx === currentBanner ? '24px' : '8px', height: '8px', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: idx === currentBanner ? '#6366f1' : '#e2e8f0', transition: 'all 0.3s ease' }} />
            ))}
          </div>
          )}
        </div>
        )}

        {/* FEATURED PLANS */}
        {featuredSection.isEnabled && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{featuredSection.icon || '⭐'}</span>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{featuredSection.title || 'Featured Plans'}</h3>
            </div>
            {config?.featuredPlansConfig?.showSeeAllButton !== false && (
            <button onClick={() => navigate('/plans')} style={{ fontSize: '14px', color: '#6366f1', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}>
              {config?.featuredPlansConfig?.seeAllButtonText || 'See All'} →
            </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            {featuredPlans.slice(0, config?.featuredPlansConfig?.displayCount || 4).map((plan, idx) => {
              const coverMedia = plan.planMedia?.[0];
              const displayUrl = coverMedia ? getMediaDisplayUrl(coverMedia) : (plan.featureImage || null);
              const isVideo = coverMedia?.type === 'video';
              
              return (
                <div 
                  key={plan.id || idx} 
                  onClick={() => navigate(`/plans/${plan.id}`)}
                  style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
                >
                  {/* 1:1 Aspect Ratio Container */}
                  <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                    {displayUrl ? (
                      <>
                        <img 
                          src={displayUrl} 
                          alt="" 
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                        />
                        {/* Fallback if image fails */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'none', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
                          <span style={{ fontSize: '32px' }}>{isVideo ? '🎬' : '📦'}</span>
                        </div>
                        {/* Play icon overlay for videos */}
                        {isVideo && (
                          <div style={{ position: 'absolute', top: '8px', right: '8px', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
                              <polygon points="5,3 19,12 5,21" />
                            </svg>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
                        <span style={{ fontSize: '32px', opacity: 0.8 }}>📦</span>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.title}</p>
                    <p style={{ fontSize: '16px', fontWeight: '800', color: '#22c55e', margin: 0 }}>₹{plan.offerPrice || plan.creditCost || 0}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* SEE MORE BUTTON */}
        {seeMoreSection.isEnabled && config?.seeMoreButtonConfig?.isEnabled !== false && (
        <div style={{ marginBottom: '28px' }}>
          <button 
            onClick={() => {
              if (config?.seeMoreButtonConfig?.linkType === 'external') {
                window.open(config.seeMoreButtonConfig.link, '_blank');
              } else {
                navigate(config?.seeMoreButtonConfig?.link || '/plans');
              }
            }}
            style={{ width: '100%', padding: '18px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '16px', fontWeight: '700', borderRadius: '16px', border: 'none', cursor: 'pointer', boxShadow: '0 6px 20px rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            {config?.seeMoreButtonConfig?.text || 'See More Plans'}
          </button>
        </div>
        )}

        {/* PENDING ADMIN REVIEW TASKS */}
        {pendingTasks.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>⏳</span>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Pending Admin Review</h3>
            <span style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{pendingTasks.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingTasks.map(task => (
              <div 
                key={task.id || task._id} 
                onClick={() => navigate(`/tasks/${task.id || task._id}`)}
                style={{ backgroundColor: '#fffbeb', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #f59e0b', border: '1px solid #fef3c7', cursor: 'pointer', transition: 'transform 0.2s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{task.icon || '📝'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                    <p style={{ fontSize: '12px', color: '#d97706', margin: 0 }}>Waiting for admin to start your task</p>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#d97706' }}>₹{task.creditsUsed || task.creditCost || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ACTIVE TASKS */}
        {activeTasks.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🟢</span>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Active Tasks</h3>
              <span style={{ backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{activeTasks.length}</span>
            </div>
            <button onClick={() => navigate('/tasks')} style={{ fontSize: '14px', color: '#6366f1', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}>
              View All →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeTasks.slice(0, 3).map(task => (
              <div 
                key={task.id || task._id} 
                onClick={() => navigate(`/tasks/${task.id || task._id}`)}
                style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #22c55e', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{task.icon || '📝'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${task.progress || 0}%`, height: '100%', backgroundColor: '#22c55e', borderRadius: '3px', transition: 'width 0.3s' }} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#22c55e' }}>{task.progress || 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* RECENTLY COMPLETED TASKS */}
        {completedTasks.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>✅</span>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Recently Completed</h3>
            </div>
            <button onClick={() => navigate('/tasks')} style={{ fontSize: '14px', color: '#6366f1', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer' }}>
              View All →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {completedTasks.map(task => (
              <div 
                key={task.id || task._id} 
                onClick={() => navigate(`/tasks/${task.id || task._id}`)}
                style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #94a3b8', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s', opacity: 0.8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{task.icon || '📝'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px', margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Completed {task.completedAt ? new Date(task.completedAt).toLocaleDateString() : ''}</p>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#22c55e', backgroundColor: '#dcfce7', padding: '4px 10px', borderRadius: '8px' }}>Done</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* UPDATES SECTION */}
        {updatesSection.isEnabled && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>{config?.updatesSectionConfig?.icon || '🔄'}</span>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{config?.updatesSectionConfig?.title || 'Updates'}</h3>
            <span style={{ backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{updates.length}</span>
          </div>
          {updates.length === 0 ? (
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.5 }}>{config?.updatesSectionConfig?.emptyIcon || '📭'}</div>
              <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>{config?.updatesSectionConfig?.emptyText || 'No updates at the moment'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {updates.map(notice => (
                <div 
                  key={notice.id} 
                  onClick={() => handleViewNotice(notice)}
                  style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #3b82f6', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    {notice.imageUrl ? (
                      <img src={notice.imageUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '12px', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '22px' }}>🔄</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{notice.title}</span>
                        {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌 Pinned</span>}
                      </div>
                      <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 6px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(notice.createdAt).toLocaleDateString()}</span>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* REQUIREMENTS SECTION */}
        {requirementsSection.isEnabled && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>{config?.requirementsSectionConfig?.icon || '📋'}</span>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{config?.requirementsSectionConfig?.title || 'Requirements'}</h3>
            <span style={{ backgroundColor: '#ffedd5', color: '#c2410c', padding: '2px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{requirements.length}</span>
          </div>
          {requirements.length === 0 ? (
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.5 }}>{config?.requirementsSectionConfig?.emptyIcon || '✅'}</div>
              <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>{config?.requirementsSectionConfig?.emptyText || 'All caught up! No requirements pending.'}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {requirements.map(notice => (
                <div 
                  key={notice.id} 
                  onClick={() => handleViewNotice(notice)}
                  style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: `4px solid ${notice.priority === 'URGENT' ? '#ef4444' : notice.priority === 'HIGH' ? '#f59e0b' : '#22c55e'}`, border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: notice.responseRequired && !notice.hasResponded ? '#fee2e2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '22px' }}>{notice.hasResponded ? '✅' : '📋'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{notice.title}</span>
                        {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌</span>}
                        {notice.responseRequired && !notice.hasResponded && (
                          <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px' }}>Action Required</span>
                        )}
                        {notice.hasResponded && (
                          <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px' }}>Responded</span>
                        )}
                      </div>
                      <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 6px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(notice.createdAt).toLocaleDateString()}</span>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* PROMOTIONS SECTION */}
        {promotionsSection.isEnabled && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px' }}>{promotionsSectionConfig.icon}</span>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{promotionsSectionConfig.title}</h3>
            <span style={{ backgroundColor: '#fed7aa', color: '#c2410c', padding: '2px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>{promotions.length}</span>
          </div>
          {promotions.length === 0 ? (
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '32px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.5 }}>{promotionsSectionConfig.emptyIcon}</div>
              <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>{promotionsSectionConfig.emptyText}</p>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {promotions.map(notice => (
              <div 
                key={notice.id} 
                onClick={() => handleViewNotice(notice)}
                style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #f97316', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'transform 0.2s' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '12px', backgroundColor: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '22px' }}>{notice.hasResponded ? '✅' : '🎁'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '15px' }}>{notice.title}</span>
                      {notice.isPinned && <span style={{ fontSize: '11px', backgroundColor: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '6px' }}>📌</span>}
                      {notice.responseRequired && !notice.hasResponded && (
                        <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px' }}>Action Required</span>
                      )}
                      {notice.hasResponded && (
                        <span style={{ fontSize: '11px', backgroundColor: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '6px' }}>Responded</span>
                      )}
                    </div>
                    <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 6px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notice.content}</p>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date(notice.createdAt).toLocaleDateString()}</span>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        )}
      </div>

      {/* NOTICE DETAIL MODAL */}
      {selectedNotice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>{selectedNotice.type === 'REQUIREMENT' ? '📋 Requirement' : selectedNotice.type === 'PROMOTION' ? '🎁 Promotion' : '🔄 Update'}</h3>
              <button 
                onClick={() => setSelectedNotice(null)} 
                style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px', maxHeight: 'calc(90vh - 160px)', overflowY: 'auto' }}>
              <h4 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' }}>{selectedNotice.title}</h4>
              
              {selectedNotice.imageUrl && (
                <img src={selectedNotice.imageUrl} alt="" style={{ width: '100%', borderRadius: '16px', marginBottom: '16px' }} />
              )}
              
              <p style={{ fontSize: '15px', color: '#374151', lineHeight: 1.7, margin: '0 0 20px 0', whiteSpace: 'pre-wrap' }}>{selectedNotice.content}</p>
              
              {selectedNotice.linkUrl && (
                <a href={selectedNotice.linkUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '12px 20px', backgroundColor: '#f1f5f9', color: '#6366f1', borderRadius: '12px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', marginBottom: '20px' }}>
                  {selectedNotice.linkText || 'Learn More'} →
                </a>
              )}
              
              {/* Response Section */}
              {selectedNotice.responseType && selectedNotice.responseType !== 'NONE' && !selectedNotice.hasResponded && (
                <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#fef3c7', borderRadius: '16px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#92400e', margin: '0 0 16px 0' }}>⚠️ Your response is required</p>
                  
                  {selectedNotice.responseType === 'YES_NO' && (
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => handleSubmitResponse('YES', 'Yes')} disabled={responding} style={{ flex: 1, padding: '14px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.7 : 1 }}>
                        ✅ Yes
                      </button>
                      <button onClick={() => handleSubmitResponse('NO', 'No')} disabled={responding} style={{ flex: 1, padding: '14px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: responding ? 'not-allowed' : 'pointer', opacity: responding ? 0.7 : 1 }}>
                        ❌ No
                      </button>
                    </div>
                  )}
                  
                  {selectedNotice.responseType === 'RATING' && (
                    <div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
                        {[1,2,3,4,5].map(star => (
                          <button key={star} onClick={() => setResponseValue(String(star))} style={{ width: '48px', height: '48px', fontSize: '24px', backgroundColor: responseValue >= String(star) ? '#fef3c7' : '#fff', border: '2px solid #f59e0b', borderRadius: '12px', cursor: 'pointer' }}>
                            {responseValue >= String(star) ? '⭐' : '☆'}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => handleSubmitResponse('RATING', responseValue)} disabled={responding || !responseValue} style={{ width: '100%', padding: '14px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: (responding || !responseValue) ? 'not-allowed' : 'pointer', opacity: (responding || !responseValue) ? 0.7 : 1 }}>
                        Submit Rating
                      </button>
                    </div>
                  )}
                  
                  {selectedNotice.responseType === 'TEXT' && (
                    <div>
                      <textarea value={responseValue} onChange={(e) => setResponseValue(e.target.value)} placeholder="Type your response..." rows={4} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '14px', resize: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
                      <button onClick={() => handleSubmitResponse('TEXT', responseValue)} disabled={responding || !responseValue.trim()} style={{ width: '100%', padding: '14px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: (responding || !responseValue.trim()) ? 'not-allowed' : 'pointer', opacity: (responding || !responseValue.trim()) ? 0.7 : 1 }}>
                        Submit Response
                      </button>
                    </div>
                  )}
                  
                  {selectedNotice.responseType === 'FILE' && (
                    <div>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', border: '2px dashed #d97706', borderRadius: '12px', backgroundColor: '#fffbeb', cursor: 'pointer', marginBottom: '12px' }}>
                        <span style={{ fontSize: '32px', marginBottom: '8px' }}>📎</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#92400e' }}>
                          {responseValue ? responseValue : 'Click to upload file'}
                        </span>
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setResponseValue(file.name);
                          }}
                        />
                      </label>
                      <button onClick={() => handleSubmitResponse('FILE', responseValue)} disabled={responding || !responseValue} style={{ width: '100%', padding: '14px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', fontSize: '15px', fontWeight: '700', cursor: (responding || !responseValue) ? 'not-allowed' : 'pointer', opacity: (responding || !responseValue) ? 0.7 : 1 }}>
                        Upload File
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {selectedNotice.hasResponded && (
                <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#dcfce7', borderRadius: '12px', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a' }}>✅ You have already responded to this</span>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 20px calc(16px + env(safe-area-inset-bottom))', borderTop: '1px solid #f1f5f9' }}>
              <button onClick={() => setSelectedNotice(null)} style={{ width: '100%', padding: '16px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '14px', border: 'none', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

export default Dashboard;
