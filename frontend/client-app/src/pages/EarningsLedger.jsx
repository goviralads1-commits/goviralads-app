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

const EarningsLedger = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [balance, setBalance] = useState(0);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await api.get('/client/earnings-balance', { params });
      setEntries(res.data?.entries || []);
      setBalance(res.data?.balance || 0);
      setTotalEntries(res.data?.totalEntries || 0);
    } catch (err) {
      console.error('Failed to fetch earnings ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>←</button>
        <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Earnings Balance</h1>
      </div>

      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        {/* Balance Card */}
        <div style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)', borderRadius: '16px', padding: '20px', border: '1px solid #bbf7d0', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#15803d', margin: '0 0 4px 0', fontWeight: '600' }}>Available Balance</p>
              <p style={{ fontSize: '28px', fontWeight: '800', color: '#166534', margin: 0 }}>₹{balance.toLocaleString()}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '24px', margin: '0 0 4px 0' }}>💰</p>
              <p style={{ fontSize: '12px', color: '#16a34a', margin: 0, fontWeight: '600' }}>{totalEntries} entries</p>
            </div>
          </div>
        </div>

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
            <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>📭</p>
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
                      {entry.amount >= 0 ? '+' : ''}₹{Math.abs(entry.amount).toLocaleString()}
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
      </div>
    </div>
  );
};

export default EarningsLedger;
