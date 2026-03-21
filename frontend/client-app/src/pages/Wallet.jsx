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
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [purchasingPlan, setPurchasingPlan] = useState(null); // planId being purchased
  const [pendingSubscriptionRequests, setPendingSubscriptionRequests] = useState([]);
  const [activeSection, setActiveSection] = useState(null); // null | 'recharge' | 'subscription'
  const subscriptionRef = useRef(null);
  const addCreditRef = useRef(null);

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

        // Optional: available coupons
        try {
          const couponsResponse = await api.get('/client/coupons');
          setAvailableCoupons(couponsResponse.data.coupons || []);
        } catch (couponErr) {
          console.log('[Wallet] Coupons endpoint not available');
        }

        // Optional: pending subscription requests
        try {
          const pendingRes = await api.get('/client/subscription-requests');
          setPendingSubscriptionRequests(pendingRes.data.requests?.filter(r => r.status === 'PENDING') || []);
        } catch (pendingErr) {
          console.log('[Wallet] Subscription requests endpoint not available');
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

  // Auto-apply best coupon silently on load
  useEffect(() => {
    if (availableCoupons.length > 0 && !couponCode) {
      const discountCoupons = availableCoupons.filter(c => c.type === 'discount');
      const best = discountCoupons.length > 0
        ? discountCoupons.reduce((a, b) => b.value > a.value ? b : a)
        : availableCoupons.reduce((a, b) => b.value > a.value ? b : a);
      setCouponCode(best.code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableCoupons]);



  // Helper: days until expiry (0 = today, negative = past)
  const getDaysUntilExpiry = (expiresAt) => {
    const diffMs = new Date(expiresAt) - new Date();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  const handleSubscriptionPurchase = async (planId, plan) => {
    // ISSUE 2 FIX: Confirmation popup before purchase
    const confirmMsg = plan 
      ? `Buy "${plan.name}" for ₹${plan.price?.toLocaleString()}?\n\nYou will get ${plan.credits?.toLocaleString()} credits${plan.bonusCredits > 0 ? ` + ${plan.bonusCredits} bonus` : ''}.`
      : 'Confirm this purchase?';
    
    if (!window.confirm(confirmMsg)) return;
    
    setPurchasingPlan(planId);
    try {
      const res = await api.post(`/client/credit-plans/${planId}/purchase`, {
        couponCode: couponCode.trim() || undefined
      });
      setToast('Request submitted. Waiting for admin approval.');
      setTimeout(() => setToast(null), 4000);
      setCouponCode('');
      // Add to pending requests
      if (res.data.request) {
        setPendingSubscriptionRequests(prev => [...prev, res.data.request]);
      }
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
          <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px'}}>
            <p style={{fontSize: '14px', fontWeight: '500', opacity: 0.9, margin: 0}}>Total Credits</p>
            <span 
              title="Subscription credits expire monthly. Wallet credits never expire."
              style={{cursor: 'help', opacity: 0.7, fontSize: '14px'}}
            >ⓘ</span>
          </div>
          <p style={{fontSize: '42px', fontWeight: '800', margin: '0 0 20px 0'}}>₹{walletData?.totalCredits?.toFixed(2) || walletData?.balance?.toFixed(2) || '0.00'}</p>

          {/* Credit Breakdown */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '16px'}}>
            {/* Subscription Credits Row */}
            {(walletData?.subscriptionCredits > 0 || walletData?.subscriptionExpiresAt) && (() => {
              const subCredits = walletData?.subscriptionCredits || 0;
              const expiresAt = walletData?.subscriptionExpiresAt;
              const isExpired = expiresAt && new Date(expiresAt) < new Date();
              const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
              
              if (isExpired && subCredits === 0) return null;
              
              return (
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <div>
                    <p style={{fontSize: '13px', fontWeight: '600', color: '#fcd34d', margin: 0}}>Plan Credits</p>
                    <p style={{fontSize: '11px', color: isExpired ? '#fca5a5' : '#fde68a', margin: '2px 0 0 0'}}>
                      {isExpired ? 'Expired' : `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <span style={{fontSize: '18px', fontWeight: '700', color: '#fcd34d'}}>₹{subCredits.toFixed(2)}</span>
                </div>
              );
            })()}

            {/* Wallet Credits Row */}
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <div>
                <p style={{fontSize: '13px', fontWeight: '600', color: '#86efac', margin: 0}}>Wallet Balance</p>
                <p style={{fontSize: '11px', color: '#bbf7d0', margin: '2px 0 0 0'}}>No expiry</p>
              </div>
              <span style={{fontSize: '18px', fontWeight: '700', color: '#86efac'}}>₹{(walletData?.walletCredits || walletData?.balance || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Empty State Helper */}
          {(walletData?.walletCredits || walletData?.balance || 0) === 0 && (walletData?.subscriptionCredits || 0) === 0 && (
            <p style={{fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '12px', textAlign: 'center'}}>
              Add money to your wallet or buy a plan to start
            </p>
          )}

          {/* Upgrade Credits Button */}
          <button
            onClick={() => {
              setActiveSection(prev => prev === 'recharge' ? null : 'recharge');
              setActiveTab('recharge');
            }}
            style={{
              marginTop: '20px',
              width: '100%',
              padding: '14px 24px',
              background: activeSection === 'recharge' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.4)',
              borderRadius: '14px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            💳 {activeSection === 'recharge' ? 'Hide Add Money' : 'Add Money'}
          </button>

          {/* View Plans Button - Always show, even with active subscription */}
          {(() => {
            const now = new Date();
            const hasActiveSubscription = 
              walletData?.subscriptionExpiresAt && 
              new Date(walletData.subscriptionExpiresAt) > now && 
              walletData?.subscriptionCredits > 0;
            
            if (hasActiveSubscription) {
              const daysLeft = Math.ceil((new Date(walletData.subscriptionExpiresAt) - now) / (1000 * 60 * 60 * 24));
              return (
                <>
                  {/* Active Plan Info */}
                  <div style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '14px 24px',
                    background: 'rgba(16,185,129,0.3)',
                    border: '2px solid rgba(16,185,129,0.5)',
                    borderRadius: '14px',
                    color: '#86efac',
                    fontSize: '14px',
                    fontWeight: '600',
                    textAlign: 'center'
                  }}>
                    <div style={{fontSize: '15px', fontWeight: '700', marginBottom: '4px'}}>✅ Active Plan</div>
                    <div style={{fontSize: '13px', opacity: 0.9}}>
                      ₹{walletData.subscriptionCredits.toFixed(2)} credits • {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
                    </div>
                  </div>
                  {/* Upgrade Plans Button */}
                  <button
                    onClick={() => {
                      setActiveSection(prev => prev === 'subscription' ? null : 'subscription');
                    }}
                    style={{
                      marginTop: '10px',
                      width: '100%',
                      padding: '14px 24px',
                      background: activeSection === 'subscription' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
                      border: '2px solid rgba(255,255,255,0.4)',
                      borderRadius: '14px',
                      color: '#fff',
                      fontSize: '15px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    ⬆️ {activeSection === 'subscription' ? 'Hide Upgrade Options' : 'View Upgrade Options'}
                  </button>
                </>
              );
            }
            
            return (
              <button
                onClick={() => {
                  setActiveSection(prev => prev === 'subscription' ? null : 'subscription');
                }}
                style={{
                  marginTop: '10px',
                  width: '100%',
                  padding: '14px 24px',
                  background: activeSection === 'subscription' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
                  border: '2px solid rgba(255,255,255,0.4)',
                  borderRadius: '14px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                📦 {activeSection === 'subscription' ? 'Hide Plans' : 'Buy Plan'}
              </button>
            );
          })()}
        </div>

        {/* Subscription Plans - Premium Product Cards */}
        {activeSection === 'subscription' && creditPlans.filter(p => p.type === 'PLAN').length > 0 && (
          <div style={{marginBottom: '24px'}}>
            <h3 style={{fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '16px'}}>Choose a Plan</h3>
            {/* Coupon Input - Inline */}
            <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px'}}>
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Have a coupon?"
                style={{
                  padding: '10px 14px',
                  fontSize: '14px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  outline: 'none',
                  letterSpacing: '1px',
                  fontWeight: couponCode ? '600' : '400',
                  width: '180px',
                  backgroundColor: '#fff'
                }}
              />
              {couponCode && (
                <>
                  <span style={{fontSize: '12px', color: '#16a34a', fontWeight: '600'}}>Applied</span>
                  <button onClick={() => setCouponCode('')} style={{background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '16px'}}>×</button>
                </>
              )}
            </div>

            {/* Plan Cards - Premium Product Style */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '16px'
            }}>
              {creditPlans.filter(p => p.type === 'PLAN').sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map((plan, index) => {
                const planId = plan.id || plan._id;
                const isCurrentPlan = subscription?.planId === planId || walletData?.currentPlanId === planId;
                const isBuying = purchasingPlan === planId;
                const isPendingApproval = pendingSubscriptionRequests.some(r => r.planId === planId);
                const isBestValue = index === 0 && !isCurrentPlan && !isPendingApproval;
                
                // Upgrade logic - check if user has active subscription
                const hasActiveSubscription = walletData?.subscriptionCredits > 0 && 
                  walletData?.subscriptionExpiresAt && 
                  new Date(walletData.subscriptionExpiresAt) > new Date();
                const currentPlanPrice = Number(walletData?.currentPlanPrice) || 0;
                const canUpgrade = !hasActiveSubscription || (plan.price > currentPlanPrice);
                const isLowerPlan = hasActiveSubscription && plan.price <= currentPlanPrice && !isCurrentPlan;
                
                return (
                  <button
                    key={planId}
                    onClick={() => !isPendingApproval && canUpgrade && handleSubscriptionPurchase(planId, plan)}
                    disabled={isBuying || isPendingApproval || isLowerPlan}
                    style={{
                      padding: '24px 16px',
                      borderRadius: '20px',
                      border: isPendingApproval ? '2px solid #f59e0b' : isCurrentPlan ? '2px solid #16a34a' : isLowerPlan ? '1px solid #e2e8f0' : isBestValue ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: isPendingApproval
                        ? 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)'
                        : isCurrentPlan
                        ? 'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)'
                        : isLowerPlan
                        ? 'linear-gradient(145deg, #f1f5f9 0%, #e2e8f0 100%)'
                        : isBestValue
                        ? 'linear-gradient(145deg, #eef2ff 0%, #e0e7ff 100%)'
                        : 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)',
                      cursor: isBuying || isPendingApproval || isLowerPlan ? 'not-allowed' : 'pointer',
                      opacity: isBuying ? 0.7 : isLowerPlan ? 0.6 : 1,
                      textAlign: 'center',
                      position: 'relative',
                      transition: 'all 0.25s ease',
                      boxShadow: isBestValue ? '0 8px 24px rgba(99,102,241,0.2)' : '0 4px 12px rgba(0,0,0,0.06)',
                      transform: isBuying ? 'scale(0.98)' : 'scale(1)'
                    }}
                  >
                    {/* Badges */}
                    {isPendingApproval && (
                      <span style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                        color: '#fff', fontSize: '9px', fontWeight: '700',
                        padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.5px',
                        boxShadow: '0 2px 8px rgba(245,158,11,0.4)'
                      }}>PENDING APPROVAL</span>
                    )}
                    {!isPendingApproval && isBestValue && (
                      <span style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        color: '#fff', fontSize: '9px', fontWeight: '700',
                        padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.5px',
                        boxShadow: '0 2px 8px rgba(99,102,241,0.4)'
                      }}>BEST VALUE</span>
                    )}
                    {!isPendingApproval && isCurrentPlan && (
                      <span style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        backgroundColor: '#16a34a', color: '#fff',
                        fontSize: '9px', fontWeight: '700',
                        padding: '4px 12px', borderRadius: '20px'
                      }}>ACTIVE</span>
                    )}
                    {!isPendingApproval && !isCurrentPlan && isLowerPlan && (
                      <span style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        backgroundColor: '#94a3b8', color: '#fff',
                        fontSize: '9px', fontWeight: '700',
                        padding: '4px 12px', borderRadius: '20px'
                      }}>NOT AVAILABLE</span>
                    )}
                    {!isPendingApproval && !isCurrentPlan && !isLowerPlan && canUpgrade && hasActiveSubscription && (
                      <span style={{
                        position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                        background: 'linear-gradient(90deg, #10b981, #059669)',
                        color: '#fff', fontSize: '9px', fontWeight: '700',
                        padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.5px',
                        boxShadow: '0 2px 8px rgba(16,185,129,0.4)'
                      }}>UPGRADE</span>
                    )}

                    {/* Price */}
                    <p style={{
                      fontSize: '32px', fontWeight: '800',
                      color: isCurrentPlan ? '#16a34a' : isBestValue ? '#4f46e5' : '#1e293b',
                      margin: '8px 0 8px 0', lineHeight: 1
                    }}>
                      ₹{plan.price?.toLocaleString()}
                    </p>

                    {/* Credits */}
                    <p style={{
                      fontSize: '15px', fontWeight: '700',
                      color: '#334155', margin: '0 0 4px 0'
                    }}>
                      {plan.credits?.toLocaleString()} Credits
                    </p>

                    {/* Bonus */}
                    {plan.bonusCredits > 0 && (
                      <p style={{
                        fontSize: '13px', fontWeight: '700',
                        color: '#10b981', margin: '0',
                        backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '8px', display: 'inline-block'
                      }}>
                        +{plan.bonusCredits?.toLocaleString()} Bonus
                      </p>
                    )}

                    {/* Loading/Status */}
                    {isBuying && (
                      <p style={{fontSize: '12px', color: '#6366f1', margin: '10px 0 0 0', fontWeight: '600'}}>Processing...</p>
                    )}
                    {isPendingApproval && !isBuying && (
                      <p style={{fontSize: '11px', color: '#92400e', margin: '10px 0 0 0', fontWeight: '600'}}>Awaiting Approval</p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Subscription Status */}
            {subscription && (() => {
              const daysLeft = getDaysUntilExpiry(subscription.expiresAt);
              const isExpiringSoon = daysLeft <= 2;
              return (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  backgroundColor: isExpiringSoon ? '#fffbeb' : '#f0fdf4',
                  borderRadius: '12px',
                  border: isExpiringSoon ? '1px solid #fcd34d' : '1px solid #86efac',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div>
                    <p style={{fontSize: '13px', fontWeight: '700', color: isExpiringSoon ? '#92400e' : '#15803d', margin: 0}}>
                      {subscription.creditsRemaining?.toLocaleString()} credits remaining
                    </p>
                    <p style={{fontSize: '11px', color: isExpiringSoon ? '#a16207' : '#166534', margin: '2px 0 0 0'}}>
                      {isExpiringSoon ? `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : `Expires ${new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ISSUE 1 FIX: One-time Credit Packs Section */}
        {creditPlans.filter(p => p.type === 'PACK').length > 0 && (
          <div style={{marginBottom: '24px'}}>
            <h3 style={{fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: '0 0 12px 0'}}>One-time Credit Packs</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '12px'
            }}>
              {creditPlans.filter(p => p.type === 'PACK').map((plan) => {
                const planId = plan.id || plan._id;
                const isBuying = purchasingPlan === planId;
                const isPendingApproval = pendingSubscriptionRequests.some(r => r.planId === planId);
                return (
                  <button
                    key={planId}
                    onClick={() => !isPendingApproval && handleSubscriptionPurchase(planId, plan)}
                    disabled={isBuying || isPendingApproval}
                    style={{
                      padding: '16px 12px',
                      borderRadius: '16px',
                      border: isPendingApproval ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      background: isPendingApproval 
                        ? 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%)' 
                        : 'linear-gradient(145deg, #f0fdf4 0%, #dcfce7 100%)',
                      cursor: isBuying || isPendingApproval ? 'not-allowed' : 'pointer',
                      opacity: isBuying ? 0.7 : 1,
                      textAlign: 'center',
                      position: 'relative',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isPendingApproval && (
                      <span style={{
                        position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                        background: '#f59e0b', color: '#fff', fontSize: '8px', fontWeight: '700',
                        padding: '2px 8px', borderRadius: '12px'
                      }}>PENDING</span>
                    )}
                    <p style={{fontSize: '22px', fontWeight: '800', color: '#15803d', margin: '0 0 4px 0'}}>
                      ₹{plan.price?.toLocaleString()}
                    </p>
                    <p style={{fontSize: '13px', fontWeight: '600', color: '#334155', margin: 0}}>
                      {plan.credits?.toLocaleString()} Credits
                    </p>
                    {plan.bonusCredits > 0 && (
                      <p style={{fontSize: '11px', color: '#10b981', margin: '4px 0 0 0', fontWeight: '600'}}>
                        +{plan.bonusCredits} Bonus
                      </p>
                    )}
                    {isBuying && (
                      <p style={{fontSize: '10px', color: '#6366f1', margin: '6px 0 0 0', fontWeight: '600'}}>Processing...</p>
                    )}
                  </button>
                );
              })}
            </div>
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
                    const type = tx.type?.toUpperCase() || '';
                    const isSubscription = type.includes('SUBSCRIPTION');
                    
                    // Determine label based on type
                    const getLabel = () => {
                      if (isSubscription) return 'Plan Purchase';
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
                          <p style={{fontSize: '12px', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            {tx.description || new Date(tx.createdAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div style={{textAlign: 'right', marginLeft: '12px', flexShrink: 0}}>
                          {isSubscription && tx.credits > 0 && (
                            <p style={{fontSize: '14px', fontWeight: '700', color: '#10b981', margin: 0}}>
                              +{tx.credits} credits
                            </p>
                          )}
                          <p style={{
                            fontSize: isSubscription && tx.credits > 0 ? '12px' : '16px',
                            fontWeight: '700',
                            color: tx.amount > 0 ? '#10b981' : '#ef4444',
                            margin: 0
                          }}>
                            {tx.amount > 0 ? '+' : '−'}₹{Math.abs(tx.amount)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Recharge Requests Tab */}
          {activeSection === 'recharge' && activeTab === 'recharge' && (
            <>
              {/* Manual Recharge Form */}
              <h3 style={{fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '16px'}}>Add Money to Wallet</h3>
              <div ref={addCreditRef} style={{
                backgroundColor: '#f8fafc',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
                border: '1px solid #e2e8f0'
              }}>
                <h4 style={{fontSize: '16px', fontWeight: '600', color: '#475569', margin: '0 0 16px 0'}}>Enter Details</h4>
                <div style={{marginBottom: '12px'}}>
                  <input
                    type="number"
                    placeholder="Enter Amount"
                    value={rechargeAmount}
                    onChange={(e) => setRechargeAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '15px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{marginBottom: '16px'}}>
                  <input
                    type="text"
                    placeholder="Enter UTR / Transaction ID"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      fontSize: '15px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!rechargeAmount || parseFloat(rechargeAmount) < 1) {
                      setToast('Please enter a valid amount');
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }
                    if (!paymentRef.trim()) {
                      setToast('Please enter UTR / Transaction ID');
                      setTimeout(() => setToast(null), 3000);
                      return;
                    }
                    setRechargeSubmitting(true);
                    try {
                      await api.post('/client/wallet/recharge', {
                        amount: parseFloat(rechargeAmount),
                        paymentReference: paymentRef.trim()
                      });
                      setToast('Request submitted. Waiting for admin approval.');
                      setTimeout(() => setToast(null), 4000);
                      setRechargeAmount('');
                      setPaymentRef('');
                      // Refresh recharge requests
                      const requestsResponse = await api.get('/client/wallet/recharge-requests');
                      setRechargeRequests(requestsResponse.data.requests || []);
                    } catch (err) {
                      const msg = err.response?.data?.error || 'Failed to submit request';
                      setToast(msg);
                      setTimeout(() => setToast(null), 4000);
                    } finally {
                      setRechargeSubmitting(false);
                    }
                  }}
                  disabled={rechargeSubmitting}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: '700',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: rechargeSubmitting ? 'not-allowed' : 'pointer',
                    opacity: rechargeSubmitting ? 0.6 : 1
                  }}
                >
                  {rechargeSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>

              {/* Recharge History */}
              <h4 style={{fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px 0'}}>Request History</h4>
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