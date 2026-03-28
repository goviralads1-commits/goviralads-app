import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';

const Support = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasksWithMessages();
  }, []);

  const fetchTasksWithMessages = async () => {
    try {
      const res = await api.get('/client/tasks');
      const allTasks = res.data.tasks || res.data || [];
      
      // Filter: Only tasks with messages
      const tasksWithMessages = allTasks.filter(t => t.messages && t.messages.length > 0);
      
      // Sort by last message timestamp (most recent first)
      tasksWithMessages.sort((a, b) => {
        const aLast = a.messages[a.messages.length - 1];
        const bLast = b.messages[b.messages.length - 1];
        return new Date(bLast?.createdAt || 0) - new Date(aLast?.createdAt || 0);
      });
      
      setTasks(tasksWithMessages);
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
    if (!task.messages || task.messages.length === 0) return null;
    return task.messages[task.messages.length - 1];
  };

  const truncateText = (text, maxLength = 50) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px' }}>
      <Header title="Support" />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>
            Support
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Your task conversations
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              border: '3px solid #e2e8f0', borderTopColor: '#22c55e',
              animation: 'spin 1s linear infinite', margin: '0 auto 16px'
            }} />
            <p style={{ fontSize: '14px', color: '#64748b' }}>Loading conversations...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Empty State */}
        {!loading && tasks.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            backgroundColor: '#fff', borderRadius: '20px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px 0' }}>
              No conversations yet
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
              Start a conversation in any of your tasks
            </p>
          </div>
        )}

        {/* Task List */}
        {!loading && tasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks.map((task) => {
              const lastMessage = getLastMessage(task);
              const isAdminMessage = lastMessage?.sender === 'admin';
              
              return (
                <div
                  key={task._id}
                  onClick={() => navigate(`/tasks/${task._id}?scrollToChat=true`)}
                  style={{
                    backgroundColor: '#fff', borderRadius: '16px', padding: '16px',
                    border: '1px solid #e2e8f0', cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#22c55e';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(34,197,94,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    {/* Task Icon */}
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      backgroundColor: '#f0fdf4', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <span style={{ fontSize: '20px' }}>📋</span>
                    </div>
                    
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Task Title + Time */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <h3 style={{
                          fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {task.title}
                        </h3>
                        <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>
                          {formatTime(lastMessage?.createdAt)}
                        </span>
                      </div>
                      
                      {/* Last Message Preview */}
                      {lastMessage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                            {isAdminMessage ? 'Admin:' : 'You:'}
                          </span>
                          <p style={{
                            fontSize: '13px', color: '#64748b', margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {lastMessage.attachments?.length > 0 && !lastMessage.text 
                              ? '📎 Image' 
                              : truncateText(lastMessage.text)}
                          </p>
                        </div>
                      )}
                      
                      {/* Message Count */}
                      <div style={{ marginTop: '8px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: '600', color: '#22c55e',
                          backgroundColor: '#f0fdf4', padding: '4px 8px', borderRadius: '6px'
                        }}>
                          {task.messages.length} message{task.messages.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    
                    {/* Arrow */}
                    <div style={{ flexShrink: 0, color: '#94a3b8' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
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

export default Support;
