import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Subscriptions = () => {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [purchasing, setPurchasing] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const response = await api.get('/client/subscriptions');
      setSubscriptions(response.data.subscriptions || []);
      setError(null);
    } catch (err) {
      console.error('Subscriptions fetch error:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  // SUBSCRIPTION PURCHASE HANDLER
  const handlePurchase = async (subId) => {
    setPurchasing(subId);
    
    try {
      const response = await api.post(`/client/subscriptions/${subId}/purchase`);

      // Success toast
      setToast({ type: 'success', message: 'Subscription purchased successfully!' });
      
      // Auto-dismiss toast
      setTimeout(() => setToast(null), 2000);

      // Redirect to tasks after 1 second
      setTimeout(() => {
        navigate('/tasks');
      }, 1000);
    } catch (err) {
      console.error('Purchase error:', err.response?.data || err.message);
      
      // Error toast
      setToast({ 
        type: 'error', 
        message: err.response?.data?.error || 'Failed to purchase subscription' 
      });
      
      // Auto-dismiss error toast
      setTimeout(() => setToast(null), 4000);
      
      setPurchasing(null);
    }
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
          <div style={{ marginBottom: '32px' }}>
            <div style={{ width: '180px', height: '28px', backgroundColor: '#f1f1f1', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {[1, 2].map(i => (
              <div key={i} style={{
                backgroundColor: '#fff', borderRadius: '24px', overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
              }}>
                <div style={{ width: '100%', height: '200px', backgroundColor: '#f1f1f1', animation: 'pulse 1.5s infinite' }} />
                <div style={{ padding: '24px' }}>
                  <div style={{ width: '70%', height: '22px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '100%', height: '16px', backgroundColor: '#f1f1f1', borderRadius: '4px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '120px', height: '40px', backgroundColor: '#f1f1f1', borderRadius: '14px', animation: 'pulse 1.5s infinite' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // Error State
  if (error && subscriptions.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ fontSize: '15px', color: '#666', marginBottom: '32px' }}>{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchSubscriptions(); }}
            style={{
              padding: '14px 32px', backgroundColor: '#1a1a1a', color: '#fff',
              fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <Header />
      
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '14px',
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          zIndex: 1000, animation: 'slideDown 0.3s ease'
        }}>
          {toast.message}
        </div>
      )}
      
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
        {/* Page Title */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>
            Subscription Bundles
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: '8px 0 0 0' }}>
            {subscriptions.length} bundle{subscriptions.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* Empty State */}
        {subscriptions.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', borderRadius: '24px', padding: '48px 24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', textAlign: 'center'
          }}>
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f5f5f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px'
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 12h6M9 8h6M9 16h3" strokeLinecap="round" />
              </svg>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>No bundles available</h2>
            <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.5 }}>
              There are no subscription bundles at the moment.<br />
              Check back later for new offers.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {subscriptions.map((sub) => {
              return (
                <div
                  key={sub.id}
                  style={{
                    backgroundColor: '#fff', borderRadius: '24px', overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)', transition: 'all 0.2s ease',
                    cursor: 'pointer', position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)';
                  }}
                >
                  {/* Feature Image */}
                  {sub.featureImage ? (
                    <div style={{ width: '100%', height: '200px', backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
                      <img
                        src={sub.featureImage}
                        alt={sub.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '100%', height: '200px', backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
                        <rect x="3" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="3" width="7" height="7" rx="1"/>
                        <rect x="14" y="14" width="7" height="7" rx="1"/>
                        <rect x="3" y="14" width="7" height="7" rx="1"/>
                      </svg>
                    </div>
                  )}

                  {/* Duration Badge */}
                  {sub.durationDays && (
                    <div style={{
                      position: 'absolute', top: '12px', right: '12px',
                      backgroundColor: '#6366f1', color: '#fff',
                      padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: '700',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                      {sub.durationDays} days
                    </div>
                  )}

                  {/* Content */}
                  <div style={{ padding: '24px' }}>
                    {/* Title */}
                    <h3 style={{
                      fontSize: '18px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 8px 0',
                      lineHeight: 1.4, letterSpacing: '-0.01em'
                    }}>
                      {sub.title}
                    </h3>

                    {/* Description */}
                    {sub.description && (
                      <p style={{
                        fontSize: '14px', color: '#666', margin: '0 0 16px 0', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {sub.description}
                      </p>
                    )}

                    {/* Included Tasks */}
                    <div style={{ marginBottom: '20px' }}>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                        Includes {sub.tasks.length} task{sub.tasks.length !== 1 ? 's' : ''}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sub.tasks.slice(0, 3).map((task, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span style={{ fontSize: '13px', color: '#555' }}>{task.title}</span>
                          </div>
                        ))}
                        {sub.tasks.length > 3 && (
                          <span style={{ fontSize: '12px', color: '#999', marginLeft: '20px' }}>+ {sub.tasks.length - 3} more</span>
                        )}
                      </div>
                    </div>

                    {/* Pricing */}
                    <div style={{ marginBottom: '20px' }}>
                      {sub.offerPrice ? (
                        <div>
                          {sub.totalPrice && (
                            <span style={{
                              fontSize: '16px', color: '#999', textDecoration: 'line-through',
                              marginRight: '8px', fontWeight: '500'
                            }}>
                              ₹{sub.totalPrice}
                            </span>
                          )}
                          <span style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>
                            ₹{sub.offerPrice}
                          </span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '28px', fontWeight: '700', color: '#15803d' }}>
                          ₹{sub.totalPrice || 0}
                        </span>
                      )}
                    </div>

                    {/* Buy Button */}
                    <button
                      onClick={() => handlePurchase(sub.id)}
                      disabled={purchasing === sub.id}
                      style={{
                        width: '100%', padding: '14px 24px',
                        backgroundColor: purchasing === sub.id ? '#666' : '#1a1a1a',
                        color: '#fff',
                        fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none',
                        cursor: purchasing === sub.id ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        if (purchasing !== sub.id) e.currentTarget.style.backgroundColor = '#333';
                      }}
                      onMouseLeave={(e) => {
                        if (purchasing !== sub.id) e.currentTarget.style.backgroundColor = '#1a1a1a';
                      }}
                    >
                      {purchasing === sub.id ? (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                          </svg>
                          Purchasing...
                        </>
                      ) : (
                        'Buy Bundle'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Subscriptions;
