import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import api from '../services/api';
import AttachSheet from '../components/chat/AttachSheet';
import MediaBubble from '../components/chat/MediaBubble';
import VoiceRecorder, { isRecordingSupported } from '../components/chat/VoiceRecorder';
import { probeMediaEnabled, putToR2, mbToBytes, limitFor, VIDEO_ACCEPT, VIDEO_MIME_TYPES, deleteMedia } from '../components/chat/mediaUpload';

const Support = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientGroups, setClientGroups] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingTaskId, setPendingTaskId] = useState(null); // Store taskId to open after load
  
  // Chat state
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Approval System state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalQuestion, setApprovalQuestion] = useState('');
  const [approvalType, setApprovalType] = useState('single');
  const [approvalOptions, setApprovalOptions] = useState(['', '']);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [historyModalApproval, setHistoryModalApproval] = useState(null);
  const [showOnlyApprovals, setShowOnlyApprovals] = useState(false);
  const [isChatFullScreen, setIsChatFullScreen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);
  const [toast, setToast] = useState(null);
  const fullscreenInputRef = useRef(null);
  const pollingRef = useRef(null);
  const selectedTaskRef = useRef(null);
  const prevMessageCountRef = useRef(0);
  const lastMessageDateRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showNewMsgBadge, setShowNewMsgBadge] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState(null);

  // CHAT MEDIA (Phase 2B): all media state lives here; text/image flows are untouched
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaToast, setMediaToast] = useState(null);
  const videoInputRef = useRef(null);
  const uploadsRef = useRef(new Map()); // _tempId -> { blob, abortController, ... } (outside React state — no re-renders)

  // Keep ref in sync with selectedTask so the polling closure always reads fresh state
  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);

  // Incremental polling: fetch only NEW messages using 'since' param — visibility-aware
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
        const url = lastDate
          ? `/admin/tasks/${activeTaskId}/messages?since=${encodeURIComponent(lastDate)}`
          : `/admin/tasks/${activeTaskId}/messages?page=0&limit=50`;
        const res = await api.get(url);
        const fetched = res.data?.messages || [];
        if (fetched.length === 0) return;

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
          const remainingOptimistic = optimistic.filter(om =>
            !fetched.some(fm => fm.sender === om.sender && fm.text === om.text)
          );
          const existingKeys = new Set(real.map(m => `${m.sender}-${m.text}-${new Date(m.createdAt).getTime()}`));
          const trulyNew = fetched.filter(m =>
            !existingKeys.has(`${m.sender}-${m.text}-${new Date(m.createdAt).getTime()}`)
          );
          if (trulyNew.length === 0 && remainingOptimistic.length === optimistic.length) return prev;
          if (!isNearBottomRef.current && trulyNew.length > 0) {
            setShowNewMsgBadge(true);
          }
          return { ...prev, messages: [...real, ...trulyNew, ...remainingOptimistic] };
        });
      } catch (_) { /* silent poll failure */ }
    };

    let intervalId = null;
    const startPolling = () => {
      if (intervalId) return;
      poll();
      intervalId = setInterval(poll, 3000);
      pollingRef.current = intervalId;
    };
    const stopPolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; pollingRef.current = null; }
    };
    if (document.visibilityState === 'visible') startPolling();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') { startPolling(); }
      else { stopPolling(); }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleFCMMessage = (e) => {
      const payload = e.detail;
      const pushTaskId = payload?.data?.taskId;
      if (pushTaskId === activeTaskId) {
        console.log('[Admin Support] FCM message for active task — polling immediately');
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

  // CHAT MEDIA (Phase 2B): one-time capability probe per opened task.
  // Flag OFF (or probe failure) => media controls stay hidden, exact legacy UI.
  // Also aborts any in-flight uploads when switching tasks.
  useEffect(() => {
    if (!activeTaskId) { setMediaEnabled(false); return; }
    let cancelled = false;
    probeMediaEnabled(activeTaskId)
      .then(on => { if (!cancelled) setMediaEnabled(!!on); })
      .catch(() => { if (!cancelled) setMediaEnabled(false); });
    return () => {
      cancelled = true;
      uploadsRef.current.forEach(u => { try { u.abortController?.abort(); } catch (_) {} });
      uploadsRef.current.clear();
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
      const res = await api.get(`/admin/tasks/${taskId}`);
      if (res.data?.task) {
        console.log('[Support] Chat loaded successfully:', res.data.task.title);
        setSelectedTask(res.data.task);
        setActiveTaskId(taskId);
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
    setShowNewMsgBadge(false);
    isNearBottomRef.current = true;
    try {
      const res = await api.get(`/admin/tasks/${taskId}`);
      setSelectedTask(res.data.task);
      setActiveTaskId(taskId);
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

  // Scroll to bottom only when message count increases AND user is near bottom
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

  // Close fullscreen chat on ESC key
  useEffect(() => {
    if (!isChatFullScreen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsChatFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatFullScreen]);

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
        sender: 'ADMIN',
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
          messageAttachments.forEach((att, idx) => {
            console.log(`[Support Upload] File ${idx}:`, att.file.name, att.file.type, att.file.size, 'bytes');
            formData.append('images', att.file); // MUST be 'images' (plural) to match backend
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
          setToast({ type: 'error', message: uploadErr.response?.data?.error || uploadErr.message || 'Failed to upload image' });
          setTimeout(() => setToast(null), 5000);
          setSendingMessage(false);
          return; // DO NOT send message
        }
      }

      // STEP 2: Send message
      const sendRes = await api.post(`/admin/tasks/${taskId}/message`, {
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
        // Cleanup preview URLs for images
        messageAttachments.forEach(att => URL.revokeObjectURL(att.previewUrl));
        const res = await api.get(`/admin/tasks/${taskId}/messages?page=0&limit=50`);
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
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to send message' });
      setTimeout(() => setToast(null), 3000);
      // Revert optimistic message on error and restore input text (match by _tempId, not text)
      if (!hasImages && capturedText) {
        setSelectedTask(prev => prev ? { ...prev, messages: (prev.messages || []).filter(m => m._tempId !== tempId) } : prev);
        setMessageText(capturedText);
      }
    } finally {
      setSendingMessage(false);
    }
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

  // Refresh selected task
  const refreshTask = async () => {
    if (!selectedTask) return;
    const taskId = selectedTask._id || selectedTask.id;
    try {
      const res = await api.get(`/admin/tasks/${taskId}`);
      setSelectedTask(res.data.task);
    } catch (err) {
      console.error('Failed to refresh task:', err);
    }
  };

  // Handle sending approval request
  const handleSendApproval = async () => {
    if (!approvalQuestion.trim()) {
      setToast({ type: 'error', message: 'Please enter a question' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const validOptions = approvalOptions.filter(o => o.trim());
    if (validOptions.length < 2) {
      setToast({ type: 'error', message: 'Please add at least 2 options' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSendingApproval(true);
    try {
      const taskId = selectedTask._id || selectedTask.id;
      await api.post(`/admin/tasks/${taskId}/approvals`, {
        title: approvalQuestion.trim(),
        type: approvalType === 'single' ? 'single' : 'multi',
        options: validOptions,
        isVisibleToClient: true,
        showBelowChat: false
      });
      setShowApprovalModal(false);
      setApprovalQuestion('');
      setApprovalType('single');
      setApprovalOptions(['', '']);
      setToast({ type: 'success', message: 'Approval request sent!' });
      setTimeout(() => setToast(null), 3000);
      await refreshTask();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to send approval' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSendingApproval(false);
    }
  };

  // Update approval settings (allowChanges, showHistoryToClient)
  const handleUpdateApprovalSetting = async (approvalId, field, value) => {
    setSelectedTask(prev => {
      if (!prev || !prev.approvalRequests) return prev;
      return {
        ...prev,
        approvalRequests: prev.approvalRequests.map(a =>
          a.id === approvalId ? { ...a, [field]: value } : a
        )
      };
    });
    try {
      const taskId = selectedTask._id || selectedTask.id;
      await api.patch(`/admin/tasks/${taskId}/approvals/${approvalId}`, { [field]: value });
      setToast({ type: 'success', message: 'Setting updated' });
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      await refreshTask();
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Export approval proof
  const handleExportProof = () => {
    const approvedItems = (selectedTask.approvalRequests || []).filter(a => (a.selectionsHistory || []).length > 0);
    if (approvedItems.length === 0) return;
    const formatTimestamp = (ts) => new Date(ts).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    let report = `--- CLIENT APPROVAL REPORT ---

Task: ${selectedTask.title}

`;
    approvedItems.forEach((approval, idx) => {
      const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
      const status = approval.allowChanges === false ? 'Locked ✓' : 'Editable';
      report += `[ ${approval.title} ]

Final: ${latest?.selectedOptions?.join(', ') || 'No selection'}

Status: ${status}
`;
      if ((approval.selectionsHistory || []).length > 0) {
        report += `\nHistory:\n`;
        approval.selectionsHistory.forEach((h) => {
          report += `  • ${h.selectedOptions?.join(', ')} (${formatTimestamp(h.timestamp)})\n`;
        });
      }
      if (idx < approvedItems.length - 1) report += `\n${'—'.repeat(30)}\n\n`;
    });
    report += `\n---`;
    navigator.clipboard.writeText(report).then(() => {
      setCopyToast('Report copied');
      setTimeout(() => setCopyToast(null), 2500);
    }).catch(() => {
      setCopyToast('Copy failed');
      setTimeout(() => setCopyToast(null), 2500);
    });
  };

  // Linkify text - convert URLs to clickable links
  const linkifyText = (text) => {
    if (!text) return text;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{part}</a>;
      }
      return part;
    });
  };

  // Handle image selection
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 5 - messageAttachments.length;
    const toProcess = files.slice(0, remaining);
    toProcess.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setToast({ type: 'error', message: 'Only images allowed' });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setToast({ type: 'error', message: 'Image too large (max 5MB)' });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setMessageAttachments(prev => [...prev, { file, previewUrl }]);
    });
    e.target.value = '';
  };

  // Remove attachment
  const removeAttachment = (idx) => {
    setMessageAttachments(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ==================== CHAT MEDIA (Phase 2B) — direct-to-R2 video/audio ====================
  // Fully independent from the text/image send path above. Bytes go browser -> R2
  // via presigned PUT (XHR, no 30s timeout); the Node backend only sees metadata.
  const showMediaToast = (msg) => {
    setMediaToast(msg);
    setTimeout(() => setMediaToast(null), 4000);
  };

  const patchMediaMessage = (tempId, patch) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      return { ...prev, messages: (prev.messages || []).map(m => m._tempId === tempId ? { ...m, ...patch } : m) };
    });
  };

  const startMediaUpload = async (fileOrBlob, kind, { tempId: existingTempId = null, name = null, mime = null } = {}) => {
    if (!selectedTask) return;
    const taskId = selectedTask._id || selectedTask.id;
    const limitMB = limitFor(kind);
    if (fileOrBlob.size > mbToBytes(limitMB)) {
      showMediaToast(`${kind === 'audio' ? 'Voice note' : 'Video'} too large — max ${limitMB} MB`);
      return;
    }
    const tempId = existingTempId || `tmp-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = name || fileOrBlob.name || `${kind}.${kind === 'audio' ? 'webm' : 'mp4'}`;
    // Normalize MIME for upload metadata only: MediaRecorder can produce
    // 'audio/webm;codecs=opus' but the server whitelist expects the base type.
    // The Blob itself is untouched; the server remains authoritative.
    const fileMime = ((mime || fileOrBlob.type || '').split(';')[0].trim()) || (kind === 'video' ? 'video/mp4' : 'audio/webm');

    if (!existingTempId) {
      // Optimistic media bubble appears immediately (upload state lives on the attachment)
      const optimisticMsg = {
        _tempId: tempId,
        sender: 'ADMIN',
        text: '',
        attachments: [{ _upload: 'uploading', _progress: 0, kind, name: fileName, size: fileOrBlob.size }],
        createdAt: new Date().toISOString(),
        _optimistic: true
      };
      setSelectedTask(prev => prev ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] } : prev);
      scrollToBottom(true);
    } else {
      patchMediaMessage(tempId, { attachments: [{ _upload: 'uploading', _progress: 0, kind, name: fileName, size: fileOrBlob.size }] });
    }

    const abortController = new AbortController();
    uploadsRef.current.set(tempId, { blob: fileOrBlob, kind, name: fileName, mime: fileMime, taskId, abortController });

    try {
      // Fresh presigned URL for EVERY attempt (initial + retries) — never reused
      const urlRes = await api.post(`/admin/tasks/${taskId}/media/upload-url`, {
        kind, filename: fileName, size: fileOrBlob.size, mime: fileMime
      });
      const { uploadUrl, attachment } = urlRes.data || {};
      if (!uploadUrl || !attachment) throw new Error('No upload URL returned');

      await putToR2(uploadUrl, fileOrBlob, {
        contentType: fileMime,
        signal: abortController.signal,
        onProgress: (pct) => patchMediaMessage(tempId, {
          attachments: [{ _upload: 'uploading', _progress: pct, kind, name: fileName, size: fileOrBlob.size }]
        })
      });

      patchMediaMessage(tempId, { attachments: [{ _upload: 'sending', kind, name: fileName, size: fileOrBlob.size }] });
      // Send with the SERVER-ISSUED metadata; server re-validates + HEAD-checks the R2 object
      const sendRes = await api.post(`/admin/tasks/${taskId}/message`, { text: '', attachments: [attachment] });
      const serverMsg = sendRes?.data?.message;
      // Same reconcile pattern as the text flow: replace by _tempId + advance poll cursor
      setSelectedTask(prev => {
        if (!prev) return prev;
        const messages = (prev.messages || []).map(m =>
          m._tempId === tempId ? (serverMsg ? { ...serverMsg } : { ...m, _optimistic: false }) : m
        );
        return { ...prev, messages };
      });
      const serverTs = serverMsg?.createdAt ? new Date(serverMsg.createdAt).getTime() : NaN;
      if (!isNaN(serverTs)) {
        const currentTs = lastMessageDateRef.current ? new Date(lastMessageDateRef.current).getTime() : 0;
        if (serverTs > currentTs) lastMessageDateRef.current = new Date(serverTs).toISOString();
      }
      scrollToBottom();
      // Terminal success — the Blob is no longer needed for Retry; release it.
      uploadsRef.current.delete(tempId);
    } catch (err) {
      if (err.message === 'cancelled') return; // discard/task-switch already cleaned up
      // FAILED upload: keep the Blob in uploadsRef so Retry can re-upload it
      // with a fresh presigned URL. Only success / Discard / task-switch release it.
      patchMediaMessage(tempId, {
        attachments: [{ _upload: 'error', _error: err.response?.data?.error || err.message || 'Upload failed', kind, name: fileName, size: fileOrBlob.size }]
      });
      console.error('[Chat Media] Upload/send failed:', err);
    }
  };

  const handleRetryMedia = (tempId) => {
    const entry = uploadsRef.current.get(tempId);
    if (!entry) { showMediaToast('File no longer available — please attach again'); return; }
    // Same original Blob (by reference, never copied); startMediaUpload will
    // request a completely NEW presigned upload URL for this attempt.
    startMediaUpload(entry.blob, entry.kind, { tempId, name: entry.name, mime: entry.mime });
  };

  const handleDiscardMedia = (tempId) => {
    const entry = uploadsRef.current.get(tempId);
    if (entry) { try { entry.abortController.abort(); } catch (_) {} uploadsRef.current.delete(tempId); }
    setSelectedTask(prev => prev ? { ...prev, messages: (prev.messages || []).filter(m => m._tempId !== tempId) } : prev);
  };

  const handleVideoSelect = (e) => {
    const file = Array.from(e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      showMediaToast('Only MP4 or WebM videos are supported');
      return;
    }
    if (file.size > mbToBytes(limitFor('video'))) {
      showMediaToast(`Video too large — max ${limitFor('video')} MB`);
      return;
    }
    startMediaUpload(file, 'video', {});
  };

  const handleRecorded = (blob, { mime, name }) => {
    setIsRecording(false);
    startMediaUpload(blob, 'audio', { mime, name });
  };

  const handleRecordCancel = () => setIsRecording(false);

  const handleRecordError = (msg) => {
    setIsRecording(false);
    showMediaToast(msg);
  };

  // CHAT MEDIA (delete): confirmed media only. All authorization is
  // server-side; on success we mark the attachment deleted locally so the
  // bubble flips to the inert "Media deleted" chip immediately. Incremental
  // polling only ever APPENDS new messages, so it cannot revive the marker.
  const handleDeleteMedia = async (msg, att) => {
    if (!selectedTask || !msg || !msg._id || !att || !att.key) return;
    if (!window.confirm('Delete this media for everyone in this chat?')) return;
    const taskId = selectedTask._id || selectedTask.id;
    try {
      await deleteMedia(taskId, msg._id, att.key);
      setSelectedTask(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: (prev.messages || []).map(m =>
            m._id === msg._id
              ? { ...m, attachments: (m.attachments || []).map(a => (a && typeof a === 'object' && a.key === att.key ? { ...a, deleted: true } : a)) }
              : m
          ),
        };
      });
    } catch (err) {
      showMediaToast(err.response?.data?.error || 'Could not delete media');
    }
  };

  // ==================== LEVEL 3: CHAT VIEW ====================
  if (selectedTask) {
    const messages = selectedTask.messages || [];
    const approvals = selectedTask.approvalRequests || [];
    const messageItems = messages.map(m => ({ ...m, _type: 'message', _ts: new Date(m.createdAt || 0).getTime() }));
    const approvalItems = approvals.map(a => ({ ...a, _type: 'approval', _ts: new Date(a.createdAt || 0).getTime() }));
    const timeline = [...messageItems, ...approvalItems].sort((a, b) => a._ts - b._ts);
    const approvedItems = approvals.filter(a => (a.selectionsHistory || []).length > 0);

    // Render approval card with admin controls
    const renderApprovalCard = (approval, idx) => {
      const hasHistory = (approval.selectionsHistory || []).length > 0;
      const isLocked = hasHistory && !approval.allowChanges;
      return (
        <div key={`approval-${approval.id || idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366f1', marginBottom: '4px' }}>Admin (Approval)</span>
          <div style={{ maxWidth: '85%', padding: '14px', borderRadius: '14px', backgroundColor: '#fef3c7', border: '2px solid #fbbf24' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: '0 0 10px 0' }}>{approval.title}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {approval.options.map((opt, optIdx) => {
                const latestSelection = approval.selectionsHistory?.[approval.selectionsHistory.length - 1];
                const isSelected = latestSelection?.selectedOptions?.includes(opt);
                return (
                  <div key={optIdx} style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '13px', backgroundColor: isSelected ? '#dcfce7' : '#fff', border: isSelected ? '2px solid #22c55e' : '1px solid #e5e7eb', color: isSelected ? '#15803d' : '#374151' }}>
                    {approval.type === 'single' ? '○' : '☐'} {opt} {isSelected && '✓'}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '11px', color: '#92400e', margin: '0 0 8px 0' }}>
              {hasHistory ? `Selected by ${approval.selectionsHistory[approval.selectionsHistory.length - 1]?.selectedBy?.toLowerCase()}` : 'Awaiting selection'}
              {isLocked && ' 🔒 (Locked)'}
            </p>
            {(approval.selectionsHistory || []).length > 0 && (
              <button onClick={() => setHistoryModalApproval(approval)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc', cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                View History ({approval.selectionsHistory.length})
              </button>
            )}
            <div style={{ borderTop: '1px solid #fcd34d', paddingTop: '10px', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#92400e' }}>Allow client to change</span>
                <button onClick={() => handleUpdateApprovalSetting(approval.id, 'allowChanges', !approval.allowChanges)} style={{ padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '600', backgroundColor: approval.allowChanges ? '#22c55e' : '#e5e7eb', color: approval.allowChanges ? '#fff' : '#6b7280' }}>
                  {approval.allowChanges ? 'ON' : 'OFF'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#92400e' }}>Show history to client</span>
                <button onClick={() => handleUpdateApprovalSetting(approval.id, 'showHistoryToClient', !approval.showHistoryToClient)} style={{ padding: '4px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: '600', backgroundColor: approval.showHistoryToClient ? '#22c55e' : '#e5e7eb', color: approval.showHistoryToClient ? '#fff' : '#6b7280' }}>
                  {approval.showHistoryToClient ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            <p style={{ fontSize: '10px', color: '#b45309', margin: '8px 0 0' }}>
              {new Date(approval.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      );
    };

    // Render message
    const renderMessage = (msg, idx) => {
      const isAdmin = msg.sender === 'ADMIN';
      
      // Use senderLabel directly from backend (already resolved to designation)
      const senderLabel = msg.senderLabel || (isAdmin ? 'Admin' : 'Client');
      
      return (
      <div key={`msg-${idx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: isAdmin ? '#6366f1' : '#64748b', marginBottom: '4px' }}>
          {senderLabel}
        </span>
        <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '14px', backgroundColor: isAdmin ? '#6366f1' : '#f1f5f9', color: isAdmin ? '#fff' : '#0f172a' }}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: msg.text && msg.text !== '[Image]' ? '6px' : 0 }}>
              {msg.attachments.map((att, attIdx) => {
                // CHAT MEDIA (Phase 2B): server media objects render via MediaBubble;
                // legacy strings / plain-url objects keep the exact existing <img> path.
                if (att && typeof att === 'object' && att.kind) {
                  return (
                    <MediaBubble
                      key={attIdx}
                      att={att}
                      taskId={selectedTask._id || selectedTask.id}
                      onRetry={handleRetryMedia}
                      onDiscard={handleDiscardMedia}
                      onDelete={(a) => handleDeleteMedia(msg, a)}
                    />
                  );
                }
                const imgUrl = typeof att === 'string' ? att : att.url;
                return <img key={attIdx} src={imgUrl} alt="" onClick={() => setLightboxImage(imgUrl)} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '6px', cursor: 'pointer', objectFit: 'cover' }} />;
              })}
            </div>
          )}
          {msg.text && msg.text !== '[Image]' && <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{linkifyText(msg.text)}</p>}
          <p style={{ fontSize: '10px', margin: '4px 0 0', color: msg.sender === 'ADMIN' ? 'rgba(255,255,255,0.7)' : '#94a3b8', textAlign: 'right' }}>
            {new Date(msg.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  };

    // Render chat content (supports filter mode) — with date separators
    const renderChatContent = () => {
      if (showOnlyApprovals) {
        if (approvals.length === 0) return <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '30px 0' }}>No approvals found</p>;
        return <>{approvals.map((approval, idx) => renderApprovalCard(approval, idx))}</>;
      }
      if (timeline.length === 0) return <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '30px 0' }}>No messages yet</p>;
      return <>{timeline.map((item, idx) => {
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
        return (
          <React.Fragment key={`item-${idx}`}>
            {showDateSep && <div style={{ textAlign: 'center', padding: '12px 0', color: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>{dateLabel}</div>}
            {item._type === 'approval' ? renderApprovalCard(item, idx) : renderMessage(item, idx)}
          </React.Fragment>
        );
      })}<div ref={messagesEndRef} /></>;
    };

    return (
      <div style={{ height: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
        {/* Toast */}
        {toast && (
          <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 10000 }}>{toast.message}</div>
        )}

        {/* Header */}
        <div style={{ backgroundColor: '#fff', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => { setSelectedTask(null); setShowOnlyApprovals(false); setActiveTaskId(null); }} style={{ padding: '8px', borderRadius: '8px', border: 'none', backgroundColor: '#f1f5f9', cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{selectedTask.title}</h2>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chat with {selectedTask.clientIdentifier || 'Client'}</p>
          </div>
          {/* Approval Filter Toggle */}
          {approvals.length > 0 && (
            <button onClick={() => setShowOnlyApprovals(!showOnlyApprovals)} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', backgroundColor: showOnlyApprovals ? '#fef3c7' : '#f1f5f9', color: showOnlyApprovals ? '#92400e' : '#64748b', border: showOnlyApprovals ? '2px solid #fbbf24' : '1px solid #e2e8f0', cursor: 'pointer' }}>
              ✅ Approvals ({approvals.length})
            </button>
          )}
          {/* Full Screen Toggle */}
          <button onClick={() => { setIsChatFullScreen(true); setTimeout(() => fullscreenInputRef.current?.focus(), 100); }} title="Expand chat" style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={(e) => {
          const el = e.currentTarget;
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          isNearBottomRef.current = distFromBottom < 100;
          if (isNearBottomRef.current && showNewMsgBadge) setShowNewMsgBadge(false);
        }} style={{ flex: 1, overflowY: 'auto', padding: '16px', position: 'relative' }}>
          {showNewMsgBadge && (
            <button onClick={() => { scrollToBottom(true); setShowNewMsgBadge(false); }} style={{ position: 'sticky', bottom: '10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#6366f1', color: '#fff', padding: '6px 16px', borderRadius: '20px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7-7-7M19 6l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              New messages
            </button>
          )}
          {renderChatContent()}
        </div>

        {/* Final Approved Decisions Summary */}
        {approvedItems.length > 0 && (
          <div style={{ backgroundColor: '#f0fdf4', padding: '12px 16px', borderTop: '1px solid #bbf7d0', position: 'relative' }}>
            {copyToast && <div style={{ position: 'absolute', top: '8px', right: '12px', backgroundColor: '#166534', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', zIndex: 10 }}>{copyToast}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '700', color: '#166534', margin: 0 }}>✅ Final Decisions</h4>
              <button onClick={handleExportProof} style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
                Export
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {approvedItems.map((approval, idx) => {
                const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
                return (
                  <div key={idx} style={{ backgroundColor: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px 0' }}>{approval.title}</p>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#166534', margin: 0 }}>{latest?.selectedOptions?.join(', ') || 'No selection'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Input Section */}
        <div style={{ backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', padding: '12px 16px' }}>
          {mediaToast && (
            <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>{mediaToast}</div>
          )}
          {messageAttachments.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
              {messageAttachments.map((att, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <img src={att.previewUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover' }} />
                  <button onClick={() => removeAttachment(idx)} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {isRecording && mediaEnabled ? (
            <VoiceRecorder onRecorded={handleRecorded} onCancel={handleRecordCancel} onError={handleRecordError} />
          ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: 'none' }} />
            {mediaEnabled && <input type="file" ref={videoInputRef} onChange={handleVideoSelect} accept={VIDEO_ACCEPT} style={{ display: 'none' }} />}
            <button onClick={() => (mediaEnabled ? setAttachSheetOpen(true) : fileInputRef.current?.click())} disabled={messageAttachments.length >= 5} style={{ padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer', opacity: messageAttachments.length >= 5 ? 0.5 : 1, minWidth: '44px', minHeight: '44px' }} title="Attach">
              📎
            </button>
            {/* Send Approval Button */}
            <button onClick={() => setShowApprovalModal(true)} style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '14px', border: 'none', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }} title="Send Approval Request">
              ✅
            </button>
            <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} placeholder="Reply to client..." style={{ flex: 1, padding: '12px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '14px', outline: 'none', resize: 'none', lineHeight: 1.5, minHeight: '44px', maxHeight: '120px', overflow: 'auto' }} />
            <button onClick={handleSendMessage} disabled={(!messageText.trim() && messageAttachments.length === 0) || sendingMessage} style={{ padding: '12px 20px', backgroundColor: (messageText.trim() || messageAttachments.length > 0) ? '#6366f1' : '#e2e8f0', color: (messageText.trim() || messageAttachments.length > 0) ? '#fff' : '#94a3b8', fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', minHeight: '44px', cursor: (messageText.trim() || messageAttachments.length > 0) && !sendingMessage ? 'pointer' : 'not-allowed', opacity: sendingMessage ? 0.6 : 1 }}>
              {sendingMessage ? '...' : 'Send'}
            </button>
            {mediaEnabled && isRecordingSupported() && (
              <button onClick={() => setIsRecording(true)} title="Record voice note" style={{ padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
          )}
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div onClick={() => setLightboxImage(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}>
            <img src={lightboxImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
          </div>
        )}

        {/* CHAT MEDIA (Phase 2B): attachment menu — shared by both composers */}
        {attachSheetOpen && (
          <AttachSheet
            onClose={() => setAttachSheetOpen(false)}
            onPickPhoto={() => { setAttachSheetOpen(false); fileInputRef.current?.click(); }}
            onPickVideo={() => { setAttachSheetOpen(false); videoInputRef.current?.click(); }}
          />
        )}

        {/* Approval Modal */}
        {showApprovalModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', maxWidth: '480px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0' }}>Send Approval Request</h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Question</label>
                <input type="text" value={approvalQuestion} onChange={(e) => setApprovalQuestion(e.target.value)} placeholder="e.g., Which design do you prefer?" style={{ width: '100%', padding: '12px 14px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Selection Type</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" name="approvalType" checked={approvalType === 'single'} onChange={() => setApprovalType('single')} />
                    <span style={{ fontSize: '14px' }}>Single Choice</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="radio" name="approvalType" checked={approvalType === 'multi'} onChange={() => setApprovalType('multi')} />
                    <span style={{ fontSize: '14px' }}>Multiple Choice</span>
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Options</label>
                {approvalOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input type="text" value={opt} onChange={(e) => { const newOpts = [...approvalOptions]; newOpts[idx] = e.target.value; setApprovalOptions(newOpts); }} placeholder={`Option ${idx + 1}`} style={{ flex: 1, padding: '10px 12px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '8px', outline: 'none' }} />
                    {approvalOptions.length > 2 && <button onClick={() => setApprovalOptions(approvalOptions.filter((_, i) => i !== idx))} style={{ padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>✕</button>}
                  </div>
                ))}
                <button onClick={() => setApprovalOptions([...approvalOptions, ''])} style={{ padding: '8px 14px', fontSize: '13px', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>+ Add Option</button>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowApprovalModal(false); setApprovalQuestion(''); setApprovalOptions(['', '']); }} style={{ padding: '12px 20px', fontSize: '14px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSendApproval} disabled={sendingApproval} style={{ padding: '12px 20px', fontSize: '14px', fontWeight: '600', backgroundColor: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', cursor: sendingApproval ? 'not-allowed' : 'pointer', opacity: sendingApproval ? 0.6 : 1 }}>{sendingApproval ? 'Sending...' : 'Send'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Full Screen Chat Overlay */}
        {isChatFullScreen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#fff' }}>
              <button onClick={() => setIsChatFullScreen(false)} style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Discussion</h2>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{selectedTask.title}</p>
              </div>
              {approvals.length > 0 && (
                <button onClick={() => setShowOnlyApprovals(!showOnlyApprovals)} style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', backgroundColor: showOnlyApprovals ? '#fef3c7' : '#f1f5f9', color: showOnlyApprovals ? '#92400e' : '#64748b', border: showOnlyApprovals ? '2px solid #fbbf24' : '1px solid #e2e8f0', cursor: 'pointer' }}>
                  ✅ Approvals ({approvals.length})
                </button>
              )}
            </div>
            <div onScroll={(e) => {
              const el = e.currentTarget;
              const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
              isNearBottomRef.current = distFromBottom < 100;
              if (isNearBottomRef.current && showNewMsgBadge) setShowNewMsgBadge(false);
            }} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', position: 'relative' }}>
              {showNewMsgBadge && (
                <button onClick={() => { scrollToBottom(true); setShowNewMsgBadge(false); }} style={{ position: 'sticky', bottom: '10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#6366f1', color: '#fff', padding: '6px 16px', borderRadius: '20px', border: 'none', fontSize: '12px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', zIndex: 10, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7-7-7M19 6l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  New messages
                </button>
              )}
              {renderChatContent()}
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
              {mediaToast && (
                <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>{mediaToast}</div>
              )}
              {messageAttachments.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {messageAttachments.map((att, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img src={att.previewUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                      <button onClick={() => removeAttachment(idx)} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {isRecording && mediaEnabled ? (
                <VoiceRecorder onRecorded={handleRecorded} onCancel={handleRecordCancel} onError={handleRecordError} />
              ) : (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: 'none' }} />
                <button onClick={() => (mediaEnabled ? setAttachSheetOpen(true) : fileInputRef.current?.click())} disabled={messageAttachments.length >= 5} style={{ padding: '14px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer', minWidth: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Attach">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <textarea ref={fullscreenInputRef} value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }}} placeholder="Type a message..." style={{ flex: 1, padding: '14px 16px', fontSize: '15px', borderRadius: '14px', border: '2px solid #e2e8f0', outline: 'none', resize: 'none', minHeight: '48px', maxHeight: '120px', lineHeight: 1.4 }} />
                <button onClick={handleSendMessage} disabled={sendingMessage || (!messageText.trim() && messageAttachments.length === 0)} style={{ padding: '14px 20px', backgroundColor: '#6366f1', borderRadius: '14px', border: 'none', color: '#fff', fontWeight: '600', cursor: 'pointer', opacity: sendingMessage || (!messageText.trim() && messageAttachments.length === 0) ? 0.5 : 1 }}>
                  {sendingMessage ? '...' : 'Send'}
                </button>
                {mediaEnabled && isRecordingSupported() && (
                  <button onClick={() => setIsRecording(true)} title="Record voice note" style={{ padding: '14px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: 'pointer', minWidth: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {/* History Modal */}
        {historyModalApproval && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setHistoryModalApproval(null)}>
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', width: '100%', maxWidth: '420px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Selection History</h3>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>{historyModalApproval.title}</p>
                </div>
                <button onClick={() => setHistoryModalApproval(null)} style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {(historyModalApproval.selectionsHistory || []).length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '30px 0' }}>No selections yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {historyModalApproval.selectionsHistory.map((h, hIdx) => {
                      const isLatest = hIdx === historyModalApproval.selectionsHistory.length - 1;
                      return (
                        <div key={hIdx} style={{ padding: '14px', borderRadius: '12px', backgroundColor: isLatest ? '#f0fdf4' : '#f8fafc', border: isLatest ? '2px solid #22c55e' : '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '700', color: isLatest ? '#16a34a' : '#64748b', textTransform: 'uppercase' }}>{isLatest ? 'Current (Final)' : `v${hIdx + 1}`}</span>
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{new Date(h.timestamp).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          </div>
                          <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 6px 0', color: isLatest ? '#166534' : '#334155' }}>{h.selectedOptions?.join(', ') || 'No selection'}{isLatest && ' ✓'}</p>
                          <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>Selected by {h.selectedBy?.toLowerCase() || 'unknown'}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                <button onClick={() => setHistoryModalApproval(null)} style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600', backgroundColor: '#f1f5f9', color: '#334155', border: 'none', borderRadius: '12px', cursor: 'pointer' }}>Close</button>
              </div>
            </div>
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
