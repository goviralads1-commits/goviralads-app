import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const PlanDetail = () => {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [toast, setToast] = useState(null);
  const [currentMediaIdx, setCurrentMediaIdx] = useState(0);

  const fetchPlan = useCallback(async () => {
    try {
      const response = await api.get(`/client/plans/${planId}`);
      setPlan(response.data.plan);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      await api.post(`/client/plans/${planId}/purchase`);
      setToast({ type: 'success', message: 'Plan purchased! Awaiting approval.' });
      setTimeout(() => setToast(null), 2000);
      setTimeout(() => navigate('/tasks'), 1500);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to purchase' });
      setTimeout(() => setToast(null), 4000);
      setPurchasing(false);
    }
  };

  const formatCountdown = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    if (date <= now) return null;
    const days = Math.floor((date - now) / (1000 * 60 * 60 * 24));
    const hours = Math.floor(((date - now) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    return url;
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 16px', paddingBottom: '120px' }}>
          <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: '#e9ecef', borderRadius: '24px', animation: 'shimmer 1.5s infinite', marginBottom: '20px' }} />
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '24px' }}>
            <div style={{ width: '40%', height: '28px', backgroundColor: '#e9ecef', borderRadius: '8px', animation: 'shimmer 1.5s infinite', marginBottom: '16px' }} />
            <div style={{ width: '80%', height: '32px', backgroundColor: '#e9ecef', borderRadius: '8px', animation: 'shimmer 1.5s infinite', marginBottom: '16px' }} />
            <div style={{ width: '100%', height: '80px', backgroundColor: '#e9ecef', borderRadius: '8px', animation: 'shimmer 1.5s infinite' }} />
          </div>
        </div>
        <style>{`@keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // Error State
  if (error || !plan) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '400px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>😔</div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a2e', marginBottom: '12px' }}>Plan not found</h2>
          <p style={{ fontSize: '15px', color: '#6c757d', marginBottom: '28px' }}>{error || 'This plan may have been removed.'}</p>
          <button onClick={() => navigate('/plans')} style={{ padding: '14px 32px', backgroundColor: '#28a745', color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer' }}>
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  const mediaArray = Array.isArray(plan.planMedia) ? plan.planMedia : [];
  const countdown = formatCountdown(plan.countdownEndDate);
  const hasDiscount = plan.offerPrice && plan.originalPrice && plan.offerPrice < plan.originalPrice;
  const discountPercent = hasDiscount ? Math.round((1 - plan.offerPrice / plan.originalPrice) * 100) : 0;
  const displayPrice = plan.offerPrice || plan.creditCost || 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', paddingBottom: '100px' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{ 
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', 
          backgroundColor: toast.type === 'error' ? '#dc3545' : '#28a745', 
          color: '#fff', padding: '14px 28px', borderRadius: '16px', 
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', 
          zIndex: 1000 
        }}>
          {toast.message}
        </div>
      )}
      
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 16px' }}>
        
        {/* Back Button */}
        <button 
          onClick={() => navigate('/plans')} 
          style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '8px', 
            padding: '12px 18px', backgroundColor: '#fff', border: 'none', borderRadius: '14px', 
            fontSize: '14px', fontWeight: '600', color: '#495057', cursor: 'pointer', 
            marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' 
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>

        {/* Media Gallery - Full Width */}
        <div style={{ 
          backgroundColor: '#fff', borderRadius: '24px', overflow: 'hidden', 
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginBottom: '20px' 
        }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', backgroundColor: '#f8f9fa' }}>
            {mediaArray.length > 0 ? (
              <>
                {mediaArray[currentMediaIdx]?.type === 'video' ? (
                  (() => {
                    const embedUrl = getVideoEmbedUrl(mediaArray[currentMediaIdx].url);
                    if (embedUrl?.includes('embed') || embedUrl?.includes('player.vimeo')) {
                      return <iframe src={embedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen />;
                    }
                    return <video src={embedUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                  })()
                ) : (
                  <img src={mediaArray[currentMediaIdx]?.url} alt={plan.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                )}
                
                {/* Navigation Arrows */}
                {mediaArray.length > 1 && (
                  <>
                    <button 
                      onClick={() => setCurrentMediaIdx(prev => prev > 0 ? prev - 1 : mediaArray.length - 1)} 
                      style={{ 
                        position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', 
                        width: '44px', height: '44px', borderRadius: '50%', 
                        backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', cursor: 'pointer', 
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2.5">
                        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => setCurrentMediaIdx(prev => prev < mediaArray.length - 1 ? prev + 1 : 0)} 
                      style={{ 
                        position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', 
                        width: '44px', height: '44px', borderRadius: '50%', 
                        backgroundColor: 'rgba(255,255,255,0.95)', border: 'none', cursor: 'pointer', 
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </>
                )}
                
                {/* Dots Navigation */}
                {mediaArray.length > 1 && (
                  <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '10px' }}>
                    {mediaArray.map((_, idx) => (
                      <button 
                        key={idx} 
                        onClick={() => setCurrentMediaIdx(idx)} 
                        style={{ 
                          width: '10px', height: '10px', borderRadius: '50%', border: 'none', cursor: 'pointer', 
                          backgroundColor: idx === currentMediaIdx ? '#fff' : 'rgba(255,255,255,0.5)', 
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          transition: 'all 0.2s'
                        }} 
                      />
                    ))}
                  </div>
                )}
                
                {/* Media Counter */}
                {mediaArray.length > 1 && (
                  <div style={{ 
                    position: 'absolute', top: '16px', left: '16px', 
                    backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', 
                    padding: '8px 14px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' 
                  }}>
                    {currentMediaIdx + 1}/{mediaArray.length}
                  </div>
                )}
              </>
            ) : plan.featureImage ? (
              <img src={plan.featureImage} alt={plan.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9ecef' }}>
                <span style={{ fontSize: '80px', opacity: 0.4 }}>📦</span>
              </div>
            )}
            
            {/* Countdown Badge */}
            {countdown && (
              <div style={{ 
                position: 'absolute', top: '16px', right: '16px', 
                backgroundColor: '#ff6b35', color: '#fff', 
                padding: '10px 18px', borderRadius: '14px', 
                fontSize: '14px', fontWeight: '700',
                display: 'flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 4px 16px rgba(255,107,53,0.4)'
              }}>
                🔥 {countdown}
              </div>
            )}
          </div>
        </div>

        {/* Content Card */}
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '28px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
          
          {/* Category Badge */}
          {plan.categoryName && (
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '8px', 
              padding: '8px 16px', backgroundColor: plan.categoryColor || '#28a745', color: '#fff', 
              borderRadius: '12px', fontSize: '13px', fontWeight: '600', marginBottom: '16px' 
            }}>
              {plan.categoryIcon && <span style={{ fontSize: '16px' }}>{plan.categoryIcon}</span>}
              {plan.categoryName}
            </div>
          )}

          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
            {plan.title}
          </h1>

          {plan.description && (
            <p style={{ fontSize: '16px', color: '#495057', margin: '0 0 24px', lineHeight: 1.7 }}>
              {plan.description}
            </p>
          )}

          {/* Quantity Badge - Client-safe info only */}
          {plan.quantity && plan.showQuantityToClient && (
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: '8px', 
              padding: '12px 18px', backgroundColor: '#e8f5e9', borderRadius: '14px', 
              fontSize: '14px', fontWeight: '600', color: '#2e7d32', marginBottom: '24px' 
            }}>
              📦 Quantity: {plan.quantity}
            </div>
          )}

          {/* Pricing Block */}
          <div style={{ 
            padding: '24px', backgroundColor: '#f8f9fa', borderRadius: '20px', 
            marginBottom: '20px' 
          }}>
            <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Price
            </div>
            {plan.offerPrice ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {plan.originalPrice && (
                  <span style={{ fontSize: '22px', color: '#adb5bd', textDecoration: 'line-through', fontWeight: '500' }}>
                    ₹{plan.originalPrice}
                  </span>
                )}
                <span style={{ fontSize: '40px', fontWeight: '800', color: '#28a745' }}>
                  ₹{plan.offerPrice}
                </span>
                {hasDiscount && (
                  <span style={{ 
                    padding: '6px 14px', backgroundColor: '#dc3545', color: '#fff', 
                    borderRadius: '10px', fontSize: '14px', fontWeight: '800' 
                  }}>
                    {discountPercent}% OFF
                  </span>
                )}
              </div>
            ) : plan.showCreditsToClient !== false ? (
              <span style={{ fontSize: '40px', fontWeight: '800', color: '#28a745' }}>
                ₹{plan.creditCost || 0}
              </span>
            ) : null}
          </div>

          {/* Public Notes / What's Included */}
          {plan.publicNotes && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                What's Included
              </div>
              <p style={{ fontSize: '15px', color: '#495057', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                {plan.publicNotes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div style={{ 
        position: 'fixed', bottom: 0, left: 0, right: 0, 
        backgroundColor: '#fff', 
        padding: '16px 20px calc(16px + env(safe-area-inset-bottom))', 
        boxShadow: '0 -4px 24px rgba(0,0,0,0.1)',
        zIndex: 100
      }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#6c757d', marginBottom: '2px' }}>Total Price</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#28a745' }}>₹{displayPrice}</div>
          </div>
          <button
            onClick={handlePurchase}
            disabled={purchasing}
            style={{
              flex: 1.5, padding: '18px 24px', 
              backgroundColor: purchasing ? '#6c757d' : '#28a745', 
              color: '#fff',
              fontSize: '16px', fontWeight: '700', borderRadius: '16px', border: 'none',
              cursor: purchasing ? 'not-allowed' : 'pointer', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: purchasing ? 'none' : '0 6px 20px rgba(40,167,69,0.4)',
              transition: 'all 0.2s'
            }}
          >
            {purchasing ? (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Buy Now
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PlanDetail;
