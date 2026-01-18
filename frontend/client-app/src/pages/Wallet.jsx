import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Wallet = () => {
  const [walletData, setWalletData] = useState(null);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [showRechargeForm, setShowRechargeForm] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [rechargeSubmitting, setRechargeSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('transactions'); // 'transactions' | 'recharge'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletResponse, requestsResponse] = await Promise.all([
          api.get('/client/wallet'),
          api.get('/client/wallet/recharge-requests')
        ]);
        
        setWalletData(walletResponse.data);
        setRechargeRequests(requestsResponse.data.requests || []);
      } catch (err) {
        setError('Failed to load wallet data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleRechargeSubmit = async (e) => {
    e.preventDefault();
    setRechargeSubmitting(true);
    setError('');
    
    try {
      const response = await api.post('/client/wallet/recharge', { 
        amount: parseFloat(rechargeAmount),
        paymentReference: paymentRef
      });
      
      // Success! Show toast immediately
      setToast('Recharge request submitted successfully');
      setTimeout(() => setToast(null), 3000);
      
      // Clear form
      setRechargeAmount('');
      setPaymentRef('');
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
            onClick={() => setShowRechargeForm(!showRechargeForm)}
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
            Request Recharge
          </button>
        </div>

        {/* Recharge Form */}
        {showRechargeForm && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '20px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
          }}>
            <h3 style={{fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0'}}>Request Recharge</h3>
            <form onSubmit={handleRechargeSubmit}>
              <div style={{marginBottom: '16px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>Amount (₹)</label>
                <input
                  type="number"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  min="100"
                  max="100000"
                  required
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
              <div style={{marginBottom: '20px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>Payment Reference</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  required
                  placeholder="Transaction ID or reference"
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
                  onClick={() => setShowRechargeForm(false)}
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
          </div>
        )}

        {/* Tab Toggle */}
        <div style={{
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
            Transaction History
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
            Recharge Requests
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
        </div>
      </div>
    </div>
  );
};

export default Wallet;