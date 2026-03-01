import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const ORDER_STATUSES = ['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'];

const statusColors = {
  PENDING_APPROVAL: { bg: '#fef3c7', text: '#b45309', label: 'Pending' },
  APPROVED: { bg: '#dbeafe', text: '#1d4ed8', label: 'Approved' },
  REJECTED: { bg: '#fee2e2', text: '#dc2626', label: 'Rejected' },
  IN_PROGRESS: { bg: '#e0e7ff', text: '#4f46e5', label: 'In Progress' },
  COMPLETED: { bg: '#dcfce7', text: '#16a34a', label: 'Completed' },
};

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialOrderId = searchParams.get('orderId');
  
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/orders', {
        params: statusFilter !== 'ALL' ? { status: statusFilter } : {}
      });
      setOrders(res.data.orders || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setError(err.response?.data?.error || 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Open order detail if orderId is in URL
  useEffect(() => {
    if (initialOrderId && orders.length > 0) {
      const order = orders.find(o => o.id === initialOrderId || o._id === initialOrderId);
      if (order) {
        setSelectedOrder(order);
        setShowDetailModal(true);
      }
    }
  }, [initialOrderId, orders]);

  // Approve order
  const handleApprove = async () => {
    if (!selectedOrder) return;
    setActionLoading(true);
    try {
      const res = await api.post(`/admin/orders/${selectedOrder.id || selectedOrder._id}/approve`);
      setToast({ type: 'success', message: res.data.message || 'Order approved successfully!' });
      setShowDetailModal(false);
      setSelectedOrder(null);
      fetchOrders();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to approve order' });
    } finally {
      setActionLoading(false);
    }
  };

  // Reject order
  const handleReject = async () => {
    if (!selectedOrder) return;
    setActionLoading(true);
    try {
      const res = await api.post(`/admin/orders/${selectedOrder.id || selectedOrder._id}/reject`, {
        reason: rejectionReason || 'Order rejected by admin'
      });
      setToast({ type: 'success', message: res.data.message || 'Order rejected and refunded.' });
      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedOrder(null);
      setRejectionReason('');
      fetchOrders();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to reject order' });
    } finally {
      setActionLoading(false);
    }
  };

  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN')}`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px' }}>
      <Header title="Orders" />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#dc2626' : '#16a34a',
          color: '#fff', padding: '14px 28px', borderRadius: '12px',
          fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1000, maxWidth: '90%', textAlign: 'center'
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px' }}>
            📦 Orders
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Manage customer orders and approvals
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '20px',
          overflowX: 'auto', paddingBottom: '4px'
        }}>
          {ORDER_STATUSES.map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: statusFilter === status ? '#6366f1' : '#fff',
                color: statusFilter === status ? '#fff' : '#64748b',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: statusFilter === status ? '0 4px 12px rgba(99,102,241,0.3)' : '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s'
              }}
            >
              {status === 'ALL' ? 'All Orders' : statusColors[status]?.label || status}
            </button>
          ))}
        </div>

        {/* Error State */}
        {error && (
          <div style={{
            padding: '20px', backgroundColor: '#fef2f2', borderRadius: '12px',
            color: '#dc2626', marginBottom: '20px', textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
            <p style={{ color: '#64748b' }}>Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', borderRadius: '20px', padding: '60px 24px',
            textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📭</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
              No orders found
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              {statusFilter !== 'ALL' ? `No ${statusColors[statusFilter]?.label.toLowerCase()} orders` : 'Orders will appear here when clients place them'}
            </p>
          </div>
        ) : (
          /* Orders List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {orders.map(order => (
              <div
                key={order.id || order._id}
                onClick={() => openOrderDetail(order)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: order.orderStatus === 'PENDING_APPROVAL' ? '2px solid #f59e0b' : '1px solid transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
                      {order.orderId}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                      {order.clientEmail || order.clientId?.identifier || 'Unknown Client'}
                    </p>
                  </div>
                  <span style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    backgroundColor: statusColors[order.orderStatus]?.bg || '#f1f5f9',
                    color: statusColors[order.orderStatus]?.text || '#64748b'
                  }}>
                    {statusColors[order.orderStatus]?.label || order.orderStatus}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: '#64748b' }}>
                  <span>📦 {order.items?.length || 0} item(s)</span>
                  <span>💰 {formatCurrency(order.totalAmount)}</span>
                  <span>🕐 {formatDate(order.createdAt)}</span>
                </div>

                {order.orderStatus === 'PENDING_APPROVAL' && (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px',
                    backgroundColor: '#fef3c7', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{ fontSize: '16px' }}>⏳</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#b45309' }}>
                      Awaiting your approval
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {showDetailModal && selectedOrder && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1001, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '24px',
            maxWidth: '600px', width: '100%', maxHeight: '90vh',
            overflowY: 'auto', position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '24px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1
            }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
                  {selectedOrder.orderId}
                </h2>
                <span style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                  backgroundColor: statusColors[selectedOrder.orderStatus]?.bg || '#f1f5f9',
                  color: statusColors[selectedOrder.orderStatus]?.text || '#64748b'
                }}>
                  {statusColors[selectedOrder.orderStatus]?.label || selectedOrder.orderStatus}
                </span>
              </div>
              <button
                onClick={() => { setShowDetailModal(false); setSelectedOrder(null); }}
                style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  backgroundColor: '#f8fafc', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '24px' }}>
              {/* Client Info */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                  Client Information
                </h4>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
                    <strong>Email:</strong> {selectedOrder.clientEmail || selectedOrder.clientId?.identifier || '-'}
                  </p>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    <strong>Order Date:</strong> {formatDate(selectedOrder.createdAt)}
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                  Order Items ({selectedOrder.items?.length || 0})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(selectedOrder.items || []).map((item, idx) => (
                    <div key={idx} style={{
                      backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{item.planIcon || '📦'}</span>
                        <div>
                          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                            {item.planTitle}
                          </p>
                          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                            {formatCurrency(item.unitPrice)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#16a34a' }}>
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Total */}
              <div style={{
                backgroundColor: '#f0fdf4', borderRadius: '12px', padding: '16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '24px'
              }}>
                <span style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a' }}>Total Amount</span>
                <span style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a' }}>
                  {formatCurrency(selectedOrder.totalAmount)}
                </span>
              </div>

              {/* Payment Info */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                  Payment Information
                </h4>
                <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
                    <strong>Method:</strong> {selectedOrder.paymentMethod || 'WALLET'}
                  </p>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    <strong>Status:</strong>{' '}
                    <span style={{ color: selectedOrder.paymentStatus === 'PAID' ? '#16a34a' : '#dc2626' }}>
                      {selectedOrder.paymentStatus}
                    </span>
                  </p>
                </div>
              </div>

              {/* Rejection Reason if rejected */}
              {selectedOrder.orderStatus === 'REJECTED' && selectedOrder.rejectionReason && (
                <div style={{
                  backgroundColor: '#fef2f2', borderRadius: '12px', padding: '16px',
                  marginBottom: '24px'
                }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', margin: '0 0 8px' }}>
                    Rejection Reason
                  </h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#991b1b' }}>
                    {selectedOrder.rejectionReason}
                  </p>
                </div>
              )}

              {/* Action Buttons (only for PENDING_APPROVAL) */}
              {selectedOrder.orderStatus === 'PENDING_APPROVAL' && (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={actionLoading}
                    style={{
                      flex: 1, padding: '16px',
                      backgroundColor: '#fef2f2', color: '#dc2626',
                      border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    style={{
                      flex: 2, padding: '16px',
                      backgroundColor: actionLoading ? '#94a3b8' : '#16a34a',
                      color: '#fff', border: 'none', borderRadius: '12px',
                      fontSize: '15px', fontWeight: '600', cursor: actionLoading ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.3)'
                    }}
                  >
                    {actionLoading ? 'Processing...' : '✅ Approve Order'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1002, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '20px',
            maxWidth: '440px', width: '100%', padding: '24px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>
              Reject Order?
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px' }}>
              This will refund {formatCurrency(selectedOrder?.totalAmount)} to the client's wallet.
            </p>
            
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                border: '2px solid #e2e8f0', fontSize: '14px',
                minHeight: '100px', resize: 'vertical', marginBottom: '20px',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '14px',
                  backgroundColor: '#f8fafc', color: '#64748b',
                  border: 'none', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                style={{
                  flex: 1, padding: '14px',
                  backgroundColor: actionLoading ? '#94a3b8' : '#dc2626',
                  color: '#fff', border: 'none', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '600', cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {actionLoading ? 'Processing...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-hide toast */}
      {toast && setTimeout(() => setToast(null), 4000) && null}
    </div>
  );
};

export default Orders;
