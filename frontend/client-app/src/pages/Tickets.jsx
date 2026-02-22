import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Tickets = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    category: 'GENERAL',
    priority: 'NORMAL',
    message: ''
  });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get('/client/tickets');
      setTickets(res.data.tickets || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    console.log('[TICKET UI] ==============================');
    console.log('[TICKET UI] Create button clicked');
    console.log('[TICKET UI] Form data:', JSON.stringify(formData));
    
    // Log the FULL URL that will be called
    const fullUrl = `${import.meta.env.VITE_API_URL}/client/tickets`;
    console.log('[TICKET UI] FULL API URL:', fullUrl);
    console.log('[TICKET UI] VITE_API_URL env:', import.meta.env.VITE_API_URL);
    
    if (!formData.subject.trim() || !formData.message.trim()) {
      console.error('[TICKET UI] Validation failed: empty fields');
      alert('Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);
      console.log('[TICKET UI] Sending POST to:', fullUrl);
      const response = await api.post('/client/tickets', formData);
      console.log('[TICKET UI] SUCCESS! Response:', response.data);
      console.log('[TICKET UI] ==============================');
      setShowCreateModal(false);
      setFormData({ subject: '', category: 'GENERAL', priority: 'NORMAL', message: '' });
      fetchTickets();
    } catch (err) {
      console.error('[TICKET UI] ==============================');
      console.error('[TICKET UI] FAILED!');
      console.error('[TICKET UI]   Status:', err.response?.status);
      console.error('[TICKET UI]   URL called:', fullUrl);
      console.error('[TICKET UI]   Error:', err.response?.data || err.message);
      const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to create ticket';
      alert(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      OPEN: '#3b82f6',
      IN_PROGRESS: '#f59e0b',
      AWAITING_CLIENT: '#8b5cf6',
      RESOLVED: '#10b981',
      CLOSED: '#6b7280'
    };
    return colors[status] || '#6b7280';
  };

  const getPriorityColor = (priority) => {
    const colors = {
      LOW: '#10b981',
      NORMAL: '#3b82f6',
      HIGH: '#f59e0b',
      URGENT: '#ef4444'
    };
    return colors[priority] || '#3b82f6';
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '40px', textAlign: 'center' }}>
            <p style={{ color: '#64748b' }}>Loading tickets...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', paddingBottom: '100px' }}>
      <Header />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>Support Tickets</h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{tickets.length} tickets</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '14px 24px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)'
            }}
          >
            + New Ticket
          </button>
        </div>

        {/* Tickets List */}
        {tickets.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎫</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>No tickets yet</h2>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>Need help? Create your first support ticket</p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Create Ticket
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tickets.map(ticket => (
              <div
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>{ticket.ticketNumber}</span>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: `${getStatusColor(ticket.status)}15`,
                          color: getStatusColor(ticket.status)
                        }}
                      >
                        {ticket.status}
                      </span>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: `${getPriorityColor(ticket.priority)}15`,
                          color: getPriorityColor(ticket.priority)
                        }}
                      >
                        {ticket.priority}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px' }}>{ticket.subject}</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                      {ticket.messages?.length || 0} messages • Last reply {ticket.lastReplyAt ? new Date(ticket.lastReplyAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  {ticket.hasUnreadAdminReply && (
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Create Support Ticket</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#64748b' }}
              >
                ×
              </button>
            </div>
            
            <div style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Subject *</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Brief description of your issue"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', backgroundColor: '#fff' }}
                  >
                    <option value="GENERAL">General</option>
                    <option value="BILLING">Billing</option>
                    <option value="TECHNICAL">Technical</option>
                    <option value="TASK_ISSUE">Task Issue</option>
                    <option value="ACCOUNT">Account</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', backgroundColor: '#fff' }}
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Message *</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Describe your issue in detail..."
                  rows={6}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: creating ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  borderRadius: '14px',
                  border: 'none',
                  cursor: creating ? 'not-allowed' : 'pointer',
                  boxShadow: creating ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.35)'
                }}
              >
                {creating ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tickets;
