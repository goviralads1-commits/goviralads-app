
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Wallet = () => {
  const [wallets, setWallets] = useState([]);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientWallet, setClientWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [walletTab, setWalletTab] = useState('clients'); // 'clients' | 'rechargeRequests' | 'planRequests'
  
  // Add funds modal
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingId, setLoadingId] = useState(null);

  // Deduct funds modal
  const [showDeductFunds, setShowDeductFunds] = useState(false);
  const [deductAmount, setDeductAmount] = useState('');
  const [deductDescription, setDeductDescription] = useState('');
  const [deductHidden, setDeductHidden] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [walletsRes, requestsRes, subRequestsRes] = await Promise.all([
        api.get('/admin/wallets'),
        api.get('/admin/recharge-requests'),
        api.get('/admin/subscription-requests')
      ]);
      setWallets(walletsRes.data.wallets || []);
      setRechargeRequests(requestsRes.data.requests || []);
      setSubscriptionRequests(subRequestsRes.data.requests || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchWallets = async () => {
    try {
      const response = await api.get('/admin/wallets');
      setWallets(response.data.wallets || []);
    } catch (err) {
      console.error('Wallets error:', err);
    }
  };

  const fetchRechargeRequests = async () => {
    try {
      const response = await api.get('/admin/recharge-requests');
      setRechargeRequests(response.data.requests || []);
    } catch (err) {
      console.error('Recharge requests error:', err);
    }
  };

  const fetchSubscriptionRequests = async () => {
    try {
      const response = await api.get('/admin/subscription-requests');
      setSubscriptionRequests(response.data.requests || []);
    } catch (err) {
      console.error('Subscription requests error:', err);
    }
  };

  const handleApprove = async (requestId) => {
    try {
      setLoadingId(requestId);
      await api.post(`/admin/recharge-requests/${requestId}/approve`);
      setToast('Approved successfully');
      setTimeout(() => setToast(null), 3000);
      try {
        await Promise.all([fetchWallets(), fetchRechargeRequests()]);
        if (selectedClient) await fetchClientWallet(selectedClient);
      } catch (refreshErr) {
        console.warn('Refresh after approve had issues:', refreshErr);
      }
    } catch (err) {
      console.error('Approve error:', err);
      setToast(err.response?.data?.error || 'Something went wrong. Please try again.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (requestId) => {
    try {
      setLoadingId(requestId);
      await api.post(`/admin/recharge-requests/${requestId}/reject`);
      setToast('Rejected successfully');
      setTimeout(() => setToast(null), 3000);
      try {
        await fetchRechargeRequests();
      } catch (refreshErr) {
        console.warn('Refresh after reject had issues:', refreshErr);
      }
    } catch (err) {
      console.error('Reject error:', err);
      setToast(err.response?.data?.error || 'Something went wrong. Please try again.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoadingId(null);
    }
  };

  // Subscription Request Handlers
  const handleSubscriptionApprove = async (requestId) => {
    try {
      setLoadingId(requestId);
      const res = await api.post(`/admin/subscription-requests/${requestId}/approve`);
      // Success - show green toast
      setToast({ type: 'success', message: `✅ Approved! ${res.data.totalCredits || ''} credits added` });
      setTimeout(() => setToast(null), 3000);
      try {
        await Promise.all([fetchWallets(), fetchSubscriptionRequests()]);
        if (selectedClient) await fetchClientWallet(selectedClient);
      } catch (refreshErr) {
        console.warn('Refresh after approve had issues:', refreshErr);
      }
    } catch (err) {
      console.error('Subscription approve error:', err);
      // Error - show red toast
      setToast({ type: 'error', message: err.response?.data?.details || err.response?.data?.error || 'Failed to approve' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoadingId(null);
    }
  };

  const handleSubscriptionReject = async (requestId) => {
    try {
      setLoadingId(requestId);
      await api.post(`/admin/subscription-requests/${requestId}/reject`);
      setToast('Rejected successfully');
      setTimeout(() => setToast(null), 3000);
      try {
        await fetchSubscriptionRequests();
      } catch (refreshErr) {
        console.warn('Refresh after reject had issues:', refreshErr);
      }
    } catch (err) {
      console.error('Subscription reject error:', err);
      setToast(err.response?.data?.error || 'Something went wrong. Please try again.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoadingId(null);
    }
  };

  const fetchClientWallet = async (clientId) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/admin/wallets/${clientId}`);
      setClientWallet(response.data);
      setSelectedClient(clientId);
    } catch (err) {
      console.error('Client wallet error:', err);
      setToast('Failed to load client wallet');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddFunds = async (e) => {
    e.preventDefault();
    if (!selectedClient || !addAmount) return;
    
    setSubmitting(true);
    try {
      await api.post(`/admin/wallets/${selectedClient}/adjust`, {
        credits: parseFloat(addAmount),
        description: addDescription || 'Admin credit adjustment'
      });
      
      // Refresh data
      await fetchWallets();
      await fetchClientWallet(selectedClient);
      
      setShowAddFunds(false);
      setAddAmount('');
      setAddDescription('');
      setToast({ type: 'success', message: `+${addAmount} credits added successfully` });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Add funds error:', err);
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to add funds' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeductFunds = async (e) => {
    e.preventDefault();
    if (!selectedClient || !deductAmount) return;
    
    const amount = parseFloat(deductAmount);
    if (amount <= 0) {
      setToast({ type: 'error', message: 'Amount must be greater than 0' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    setSubmitting(true);
    try {
      await api.post(`/admin/wallets/${selectedClient}/adjust`, {
        credits: -amount, // Negative for deduction
        description: deductDescription || 'Admin credit deduction',
        isHidden: deductHidden
      });
      
      // Refresh data
      await fetchWallets();
      await fetchClientWallet(selectedClient);
      
      setShowDeductFunds(false);
      setDeductAmount('');
      setDeductDescription('');
      setDeductHidden(false);
      setToast({ type: 'success', message: `-${amount} credits deducted successfully` });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Deduct funds error:', err);
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to deduct funds' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
        <Header />
        <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px'}}>
            <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{padding: '16px', marginBottom: '12px', backgroundColor: '#f8fafc', borderRadius: '12px'}}>
                  <div style={{width: '60%', height: '18px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '8px', animation: 'pulse 1.5s infinite'}}></div>
                  <div style={{width: '40%', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite'}}></div>
                </div>
              ))}
            </div>
            <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
              <div style={{width: '200px', height: '28px', backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: '24px', animation: 'pulse 1.5s infinite'}}></div>
              <div style={{width: '100%', height: '200px', backgroundColor: '#f8fafc', borderRadius: '12px', animation: 'pulse 1.5s infinite'}}></div>
            </div>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
      <Header />
      
      {/* Toast */}
      {toast && ((
        () => {
          const msg = typeof toast === 'object' ? toast.message : toast;
          const isError = typeof toast === 'object' 
            ? toast.type === 'error' 
            : (msg.toLowerCase().includes('fail') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('insufficient'));
          return (
            <div style={{
              position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
              backgroundColor: isError ? '#ef4444' : '#10b981',
              color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100
            }}>
              {msg}
            </div>
          );
        }
      )())}

      <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
        <h1 style={{fontSize: '28px', fontWeight: '700', color: '#0f172a', marginBottom: '24px'}}>Wallet Management</h1>
        
        {/* Tab Switcher */}
        <div style={{display: 'flex', gap: '8px', marginBottom: '20px'}}>
          <button
            onClick={() => setWalletTab('clients')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: walletTab === 'clients' ? '#6366f1' : '#f1f5f9',
              color: walletTab === 'clients' ? '#fff' : '#64748b',
              transition: 'all 0.2s'
            }}
          >
            Client Wallets
          </button>
          <button
            onClick={() => setWalletTab('rechargeRequests')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: walletTab === 'rechargeRequests' ? '#6366f1' : '#f1f5f9',
              color: walletTab === 'rechargeRequests' ? '#fff' : '#64748b',
              transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            Recharge Requests
            {rechargeRequests.filter(r => r.status === 'PENDING').length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '20px', height: '20px',
                backgroundColor: '#ef4444', color: '#fff',
                borderRadius: '50%', fontSize: '11px', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {rechargeRequests.filter(r => r.status === 'PENDING').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setWalletTab('planRequests')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: walletTab === 'planRequests' ? '#6366f1' : '#f1f5f9',
              color: walletTab === 'planRequests' ? '#fff' : '#64748b',
              transition: 'all 0.2s',
              position: 'relative'
            }}
          >
            Plan Requests
            {subscriptionRequests.filter(r => r.status === 'PENDING').length > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                width: '20px', height: '20px',
                backgroundColor: '#ef4444', color: '#fff',
                borderRadius: '50%', fontSize: '11px', fontWeight: '700',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {subscriptionRequests.filter(r => r.status === 'PENDING').length}
              </span>
            )}
          </button>
        </div>

        {walletTab === 'clients' ? (
        <div style={{display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px'}}>
          {/* Client List */}
          <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
            <h2 style={{fontSize: '16px', fontWeight: '700', color: '#334155', marginBottom: '16px'}}>Clients</h2>
            
            {wallets.length === 0 ? (
              <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0'}}>No clients found</p>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {wallets.map(wallet => (
                  <div
                    key={wallet.clientId}
                    onClick={() => fetchClientWallet(wallet.clientId)}
                    style={{
                      padding: '16px',
                      backgroundColor: selectedClient === wallet.clientId ? '#eef2ff' : '#f8fafc',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      border: selectedClient === wallet.clientId ? '2px solid #6366f1' : '2px solid transparent',
                      transition: 'all 0.2s'
                    }}
                  >
                    <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                      {wallet.clientIdentifier}
                    </p>
                    <p style={{fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0}}>
                      ₹{wallet.balance.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client Detail */}
          <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
            {!selectedClient ? (
              <div style={{textAlign: 'center', padding: '60px 0'}}>
                <p style={{fontSize: '16px', color: '#94a3b8'}}>Select a client to view wallet details</p>
              </div>
            ) : detailLoading ? (
              <div style={{textAlign: 'center', padding: '60px 0'}}>
                <p style={{fontSize: '14px', color: '#64748b'}}>Loading...</p>
              </div>
            ) : clientWallet ? (
              <>
                {/* Header */}
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px'}}>
                  <div>
                    <h2 style={{fontSize: '18px', fontWeight: '700', color: '#334155', margin: '0 0 4px 0'}}>
                      {clientWallet.clientIdentifier}
                    </h2>
                    <p style={{fontSize: '32px', fontWeight: '800', color: '#0f172a', margin: 0}}>
                      ₹{clientWallet.balance.toFixed(2)}
                    </p>
                  </div>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button
                      onClick={() => setShowAddFunds(true)}
                      style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                      }}
                    >
                      + Add Funds
                    </button>
                    <button
                      onClick={() => setShowDeductFunds(true)}
                      style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(239,68,68,0.3)'
                      }}
                    >
                      − Deduct Funds
                    </button>
                  </div>
                </div>

                {/* Transaction History */}
                <h3 style={{fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px'}}>
                  Transaction History
                </h3>
                
                {clientWallet.transactions?.length === 0 ? (
                  <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '32px 0'}}>No transactions yet</p>
                ) : (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                    {clientWallet.transactions?.map(tx => (
                      <div key={tx.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 16px',
                        backgroundColor: '#f8fafc',
                        borderRadius: '12px'
                      }}>
                        <div>
                          <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                            {tx.description || tx.type}
                          </p>
                          <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                            {new Date(tx.createdAt).toLocaleString()}
                            {tx.referenceId && <span style={{marginLeft: '8px'}}>• Task: {tx.referenceId.slice(-8)}</span>}
                          </p>
                        </div>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: tx.amount > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
        ) : walletTab === 'rechargeRequests' ? (
        /* Recharge Requests Tab */
        <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
          <h2 style={{fontSize: '18px', fontWeight: '700', color: '#334155', marginBottom: '20px'}}>Recharge Requests</h2>
          
          {rechargeRequests.length === 0 ? (
            <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '40px 0'}}>No recharge requests yet</p>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              {/* Pending Requests First */}
              {rechargeRequests.filter(r => r.status === 'PENDING').length > 0 && (
                <>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0'}}>Pending Approval</h3>
                  {rechargeRequests.filter(r => r.status === 'PENDING').map(req => (
                    <div key={req.id} style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      backgroundColor: '#fffbeb',
                      borderRadius: '12px',
                      border: '2px solid #fcd34d'
                    }}>
                      <div style={{flex: '1 1 200px', minWidth: 0}}>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                          {req.clientIdentifier}
                        </p>
                        <p style={{fontSize: '22px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0'}}>
                          ₹{req.amount.toFixed(2)}
                        </p>
                        <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                          Ref: {req.paymentReference} • {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={loadingId === req.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: loadingId === req.id ? 'not-allowed' : 'pointer',
                            opacity: loadingId === req.id ? 0.6 : 1
                          }}
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={loadingId === req.id}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: loadingId === req.id ? 'not-allowed' : 'pointer',
                            opacity: loadingId === req.id ? 0.6 : 1,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                          }}
                        >
                          {loadingId === req.id ? 'Processing...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Processed Requests */}
              {rechargeRequests.filter(r => r.status !== 'PENDING').length > 0 && (
                <>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px 0'}}>History</h3>
                  {rechargeRequests.filter(r => r.status !== 'PENDING').map(req => (
                    <div key={req.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 20px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px'
                    }}>
                      <div>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 2px 0'}}>
                          {req.clientIdentifier}
                        </p>
                        <p style={{fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0'}}>
                          ₹{req.amount.toFixed(2)}
                        </p>
                        <p style={{fontSize: '11px', color: '#94a3b8', margin: 0}}>
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: req.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                        color: req.status === 'APPROVED' ? '#15803d' : '#dc2626'
                      }}>
                        {req.status}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        ) : (
        /* Plan Requests Tab */
        <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
          <h2 style={{fontSize: '18px', fontWeight: '700', color: '#334155', marginBottom: '20px'}}>Plan Requests</h2>
          
          {subscriptionRequests.length === 0 ? (
            <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '40px 0'}}>No plan requests yet</p>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              {/* Pending Requests First */}
              {subscriptionRequests.filter(r => r.status === 'PENDING').length > 0 && (
                <>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0'}}>Pending Approval</h3>
                  {subscriptionRequests.filter(r => r.status === 'PENDING').map(req => (
                    <div key={req.id} style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px',
                      backgroundColor: '#fffbeb',
                      borderRadius: '12px',
                      border: '2px solid #fcd34d'
                    }}>
                      <div style={{flex: '1 1 200px', minWidth: 0}}>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 4px 0'}}>
                          {req.clientIdentifier}
                        </p>
                        <p style={{fontSize: '16px', fontWeight: '700', color: '#6366f1', margin: '0 0 4px 0'}}>
                          {req.planName || req.planId?.name || 'Plan'}
                        </p>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0'}}>
                          {req.totalCredits || ((req.planCredits || 0) + (req.planBonusCredits || 0))} credits
                        </p>
                        <p style={{fontSize: '12px', color: '#94a3b8', margin: 0}}>
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
                        <button
                          onClick={() => handleSubscriptionReject(req.id)}
                          disabled={loadingId === req.id}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: loadingId === req.id ? 'not-allowed' : 'pointer',
                            opacity: loadingId === req.id ? 0.6 : 1
                          }}
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleSubscriptionApprove(req.id)}
                          disabled={loadingId === req.id}
                          style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: loadingId === req.id ? 'not-allowed' : 'pointer',
                            opacity: loadingId === req.id ? 0.6 : 1,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                          }}
                        >
                          {loadingId === req.id ? 'Processing...' : 'Approve'}
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Processed Requests */}
              {subscriptionRequests.filter(r => r.status !== 'PENDING').length > 0 && (
                <>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px 0'}}>History</h3>
                  {subscriptionRequests.filter(r => r.status !== 'PENDING').map(req => (
                    <div key={req.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '14px 20px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '12px'
                    }}>
                      <div>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#334155', margin: '0 0 2px 0'}}>
                          {req.clientIdentifier}
                        </p>
                        <p style={{fontSize: '14px', fontWeight: '600', color: '#6366f1', margin: '0 0 4px 0'}}>
                          {req.planName || req.planId?.name || 'Plan'}
                        </p>
                        <p style={{fontSize: '11px', color: '#94a3b8', margin: 0}}>
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: req.status === 'APPROVED' ? '#dcfce7' : '#fee2e2',
                        color: req.status === 'APPROVED' ? '#15803d' : '#dc2626'
                      }}>
                        {req.status}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Add Funds Modal */}
      {showAddFunds && (
        <>
          <div 
            onClick={() => setShowAddFunds(false)}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(15,23,42,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 80
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            borderRadius: '24px',
            padding: '32px',
            width: '90%',
            maxWidth: '400px',
            zIndex: 90,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 24px 0'}}>Add Funds</h3>
            <form onSubmit={handleAddFunds}>
              <div style={{marginBottom: '20px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>
                  Credits
                </label>
                <input
                  type="number"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="500"
                  required
                  min="1"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '18px',
                    fontWeight: '600',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{marginBottom: '24px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>
                  Description
                </label>
                <input
                  type="text"
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="Reason for adjustment"
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
                  onClick={() => setShowAddFunds(false)}
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
                  disabled={submitting || !addAmount}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.6 : 1
                  }}
                >
                  {submitting ? 'Adding...' : 'Add Funds'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Deduct Funds Modal */}
      {showDeductFunds && (
        <>
          <div 
            onClick={() => setShowDeductFunds(false)}
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(15,23,42,0.6)',
              backdropFilter: 'blur(8px)',
              zIndex: 80
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#fff',
            borderRadius: '24px',
            padding: '32px',
            width: '90%',
            maxWidth: '400px',
            zIndex: 90,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <h3 style={{fontSize: '20px', fontWeight: '700', color: '#ef4444', margin: '0 0 24px 0'}}>Deduct Funds</h3>
            <form onSubmit={handleDeductFunds}>
              <div style={{marginBottom: '20px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>
                  Credits to Deduct
                </label>
                <input
                  type="number"
                  value={deductAmount}
                  onChange={(e) => setDeductAmount(e.target.value)}
                  placeholder="500"
                  required
                  min="1"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: '18px',
                    fontWeight: '600',
                    border: '2px solid #fecaca',
                    borderRadius: '12px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{marginBottom: '20px'}}>
                <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px'}}>
                  Reason (required)
                </label>
                <input
                  type="text"
                  value={deductDescription}
                  onChange={(e) => setDeductDescription(e.target.value)}
                  placeholder="e.g., Payment reversal, Manual correction"
                  required
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
              <div style={{marginBottom: '24px'}}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#64748b',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={deductHidden}
                    onChange={(e) => setDeductHidden(e.target.checked)}
                    style={{width: '18px', height: '18px', accentColor: '#6366f1'}}
                  />
                  Hide from client (admin-only record)
                </label>
              </div>
              <div style={{display: 'flex', gap: '12px'}}>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeductFunds(false);
                    setDeductAmount('');
                    setDeductDescription('');
                    setDeductHidden(false);
                  }}
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
                  disabled={submitting || !deductAmount || !deductDescription}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: (submitting || !deductDescription) ? 0.6 : 1
                  }}
                >
                  {submitting ? 'Processing...' : 'Deduct Funds'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default Wallet;
