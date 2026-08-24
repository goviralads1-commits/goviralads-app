import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import ApprovalBox from '../components/ApprovalBox';
import api from '../services/api';

const Support = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState(null); // Store taskId to open after load
  const [currentUserId, setCurrentUserId] = useState(null);
  
  // Get current user ID from stored user data
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUserId(user.id || user._id);
      }
    } catch (err) {
      console.error('[Support] Failed to get current user ID:', err);
    }
  }, []);
  
  // Chat state
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [historyModalApproval, setHistoryModalApproval] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);
  const selectedTaskRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const lastMessageDateRef = useRef(null); // Tracks most recent message timestamp for incremental fetch
  const scrollContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showNewMsgBadge, setShowNewMsgBadge] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);

  // Keep ref in sync with selectedTask so the polling closure always reads fresh state
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  // Incremental polling: fetch only NEW messages using 'since' param — avoids re-downloading entire conversation
  useEffect(() => {
    if (!activeTaskId) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const current = selectedTaskRef.current;
        if (!current) return;
        const lastDate = lastMessageDateRef.current;
        // Use incremental fetch if we have a lastMessageDate, otherwise full page load
        const url = lastDate
          ? `/client/tasks/${activeTaskId}/messages?since=${encodeURIComponent(lastDate)}`
          : `/client/tasks/${activeTaskId}/messages?page=0&limit=50`;
        const res = await api.get(url);
        const fetched = res.data?.messages || [];
        if (fetched.length === 0) return;

        // Update lastMessageDate to the most recent fetched message
        const maxTs = fetched.reduce((max, m) => {
          const t = new Date(m.createdAt).getTime();
          return t > max ? t : max;
        }, 0);
        if (maxTs > 0) lastMessageDateRef.current = new Date(maxTs).toISOString();

        setSelectedTask(prev => {
          if (!prev) return prev;
          const existing = prev.messages || [];
          const optimistic = existing.filter(m => m._optimistic);
          const real = existing.filter(m => !m._optimistic);

          // Remove optimistic messages that are now confirmed by the server (match by sender + text)
          const remainingOptimistic = optimistic.filter(om =>
            !fetched.some(fm => fm.sender === om.sender && fm.text === om.text)
          );
          // Filter out duplicates already in real messages
          const existingKeys = new Set(real.map(m => `${m.sender}-${m.text}-${new Date(m.createdAt).getTime()}`));
          const trulyNew = fetched.filter(m =>
            !existingKeys.has(`${m.sender}-${m.text}-${new Date(m.createdAt).getTime()}`)
          );

          if (trulyNew.length === 0 && remainingOptimistic.length === optimistic.length) return prev;

          // Show new-message badge if user is scrolled up
          if (!isNearBottomRef.current && trulyNew.length > 0) {
            setShowNewMsgBadge(true);
          }
          return { ...prev, messages: [...real, ...trulyNew, ...remainingOptimistic] };
        });
      } catch (_) { /* silent poll failure */ }
    };

    // Only poll when the tab is visible to save bandwidth
    let intervalId = null;
    const startPolling = () => {
      if (intervalId) return;
      poll(); // Immediate poll on start
      intervalId = setInterval(poll, 3000);
      pollingRef.current = intervalId;
    };
    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; pollingRef.current = null; }
    };

    if (document.visibilityState === 'visible') startPolling();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        startPolling();
      } else {
        stopPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // FCM event listener: trigger immediate poll when a push message arrives for this task
    const handleFCMMessage = (e) => {
      const payload = e.detail;
      const pushTaskId = payload?.data?.taskId;
      if (pushTaskId === activeTaskId) {
        console.log('[Support] FCM message for active task — polling immediately');
        poll();
      }
    };
    window.addEventListener('gva-fcm-message', handleFCMMessage);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('gva-fcm-message', handleFCMMessage);
    };
  }, [activeTaskId]);

  // Extract taskId from URL or sessionStorage on mount
  useEffect(() => {
    console.log('[Support] ========== PAGE MOUNT ==========');
    console.log('[Support] Auth token:', localStorage.getItem('token') ? 'YES' : 'NO');
    
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('[Support] No token, stopping load');
      setLoading(false);
      return;
    }
    
    // Check URL params first
    const params = new URLSearchParams(location.search);
    let taskIdFromUrl = params.get('taskId');
    
    // Also check sessionStorage intendedUrl (from ProtectedRoute redirect)
    if (!taskIdFromUrl) {
      const intendedUrl = sessionStorage.getItem('intendedUrl');
      if (intendedUrl && intendedUrl.includes('taskId=')) {
        const match = intendedUrl.match(/taskId=([^&]+)/);
        if (match) {
          taskIdFromUrl = match[1];
          console.log('[Support] Found taskId in sessionStorage intendedUrl:', taskIdFromUrl);
          sessionStorage.removeItem('intendedUrl');
        }
      }
    }
    
    if (taskIdFromUrl) {
      console.log('[Support] Deep link taskId detected:', taskIdFromUrl);
      setPendingTaskId(taskIdFromUrl);
      // Clear URL params but keep the taskId pending
      if (location.search) {
        navigate('/support', { replace: true });
      }
    }
    
    // Always fetch tasks
    fetchTasksWithMessages();
    console.log('[Support] =====================================');
  }, []);
  
  // Handle pending deep link after tasks are loaded - with FORCE retry
  useEffect(() => {
    if (!loading && pendingTaskId && !selectedTask) {
      console.log('[Support] Tasks loaded, scheduling chat open for:', pendingTaskId);
      
      // First attempt after 300ms delay
      const timer1 = setTimeout(() => {
        console.log('[Support] First attempt to open chat:', pendingTaskId);
        openChatByTaskId(pendingTaskId);
        
        // Force retry after 700ms if still no selectedTask
        const timer2 = setTimeout(() => {
          if (!selectedTask) {
            console.log('[Support] Force retry - chat still not open');
            openChatByTaskId(pendingTaskId);
          }
        }, 700);
        
        return () => clearTimeout(timer2);
      }, 300);
      
      setPendingTaskId(null); // Clear to prevent re-triggering
      return () => clearTimeout(timer1);
    }
  }, [loading, pendingTaskId]);
  
  // Open chat directly by taskId (for deep links) with retry
  const openChatByTaskId = async (taskId, retryCount = 0) => {
    setChatLoading(true);
    setShowNewMsgBadge(false);
    isNearBottomRef.current = true;
    try {
      console.log('[Support] Opening chat for taskId:', taskId, retryCount > 0 ? `(retry ${retryCount})` : '');
      const res = await api.get(`/client/tasks/${taskId}`);
      if (res.data?.task) {
        console.log('[Support] Chat loaded successfully:', res.data.task.title);
        setSelectedTask(res.data.task);
        setActiveTaskId(taskId);
        // Initialize lastMessageDate for incremental polling
        const msgs = res.data.task?.messages || [];
        if (msgs.length > 0) {
          const maxTs = msgs.reduce((max, m) => {
            const t = new Date(m.createdAt).getTime();
            return t > max ? t : max;
          }, 0);
          lastMessageDateRef.current = new Date(maxTs).toISOString();
        } else {
          lastMessageDateRef.current = null;
        }
      } else {
        throw new Error('No task in response');
      }
    } catch (err) {
      console.error('[Support] Chat load failed:', err.response?.status || err.message);
      // Retry once after 500ms
      if (retryCount < 1) {
        console.log('[Support] Retrying in 500ms...');
        setTimeout(() => openChatByTaskId(taskId, retryCount + 1), 500);
        return; // Don't clear loading state yet
      }
      console.error('[Support] All retries failed, showing task list');
    } finally {
      if (retryCount >= 1 || !pendingTaskId) {
        setChatLoading(false);
      }
    }
  };

  const getLastActivity = (task) => {
    const msgTime = task.lastMessageAt ? new Date(task.lastMessageAt).getTime() : 0;
    const approvalTime = task.lastApprovalAt ? new Date(task.lastApprovalAt).getTime() : 0;
    return Math.max(msgTime, approvalTime);
  };

  const fetchTasksWithMessages = async () => {
    try {
      const res = await api.get('/client/tasks');
      const allTasks = res.data.tasks || res.data || [];
      const tasksWithActivity = allTasks.filter(t => 
        (t.messagesCount > 0) || (t.approvalRequestsCount > 0)
      );
      tasksWithActivity.sort((a, b) => getLastActivity(b) - getLastActivity(a));
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
    setShowNewMsgBadge(false);
    isNearBottomRef.current = true;
    try {
      const res = await api.get(`/client/tasks/${taskId}`);
      setSelectedTask(res.data.task);
      setActiveTaskId(taskId);
      // Initialize lastMessageDate for incremental polling
      const msgs = res.data.task?.messages || [];
      if (msgs.length > 0) {
        const maxTs = msgs.reduce((max, m) => {
          const t = new Date(m.createdAt).getTime();
          return t > max ? t : max;
        }, 0);
        lastMessageDateRef.current = new Date(maxTs).toISOString();
      } else {
        lastMessageDateRef.current = null;
      }
    } catch (err) {
      console.error('[Support] Failed to load chat:', err);
    } finally {
      setChatLoading(false);
    }
  };

  const scrollToBottom = useCallback((instant = false) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'auto', block: 'end' });
    }, 350);
  }, []);

  // Scroll to bottom only when message count increases AND user is near bottom (prevents jumping when reading older messages)
  useEffect(() => {
    if (!selectedTask) {
      prevMessageCountRef.current = 0;
      return;
    }
    const count = (selectedTask.messages || []).length;
    if (count !== prevMessageCountRef.current) {
      prevMessageCountRef.current = count;
      if (isNearBottomRef.current) {
        scrollToBottom();
      }
    }
  }, [selectedTask, scrollToBottom]);

  const handleSendMessage = async () => {
    if ((!messageText.trim() && messageAttachments.length === 0) || sendingMessage) return;

    const taskId = selectedTask._id || selectedTask.id;
    const capturedText = messageText.trim();
    const hasImages = messageAttachments.length > 0;

    // Optimistic update for text-only messages — show immediately, don't wait for API
    // _tempId uniquely identifies this optimistic message (safe even for identical text sent twice)
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!hasImages && capturedText) {
      const optimisticMsg = {
        _tempId: tempId,
        sender: 'CLIENT',
        text: capturedText,
        attachments: [],
        createdAt: new Date().toISOString(),
        _optimistic: true
      };
      setSelectedTask(prev => prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev);
      setMessageText('');
      scrollToBottom(true);
    }

    setSendingMessage(true);
    try {
      let attachmentUrls = [];

      // STEP 1: Upload images first if any (MUST match TaskDetail exactly)
      if (hasImages) {
        try {
          console.log('[Support Upload] Starting upload...');
          console.log('[Support Upload] Files to upload:', messageAttachments.length);

          const formData = new FormData();
          messageAttachments.forEach((file, idx) => {
            console.log(`[Support Upload] File ${idx}:`, file.name, file.type, file.size, 'bytes');
            formData.append('images', file); // MUST be 'images' (plural) to match backend
          });

          // Note: Don't set Content-Type manually - browser sets it with correct boundary for FormData
          const uploadRes = await api.post('/upload/chat', formData);
          console.log('[Support Upload] Response:', uploadRes.status, uploadRes.data);
          attachmentUrls = uploadRes.data?.urls || [];

          // If upload returned no URLs, fail
          if (messageAttachments.length > 0 && attachmentUrls.length === 0) {
            throw new Error('Image upload failed - no URLs returned');
          }
        } catch (uploadErr) {
          console.error('[Support Upload] ERROR:', uploadErr);
          console.error('[Support Upload] Response status:', uploadErr.response?.status);
          console.error('[Support Upload] Response data:', uploadErr.response?.data);
          setSendingMessage(false);
          return; // DO NOT send message
        }
      }

      // STEP 2: Send message
      const sendRes = await api.post(`/client/tasks/${taskId}/message`, {
        text: capturedText || (attachmentUrls.length > 0 ? '[Image]' : ''),
        attachments: attachmentUrls
      });

      // STEP 3: Confirm optimistic (text) or refresh messages (image)
      if (!hasImages) {
        // Replace optimistic message with the authoritative server copy (server _id/createdAt).
        // This guarantees the next incremental `since` poll cannot append a duplicate
        // (same timestamp -> dedup key matches; cursor also advanced past it).
        const serverMsg = sendRes?.data?.message;
        setSelectedTask(prev => {
          if (!prev) return prev;
          const messages = (prev.messages || []).map(m =>
            m._tempId === tempId
              ? (serverMsg ? { ...serverMsg } : { ...m, _optimistic: false })
              : m
          );
          return { ...prev, messages };
        });
        // Advance incremental-poll cursor past the server message timestamp
        const serverTs = serverMsg?.createdAt ? new Date(serverMsg.createdAt).getTime() : NaN;
        if (!isNaN(serverTs)) {
          const currentTs = lastMessageDateRef.current ? new Date(lastMessageDateRef.current).getTime() : 0;
          if (serverTs > currentTs) lastMessageDateRef.current = new Date(serverTs).toISOString();
        }
      } else {
        const res = await api.get(`/client/tasks/${taskId}/messages?page=0&limit=50`);
        const fetched = res.data?.messages || [];
        if (fetched.length > 0) {
          setSelectedTask(prev => prev ? { ...prev, messages: fetched } : prev);
          // Update lastMessageDate for incremental polling
          const maxTs = fetched.reduce((max, m) => Math.max(max, new Date(m.createdAt).getTime()), 0);
          if (maxTs > 0) lastMessageDateRef.current = new Date(maxTs).toISOString();
        }
      }

      if (hasImages) {
        // FIX 3: Only clear messageText if user hasn't typed new content during upload
        setMessageText(prev => prev.trim() === capturedText ? '' : prev);
        setMessageAttachments([]);
      } else {
        setMessageAttachments([]);
      }
      scrollToBottom();
    } catch (err) {
      console.error('Send error:', err);
      // Revert optimistic message on error and restore input text (match by _tempId, not text)
      if (!hasImages && capturedText) {
        setSelectedTask(prev => prev ? { ...prev, messages: (prev.messages || []).filter(m => m._tempId !== tempId) } : prev);
        setMessageText(capturedText);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setMessageAttachments(prev => [...prev, ...files].slice(0, 5));
  };

  // Refresh task data (used by ApprovalBox)
  const refreshTaskData = async () => {
    const taskId = selectedTask._id || selectedTask.id;
    try {
      const res = await api.get(`/client/tasks/${taskId}`);
      setSelectedTask(res.data.task);
    } catch (err) {
      console.error('[Support] Refresh task error:', err);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // ==================== CHAT VIEW ====================
  if (selectedTask) {
    const messages = selectedTask.messages || [];
    const approvals = (selectedTask.approvalRequests || []).filter(a => a.isVisibleToClient !== false);
    const messageItems = messages.map(m => ({ ...m, _type: 'message', _ts: new Date(m.createdAt || 0).getTime() }));
    const approvalItems = approvals.map(a => ({ ...a, _type: 'approval', _ts: new Date(a.createdAt || 0).getTime() }));
    const timeline = [...messageItems, ...approvalItems].sort((a, b) => a._ts - b._ts);

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ backgroundColor: '#fff', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => { setSelectedTask(null); setActiveTaskId(null); }} style={{ padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{selectedTask.title}</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chat</p>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={(e) => {
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          isNearBottomRef.current = distFromBottom < 100;
          if (isNearBottomRef.current && showNewMsgBadge) setShowNewMsgBadge(false);
        }} style={{ flex: 1, overflowY: 'auto', padding: '16px', position: 'relative' }}>
          {showNewMsgBadge && (
            <button onClick={() => { scrollToBottom(true); setShowNewMsgBadge(false); }} style={{ position: 'sticky', bottom: '10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#22c55e', color: '#fff', padding: '6px 16px', borderRadius: '20px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(34,197,94,0.3)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7-7-7M19 6l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              New messages
            </button>
          )}
          {timeline.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No messages yet</div>
          )}
          {timeline.map((item, idx) => {
            // Date separator: show when day changes between consecutive items
            const prevTs = idx > 0 ? timeline[idx - 1]._ts : null;
            const currTs = item._ts || 0;
            const showDateSep = prevTs === null || new Date(prevTs).toDateString() !== new Date(currTs).toDateString();
            const dateLabel = (() => {
              const d = new Date(currTs);
              const today = new Date();
              const yest = new Date(today); yest.setDate(yest.getDate() - 1);
              if (d.toDateString() === today.toDateString()) return 'Today';
              if (d.toDateString() === yest.toDateString()) return 'Yesterday';
              return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            })();
            if (item._type === 'approval') {
              const taskId = selectedTask._id || selectedTask.id;
              return (
                <React.Fragment key={`a-${idx}`}>
                  {showDateSep && <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>{dateLabel}</div>}
                  <ApprovalBox
                    approval={item}
                    taskId={taskId}
                    onSubmitSuccess={refreshTaskData}
                    onViewHistory={(a) => setHistoryModalApproval(a)}
                    compact={true}
                  />
                </React.Fragment>
              );
            }
            const isAdmin = item.sender === 'ADMIN';
            const isAssignedUser = item.senderLabel === 'ASSIGNED_USER';
            const isCurrentUser = item.senderId === currentUserId;
            const isTaskOwner = selectedTask && selectedTask.clientId === item.senderId;
            
            // Determine sender display label
            let senderLabel = 'CLIENT';
            if (isAdmin) {
              senderLabel = 'ADMIN';
            } else if (isCurrentUser && isAssignedUser) {
              // Current user is an assigned operational user
              const assignedUser = (selectedTask.assignedUsers || []).find(u => u.userId === item.senderId);
              if (assignedUser && assignedUser.designation) {
                senderLabel = assignedUser.designation;
              } else {
                senderLabel = 'You';
              }
            } else if (isCurrentUser) {
              // Current user is the task owner
              senderLabel = 'You';
            } else if (isAssignedUser) {
              // Other assigned operational user
              const assignedUser = (selectedTask.assignedUsers || []).find(u => u.userId === item.senderId);
              if (assignedUser && assignedUser.designation) {
                senderLabel = assignedUser.designation;
              } else {
                senderLabel = 'TEAM'; // Fallback if no designation
              }
            } else if (isTaskOwner) {
              // Real client/customer (task owner)
              senderLabel = 'CLIENT';
            }
            
            return (
              <React.Fragment key={`m-${idx}`}>
                {showDateSep && <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>{dateLabel}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-start' : (isCurrentUser ? 'flex-end' : 'flex-start'), marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: isAdmin ? '#6366f1' : (isCurrentUser ? '#22c55e' : '#64748b'), marginBottom: '4px' }}>{senderLabel}</span>
                <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '14px', backgroundColor: isAdmin ? '#f1f5f9' : (isCurrentUser ? '#22c55e' : '#f1f5f9'), color: isAdmin ? '#0f172a' : (isCurrentUser ? '#fff' : '#0f172a') }}>
                  {item.attachments?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: item.text && item.text !== '[Image]' ? '6px' : 0 }}>
                      {item.attachments.map((att, i) => (
                        <img key={i} src={typeof att === 'string' ? att : att.url} alt="" onClick={() => setLightboxImage(typeof att === 'string' ? att : att.url)} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '8px', cursor: 'pointer', objectFit: 'cover' }} />
                      ))}
                    </div>
                  )}
                  {item.text && item.text !== '[Image]' && <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{item.text}</p>}
                  <p style={{ fontSize: '10px', margin: '4px 0 0', color: isAdmin ? '#94a3b8' : 'rgba(255,255,255,0.7)', textAlign: 'right' }}>
                    {new Date(item.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
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
            <button onClick={handleSendMessage} disabled={sendingMessage || (!messageText.trim() && messageAttachments.length === 0)} style={{ padding: '10px 16px', borderRadius: '20px', border: 'none', backgroundColor: '#22c55e', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: 'pointer', opacity: (sendingMessage || (!messageText.trim() && messageAttachments.length === 0)) ? 0.5 : 1 }}>
              {sendingMessage ? '...' : 'Send'}
            </button>
          </div>
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div onClick={() => setLightboxImage(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <img src={lightboxImage} alt="" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
          </div>
        )}

        {/* History Modal */}
        {historyModalApproval && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setHistoryModalApproval(null)}
          >
            <div style={{
              backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '420px',
              maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
            }}
            onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{
                padding: '20px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Selection History</h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>{historyModalApproval.title}</p>
                </div>
                <button
                  onClick={() => setHistoryModalApproval(null)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {(historyModalApproval.selectionsHistory || []).length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '30px 0' }}>
                    No selections yet
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {historyModalApproval.selectionsHistory.map((h, hIdx) => {
                      const isLatest = hIdx === historyModalApproval.selectionsHistory.length - 1;
                      return (
                        <div key={hIdx} style={{
                          padding: '14px', borderRadius: '12px',
                          backgroundColor: isLatest ? '#f0fdf4' : '#f8fafc',
                          border: isLatest ? '2px solid #22c55e' : '1px solid #e2e8f0'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{
                              fontSize: '11px', fontWeight: '700',
                              color: isLatest ? '#16a34a' : '#64748b',
                              textTransform: 'uppercase'
                            }}>
                              {isLatest ? 'Current (Final)' : `v${hIdx + 1}`}
                            </span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                              {new Date(h.timestamp).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}
                            </span>
                          </div>
                          <p style={{
                            fontSize: '14px', fontWeight: '600', margin: 0,
                            color: isLatest ? '#166534' : '#334155'
                          }}>
                            {h.selectedOptions?.join(', ') || 'No selection'}
                            {isLatest && ' ✓'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setHistoryModalApproval(null)}
                  style={{
                    width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600',
                    backgroundColor: '#f1f5f9', color: '#334155',
                    border: 'none', borderRadius: '12px', cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== TASK LIST VIEW ====================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px' }}>
      <Header title="Support" />
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>Support</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Your conversations</p>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#22c55e', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '14px', color: '#64748b' }}>Loading...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {chatLoading && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#22c55e', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '14px', color: '#64748b' }}>Opening chat...</p>
            </div>
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px 0' }}>No conversations yet</h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Start a conversation in any task</p>
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tasks.map((task) => {
              const taskId = task._id || task.id;
              if (!taskId) return null;
              // Determine if this is an assigned task or owned task
              const isAssignedTask = task.isAssignedUser === true;
              return (
                <div key={taskId} onClick={() => openChat(task)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', border: isAssignedTask ? '2px solid #6366f1' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: isAssignedTask ? '#eef2ff' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '20px' }}>{isAssignedTask ? '👥' : '💬'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</h3>
                          {isAssignedTask && (
                            <span style={{ fontSize: '10px', fontWeight: '700', color: '#6366f1', backgroundColor: '#eef2ff', padding: '3px 8px', borderRadius: '6px', flexShrink: 0 }}>ASSIGNED</span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>{formatTime(task.lastMessageAt || task.lastApprovalAt)}</span>
                      </div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
                        {(task.messagesCount || 0) > 0 && <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e', backgroundColor: '#f0fdf4', padding: '4px 8px', borderRadius: '6px' }}>{task.messagesCount} msg</span>}
                        {(task.approvalRequestsCount || 0) > 0 && <span style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b', backgroundColor: '#fef3c7', padding: '4px 8px', borderRadius: '6px' }}>{task.approvalRequestsCount} approval</span>}
                      </div>
                    </div>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
