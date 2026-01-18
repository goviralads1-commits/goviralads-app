import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const TicketDetail = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  const fetchTicket = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/client/tickets/${ticketId}`);
      setTicket(res.data.ticket);
    } catch (err) {
      console.error('Failed to load ticket:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) {
      alert('Please enter a message');
      return;
    }

    try {
      setReplying(true);
      await api.post(`/client/tickets/${ticketId}/reply`, { message: replyText });
      setReplyText('');
      fetchTicket();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send reply');
    } finally {
      setReplying(false);
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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
          <p style={{ textAlign: 'center', color: '#64748b' }}>Loading ticket...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <Header />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: '16px' }}>Ticket not found</p>
          <button
            onClick={() => navigate('/tickets')}
            style={{ marginTop: '20px', padding: '12px 24px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
          >
            Back to Tickets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', paddingBottom: '100px' }}>
      <Header />
      
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/tickets')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: '600', color: '#475569', cursor: 'pointer', marginBottom: '20px' }}
        >
          ← Back to Tickets
        </button>

        {/* Ticket Header */}
        <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#64748b' }}>{ticket.ticketNumber}</span>
            <span
              style={{
                padding: '6px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: `${getStatusColor(ticket.status)}15`,
                color: getStatusColor(ticket.status)
              }}
            >
              {ticket.status}
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px' }}>{ticket.subject}</h1>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#64748b' }}>
            <span>Category: {ticket.category}</span>
            <span>•</span>
            <span>Priority: {ticket.priority}</span>
            <span>•</span>
            <span>Created: {new Date(ticket.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Messages Thread */}
        <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '20px' }}>Messages</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {ticket.messages?.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  backgroundColor: msg.senderRole === 'CLIENT' ? '#f0f9ff' : '#fef3f2',
                  border: `1px solid ${msg.senderRole === 'CLIENT' ? '#bae6fd' : '#fecaca'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: msg.senderRole === 'CLIENT' ? '#0369a1' : '#dc2626' }}>
                    {msg.senderRole === 'CLIENT' ? 'You' : 'Support Team'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                </div>
                <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {msg.message}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Reply Box */}
        {ticket.status !== 'CLOSED' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '16px' }}>Reply</h3>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type your message here..."
              rows={5}
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '15px', outline: 'none', resize: 'vertical', marginBottom: '16px' }}
            />
            <button
              onClick={handleReply}
              disabled={replying}
              style={{
                padding: '14px 28px',
                background: replying ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                borderRadius: '14px',
                border: 'none',
                cursor: replying ? 'not-allowed' : 'pointer',
                boxShadow: replying ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.35)'
              }}
            >
              {replying ? 'Sending...' : 'Send Reply'}
            </button>
          </div>
        )}

        {ticket.status === 'CLOSED' && (
          <div style={{ backgroundColor: '#fef3f2', borderRadius: '16px', padding: '16px', textAlign: 'center', border: '1px solid #fecaca' }}>
            <p style={{ fontSize: '14px', color: '#dc2626', margin: 0 }}>This ticket is closed and cannot receive new replies.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketDetail;
