import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';
import { hasPermission } from '../services/authService';

const SubscriptionRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionType, setActionType] = useState(''); // 'approve' or 'reject'
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await api.get('/admin/subscription-requests');
      setRequests(response.data.requests || []);
    } catch (err) {
      setError('Failed to load subscription requests');
      console.error('SubscriptionRequests error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleActionSubmit = async (e) => {
    e.preventDefault();
    setActionSubmitting(true);
    
    try {
      if (actionType === 'approve') {
        await api.post(`/admin/subscription-requests/${selectedRequest.id}/approve`);
        setToast('Subscription approved successfully');
      } else if (actionType === 'reject') {
        await api.post(`/admin/subscription-requests/${selectedRequest.id}/reject`, {
          rejectionReason
        });
        setToast('Subscription request rejected');
      }
      
      // Refresh data
      await fetchRequests();
      setSelectedRequest(null);
      setActionType('');
      setRejectionReason('');
      setShowActionForm(false);
    } catch (err) {
      const msg = err.response?.data?.error || `Failed to ${actionType} subscription request`;
      setToast(msg);
      console.error('Action error:', err);
    } finally {
      setActionSubmitting(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="text-center py-12">
              <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full text-indigo-600" role="status">
                <span className="sr-only">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pendingRequests = requests.filter(req => req.status === 'PENDING');
  const processedRequests = requests.filter(req => req.status !== 'PENDING');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.toLowerCase().includes('fail') || toast.toLowerCase().includes('error') ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100
        }}>
          {toast}
        </div>
      )}

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Subscription Requests</h1>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 mb-6">
              <div className="text-red-700">{error}</div>
            </div>
          )}

          {/* Action Form */}
          {showActionForm && selectedRequest && (
            <div className="bg-white shadow sm:rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {actionType === 'approve' ? 'Approve' : 'Reject'} Subscription Request
                </h3>
                <div className="mt-2 text-sm text-gray-500">
                  <p><strong>Client:</strong> {selectedRequest.clientIdentifier || 'N/A'}</p>
                  <p><strong>Plan:</strong> {selectedRequest.planName}</p>
                  <p><strong>Amount:</strong> ₹{selectedRequest.finalPrice?.toFixed(2)}</p>
                  <p><strong>Credits:</strong> {selectedRequest.totalCredits}</p>
                  {selectedRequest.couponCode && (
                    <p><strong>Coupon:</strong> {selectedRequest.couponCode} (-₹{selectedRequest.couponDiscount?.toFixed(2)})</p>
                  )}
                </div>
                <div className="mt-5">
                  <form onSubmit={handleActionSubmit} className="space-y-4">
                    {actionType === 'reject' && (
                      <div>
                        <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
                          Rejection Reason (Optional)
                        </label>
                        <div className="mt-1">
                          <textarea
                            id="reason"
                            rows={3}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Reason for rejection..."
                            className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowActionForm(false);
                          setSelectedRequest(null);
                          setActionType('');
                          setRejectionReason('');
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionSubmitting}
                        className={`inline-flex items-center px-4 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white ${
                          actionType === 'approve' 
                            ? 'bg-green-600 hover:bg-green-700' 
                            : 'bg-red-600 hover:bg-red-700'
                        } disabled:opacity-50`}
                      >
                        {actionSubmitting ? 'Processing...' : actionType === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Pending Requests Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Pending Requests</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Awaiting approval</p>
            </div>
            <div className="border-t border-gray-200">
              {pendingRequests.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No pending subscription requests
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Coupon
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {request.clientIdentifier || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>{request.planName}</div>
                          <div className="text-xs text-gray-500">{request.totalCredits} credits</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₹{request.finalPrice?.toFixed(2)}
                          {request.couponDiscount > 0 && (
                            <span className="text-xs text-green-600 ml-1">
                              (saved ₹{request.couponDiscount?.toFixed(2)})
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {request.couponCode || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(request.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {hasPermission('canApproveRecharge') && (
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setActionType('approve');
                                setShowActionForm(true);
                              }}
                              className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 mr-2"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType('reject');
                              setShowActionForm(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200"
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Processed Requests Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Processed Requests</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Approved and rejected requests</p>
            </div>
            <div className="border-t border-gray-200">
              {processedRequests.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500">
                  No processed requests yet
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reviewed By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {request.clientIdentifier || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {request.planName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ₹{request.finalPrice?.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(request.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            request.status === 'APPROVED' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {request.reviewedBy?.email || '-'}
                          {request.reviewedAt && (
                            <div className="text-xs text-gray-400">
                              {new Date(request.reviewedAt).toLocaleDateString('en-IN')}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionRequests;
