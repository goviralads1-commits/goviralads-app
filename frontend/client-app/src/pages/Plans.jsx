import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import DOMPurify from 'dompurify';
import { useCart } from '../context/CartContext';

const Plans = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get('category');
  const { addToCart, removeFromCart, updateCartItemQuantity, getCartItemQuantity, isInCart, cartCount } = useCart();
  
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  
  // Filters & View
  const [selectedCategory, setSelectedCategory] = useState(urlCategory || 'ALL');
  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Media carousel state
  const [activeMediaIndex, setActiveMediaIndex] = useState({});

  // Update from URL param changes
  useEffect(() => {
    if (urlCategory) {
      setSelectedCategory(urlCategory);
    }
  }, [urlCategory]);

  const fetchData = useCallback(async () => {
    try {
      const params = { 
        categoryId: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        search: debouncedSearch || undefined
      };
      
      const [plansRes, categoriesRes] = await Promise.all([
        api.get('/client/plans', { params }),
        api.get('/client/categories').catch(() => ({ data: { categories: [] } }))
      ]);
      
      setPlans(plansRes.data.plans || []);
      setCategories(categoriesRes.data.categories || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const [quantities, setQuantities] = useState({});
  
  const handleQuantityChange = (planId, newQuantity) => {
    if (newQuantity <= 0) {
      // If quantity becomes 0, remove from cart and reset quantity state
      removeFromCart(planId);
      setQuantities(prev => {
        const newQuantities = {...prev};
        delete newQuantities[planId];
        return newQuantities;
      });
    } else {
      updateCartItemQuantity(planId, newQuantity);
      setQuantities(prev => ({
        ...prev,
        [planId]: newQuantity
      }));
    }
  };
  
  const handleAddToCart = (plan, e) => {
    e.stopPropagation();
    const currentQuantity = getCartItemQuantity(plan.id || plan._id);
    if (currentQuantity === 0) {
      // First time adding, initialize with quantity 1
      addToCart({
        id: plan.id || plan._id,
        title: plan.title,
        offerPrice: plan.offerPrice,
        creditCost: plan.creditCost,
        price: plan.offerPrice || plan.creditCost || 0,
        originalPrice: plan.originalPrice,
        icon: plan.icon,
        featureImage: plan.featureImage,
        categoryName: plan.categoryName,
      }, 1);
      setQuantities(prev => ({
        ...prev,
        [plan.id || plan._id]: 1
      }));
    } else {
      // Quantity already exists, increment
      handleQuantityChange(plan.id || plan._id, currentQuantity + 1);
    }
    setToast({ type: 'success', message: 'Added to cart!' });
    setTimeout(() => setToast(null), 2000);
  };


  const formatCountdown = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    if (date <= now) return null;
    const days = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    const hours = Math.floor(((date - now) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h left`;
  };

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    return url;
  };

  // Skeleton Loader - Premium Grid
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px 16px', paddingBottom: '100px' }}>
          {/* Category Skeleton */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ width: '100px', height: '44px', backgroundColor: '#e9ecef', borderRadius: '22px', flexShrink: 0, animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
          {/* Grid Skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ width: '100%', aspectRatio: '1/1', backgroundColor: '#e9ecef', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ padding: '16px' }}>
                  <div style={{ width: '80%', height: '16px', backgroundColor: '#e9ecef', borderRadius: '8px', marginBottom: '10px', animation: 'shimmer 1.5s infinite' }} />
                  <div style={{ width: '50%', height: '20px', backgroundColor: '#e9ecef', borderRadius: '8px', marginBottom: '12px', animation: 'shimmer 1.5s infinite' }} />
                  <div style={{ width: '100%', height: '44px', backgroundColor: '#e9ecef', borderRadius: '12px', animation: 'shimmer 1.5s infinite' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <style>{`
          @keyframes shimmer {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // Error State
  if (error && plans.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '400px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fff5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <span style={{ fontSize: '36px' }}>😔</span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ fontSize: '15px', color: '#6c757d', marginBottom: '28px' }}>{error}</p>
          <button onClick={() => { setLoading(true); setError(null); fetchData(); }} style={{ padding: '14px 32px', backgroundColor: '#28a745', color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f5f7fa', 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", 
      paddingBottom: '100px'
    }}>
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
      
      {/* Main Layout: Left Category Rail + Right Content (Admin Pattern) */}
      <div className="plans-layout" style={{ display: 'flex', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* LEFT VERTICAL CATEGORY RAIL - Sticky Position */}
        <div className="category-rail" style={{ 
          width: '100px', minWidth: '100px', maxWidth: '100px',
          backgroundColor: '#ffffff', 
          borderRight: '1px solid #eef2f6',
          position: 'sticky', 
          top: '60px',
          alignSelf: 'flex-start',
          height: 'fit-content',
          maxHeight: 'calc(100vh - 80px)',
          overflow: 'visible',
          paddingTop: '20px', 
          paddingBottom: '20px',
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          boxShadow: '4px 0 24px rgba(0,0,0,0.03)'
        }}>
          {/* All Category Tab */}
          <div
            onClick={() => setSelectedCategory('ALL')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '16px 10px', margin: '0 8px 14px', borderRadius: '18px',
              cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: selectedCategory === 'ALL' ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'transparent',
              boxShadow: selectedCategory === 'ALL' ? '0 4px 20px rgba(59, 130, 246, 0.2), inset 0 0 0 2px rgba(59, 130, 246, 0.3)' : 'none',
              transform: selectedCategory === 'ALL' ? 'scale(1.02)' : 'scale(1)'
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
          
          {/* Dynamic Category Tabs - Filter out duplicate "All" */}
          {categories
            .filter(cat => cat.name && cat.name.toLowerCase() !== 'all')
            .map(cat => {
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
                  padding: '16px 10px', margin: '0 8px 14px', borderRadius: '18px',
                  cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  backgroundColor: isSelected ? `${themeColor}12` : 'transparent',
                  boxShadow: isSelected ? `0 4px 20px ${themeColor}25, inset 0 0 0 2px ${themeColor}35` : 'none',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)'
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
        </div>
        
        {/* RIGHT CONTENT AREA - Marketplace Experience */}
        <div className="plans-content" style={{ flex: 1, padding: '28px 24px', paddingBottom: '120px', minWidth: 0 }}>
          
          {/* Header Section */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '26px', fontWeight: '700', color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Marketplace</h1>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '6px 0 0', fontWeight: '500' }}>
                  {selectedCategory === 'ALL' ? `${plans.length} plans available` : `${plans.length} in ${categories.find(c => (c.id || c._id) === selectedCategory)?.name || 'category'}`}
                </p>
              </div>
              
              {/* View Toggle */}
              <div style={{ display: 'flex', gap: '4px', backgroundColor: '#ffffff', borderRadius: '14px', padding: '5px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
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
            
            {/* Search Bar */}
            <div style={{ position: 'relative' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)' }}>
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
                  border: '2px solid #e2e8f0', borderRadius: '16px', backgroundColor: '#ffffff',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.04)', outline: 'none',
                  transition: 'all 0.2s', fontWeight: '500'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.04)'; }}
              />
            </div>
          </div>
        {plans.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🛒</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', marginBottom: '10px' }}>No plans found</h2>
            <p style={{ fontSize: '15px', color: '#6c757d', marginBottom: '24px' }}>
              {searchQuery ? `No plans match "${searchQuery}"` : selectedCategory !== 'ALL' ? 'No plans in this category.' : 'Check back later for new offers.'}
            </p>
            {(selectedCategory !== 'ALL' || searchQuery) && (
              <button onClick={() => { setSelectedCategory('ALL'); setSearchQuery(''); }} style={{ padding: '14px 28px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
                View All Plans
              </button>
            )}
          </div>
        ) : (
          /* Responsive Premium Grid - Marketplace Spacing */
          <div className="plans-grid" style={{ 
            display: viewMode === 'grid' ? 'grid' : 'flex', 
            gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(260px, 1fr))' : undefined,
            flexDirection: viewMode === 'list' ? 'column' : undefined,
            gap: '24px'
          }}>
            {plans.map((plan, planIndex) => {
              const countdown = formatCountdown(plan.countdownEndDate);
              const mediaArray = Array.isArray(plan.planMedia) ? plan.planMedia : [];
              const currentMediaIdx = activeMediaIndex[plan.id] || 0;
              const coverMedia = mediaArray[currentMediaIdx] || mediaArray[0];
              const coverUrl = coverMedia?.url || plan.featureImage;
              const hasDiscount = plan.offerPrice && plan.originalPrice && plan.offerPrice < plan.originalPrice;
              const discountPercent = hasDiscount ? Math.round((1 - plan.offerPrice / plan.originalPrice) * 100) : 0;
              
              // Premium gradient backgrounds for no-image fallback
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
              const fallbackGradient = premiumGradients[planIndex % premiumGradients.length];
              const categoryColor = plan.categoryColor || '#6366f1';
              
              return (
                <div
                  key={plan.id}
                  onClick={() => navigate(`/plans/${plan.id}`)}
                  style={{
                    backgroundColor: '#ffffff', 
                    borderRadius: '20px', 
                    overflow: 'hidden',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: viewMode === 'list' ? 'flex' : 'block',
                    border: '1px solid rgba(0,0,0,0.06)'
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.transform = 'translateY(-8px)';
                    e.currentTarget.style.boxShadow = '0 24px 48px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 16px rgba(0,0,0,0.08)';
                  }}
                >
                  {/* Image Section - Compact Design */}
                  <div style={{ 
                    width: viewMode === 'list' ? '160px' : '100%',
                    aspectRatio: viewMode === 'list' ? undefined : '4/5',
                    height: viewMode === 'list' ? '160px' : undefined,
                    background: coverUrl ? '#f1f5f9' : fallbackGradient, 
                    position: 'relative',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {coverUrl ? (
                      coverMedia?.type === 'video' ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
                          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                              <polygon points="5,3 19,12 5,21" />
                            </svg>
                          </div>
                        </div>
                      ) : (
                        <>
                          <img 
                            src={coverUrl} 
                            alt={plan.title} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            loading="lazy"
                          />
                          {/* Subtle overlay gradient */}
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
                          {plan.categoryIcon || '📦'}
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
                        {(plan.offerPrice || plan.creditCost) && (
                          <div style={{ 
                            marginTop: '12px', padding: '8px 16px', backgroundColor: 'rgba(255,255,255,0.2)',
                            borderRadius: '20px', backdropFilter: 'blur(8px)', position: 'relative', zIndex: 2
                          }}>
                            <span style={{ fontSize: '16px', fontWeight: '800', color: '#ffffff' }}>
                              ₹{plan.offerPrice || plan.creditCost}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Discount Badge - Premium */}
                    {hasDiscount && (
                      <div style={{
                        position: 'absolute', top: '12px', left: '12px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff',
                        padding: '6px 14px', borderRadius: '20px',
                        fontSize: '11px', fontWeight: '700', letterSpacing: '0.02em',
                        boxShadow: '0 4px 14px rgba(239,68,68,0.4)'
                      }}>
                        {discountPercent}% OFF
                      </div>
                    )}
                    
                    {/* Countdown Badge - Premium */}
                    {countdown && (
                      <div style={{
                        position: 'absolute', top: '12px', right: '12px',
                        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', color: '#fff',
                        padding: '6px 12px', borderRadius: '20px',
                        fontSize: '10px', fontWeight: '700',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        boxShadow: '0 4px 14px rgba(249,115,22,0.4)'
                      }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
                        </svg>
                        {countdown}
                      </div>
                    )}
                    
                    {/* Media Dots */}
                    {mediaArray.length > 1 && viewMode === 'grid' && (
                      <div style={{ 
                        position: 'absolute', bottom: '12px', left: '50%', 
                        transform: 'translateX(-50%)', display: 'flex', gap: '6px' 
                      }}>
                        {mediaArray.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setActiveMediaIndex(prev => ({ ...prev, [plan.id]: idx })); 
                            }}
                            style={{
                              width: '8px', height: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                              backgroundColor: idx === currentMediaIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                              transition: 'all 0.2s'
                            }}
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Category Badge - Premium */}
                    {plan.categoryName && coverUrl && (
                      <div style={{
                        position: 'absolute', bottom: '12px', right: '12px',
                        backgroundColor: 'rgba(255,255,255,0.95)', color: categoryColor,
                        padding: '6px 12px', borderRadius: '20px',
                        fontSize: '10px', fontWeight: '700',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        backdropFilter: 'blur(8px)'
                      }}>
                        {plan.categoryIcon && <span style={{ fontSize: '12px' }}>{plan.categoryIcon}</span>}
                        {plan.categoryName}
                      </div>
                    )}
                  </div>

                  {/* Content Section - Compact Typography */}
                  <div style={{ padding: viewMode === 'list' ? '16px' : '14px', flex: 1 }}>
                    <h3 style={{ 
                      fontSize: viewMode === 'list' ? '16px' : '15px', 
                      fontWeight: '600', 
                      color: '#0f172a', 
                      margin: '0 0 8px',
                      lineHeight: 1.35,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      letterSpacing: '-0.01em'
                    }}>
                      {plan.title}
                    </h3>

                    {plan.description && viewMode === 'list' && (
                      <div 
                        style={{ 
                          fontSize: '13px', color: '#64748b', margin: '0 0 12px',
                          lineHeight: 1.55,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                        }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(plan.description) }}
                      />
                    )}

                    {/* Pricing - Premium Style */}
                    <div style={{ marginBottom: '14px' }}>
                      {plan.offerPrice ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
                            ₹{plan.offerPrice}
                          </span>
                          {plan.originalPrice && (
                            <span style={{ fontSize: '14px', color: '#94a3b8', textDecoration: 'line-through', fontWeight: '500' }}>
                              ₹{plan.originalPrice}
                            </span>
                          )}
                        </div>
                      ) : plan.showCreditsToClient !== false ? (
                        <span style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
                          ₹{plan.creditCost || 0}
                        </span>
                      ) : null}
                    </div>

                    {/* Action Buttons - Quantity Controls */}
                    <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/plans/${plan.id}`); }}
                        style={{
                          width: '100%', padding: '10px 8px', backgroundColor: '#f1f5f9', color: '#475569',
                          fontSize: '12px', fontWeight: '600', borderRadius: '10px', border: '1px solid #e2e8f0',
                          cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'
                        }}
                      >
                        Details
                      </button>
                      
                      {/* Quantity Control or Add Button */}
                      {isInCart(plan.id || plan._id) && getCartItemQuantity(plan.id || plan._id) > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(plan.id || plan._id, getCartItemQuantity(plan.id || plan._id) - 1); }}
                            style={{
                              width: '32px', height: '32px',
                              backgroundColor: '#f1f5f9', color: '#475569',
                              fontSize: '16px', fontWeight: '600', borderRadius: '8px', border: '1px solid #e2e8f0',
                              cursor: 'pointer', transition: 'all 0.2s', display: 'flex',
                              alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            −
                          </button>
                          <span style={{ fontSize: '14px', fontWeight: '600', minWidth: '20px', textAlign: 'center' }}>
                            {getCartItemQuantity(plan.id || plan._id)}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleQuantityChange(plan.id || plan._id, getCartItemQuantity(plan.id || plan._id) + 1); }}
                            style={{
                              width: '32px', height: '32px',
                              backgroundColor: '#f1f5f9', color: '#475569',
                              fontSize: '16px', fontWeight: '600', borderRadius: '8px', border: '1px solid #e2e8f0',
                              cursor: 'pointer', transition: 'all 0.2s', display: 'flex',
                              alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleAddToCart(plan, e)}
                          style={{
                            width: '100%', padding: '10px 8px', 
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', 
                            color: '#fff',
                            fontSize: '12px', fontWeight: '600', borderRadius: '10px', border: 'none',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                            transition: 'all 0.2s', whiteSpace: 'nowrap'
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Add
                        </button>
                      )}
                      
                      {/* View Cart Button - Visible when cart has items */}
                      {cartCount > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate('/cart'); }}
                          style={{
                            width: '100%', padding: '10px 8px', 
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
                            color: '#fff',
                            fontSize: '12px', fontWeight: '600', borderRadius: '10px', border: 'none',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                            transition: 'all 0.2s', whiteSpace: 'nowrap'
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          View Cart ({cartCount})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        /* Hide scrollbar on sidebar - Premium feel */
        .category-rail::-webkit-scrollbar {
          display: none;
        }
        
        /* Rich text description styling in list cards */
        .plans-grid div[dangerouslysetinnerhtml] h4,
        .plans-grid div[dangerouslysetinnerhtml] h5 {
          font-size: 13px !important;
          margin: 0 !important;
          font-weight: 500 !important;
          display: inline;
        }
        .plans-grid div[dangerouslysetinnerhtml] ul,
        .plans-grid div[dangerouslysetinnerhtml] ol {
          margin: 0 !important;
          padding-left: 16px !important;
        }
        .plans-grid div[dangerouslysetinnerhtml] li {
          margin: 0 !important;
        }
        .plans-grid div[dangerouslysetinnerhtml] p {
          margin: 0 !important;
          display: inline;
        }
        
        /* MOBILE RESPONSIVE - Swiggy Marketplace Pattern */
        @media (max-width: 768px) {
          /* Vertical stack on mobile */
          .plans-layout {
            flex-direction: column !important;
          }
          
          /* Sidebar horizontal scroll */
          .category-rail {
            position: relative !important;
            top: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: none !important;
            border-right: none !important;
            border-bottom: 1px solid #eef2f6 !important;
            padding: 16px !important;
            display: flex !important;
            flex-direction: row !important;
            gap: 10px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            -webkit-overflow-scrolling: touch !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
          }
          
          /* Category items compact on mobile */
          .category-rail > div {
            flex-shrink: 0 !important;
            margin: 0 !important;
            padding: 12px 10px !important;
            min-width: 75px !important;
          }
          
          /* Content area mobile spacing */
          .plans-content {
            padding: 20px 16px 140px !important;
          }
          
          /* Grid 2 columns - clean responsive */
          .plans-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 14px !important;
          }
          
          /* Mobile Card Adjustments - Proportional & Premium */
          .plans-grid > div {
            border-radius: 16px !important;
          }
          
          /* Mobile Card Content Padding */
          .plans-grid > div > div:last-child {
            padding: 16px !important;
          }
          
          /* Mobile Title Size */
          .plans-grid h3 {
            font-size: 14px !important;
            line-height: 1.3 !important;
            margin: 0 0 6px !important;
          }
          
          /* Mobile Price Size */
          .plans-grid h3 + div span[style*="fontSize: '20px'"] {
            font-size: 18px !important;
          }
          
          /* Mobile Button Container */
          .plans-grid > div > div:last-child > div:last-child {
            gap: 8px !important;
          }
          
          /* Mobile Buttons */
          .plans-grid button {
            padding: 10px 8px !important;
            font-size: 12px !important;
            border-radius: 10px !important;
          }
        }
        
        /* Tablet - Premium spacing maintained */
        @media (min-width: 769px) and (max-width: 1024px) {
          .category-rail {
            width: 90px !important;
            min-width: 90px !important;
            max-width: 90px !important;
          }
          
          .plans-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 20px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Plans;
