import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const typeLabels = {
  COMMISSION_EARNED: 'Commission',
  ADMIN_BONUS: 'Bonus',
  ADMIN_DEDUCT: 'Deduction',
  ADMIN_CORRECTION: 'Correction',
  REDEEM_TO_WALLET: 'Redeemed',
  EXTERNAL_PAYOUT: 'Payout',
};

const typeColors = {
  COMMISSION_EARNED: { bg: '#f0fdf4', text: '#15803d' },
  ADMIN_BONUS: { bg: '#eff6ff', text: '#1d4ed8' },
  ADMIN_DEDUCT: { bg: '#fef2f2', text: '#dc2626' },
  ADMIN_CORRECTION: { bg: '#fefce8', text: '#a16207' },
  REDEEM_TO_WALLET: { bg: '#f5f3ff', text: '#7c3aed' },
  EXTERNAL_PAYOUT: { bg: '#fdf4ff', text: '#a21caf' },
};

const statusColors = {
  PENDING: { bg: '#fef3c7', text: '#92400e' },
  APPROVED_WALLET: { bg: '#dcfce7', text: '#166534' },
  APPROVED_EXTERNAL: { bg: '#dbeafe', text: '#1e40af' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b' },
};

const statusLabels = {
  PENDING: 'Pending',
  APPROVED_WALLET: 'Approved (Wallet)',
  APPROVED_EXTERNAL: 'Approved (External)',
  REJECTED: 'Rejected',
};

const EarningsLedger = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [toast, setToast] = useState(null);

  // Config state
  const [config, setConfig] = useState(null);

  // Redeem modal
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  // Redeem requests
  const [redeemRequests, setRedeemRequests] = useState([]);
  const [hasPending, setHasPending] = useState(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'redeems'

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const [balRes, configRes, reqRes] = await Promise.all([
        api.get('/client/earnings-balance', { params }),
        api.get('/client/earnings/config').catch(() => ({ data: {} })),
        api.get('/client/earnings/redeem-requests').catch(() => ({ data: { requests: [] } })),
      ]);
      setEntries(balRes.data?.entries || []);
      setBalance(balRes.data?.balance || 0);
      setTotalEntries(balRes.data?.totalEntries || 0);
      setConfig(configRes.data || null);
      const reqs = reqRes.data?.requests || [];
      setRedeemRequests(reqs);
      setHasPending(reqs.some(r => r.status === 'PENDING'));
    } catch (err) {
      console.error('Failed to fetch earnings ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  const handleRedeem = async () => {
    const amt = parseFloat(redeemAmount);
    if (!amt || amt <= 0) { setRedeemError('Enter a valid amount.'); return; }
    if (config && amt < config.minimumRedeemAmount) { setRedeemError(`Minimum: \u20b9${config.minimumRedeemAmount}`); return; }
    if (config && amt > config.maximumRedeemAmount) { setRedeemError(`Maximum: \u20b9${config.maximumRedeemAmount}`); return; }
    if (amt > balance) { setRedeemError('Amount exceeds your balance.'); return; }

    setRedeemLoading(true);
    setRedeemError('');
    try {
      await api.post('/client/earnings/redeem-request', { amount: amt });
      showToast('Redeem request submitted!', 'success');
      setShowRedeemModal(false);
      setRedeemAmount('');
      fetchData();
    } catch (err) {
      setRedeemError(err.response?.data?.error || 'Failed to submit request.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const redeemDisabled = !config?.redeemEnabled || hasPending || balance <= 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>{'\u2190'}</button>
        <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Earnings Balance</h1>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        {/* Balance Card */}
        <div style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)', borderRadius: '16px', padding: '20px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#15803d', margin: '0 0 4px 0', fontWeight: '600' }}>Available Balance</p>
              <p style={{ fontSize: '28px', fontWeight: '800', color: '#166534', margin: 0 }}>{balance.toLocaleString()} credits</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '24px', margin: '0 0 4px 0' }}>{'\uD83D\uDCB0'}</p>
              <p style={{ fontSize: '12px', color: '#16a34a', margin: 0, fontWeight: '600' }}>{totalEntries} entries</p>
            </div>
          </div>

          {/* Redeem Button */}
          <button
            onClick={() => { setRedeemError(''); setRedeemAmount(''); setShowRedeemModal(true); }}
            disabled={redeemDisabled}
            style={{
              marginTop: '16px', width: '100%', padding: '14px',
              background: redeemDisabled ? '#e2e8f0' : 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: redeemDisabled ? '#94a3b8' : '#fff',
              fontSize: '15px', fontWeight: '700', border: 'none', borderRadius: '12px',
              cursor: redeemDisabled ? 'not-allowed' : 'pointer',
              boxShadow: redeemDisabled ? 'none' : '0 4px 12px rgba(124,58,237,0.3)',
            }}
          >
            {hasPending ? 'Redeem Pending...' : !config?.redeemEnabled ? 'Redeem Disabled' : 'Redeem Earnings'}
          </button>

          {/* View Redeem Requests Link */}
          {redeemRequests.length > 0 && (
            <button
              onClick={() => setActiveTab('redeems')}
              style={{
                marginTop: '10px', width: '100%', padding: '10px',
                background: 'transparent',
                color: '#7c3aed',
                fontSize: '13px', fontWeight: '600', border: 'none',
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              View Redeem Requests ({redeemRequests.length})
            </button>
          )}

          {/* Limits Info */}
          {config?.redeemEnabled && (
            <p style={{ fontSize: '11px', color: '#16a34a', margin: '8px 0 0 0', textAlign: 'center' }}>
              Min: {'\u20b9'}{config.minimumRedeemAmount} | Max: {'\u20b9'}{config.maximumRedeemAmount}
            </p>
          )}
        </div>

        {/* Pending Request Warning */}
        {hasPending && (
          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>{'\u23F3'}</span>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#92400e', margin: 0 }}>Pending Redeem Request</p>
              <p style={{ fontSize: '12px', color: '#a16207', margin: '2px 0 0 0' }}>
                {'\u20b9'}{redeemRequests.find(r => r.status === 'PENDING')?.requestedAmount?.toLocaleString() || '0'} awaiting approval
              </p>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button onClick={() => setActiveTab('ledger')} style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: activeTab === 'ledger' ? '2px solid #22c55e' : '1px solid #e2e8f0', backgroundColor: activeTab === 'ledger' ? '#f0fdf4' : '#fff', color: activeTab === 'ledger' ? '#16a34a' : '#64748b', cursor: 'pointer' }}>
            Ledger
          </button>
          <button onClick={() => setActiveTab('redeems')} style={{ flex: 1, padding: '10px', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: activeTab === 'redeems' ? '2px solid #7c3aed' : '1px solid #e2e8f0', backgroundColor: activeTab === 'redeems' ? '#f5f3ff' : '#fff', color: activeTab === 'redeems' ? '#7c3aed' : '#64748b', cursor: 'pointer' }}>
            Redeem History {redeemRequests.length > 0 && `(${redeemRequests.length})`}
          </button>
        </div>

        {activeTab === 'ledger' && (
          <>
            {/* Date Filters */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>From</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>To</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Entries */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Loading...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>{'\uD83D\uDCED'}</p>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>No ledger entries yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {entries.map((entry) => {
                  const color = typeColors[entry.type] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <div key={entry.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', backgroundColor: color.bg, color: color.text, padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {typeLabels[entry.type] || entry.type}
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: entry.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                          {entry.amount >= 0 ? '+' : ''}{Math.abs(entry.amount).toLocaleString()} credits
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {entry.note && <p style={{ fontSize: '12px', color: '#475569', margin: 0, flex: 1 }}>{entry.note}</p>}
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'redeems' && (
          <div>
            {redeemRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>{'\uD83D\uDCC4'}</p>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>No redeem requests yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {redeemRequests.map((req) => {
                  const sc = statusColors[req.status] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <div key={req.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', backgroundColor: sc.bg, color: sc.text, padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {statusLabels[req.status] || req.status}
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                          {'\u20b9'}{req.requestedAmount?.toLocaleString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {req.payoutMethod && (
                          <span style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {req.payoutMethod === 'WALLET' ? 'To Wallet' : 'External'}
                          </span>
                        )}
                        {req.transactionReference && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Ref: {req.transactionReference}</span>
                        )}
                        {req.adminNote && (
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>{req.adminNote}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                          {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Redeem Modal */}
      {showRedeemModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 32px', width: '100%', maxWidth: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>Redeem Earnings</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
              Balance: {balance.toLocaleString()} credits | Min: ₹{config?.minimumRedeemAmount || 0} | Max: ₹{config?.maximumRedeemAmount || 0}
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '6px' }}>Amount to Redeem</label>
              <input
                type="number"
                value={redeemAmount}
                onChange={(e) => { setRedeemAmount(e.target.value); setRedeemError(''); }}
                placeholder={`Min \u20b9${config?.minimumRedeemAmount || 0}`}
                style={{ width: '100%', padding: '14px 16px', fontSize: '18px', fontWeight: '600', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {redeemError && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>{redeemError}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowRedeemModal(false)} style={{ flex: 1, padding: '14px', backgroundColor: 'transparent', color: '#64748b', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: '2px solid #e2e8f0', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleRedeem} disabled={redeemLoading} style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: redeemLoading ? 'not-allowed' : 'pointer', opacity: redeemLoading ? 0.6 : 1 }}>
                {redeemLoading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '10px', backgroundColor: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#dc2626' : '#475569', color: '#fff', fontSize: '14px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default EarningsLedger;
