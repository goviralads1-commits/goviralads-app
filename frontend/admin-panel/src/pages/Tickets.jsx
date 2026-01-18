import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Tickets = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchTickets();
  }, [filter]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params = filter !== 'ALL' ? { status: filter } : {};
      const res = await api.get('/admin/tickets', { params });
      setTickets(res.data.tickets || []);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
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
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        <Header />
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
          <p style={{ textAlign: 'center', color: '#64748b' }}>Loading tickets...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', paddingBottom: '100px' }}>
      <Header />
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px' }}>Support Tickets</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>{tickets.length} total tickets</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {['ALL', 'OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filter === status ? '#6366f1' : '#fff',
                color: filter === status ? '#fff' : '#475569',
                boxShadow: filter === status ? '0 4px 12px rgba(99, 102, 241, 0.3)' : '0 2px 6px rgba(0,0,0,0.08)',
                transition: 'all 0.2s'
              }}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Tickets List */}
        {tickets.length === 0 ? (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '60px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🎫</div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>No tickets found</h2>
            <p style={{ fontSize: '15px', color: '#64748b' }}>
              {filter !== 'ALL' ? 'No tickets with this status' : 'No support tickets yet'}
            </p>
          </div>
        ) : (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ticket</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Priority</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Messages</th>
                  <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Reply</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                    style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background-color 0.2s' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>{ticket.ticketNumber}</div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{ticket.subject}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{ticket.category}</div>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ fontSize: '14px', color: '#475569' }}>{ticket.clientName || 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{ticket.clientEmail || ''}</div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span
                        style={{
                          padding: '6px 12px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: `${getStatusColor(ticket.status)}15`,
                          color: getStatusColor(ticket.status)
                        }}
                      >
                        {ticket.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span
                        style={{
                          padding: '6px 12px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: `${getPriorityColor(ticket.priority)}15`,
                          color: getPriorityColor(ticket.priority)
                        }}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td style={{ padding: '16px', fontSize: '14px', color: '#475569' }}>
                      {ticket.messages?.length || 0}
                    </td>
                    <td style={{ padding: '16px', fontSize: '13px', color: '#64748b' }}>
                      {ticket.lastReplyAt ? (
                        <>
                          <div>{new Date(ticket.lastReplyAt).toLocaleDateString()}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>by {ticket.lastReplyBy}</div>
                        </>
                      ) : (
                        'No replies'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tickets;
