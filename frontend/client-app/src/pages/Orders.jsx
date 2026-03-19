import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const ORDER_STATUSES = ['ALL', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'];

const statusColors = {
  PENDING_APPROVAL: { bg: '#fef3c7', text: '#b45309', label: 'Pending Approval' },
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderInvoice, setOrderInvoice] = useState(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/client/orders', {
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
        openOrderDetail(order);
      }
    }
  }, [initialOrderId, orders]);

  // Fetch full order details including linked tasks
  const openOrderDetail = async (order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
    setDetailLoading(true);
    setOrderInvoice(null);
    
    try {
      const res = await api.get(`/client/orders/${order.id || order._id}`);
      setSelectedOrder(res.data.order);
      
      // Fetch invoice if order is approved
      if (res.data.order?.orderStatus === 'APPROVED' || res.data.order?.orderStatus === 'IN_PROGRESS' || res.data.order?.orderStatus === 'COMPLETED') {
        try {
          const invoiceRes = await api.get(`/client/orders/${order.id || order._id}/invoice`);
          setOrderInvoice(invoiceRes.data.invoice);
        } catch (invErr) {
          // No invoice yet - that's ok
          console.log('No invoice found for order');
        }
      }
    } catch (err) {
      console.error('Failed to fetch order details:', err);
    } finally {
      setDetailLoading(false);
    }
  };
  
  // Download invoice PDF
  const handleDownloadInvoice = async () => {
    if (!orderInvoice) return;
    
    setDownloadingInvoice(true);
    try {
      const res = await api.get(`/client/invoices/${orderInvoice.id}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${orderInvoice.invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download invoice:', err);
      alert('Failed to download invoice. Please try again.');
    } finally {
      setDownloadingInvoice(false);
    }
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

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px' }}>
            📦 My Orders
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Track your order status and history
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '20px',
          overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch'
        }}>
          {ORDER_STATUSES.map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: statusFilter === status ? '#22c55e' : '#fff',
                color: statusFilter === status ? '#fff' : '#64748b',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: statusFilter === status ? '0 4px 12px rgba(34,197,94,0.3)' : '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s'
              }}
            >
              {status === 'ALL' ? 'All' : statusColors[status]?.label || status}
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
              No orders yet
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
              {statusFilter !== 'ALL' ? `No ${statusColors[statusFilter]?.label.toLowerCase()} orders` : 'Your orders will appear here after checkout'}
            </p>
            <button
              onClick={() => navigate('/plans')}
              style={{
                padding: '14px 28px', backgroundColor: '#22c55e', color: '#fff',
                fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none',
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
              }}
            >
              Browse Plans
            </button>
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
                      {order.items?.length || 0} item(s) • {formatCurrency(order.totalAmount)}
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

                {/* Item preview */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {(order.items || []).slice(0, 3).map((item, idx) => (
                    <span key={idx} style={{
                      padding: '4px 10px', backgroundColor: '#f1f5f9', borderRadius: '6px',
                      fontSize: '12px', color: '#64748b'
                    }}>
                      {item.planIcon || '📦'} {item.planTitle?.substring(0, 20)}{item.planTitle?.length > 20 ? '...' : ''}
                      {item.quantity > 1 && ` ×${item.quantity}`}
                    </span>
                  ))}
                  {(order.items?.length || 0) > 3 && (
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      +{order.items.length - 3} more
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  🕐 {formatDate(order.createdAt)}
                </div>

                {/* Status-specific messages */}
                {order.orderStatus === 'PENDING_APPROVAL' && (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px',
                    backgroundColor: '#fef3c7', borderRadius: '10px',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{ fontSize: '16px' }}>⏳</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#b45309' }}>
                      Awaiting admin approval
                    </span>
                  </div>
                )}

                {order.orderStatus === 'REJECTED' && order.rejectionReason && (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px',
                    backgroundColor: '#fef2f2', borderRadius: '10px'
                  }}>
                    <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                      Reason: {order.rejectionReason}
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
            maxWidth: '560px', width: '100%', maxHeight: '90vh',
            overflowY: 'auto', position: 'relative'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
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
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <p style={{ color: '#64748b' }}>Loading details...</p>
                </div>
              ) : (
                <>
                  {/* Order Items */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                      Order Items ({selectedOrder.items?.length || 0})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(selectedOrder.items || []).map((item, idx) => (
                        <div key={idx} style={{
                          backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '24px' }}>{item.planIcon || '📦'}</span>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>
                                {item.planTitle}
                              </p>
                              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                {formatCurrency(item.unitPrice)} × {item.quantity}
                              </p>
                            </div>
                          </div>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: '#22c55e' }}>
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
                    <span style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Total Paid</span>
                    <span style={{ fontSize: '22px', fontWeight: '800', color: '#22c55e' }}>
                      {formatCurrency(selectedOrder.totalAmount)}
                    </span>
                  </div>

                  {/* Download Invoice Button (only for approved orders with invoice) */}
                  {orderInvoice && orderInvoice.isDownloadableByClient && (
                    <div style={{ marginBottom: '24px' }}>
                      <button
                        onClick={handleDownloadInvoice}
                        disabled={downloadingInvoice}
                        style={{
                          width: '100%',
                          padding: '14px 20px',
                          backgroundColor: downloadingInvoice ? '#94a3b8' : '#6366f1',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: '600',
                          borderRadius: '12px',
                          border: 'none',
                          cursor: downloadingInvoice ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'background 0.2s'
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                          <polyline points="7,10 12,15 17,10" strokeLinecap="round" strokeLinejoin="round" />
                          <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {downloadingInvoice ? 'Downloading...' : `Download Invoice (${orderInvoice.invoiceNumber})`}
                      </button>
                    </div>
                  )}

                  {/* Order Timeline */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                      Timeline
                    </h4>
                    <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px' }}>📝</span>
                        <span style={{ fontSize: '13px', color: '#64748b' }}>Placed: {formatDate(selectedOrder.createdAt)}</span>
                      </div>
                      {selectedOrder.approvedAt && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '14px' }}>✅</span>
                          <span style={{ fontSize: '13px', color: '#16a34a' }}>Approved: {formatDate(selectedOrder.approvedAt)}</span>
                        </div>
                      )}
                      {selectedOrder.rejectedAt && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '14px' }}>❌</span>
                          <span style={{ fontSize: '13px', color: '#dc2626' }}>Rejected: {formatDate(selectedOrder.rejectedAt)}</span>
                        </div>
                      )}
                      {selectedOrder.completedAt && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '14px' }}>🎉</span>
                          <span style={{ fontSize: '13px', color: '#22c55e' }}>Completed: {formatDate(selectedOrder.completedAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rejection Reason */}
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
                      <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#dc2626', fontWeight: '500' }}>
                        💰 {formatCurrency(selectedOrder.totalAmount)} has been refunded to your wallet
                      </p>
                    </div>
                  )}

                  {/* Linked Tasks (if approved) */}
                  {selectedOrder.tasks && selectedOrder.tasks.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px' }}>
                        Linked Tasks ({selectedOrder.tasks.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedOrder.tasks.map((task, idx) => (
                          <div
                            key={idx}
                            onClick={() => { setShowDetailModal(false); navigate(`/tasks/${task.id}`); }}
                            style={{
                              backgroundColor: '#f8fafc', borderRadius: '10px', padding: '12px 14px',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              cursor: 'pointer', transition: 'background 0.2s'
                            }}
                          >
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                                {task.title}
                              </p>
                              <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                                Progress: {task.progress || 0}%
                              </p>
                            </div>
                            <span style={{
                              padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                              backgroundColor: task.status === 'COMPLETED' ? '#dcfce7' : task.status === 'IN_PROGRESS' ? '#dbeafe' : '#f1f5f9',
                              color: task.status === 'COMPLETED' ? '#16a34a' : task.status === 'IN_PROGRESS' ? '#1d4ed8' : '#64748b'
                            }}>
                              {task.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending message */}
                  {selectedOrder.orderStatus === 'PENDING_APPROVAL' && (
                    <div style={{
                      backgroundColor: '#fef3c7', borderRadius: '12px', padding: '16px',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>⏳</span>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#b45309' }}>
                        Your order is being reviewed by admin
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#92400e' }}>
                        You'll be notified once it's approved
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
