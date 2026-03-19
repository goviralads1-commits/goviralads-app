import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Wallet = () => {
  const [walletData, setWalletData] = useState(null);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [creditPlans, setCreditPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [showRechargeForm, setShowRechargeForm] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'recharge' | 'invoices'
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const [planTab, setPlanTab] = useState('PLAN'); // 'PLAN' | 'PACK'
  const [subscription, setSubscription] = useState(null);
  const [expiredSubscription, setExpiredSubscription] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [purchasingPlan, setPurchasingPlan] = useState(null); // planId being purchased
  const subscriptionRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Required: wallet and recharge requests must succeed
        const walletResponse = await api.get('/client/wallet');
        const requestsResponse = await api.get('/client/wallet/recharge-requests');
        
        // Optional: invoices endpoint
        let invoicesData = [];
        try {
          const invoicesResponse = await api.get('/client/invoices');
          invoicesData = invoicesResponse.data.invoices || [];
        } catch (invoiceErr) {
          // Silently ignore if billing route not implemented
          console.log('[Wallet] Invoices endpoint not available');
        }
        
        // Optional: credit plans
        let plansData = [];
        try {
          const plansResponse = await api.get('/client/credit-plans');
          plansData = plansResponse.data.plans || [];
        } catch (planErr) {
          console.log('[Wallet] Credit plans endpoint not available');
        }

        // Optional: active subscription
        try {
          const subResponse = await api.get('/client/my-subscription');
          setSubscription(subResponse.data.subscription || null);
          if (!subResponse.data.subscription && subResponse.data.recentExpired) {
            setExpiredSubscription(subResponse.data.recentExpired);
          }
        } catch (subErr) {
          console.log('[Wallet] Subscription endpoint not available');
        }
        
        setWalletData(walletResponse.data);
        setRechargeRequests(requestsResponse.data.requests || []);
        setInvoices(invoicesData);
        setCreditPlans(plansData);
      } catch (err) {
        setError('Failed to load wallet data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Auto-scroll to subscription section if URL has ?scrollToSubscription=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scrollToSubscription') === 'true') {
      setActiveTab('subscriptions');
      setTimeout(() => {
        subscriptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    }
  }, []);

  // Helper: days until expiry (0 = today, negative = past)
  const getDaysUntilExpiry = (expiresAt) => {
    const diffMs = new Date(expiresAt) - new Date();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleSubscriptionPurchase = async (planId) => {
    setPurchasingPlan(planId);
    try {
      const res = await api.post(`/client/credit-plans/${planId}/purchase`, {
        couponCode: couponCode.trim() || undefined
      });
      setToast('Subscription activated!');
      setTimeout(() => setToast(null), 4000);
      setCouponCode('');
      setSubscription(res.data.subscription || null);
      // Refresh wallet balance
      try {
        const walletRes = await api.get('/client/wallet');
        setWalletData(walletRes.data);
      } catch (_) {}
    } catch (err) {
      const msg = err.response?.data?.error || 'Purchase failed';
      setToast(msg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setPurchasingPlan(null);
    }
  };

  const handleDownloadInvoice = async (invoiceId, invoiceNumber) => {
    setDownloadingInvoice(invoiceId);
    try {
      const response = await api.get(`/client/invoices/${invoiceId}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNumber || 'invoice'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const errorMsg = err.response?.status === 403 
        ? 'Invoice download not allowed. Please contact admin.'
        : 'Failed to download invoice';
      setToast(errorMsg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handleRechargeSubmit = async (e) => {
    e.preventDefault();
    setRechargeSubmitting(true);
    setError('');
    
    const amount = selectedPlan ? selectedPlan.price : parseFloat(rechargeAmount);
    if (!amount || amount < 1) {
      setToast('Please select a plan or enter a valid amount');
      setTimeout(() => setToast(null), 3000);
      setRechargeSubmitting(false);
      return;
    }
    
    try {
      const response = await api.post('/client/wallet/recharge', { 
        amount,
        paymentReference: paymentRef
      });
      
      // Success! Show toast immediately
      setToast('Recharge request submitted successfully');
      setTimeout(() => setToast(null), 3000);
      
      // Clear form
      setRechargeAmount('');
      setPaymentRef('');
      setSelectedPlan(null);
      setShowRechargeForm(false);
      
      // Refresh data (errors won't override success)
      try {
        const [walletResponse, requestsResponse] = await Promise.all([
          api.get('/client/wallet'),
          api.get('/client/wallet/recharge-requests')
        ]);
        setWalletData(walletResponse.data);
        setRechargeRequests(requestsResponse.data.requests || []);
      } catch (refreshErr) {
        // Silently handle refresh errors
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to submit recharge request';
      setToast(errorMsg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setRechargeSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
        <Header />
        <div style={{maxWidth: '1200px', margin: '0 auto', padding: '24px'}}>
          {/* Balance Skeleton */}
          <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '32px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
            <div style={{width: '120px', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '12px', animation: 'pulse 1.5s infinite'}}></div>
            <div style={{width: '160px', height: '40px', backgroundColor: '#e2e8f0', borderRadius: '8px', animation: 'pulse 1.5s infinite'}}></div>
          </div>
          {/* Transaction Skeleton */}
          <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
            <div style={{width: '180px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: '24px', animation: 'pulse 1.5s infinite'}}></div>
            {[1,2,3,4].map(i => (
              <div key={i} style={{display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #f1f5f9'}}>
                <div style={{width: '40%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite'}}></div>
                <div style={{width: '80px', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite'}}></div>
              </div>
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
        <Header />
        <div style={{maxWidth: '1200px', margin: '0 auto', padding: '24px'}}>
          <div style={{padding: '20px', backgroundColor: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca'}}>
            <p style={{color: '#dc2626', fontSize: '15px', fontWeight: '500', margin: 0}}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.toLowerCase().includes('fail') || toast.toLowerCase().includes('error') || toast.toLowerCase().includes('maximum') ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100
        }}>
          {toast}
        </div>
      )}
      
      <div style={{maxWidth: '1200px', margin: '0 auto', padding: '24px'}}>
        {/* Balance Card */}
        <div style={{
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          borderRadius: '24px',
          padding: '32px',
          marginBottom: '24px',
          color: '#fff',
          boxShadow: '0 10px 40px rgba(99,102,241,0.3)'
        }}>
          <p style={{fontSize: '14px', fontWeight: '500', opacity: 0.9, margin: '0 0 8px 0'}}>Current Balance</p>
          <p style={{fontSize: '42px', fontWeight: '800', margin: '0 0 16px 0'}}>₹{walletData?.balance?.toFixed(2) || '0.00'}</p>
          <button
            onClick={() => { setShowRechargeForm(!showRechargeForm); setSelectedPlan(null); setRechargeAmount(''); setPaymentRef(''); }}
            style={{
              padding: '12px 24px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: '2px solid rgba(255,255,255,0.3)',
              cursor: 'pointer',
              backdropFilter: 'blur(10px)'
            }}
          >
            {showRechargeForm ? 'Close' : 'Upgrade Credits'}
          </button>
        </div>

        {/* Active Subscription Banner */}
        {subscription && (() => {
          const daysLeft = getDaysUntilExpiry(subscription.expiresAt);
          const isExpiringSoon = daysLeft <= 2;
          const isToday = daysLeft <= 0;
          const bannerBg = isToday ? '#fef2f2' : isExpiringSoon ? '#fffbeb' : '#f0fdf4';
          const bannerBorder = isToday ? '1px solid #fca5a5' : isExpiringSoon ? '1px solid #fcd34d' : '1px solid #86efac';
          const titleColor = isToday ? '#991b1b' : isExpiringSoon ? '#92400e' : '#15803d';
          const textColor = isToday ? '#b91c1c' : isExpiringSoon ? '#92400e' : '#166534';
          const icon = isToday ? '\u26a0\ufe0f' : isExpiringSoon ? '\u23f3' : '\u2705';
          return (
            <div style={{
              backgroundColor: bannerBg,
              border: bannerBorder,
              borderRadius: '20px',
              padding: '20px 24px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                  <span style={{fontSize: '18px'}}>{icon}</span>
                  <p style={{fontSize: '16px', fontWeight: '700', color: titleColor, margin: 0}}>
                    {subscription.planName} &mdash; Active
                  </p>
                </div>
                <p style={{fontSize: '14px', color: textColor, margin: 0}}>
                  <strong>{subscription.creditsRemaining?.toLocaleString()}</strong> credits remaining
                  &nbsp;&middot;&nbsp;
                  Expires {new Date(subscription.expiresAt).toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric'
                  })}
                </p>
                {isToday && (
                  <p style={{fontSize: '13px', fontWeight: '700', color: '#dc2626', margin: '6px 0 0 0'}}>
                    Expires today
                  </p>
                )}
                {!isToday && isExpiringSoon && (
                  <p style={{fontSize: '13px', fontWeight: '700', color: '#d97706', margin: '6px 0 0 0'}}>
                    Expiring in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setActiveTab('subscriptions')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isToday ? '#dc2626' : isExpiringSoon ? '#d97706' : '#16a34a',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {isExpiringSoon ? 'Renew Plan' : 'Manage Plan'}
              </button>
            </div>
          );
        })()}

        {/* Expired Subscription Banner */}
        {!subscription && expiredSubscription && (
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '20px',
            padding: '20px 24px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                <span style={{fontSize: '18px'}}>&#x274c;</span>
                <p style={{fontSize: '16px', fontWeight: '700', color: '#64748b', margin: 0}}>
                  {expiredSubscription.planName} &mdash; Expired
                </p>
              </div>
              <p style={{fontSize: '14px', color: '#94a3b8', margin: 0}}>
                Expired on {new Date(expiredSubscription.expiresAt).toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric'
                })}
              </p>
              <p style={{fontSize: '13px', fontWeight: '600', color: '#ef4444', margin: '4px 0 0 0'}}>
                Your subscription has expired
              </p>
            </div>
            <button
              onClick={() => setActiveTab('subscriptions')}
              style={{
                padding: '10px 20px',
                backgroundColor: '#6366f1',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '600',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Renew Now
            </button>
          </div>
        )}

        {/* Recharge Form - Upgrade Credits */}
        {showRechargeForm && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            <h3 style={{fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0'}}>Upgrade Credits</h3>
            <p style={{fontSize: '14px', color: '#64748b', margin: '0 0 20px 0'}}>Choose a plan or credit pack to add to your wallet</p>
            
            {/* Plan/Pack Toggle */}
            {creditPlans.length > 0 && (
              <>
                <div style={{
                  display: 'flex',
                  backgroundColor: '#f1f5f9',
                  borderRadius: '12px',
                  padding: '4px',
                  marginBottom: '20px'
                }}>
                  <button
                    onClick={() => { setPlanTab('PLAN'); setSelectedPlan(null); }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: planTab === 'PLAN' ? '#6366f1' : 'transparent',
                      color: planTab === 'PLAN' ? '#fff' : '#64748b',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Subscription Plans
                  </button>
                  <button
                    onClick={() => { setPlanTab('PACK'); setSelectedPlan(null); }}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: planTab === 'PACK' ? '#6366f1' : 'transparent',
                      color: planTab === 'PACK' ? '#fff' : '#64748b',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    One-time Credit Packs
                  </button>
                </div>

                {/* Plan Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '12px',
                  marginBottom: '20px'
                }}>
                  {creditPlans.filter(p => p.type === planTab).map(plan => (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      style={{
                        padding: '16px',
                        borderRadius: '16px',
                        border: selectedPlan?.id === plan.id ? '2px solid #6366f1' : '2px solid #e2e8f0',
                        backgroundColor: selectedPlan?.id === plan.id ? '#f5f3ff' : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textAlign: 'center'
                      }}
                    >
                      <p style={{fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px 0'}}>{plan.name}</p>
                      <p style={{fontSize: '24px', fontWeight: '800', color: '#6366f1', margin: '0 0 8px 0'}}>₹{plan.price.toLocaleString()}</p>
                      <div style={{fontSize: '13px', color: '#64748b'}}>
                        <span>{plan.credits.toLocaleString()} credits</span>
                        {plan.bonusCredits > 0 && (
                          <span style={{color: '#10b981', fontWeight: '600'}}> +{plan.bonusCredits.toLocaleString()} bonus</span>
                        )}
                      </div>
                      <p style={{fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '8px 0 0 0'}}>
                        Total: {plan.totalCredits.toLocaleString()} credits
                      </p>
                      {plan.description && (
                        <p style={{fontSize: '12px', color: '#94a3b8', margin: '8px 0 0 0'}}>{plan.description}</p>
                      )}
                    </div>
                  ))}
                  {creditPlans.filter(p => p.type === planTab).length === 0 && (
                    <p style={{gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: '20px'}}>
                      No {planTab.toLowerCase()}s available
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Fallback: Manual Amount (if no plans available) */}
            {creditPlans.length === 0 && (
              <div style={{marginBottom: '16px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>Amount (₹)</label>
                <input
                  type="number"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  min="100"
                  max="100000"
                  placeholder="Enter amount (min ₹100)"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '16px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            {/* Payment Reference - Only show after plan selection or when using manual amount */}
            {(selectedPlan || (creditPlans.length === 0 && rechargeAmount)) && (
              <form onSubmit={handleRechargeSubmit}>
                {selectedPlan && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    border: '1px solid #bbf7d0'
                  }}>
                    <p style={{margin: 0, fontSize: '14px', color: '#15803d'}}>
                      Selected: <strong>{selectedPlan.name}</strong> — ₹{selectedPlan.price.toLocaleString()} for {selectedPlan.totalCredits.toLocaleString()} credits
                    </p>
                  </div>
                )}
                <div style={{marginBottom: '20px'}}>
                  <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>Payment Reference / UTR</label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    required
                    placeholder="Transaction ID or UTR number"
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '14px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{display: 'flex', gap: '12px'}}>
                  <button
                    type="button"
                    onClick={() => { setShowRechargeForm(false); setSelectedPlan(null); }}
                    style={{
                      flex: 1,
                      padding: '14px',
                      backgroundColor: 'transparent',
                      color: '#64748b',
                      fontSize: '14px',
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={rechargeSubmitting}
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: rechargeSubmitting ? 'not-allowed' : 'pointer',
                      opacity: rechargeSubmitting ? 0.6 : 1
                    }}
                  >
                    {rechargeSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}

            {/* Hint when no plan selected */}
            {!selectedPlan && creditPlans.length > 0 && (
              <p style={{textAlign: 'center', fontSize: '13px', color: '#94a3b8', margin: '12px 0 0 0'}}>
                Select a plan above to continue
              </p>
            )}
          </div>
        )}

        {/* Tab Toggle */}
        <div ref={subscriptionRef} style={{
          display: 'flex',
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '6px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <button
            onClick={() => setActiveTab('transactions')}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'transactions' ? '#6366f1' : 'transparent',
              color: activeTab === 'transactions' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveTab('recharge')}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'recharge' ? '#6366f1' : 'transparent',
              color: activeTab === 'recharge' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            Recharge
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'invoices' ? '#6366f1' : 'transparent',
              color: activeTab === 'invoices' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            Invoices
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'subscriptions' ? '#6366f1' : 'transparent',
              color: activeTab === 'subscriptions' ? '#fff' : '#64748b',
              transition: 'all 0.2s ease'
            }}
          >
            Subscriptions
          </button>
        </div>

        {/* Tab Content */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          {/* Transaction History Tab */}
          {activeTab === 'transactions' && (
            <>
              {(!walletData?.transactions || walletData.transactions.length === 0) ? (
                <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0', margin: 0}}>No transactions yet</p>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {walletData.transactions.map((tx, idx) => {
                    // Determine label based on type
                    const getLabel = () => {
                      const type = tx.type?.toUpperCase() || '';
                      if (type.includes('DEDUCT') || type.includes('SPEND')) return 'Task Deduction';
                      if (type.includes('REFUND')) return 'Refund';
                      if (type.includes('MANUAL') && tx.amount < 0) return 'Manual Deduct';
                      if (type.includes('MANUAL') && tx.amount > 0) return 'Manual Credit';
                      if (type.includes('CREDIT') || type.includes('RECHARGE')) return 'Recharge Credit';
                      if (tx.amount > 0) return 'Credit';
                      return tx.description || 'Deduction';
                    };
                    
                    return (
                      <div key={tx.id || idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '12px'
                      }}>
                        <div style={{flex: 1, minWidth: 0}}>
                          <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                            {getLabel()}
                          </p>
                          <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                            {new Date(tx.createdAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: tx.amount > 0 ? '#10b981' : '#ef4444',
                          marginLeft: '12px',
                          whiteSpace: 'nowrap'
                        }}>
                          {tx.amount > 0 ? '+' : '−'}₹{Math.abs(tx.amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Recharge Requests Tab */}
          {activeTab === 'recharge' && (
            <>
              {rechargeRequests.length === 0 ? (
                <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0', margin: 0}}>No recharge requests</p>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {rechargeRequests.map((req, idx) => (
                    <div key={req.id || idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 16px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px'
                    }}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <p style={{fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0'}}>
                          ₹{req.amount?.toFixed(2) || '0.00'}
                        </p>
                        <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                          {new Date(req.createdAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        {req.paymentReference && (
                          <p style={{fontSize: '11px', color: '#64748b', margin: '4px 0 0 0'}}>
                            Ref: {req.paymentReference}
                          </p>
                        )}
                      </div>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginLeft: '12px',
                        whiteSpace: 'nowrap',
                        backgroundColor: req.status === 'APPROVED' ? '#dcfce7' : req.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: req.status === 'APPROVED' ? '#15803d' : req.status === 'REJECTED' ? '#dc2626' : '#92400e'
                      }}>
                        {req.status === 'APPROVED' ? 'Approved' : req.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Subscriptions Tab */}
          {activeTab === 'subscriptions' && (
            <>
              <h3 style={{fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0'}}>Subscription Plans</h3>
              <p style={{fontSize: '14px', color: '#64748b', margin: '0 0 20px 0'}}>Buy a plan &mdash; subscription credits are used first before your wallet balance on every task.</p>

              {/* Coupon Input */}
              <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '24px',
                alignItems: 'center'
              }}>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Coupon code (optional)"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontSize: '14px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    outline: 'none',
                    letterSpacing: '1px',
                    fontWeight: couponCode ? '600' : '400'
                  }}
                />
                {couponCode && (
                  <button
                    onClick={() => setCouponCode('')}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#f1f5f9',
                      color: '#64748b',
                      fontSize: '13px',
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: '2px solid #e2e8f0',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {couponCode && (
                <p style={{fontSize: '13px', color: '#6366f1', fontWeight: '600', margin: '-16px 0 20px 0'}}>
                  Coupon &quot;{couponCode}&quot; will be applied at checkout
                </p>
              )}

              {/* Plan Cards */}
              {creditPlans.filter(p => p.type === 'PLAN').length === 0 ? (
                <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0', margin: 0}}>No subscription plans available</p>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '16px'
                }}>
                  {creditPlans.filter(p => p.type === 'PLAN').map(plan => {
                    const isCurrentPlan = subscription?.planId === plan.id || subscription?.planId === plan._id;
                    const isRecommended = !isCurrentPlan && plan.displayOrder === 0;
                    const isBuying = purchasingPlan === plan.id;
                    return (
                      <div
                        key={plan.id || plan._id}
                        style={{
                          padding: '20px',
                          borderRadius: '20px',
                          border: isCurrentPlan ? '2px solid #16a34a' : isRecommended ? '2px solid #6366f1' : '2px solid #e2e8f0',
                          backgroundColor: isCurrentPlan ? '#f0fdf4' : isRecommended ? '#f5f3ff' : '#fff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          position: 'relative'
                        }}
                      >
                        {isCurrentPlan && (
                          <span style={{
                            position: 'absolute', top: '-10px', right: '16px',
                            backgroundColor: '#16a34a', color: '#fff',
                            fontSize: '11px', fontWeight: '700',
                            padding: '3px 10px', borderRadius: '20px'
                          }}>ACTIVE</span>
                        )}
                        {isRecommended && (
                          <span style={{
                            position: 'absolute', top: '-10px', right: '16px',
                            backgroundColor: '#6366f1', color: '#fff',
                            fontSize: '11px', fontWeight: '700',
                            padding: '3px 10px', borderRadius: '20px'
                          }}>RECOMMENDED</span>
                        )}
                        <p style={{fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0}}>{plan.name}</p>
                        <p style={{fontSize: '28px', fontWeight: '800', color: '#6366f1', margin: 0}}>&#x20B9;{plan.price?.toLocaleString()}</p>
                        <div style={{fontSize: '13px', color: '#64748b'}}>
                          <span>{plan.credits?.toLocaleString()} credits</span>
                          {plan.bonusCredits > 0 && (
                            <span style={{color: '#10b981', fontWeight: '600'}}> +{plan.bonusCredits?.toLocaleString()} bonus</span>
                          )}
                        </div>
                        {plan.validityDays && (
                          <span style={{
                            display: 'inline-block',
                            backgroundColor: '#e0e7ff',
                            color: '#4338ca',
                            fontSize: '12px',
                            fontWeight: '600',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            width: 'fit-content'
                          }}>
                            Valid for {plan.validityDays} days
                          </span>
                        )}
                        <button
                          onClick={() => handleSubscriptionPurchase(plan.id || plan._id)}
                          disabled={isBuying}
                          style={{
                            marginTop: '6px',
                            padding: '12px',
                            background: isCurrentPlan
                              ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)'
                              : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '700',
                            borderRadius: '12px',
                            border: 'none',
                            cursor: isBuying ? 'not-allowed' : 'pointer',
                            opacity: isBuying ? 0.6 : 1
                          }}
                        >
                          {isBuying ? 'Processing...' : isCurrentPlan ? 'Renew Plan' : 'Buy Plan'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Invoices Tab */}
          {activeTab === 'invoices' && (
            <>
              {invoices.length === 0 ? (
                <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0', margin: 0}}>No invoices yet</p>
              ) : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {invoices.map((inv, idx) => (
                    <div key={inv.id || inv._id || idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 16px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px'
                    }}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <p style={{fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0'}}>
                          {inv.invoiceNumber}
                        </p>
                        <p style={{fontSize: '16px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                          ₹{inv.amount?.toFixed(2) || '0.00'}
                        </p>
                        <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                          {new Date(inv.createdAt).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                        <span style={{
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          backgroundColor: inv.status === 'FINALIZED' ? '#dcfce7' : inv.status === 'CANCELLED' ? '#fee2e2' : '#e0e7ff',
                          color: inv.status === 'FINALIZED' ? '#15803d' : inv.status === 'CANCELLED' ? '#dc2626' : '#4338ca'
                        }}>
                          {inv.status}
                        </span>
                        {inv.isDownloadableByClient && (
                          <button
                            onClick={() => handleDownloadInvoice(inv.id || inv._id, inv.invoiceNumber)}
                            disabled={downloadingInvoice === (inv.id || inv._id)}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#6366f1',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: '600',
                              borderRadius: '8px',
                              border: 'none',
                              cursor: downloadingInvoice === (inv.id || inv._id) ? 'not-allowed' : 'pointer',
                              opacity: downloadingInvoice === (inv.id || inv._id) ? 0.6 : 1,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {downloadingInvoice === inv._id ? '...' : '📄 PDF'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Wallet;