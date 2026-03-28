import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Support = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientGroups, setClientGroups] = useState([]);

  useEffect(() => {
    // CRITICAL: Only fetch if authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[Support] Skipping fetch - no token');
      setLoading(false);
      return;
    }
    fetchTasksWithMessages();
  }, []);

  const fetchTasksWithMessages = async () => {
    try {
      const res = await api.get('/admin/tasks');
      const allTasks = res.data.tasks || res.data || [];
      
      // DEBUG: Log all tasks to see what we receive
      console.log('Support: All tasks received:', allTasks.length);
      console.log('Support: Sample task structure:', allTasks[0]);
      
      // Filter: Tasks with messages OR approvalRequests (using counts from API)
      const tasksWithActivity = allTasks.filter(t => 
        (t.messagesCount > 0) || (t.approvalRequestsCount > 0)
      );
      
      console.log('Support: Tasks with activity:', tasksWithActivity.length);
      
      // Group by client
      const grouped = {};
      tasksWithActivity.forEach(task => {
        const clientId = task.clientId || 'unknown';
        const clientName = task.clientName || task.clientIdentifier || 'Unknown Client';
        
        if (!grouped[clientId]) {
          grouped[clientId] = {
            clientId,
            clientName,
            tasks: [],
            lastActivity: null
          };
        }
        grouped[clientId].tasks.push(task);
        
        // Track latest activity using timestamps from API
        const msgTime = new Date(task.lastMessageAt || 0).getTime();
        const approvalTime = new Date(task.lastApprovalAt || 0).getTime();
        const latestTime = new Date(Math.max(msgTime, approvalTime));
        
        if (!grouped[clientId].lastActivity || latestTime > grouped[clientId].lastActivity) {
          grouped[clientId].lastActivity = latestTime;
        }
      });
      
      // Convert to array and sort by last activity
      const groupedArray = Object.values(grouped);
      groupedArray.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
      
      // Sort tasks within each group
      groupedArray.forEach(group => {
        group.tasks.sort((a, b) => {
          const aTime = Math.max(
            new Date(a.lastMessageAt || 0).getTime(),
            new Date(a.lastApprovalAt || 0).getTime()
          );
          const bTime = Math.max(
            new Date(b.lastMessageAt || 0).getTime(),
            new Date(b.lastApprovalAt || 0).getTime()
          );
          return bTime - aTime;
        });
      });
      
      console.log('Support: Client groups:', groupedArray.length);
      
      setClientGroups(groupedArray);
      setTasks(tasksWithActivity);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const getLastMessage = (task) => {
    // With counts-only API, we can only show activity exists, not content
    // Return a placeholder based on most recent timestamp
    const msgTime = new Date(task.lastMessageAt || 0).getTime();
    const approvalTime = new Date(task.lastApprovalAt || 0).getTime();
    
    if (approvalTime > msgTime && task.approvalRequestsCount > 0) {
      return { _isApproval: true, createdAt: task.lastApprovalAt };
    }
    if (task.messagesCount > 0) {
      return { createdAt: task.lastMessageAt };
    }
    return null;
  };

  const truncateText = (text, maxLength = 45) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // Client List View
  const renderClientList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {clientGroups.map((group) => (
        <div
          key={group.clientId}
          onClick={() => setSelectedClient(group)}
          style={{
            backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px',
            border: '1px solid #e2e8f0', cursor: 'pointer',
            transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Avatar */}
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <span style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>
                {group.clientName.charAt(0).toUpperCase()}
              </span>
            </div>
            
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <h3 style={{
                  fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {group.clientName}
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                  {formatTime(group.lastActivity)}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''} with messages
              </p>
            </div>
            
            {/* Arrow */}
            <div style={{ flexShrink: 0, color: '#94a3b8' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Task List View (for selected client)
  const renderTaskList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {selectedClient.tasks.map((task) => {
        const lastMessage = getLastMessage(task);
        const isClientMessage = lastMessage?.sender === 'client';
        
        return (
          <div
            key={task._id}
            onClick={() => navigate(`/tasks/${task._id}?scrollToChat=true`)}
            style={{
              backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px',
              border: '1px solid #e2e8f0', cursor: 'pointer',
              transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {/* Task Icon */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                backgroundColor: '#eff6ff', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <span style={{ fontSize: '18px' }}>📋</span>
              </div>
              
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Task Title + Time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{
                    fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {task.title}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                    {formatTime(lastMessage?.createdAt)}
                  </span>
                </div>
                
                {/* Last Message Preview */}
                {lastMessage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                      {lastMessage._isApproval ? '✅ Approval' : '💬 Chat'}
                    </span>
                  </div>
                )}
                
                {/* Activity Count */}
                <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                  {(task.messagesCount || 0) > 0 && (
                    <span style={{
                      fontSize: '10px', fontWeight: '600', color: '#3b82f6',
                      backgroundColor: '#eff6ff', padding: '3px 6px', borderRadius: '4px'
                    }}>
                      {task.messagesCount} msg
                    </span>
                  )}
                  {(task.approvalRequestsCount || 0) > 0 && (
                    <span style={{
                      fontSize: '10px', fontWeight: '600', color: '#f59e0b',
                      backgroundColor: '#fef3c7', padding: '3px 6px', borderRadius: '4px'
                    }}>
                      {task.approvalRequestsCount} approval{task.approvalRequestsCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Arrow */}
              <div style={{ flexShrink: 0, color: '#94a3b8' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header title="Support" />
      
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '20px' }}>
          {selectedClient ? (
            <>
              <button
                onClick={() => setSelectedClient(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 12px', borderRadius: '8px',
                  backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '12px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back to Clients
              </button>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>
                {selectedClient.clientName}
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                {selectedClient.tasks.length} task{selectedClient.tasks.length !== 1 ? 's' : ''} with conversations
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>
                Support
              </h1>
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Client conversations
              </p>
            </>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
              animation: 'spin 1s linear infinite', margin: '0 auto 14px'
            }} />
            <p style={{ fontSize: '13px', color: '#64748b' }}>Loading conversations...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Empty State */}
        {!loading && clientGroups.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            backgroundColor: '#fff', borderRadius: '16px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>💬</div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 6px 0' }}>
              No client chats yet
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
              Client conversations will appear here
            </p>
          </div>
        )}

        {/* Content */}
        {!loading && clientGroups.length > 0 && (
          selectedClient ? renderTaskList() : renderClientList()
        )}
      </div>
    </div>
  );
};

export default Support;
