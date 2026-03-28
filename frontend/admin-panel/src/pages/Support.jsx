import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from '../components/Header';
import api from '../services/api';

const Support = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientGroups, setClientGroups] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  
  // Chat state
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    fetchTasksWithMessages();
  }, []);

  const getLastActivity = (task) => {
    const msgTime = task.lastMessageAt ? new Date(task.lastMessageAt).getTime() : 0;
    const approvalTime = task.lastApprovalAt ? new Date(task.lastApprovalAt).getTime() : 0;
    return Math.max(msgTime, approvalTime);
  };

  const fetchTasksWithMessages = async () => {
    try {
      const res = await api.get('/admin/tasks');
      const allTasks = res.data.tasks || res.data || [];
      const tasksWithActivity = allTasks.filter(t => 
        (t.messagesCount > 0) || (t.approvalRequestsCount > 0)
      );
      tasksWithActivity.sort((a, b) => getLastActivity(b) - getLastActivity(a));
      
      // Group by client
      const grouped = {};
      tasksWithActivity.forEach(task => {
        const clientId = task.clientId || 'unknown';
        const clientName = task.clientName || task.clientIdentifier || 'Unknown';
        if (!grouped[clientId]) {
          grouped[clientId] = { clientId, clientName, tasks: [], lastActivity: 0 };
        }
        grouped[clientId].tasks.push(task);
        const activity = getLastActivity(task);
        if (activity > grouped[clientId].lastActivity) {
          grouped[clientId].lastActivity = activity;
        }
      });
      
      const groupedArray = Object.values(grouped);
      groupedArray.sort((a, b) => b.lastActivity - a.lastActivity);
      setClientGroups(groupedArray);
      setTasks(tasksWithActivity);
    } catch (err) {
      console.error('[Support] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (task) => {
    const taskId = task._id || task.id;
    setChatLoading(true);
    try {
      const res = await api.get(`/admin/tasks/${taskId}`);
      setSelectedTask(res.data.task);
    } catch (err) {
      console.error('[Support] Failed to load chat:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    if (selectedTask) scrollToBottom();
  }, [selectedTask, scrollToBottom]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && messageAttachments.length === 0) || sendingMessage) return;
    setSendingMessage(true);
    try {
      const taskId = selectedTask._id || selectedTask.id;
      let attachmentUrls = [];
      
      if (messageAttachments.length > 0) {
        for (const file of messageAttachments) {
          const formData = new FormData();
          formData.append('image', file);
          const uploadRes = await api.post('/upload/chat', formData);
          if (uploadRes.data.url) attachmentUrls.push(uploadRes.data.url);
        }
      }
      
      await api.post(`/admin/tasks/${taskId}/messages`, {
        text: messageText.trim() || '[Image]',
        attachments: attachmentUrls
      });
      
      const res = await api.get(`/admin/tasks/${taskId}`);
      setSelectedTask(res.data.task);
      setMessageText('');
      setMessageAttachments([]);
      scrollToBottom();
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setMessageAttachments(prev => [...prev, ...files].slice(0, 5));
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - (typeof ts === 'number' ? ts : new Date(ts).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // ==================== LEVEL 3: CHAT VIEW ====================
  if (selectedTask) {
    const messages = selectedTask.messages || [];
    const approvals = selectedTask.approvalRequests || [];
    const messageItems = messages.map(m => ({ ...m, _type: 'message', _ts: new Date(m.createdAt || 0).getTime() }));
    const approvalItems = approvals.map(a => ({ ...a, _type: 'approval', _ts: new Date(a.createdAt || 0).getTime() }));
    const timeline = [...messageItems, ...approvalItems].sort((a, b) => a._ts - b._ts);

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
        <div style={{ backgroundColor: '#fff', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setSelectedTask(null)} style={{ padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{selectedTask.title}</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chat with {selectedTask.clientIdentifier || 'Client'}</p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {timeline.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No messages yet</div>}
          {timeline.map((item, idx) => {
            if (item._type === 'approval') {
              return (
                <div key={`a-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b', marginBottom: '4px' }}>Approval Request</span>
                  <div style={{ maxWidth: '85%', padding: '12px', borderRadius: '12px', backgroundColor: '#fef3c7', border: '1px solid #fbbf24' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: '0 0 8px 0' }}>{item.title}</p>
                    {item.options?.map((opt, i) => {
                      const sel = item.selectionsHistory?.[item.selectionsHistory.length - 1]?.selectedOptions || [];
                      return (
                        <div key={i} style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '13px', marginBottom: '4px', backgroundColor: sel.includes(opt) ? '#dcfce7' : '#fff', border: sel.includes(opt) ? '1px solid #22c55e' : '1px solid #e5e7eb' }}>
                          {opt} {sel.includes(opt) && '✓'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            const isAdmin = item.sender === 'ADMIN';
            return (
              <div key={`m-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: isAdmin ? '#6366f1' : '#64748b', marginBottom: '4px' }}>{isAdmin ? 'You' : 'Client'}</span>
                <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '14px', backgroundColor: isAdmin ? '#6366f1' : '#f1f5f9', color: isAdmin ? '#fff' : '#0f172a' }}>
                  {item.attachments?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: item.text && item.text !== '[Image]' ? '6px' : 0 }}>
                      {item.attachments.map((att, i) => (
                        <img key={i} src={typeof att === 'string' ? att : att.url} alt="" onClick={() => setLightboxImage(typeof att === 'string' ? att : att.url)} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '8px', cursor: 'pointer', objectFit: 'cover' }} />
                      ))}
                    </div>
                  )}
                  {item.text && item.text !== '[Image]' && <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{item.text}</p>}
                  <p style={{ fontSize: '10px', margin: '4px 0 0', color: isAdmin ? 'rgba(255,255,255,0.7)' : '#94a3b8', textAlign: 'right' }}>
                    {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 16px' }}>
          {messageAttachments.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {messageAttachments.map((f, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={URL.createObjectURL(f)} alt="" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px' }} />
                  <button onClick={() => setMessageAttachments(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
            <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} placeholder="Type a message..." style={{ flex: 1, padding: '10px 14px', borderRadius: '20px', border: '1px solid #e2e8f0', fontSize: '14px', resize: 'none', minHeight: '40px', maxHeight: '100px' }} />
            <button onClick={handleSendMessage} disabled={sendingMessage || (!messageText.trim() && messageAttachments.length === 0)} style={{ padding: '10px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: (sendingMessage || (!messageText.trim() && messageAttachments.length === 0)) ? 0.5 : 1 }}>
              {sendingMessage ? '...' : 'Send'}
            </button>
          </div>
        </div>

        {lightboxImage && (
          <div onClick={() => setLightboxImage(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <img src={lightboxImage} alt="" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
          </div>
        )}
      </div>
    );
  }

  // ==================== LEVEL 2: TASK LIST ====================
  if (selectedClient) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header title="Support" />
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
          <button onClick={() => setSelectedClient(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#475569', marginBottom: '16px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Back to Clients
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>{selectedClient.clientName}</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>{selectedClient.tasks.length} conversation{selectedClient.tasks.length !== 1 ? 's' : ''}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedClient.tasks.map((task) => {
              const taskId = task._id || task.id;
              if (!taskId) return null;
              return (
                <div key={taskId} onClick={() => openChat(task)} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '18px' }}>💬</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</h3>
                        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{formatTime(task.lastMessageAt || task.lastApprovalAt)}</span>
                      </div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                        {(task.messagesCount || 0) > 0 && <span style={{ fontSize: '10px', fontWeight: '600', color: '#3b82f6', backgroundColor: '#eff6ff', padding: '3px 6px', borderRadius: '4px' }}>{task.messagesCount} msg</span>}
                        {(task.approvalRequestsCount || 0) > 0 && <span style={{ fontSize: '10px', fontWeight: '600', color: '#f59e0b', backgroundColor: '#fef3c7', padding: '3px 6px', borderRadius: '4px' }}>{task.approvalRequestsCount} approval</span>}
                      </div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {chatLoading && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '14px', color: '#64748b' }}>Opening chat...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== LEVEL 1: CLIENT LIST ====================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header title="Support" />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>Support</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Client conversations</p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
            <p style={{ fontSize: '13px', color: '#64748b' }}>Loading...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && clientGroups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '44px', marginBottom: '14px' }}>💬</div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 6px 0' }}>No conversations yet</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Client chats will appear here</p>
          </div>
        )}

        {!loading && clientGroups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {clientGroups.map((group) => (
              <div key={group.clientId} onClick={() => setSelectedClient(group)} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>{group.clientName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.clientName}</h3>
                      <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{formatTime(group.lastActivity)}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</p>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Support;
