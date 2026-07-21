import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const statusColors = {
  PENDING: { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  APPROVED_WALLET: { bg: '#dcfce7', text: '#166534', label: 'Approved (Wallet)' },
  APPROVED_EXTERNAL: { bg: '#dbeafe', text: '#1e40af', label: 'Approved (External)' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
};

const EarningsRedeems = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [pendingTotal, setPendingTotal] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [payoutMethod, setPayoutMethod] = useState('WALLET');
  const [txRef, setTxRef] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await api.get('/admin/earnings/redeem-requests', { params });
      setRequests(res.data?.requests || []);
    } catch (err) {
      console.error('Failed to fetch redeem requests:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, startDate, endDate]);

  const fetchPendingTotal = useCallback(async () => {
    try {
      const res = await api.get('/admin/earnings/redeem-requests', { params: { status: 'PENDING' } });
      setPendingTotal((res.data?.requests || []).length);
    } catch (err) { /* silent */ }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchPendingTotal();
  }, [fetchRequests, fetchPendingTotal]);

  const openApprove = (req) => {
    setSelectedRequest(req);
    setPayoutMethod('WALLET');
    setTxRef('');
    setAdminNote('');
    setShowApproveModal(true);
  };

  const openReject = (req) => {
    setSelectedRequest(req);
    setRejectNote('');
    setShowRejectModal(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (payoutMethod === 'EXTERNAL' && !txRef.trim()) {
      showToast('Transaction reference required for external payout.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      await api.post('/admin/earnings/redeem-approve', {
        requestId: selectedRequest.id,
        payoutMethod,
        transactionReference: txRef.trim() || undefined,
        adminNote: adminNote.trim() || undefined,
      });
      showToast(`Request approved via ${payoutMethod}.`, 'success');
      setShowApproveModal(false);
      fetchRequests();
      fetchPendingTotal();
    } catch (err) {
      showToast(err.response?.data?.error || 'Approval failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setActionLoading(true);
    try {
      await api.post('/admin/earnings/redeem-reject', {
        requestId: selectedRequest.id,
        adminNote: rejectNote.trim() || undefined,
      });
      showToast('Request rejected.', 'success');
      setShowRejectModal(false);
      fetchRequests();
      fetchPendingTotal();
    } catch (err) {
      showToast(err.response?.data?.error || 'Rejection failed.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Earnings Redeem Requests</h1>
          {pendingTotal > 0 && statusFilter !== 'PENDING' && (
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600' }}>
              {pendingTotal} pending
            </span>
          )}
        </div>

        {/* Filters */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '160px' }}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED_WALLET">Approved (Wallet)</option>
              <option value="APPROVED_EXTERNAL">Approved (External)</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Loading requests...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>User</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Method</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Note / Ref</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No redeem requests found.</td></tr>
                  ) : requests.map((req) => {
                    const sc = statusColors[req.status] || { bg: '#f1f5f9', text: '#475569', label: req.status };
                    return (
                      <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '500', color: '#0f172a' }}>
                          {req.userIdentifier}
                          {req.userEmail && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>{req.userEmail}</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                          {'\u20b9'}{req.requestedAmount?.toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', backgroundColor: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: '6px', fontWeight: '600' }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                          {req.payoutMethod || '-'}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.transactionReference && <span>Ref: {req.transactionReference} </span>}
                          {req.adminNote || '-'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>
                          {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          <span style={{ display: 'block', fontSize: '10px' }}>
                            {new Date(req.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {req.status === 'PENDING' ? (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button onClick={() => openApprove(req)} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer' }}>
                                Approve
                              </button>
                              <button onClick={() => openReject(req)} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: 'none', backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer' }}>
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {req.approvedByAdmin || '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Approve Modal */}
        {showApproveModal && selectedRequest && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px', margin: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 6px 0' }}>Approve Redeem</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                {selectedRequest.userIdentifier} — {'\u20b9'}{selectedRequest.requestedAmount?.toLocaleString('en-IN')}
              </p>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Payout Method</label>
                <select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }}>
                  <option value="WALLET">Credit to Wallet</option>
                  <option value="EXTERNAL">External Payout</option>
                </select>
              </div>

              {payoutMethod === 'EXTERNAL' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Transaction Reference *</label>
                  <input type="text" value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="e.g. UTR / NEFT ref" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Admin Note (optional)</label>
                <input type="text" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Optional note" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowApproveModal(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleApprove} disabled={actionLoading} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: '#16a34a', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? 'Processing...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedRequest && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', margin: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 6px 0', color: '#dc2626' }}>Reject Redeem</h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
                {selectedRequest.userIdentifier} — {'\u20b9'}{selectedRequest.requestedAmount?.toLocaleString('en-IN')}
              </p>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '4px' }}>Reason (optional)</label>
                <input type="text" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Reason for rejection" style={{ width: '100%', padding: '10px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowRejectModal(false)} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleReject} disabled={actionLoading} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '10px', backgroundColor: '#ef4444', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                  {actionLoading ? 'Processing...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 24px', borderRadius: '10px', backgroundColor: toast.type === 'success' ? '#16a34a' : '#dc2626', color: '#fff', fontSize: '14px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsRedeems;
