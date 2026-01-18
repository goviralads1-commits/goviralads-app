import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdjustForm, setShowAdjustForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api.get('/admin/wallets');
        setClients(response.data);
      } catch (err) {
        setError('Failed to load clients data');
        console.error('Clients error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    setAdjustmentSubmitting(true);
    
    try {
      await api.post(`/admin/wallets/${selectedClient._id}/adjust`, {
        amount: parseFloat(adjustmentAmount),
        reason: adjustmentReason
      });
      
      // Refresh data after successful adjustment
      const response = await api.get('/admin/wallets');
      setClients(response.data);
      setSelectedClient(null);
      setAdjustmentAmount('');
      setAdjustmentReason('');
      setShowAdjustForm(false);
    } catch (err) {
      setError('Failed to adjust wallet');
      console.error('Adjustment error:', err);
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
              <div style={{ marginTop: '16px', fontSize: '14px', color: '#64748b' }}>Loading users...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', color: '#dc2626' }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>User Manager</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0' }}>Manage all registered users and their wallet balances</p>
        </div>

        {/* Wallet Adjustment Form */}
        {showAdjustForm && selectedClient && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 20px 0' }}>Adjust Wallet for {selectedClient.clientIdentifier}</h3>
            <form onSubmit={handleAdjustmentSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
                  Amount (credits)
                </label>
                <input
                  type="number"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  required
                  style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', transition: 'border 0.2s' }}
                  onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>
                  Reason
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 14px', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', transition: 'border 0.2s' }}
                  onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                  onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustForm(false);
                    setSelectedClient(null);
                  }}
                  style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '500', color: '#475569', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#ffffff'}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustmentSubmitting}
                  style={{ padding: '10px 20px', fontSize: '14px', fontWeight: '500', color: '#ffffff', backgroundColor: adjustmentSubmitting ? '#94a3b8' : '#6366f1', border: 'none', borderRadius: '8px', cursor: adjustmentSubmitting ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={(e) => !adjustmentSubmitting && (e.target.style.backgroundColor = '#4f46e5')}
                  onMouseLeave={(e) => !adjustmentSubmitting && (e.target.style.backgroundColor = '#6366f1')}
                >
                  {adjustmentSubmitting ? 'Adjusting...' : 'Adjust Wallet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Clients Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {clients.wallets?.map((wallet) => (
            <div key={wallet.clientId} style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', transition: 'all 0.2s', cursor: 'pointer' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = '#cbd5e1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              {/* User Info */}
              <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', marginBottom: '6px' }}>
                  {wallet.clientIdentifier}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  ID: {wallet.clientId}
                </div>
              </div>

              {/* Balance */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Wallet Balance
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
                  {wallet.balance.toFixed(2)} <span style={{ fontSize: '16px', fontWeight: '500', color: '#64748b' }}>credits</span>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Status
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                    Active
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Joined
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                    {new Date(wallet.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  setSelectedClient(wallet);
                  setShowAdjustForm(true);
                }}
                style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '500', color: '#ffffff', backgroundColor: '#6366f1', border: 'none', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4f46e5'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#6366f1'}
              >
                Adjust Wallet
              </button>
            </div>
          ))}
        </div>

        {clients.wallets?.length === 0 && (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '16px', color: '#64748b' }}>No clients found</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Clients;