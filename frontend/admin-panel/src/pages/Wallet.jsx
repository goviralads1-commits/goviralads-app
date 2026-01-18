import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Wallet = () => {
  const [wallets, setWallets] = useState([]);
  const [rechargeRequests, setRechargeRequests] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientWallet, setClientWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('clients'); // 'clients' or 'requests'
  
  // Add funds modal
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [walletsRes, requestsRes] = await Promise.all([
        api.get('/admin/wallets'),
        api.get('/admin/recharge-requests')
      ]);
      setWallets(walletsRes.data.wallets || []);
      setRechargeRequests(requestsRes.data.requests || []);
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

  const handleApprove = async (requestId) => {
    setProcessingRequestId(requestId);
    try {
      // Step 1: Call approve API
      const response = await api.post(`/admin/recharge-requests/${requestId}/approve`);
      // Approved successfully
      
      // If we reach here, approval succeeded - show success immediately
      setToast('Recharge approved - Balance updated');
      setTimeout(() => setToast(null), 3000);
      
      // Step 2: Refresh data (don't let refresh errors override success)
      try {
        await Promise.all([fetchWallets(), fetchRechargeRequests()]);
        if (selectedClient) await fetchClientWallet(selectedClient);
      } catch (refreshErr) {
        console.warn('Refresh after approve had issues:', refreshErr);
        // Don't show error - approval already succeeded
      }
    } catch (err) {
      // Only show error if the APPROVE call itself failed
      console.error('Approve API error:', err);
      const errorMsg = err.response?.data?.error || 'Failed to approve request';
      setToast(errorMsg);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleReject = async (requestId) => {
    setProcessingRequestId(requestId);
    try {
      await api.post(`/admin/recharge-requests/${requestId}/reject`);
      
      // Success - show immediately
      setToast('Recharge rejected');
      setTimeout(() => setToast(null), 3000);
      
      // Refresh data (errors won't override success)
      try {
        await fetchRechargeRequests();
      } catch (refreshErr) {
        console.warn('Refresh after reject had issues:', refreshErr);
      }
    } catch (err) {
      console.error('Reject API error:', err);
      setToast(err.response?.data?.error || 'Failed to reject request');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setProcessingRequestId(null);
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
        amount: parseFloat(addAmount),
        description: addDescription || 'Admin credit adjustment'
      });
      
      // Refresh data
      await fetchWallets();
      await fetchClientWallet(selectedClient);
      
      setShowAddFunds(false);
      setAddAmount('');
      setAddDescription('');
      setToast('Funds added successfully');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Add funds error:', err);
      setToast(err.response?.data?.error || 'Failed to add funds');
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
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.toLowerCase().includes('fail') || toast.toLowerCase().includes('error') || toast.toLowerCase().includes('insufficient') ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100
        }}>
          {toast}
        </div>
      )}

      <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
        <h1 style={{fontSize: '28px', fontWeight: '700', color: '#0f172a', marginBottom: '24px'}}>Wallet Management</h1>
        
        {/* Tab Switcher */}
        <div style={{display: 'flex', gap: '8px', marginBottom: '20px'}}>
          <button
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'clients' ? '#6366f1' : '#f1f5f9',
              color: activeTab === 'clients' ? '#fff' : '#64748b',
              transition: 'all 0.2s'
            }}
          >
            Client Wallets
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'requests' ? '#6366f1' : '#f1f5f9',
              color: activeTab === 'requests' ? '#fff' : '#64748b',
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
        </div>

        {activeTab === 'clients' ? (
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
                  <button
                    onClick={() => setShowAddFunds(true)}
                    style={{
                      padding: '12px 24px',
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
        ) : (
        /* Recharge Requests Tab */
        <div style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
          <h2 style={{fontSize: '18px', fontWeight: '700', color: '#334155', marginBottom: '20px'}}>Recharge Requests</h2>
          
          {rechargeRequests.length === 0 ? (
            <p style={{fontSize: '14px', color: '#94a3b8', textAlign: 'center', padding: '40px 0'}}>No recharge requests</p>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              {/* Pending Requests First */}
              {rechargeRequests.filter(r => r.status === 'PENDING').length > 0 && (
                <>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0'}}>Pending Approval</h3>
                  {rechargeRequests.filter(r => r.status === 'PENDING').map(req => (
                    <div key={req.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      backgroundColor: '#fffbeb',
                      borderRadius: '12px',
                      border: '2px solid #fcd34d'
                    }}>
                      <div>
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
                      <div style={{display: 'flex', gap: '8px'}}>
                        <button
                          onClick={() => handleReject(req.id)}
                          disabled={processingRequestId === req.id}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: processingRequestId === req.id ? 'not-allowed' : 'pointer',
                            opacity: processingRequestId === req.id ? 0.6 : 1
                          }}
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={processingRequestId === req.id}
                          style={{
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: processingRequestId === req.id ? 'not-allowed' : 'pointer',
                            opacity: processingRequestId === req.id ? 0.6 : 1,
                            boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
                          }}
                        >
                          {processingRequestId === req.id ? 'Processing...' : 'Approve'}
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
                  Amount (₹)
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
    </div>
  );
};

export default Wallet;
