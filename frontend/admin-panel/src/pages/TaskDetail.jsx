import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // State
  const [task, setTask] = useState(null);
  const [originalTask, setOriginalTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Final Delivery state (Phase 3)
  const [deliveryLink, setDeliveryLink] = useState('');
  const [deliveryText, setDeliveryText] = useState('');
  const [savingDelivery, setSavingDelivery] = useState(false);
  
  // Discussion state (Phase 6)
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const discussionRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Form state for editable fields
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    publicNotes: '',
    internalNotes: '',
    priority: 'Medium',
    status: 'PENDING',
    progress: 0,
    startDate: '',
    endDate: '',
    // Milestone & Progress Config
    milestones: [],
    autoCompletionCap: 100,
    icon: ''
  });

  // Status transition rules
  const STATUS_TRANSITIONS = {
    PENDING: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: []
  };

  const fetchTask = useCallback(async () => {
    try {
      const response = await api.get(`/admin/tasks/${taskId}`);
      
      const taskData = response.data.task;
      
      // HARD LOCK: PLANs cannot be viewed in TaskDetail
      if (taskData.isListedInPlans === true || taskData.status === 'LISTED') {
        setError('Plans are product listings. They do not have execution views.');
        setLoading(false);
        return;
      }
      setTask(taskData);
      setOriginalTask(taskData);
      
      // Initialize form data
      setFormData({
        title: taskData.title || '',
        description: taskData.description || '',
        publicNotes: taskData.publicNotes || '',
        internalNotes: taskData.internalNotes || '',
        priority: taskData.priority || 'Medium',
        status: taskData.status || 'PENDING',
        progress: taskData.progress || 0,
        startDate: taskData.startDate ? taskData.startDate.split('T')[0] : '',
        endDate: taskData.endDate ? taskData.endDate.split('T')[0] : '',
        // Milestone & Progress Config
        milestones: taskData.milestones || [],
        autoCompletionCap: taskData.autoCompletionCap || 100,
        icon: taskData.icon || ''
      });
      
      // Initialize delivery state (Phase 3)
      setDeliveryLink(taskData.finalDeliveryLink || '');
      setDeliveryText(taskData.finalDeliveryText || '');
    } catch (err) {
      console.error('Task fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Check for changes
  useEffect(() => {
    if (originalTask) {
      const changed = 
        formData.title !== (originalTask.title || '') ||
        formData.description !== (originalTask.description || '') ||
        formData.publicNotes !== (originalTask.publicNotes || '') ||
        formData.internalNotes !== (originalTask.internalNotes || '') ||
        formData.priority !== (originalTask.priority || 'Medium') ||
        formData.status !== (originalTask.status || 'PENDING') ||
        formData.progress !== (originalTask.progress || 0) ||
        formData.startDate !== (originalTask.startDate ? originalTask.startDate.split('T')[0] : '') ||
        formData.endDate !== (originalTask.endDate ? originalTask.endDate.split('T')[0] : '');
      setHasChanges(changed);
    }
  }, [formData, originalTask]);

  // Auto-scroll to discussion if scrollToChat=true
  useEffect(() => {
    if (!loading && task && searchParams.get('scrollToChat') === 'true' && discussionRef.current) {
      setTimeout(() => {
        discussionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [loading, task, searchParams]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = (newStatus) => {
    const currentStatus = originalTask?.status || 'PENDING';
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    
    if (newStatus === currentStatus) {
      return; // No change
    }
    
    if (!allowedTransitions.includes(newStatus)) {
      setToast({ type: 'error', message: `Cannot change from ${currentStatus} to ${newStatus}` });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    setFormData(prev => ({ ...prev, status: newStatus }));
  };

  const handleSave = async () => {
    // Validate milestones - check for duplicates
    const percentages = formData.milestones.map(m => m.percentage);
    const hasDuplicates = percentages.length !== new Set(percentages).size;
    if (hasDuplicates) {
      setToast({ type: 'error', message: 'Milestone percentages must be unique' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    
    const payload = {};
    
    // Only include changed fields
    if (formData.title !== originalTask.title) payload.title = formData.title;
    if (formData.description !== originalTask.description) payload.description = formData.description;
    if (formData.publicNotes !== originalTask.publicNotes) payload.publicNotes = formData.publicNotes;
    if (formData.internalNotes !== originalTask.internalNotes) payload.internalNotes = formData.internalNotes;
    if (formData.priority !== originalTask.priority) payload.priority = formData.priority;
    if (formData.progress !== originalTask.progress) {
      payload.progress = Number(formData.progress);
      payload.progressMode = 'MANUAL';
    }
    if (formData.startDate !== (originalTask.startDate ? originalTask.startDate.split('T')[0] : '')) {
      payload.startDate = formData.startDate || null;
    }
    if (formData.endDate !== (originalTask.endDate ? originalTask.endDate.split('T')[0] : '')) {
      payload.endDate = formData.endDate || null;
    }
    
    // Milestone & Progress Config - Always include if changed
    if (JSON.stringify(formData.milestones) !== JSON.stringify(originalTask.milestones || [])) {
      payload.milestones = formData.milestones;
    }
    if (formData.autoCompletionCap !== (originalTask.autoCompletionCap || 100)) {
      payload.autoCompletionCap = Number(formData.autoCompletionCap);
    }
    if (formData.icon !== (originalTask.icon || '')) {
      payload.icon = formData.icon;
    }
    
    // Handle status change separately (uses different endpoint)
    const statusChanged = formData.status !== originalTask.status;
    
    setSaving(true);
    
    try {
      // Update general fields first
      if (Object.keys(payload).length > 0) {
        const updateResponse = await api.patch(`/admin/tasks/${taskId}`, payload);
      }
      
      // Update status if changed
      if (statusChanged) {
        const statusPayload = { status: formData.status };
        if (formData.progress !== originalTask.progress) {
          statusPayload.progress = Number(formData.progress);
        }
        await api.patch(`/admin/tasks/${taskId}/status`, statusPayload);
      }
      
      // Refresh task data
      await fetchTask();
      
      setToast({ type: 'success', message: 'Task updated successfully' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Update error:', err.response?.data || err.message);
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to update task' });
      setTimeout(() => setToast(null), 4000);
      
      // Revert form data on error
      setFormData({
        title: originalTask.title || '',
        description: originalTask.description || '',
        publicNotes: originalTask.publicNotes || '',
        internalNotes: originalTask.internalNotes || '',
        priority: originalTask.priority || 'Medium',
        status: originalTask.status || 'PENDING',
        progress: originalTask.progress || 0,
        startDate: originalTask.startDate ? originalTask.startDate.split('T')[0] : '',
        endDate: originalTask.endDate ? originalTask.endDate.split('T')[0] : '',
        milestones: originalTask.milestones || [],
        autoCompletionCap: originalTask.autoCompletionCap || 100,
        icon: originalTask.icon || ''
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      setFormData({
        title: originalTask.title || '',
        description: originalTask.description || '',
        publicNotes: originalTask.publicNotes || '',
        internalNotes: originalTask.internalNotes || '',
        priority: originalTask.priority || 'Medium',
        status: originalTask.status || 'PENDING',
        progress: originalTask.progress || 0,
        startDate: originalTask.startDate ? originalTask.startDate.split('T')[0] : '',
        endDate: originalTask.endDate ? originalTask.endDate.split('T')[0] : '',
        milestones: originalTask.milestones || [],
        autoCompletionCap: originalTask.autoCompletionCap || 100,
        icon: originalTask.icon || ''
      });
      setToast({ type: 'info', message: 'Changes discarded' });
      setTimeout(() => setToast(null), 2000);
    } else {
      navigate('/tasks');
    }
  };

  const handleReopenTask = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/tasks/${taskId}/reopen`);
      await fetchTask();
      setToast({ type: 'success', message: 'Task reopened successfully' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to reopen task' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Save Final Delivery (Phase 3)
  const handleSaveDelivery = async () => {
    if (!deliveryLink.trim()) {
      setToast({ type: 'error', message: 'Please enter a delivery link' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setSavingDelivery(true);
    try {
      await api.patch(`/admin/tasks/${taskId}`, {
        finalDeliveryLink: deliveryLink.trim(),
        finalDeliveryText: deliveryText.trim(),
        finalDeliveredAt: new Date().toISOString()
      });
      await fetchTask();
      setToast({ type: 'success', message: 'Delivery saved successfully' });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to save delivery' });
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSavingDelivery(false);
    }
  };

  // Send discussion message (Phase 6)
  const handleSendMessage = async () => {
    if ((!messageText.trim() && messageAttachments.length === 0) || sendingMessage) return;
    
    setSendingMessage(true);
    try {
      let attachmentUrls = [];
      
      // STEP 1: Upload images first if any
      if (messageAttachments.length > 0) {
        try {
          const formData = new FormData();
          messageAttachments.forEach(att => formData.append('images', att.file));
          const uploadRes = await api.post('/upload/chat', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
          attachmentUrls = uploadRes.data?.urls || [];
          
          // If upload returned no URLs, fail
          if (messageAttachments.length > 0 && attachmentUrls.length === 0) {
            throw new Error('Image upload failed - no URLs returned');
          }
        } catch (uploadErr) {
          setToast({ type: 'error', message: 'Failed to upload image' });
          setTimeout(() => setToast(null), 3000);
          setSendingMessage(false);
          return; // DO NOT send message
        }
      }
      
      // STEP 2: Only send message after successful upload
      await api.post(`/admin/tasks/${taskId}/message`, { 
        text: messageText.trim() || (attachmentUrls.length > 0 ? '[Image]' : ''),
        attachments: attachmentUrls
      });
      
      // Cleanup preview URLs
      messageAttachments.forEach(att => URL.revokeObjectURL(att.previewUrl));
      setMessageText('');
      setMessageAttachments([]);
      await fetchTask(); // Refresh to get new message
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.error || 'Failed to send message' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle image selection for chat
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

  // Remove attachment and cleanup preview URL
  const removeAttachment = (idx) => {
    setMessageAttachments(prev => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
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

  // Helper functions
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getStatusStyle = (status) => {
    const styles = {
      PENDING: { bg: '#fef3c7', color: '#92400e', border: '#fbbf24' },
      ACTIVE: { bg: '#dbeafe', color: '#1d4ed8', border: '#3b82f6' },
      COMPLETED: { bg: '#dcfce7', color: '#15803d', border: '#22c55e' },
      CANCELLED: { bg: '#f3f4f6', color: '#6b7280', border: '#9ca3af' }
    };
    return styles[status] || styles.PENDING;
  };

  const getPriorityStyle = (priority) => {
    const styles = {
      High: { bg: '#fee2e2', color: '#dc2626', border: '#f87171' },
      Medium: { bg: '#e0e7ff', color: '#4338ca', border: '#818cf8' },
      Low: { bg: '#f3f4f6', color: '#6b7280', border: '#9ca3af' }
    };
    return styles[priority] || styles.Medium;
  };

  // Loading skeleton
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
          {/* Header Skeleton */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ width: '60%', height: '32px', backgroundColor: '#e2e8f0', borderRadius: '8px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ width: '80px', height: '28px', backgroundColor: '#e2e8f0', borderRadius: '14px', animation: 'pulse 1.5s infinite' }} />
              <div style={{ width: '80px', height: '28px', backgroundColor: '#e2e8f0', borderRadius: '14px', animation: 'pulse 1.5s infinite' }} />
            </div>
          </div>
          
          {/* Content Skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
            <div>
              {[1,2,3].map(i => (
                <div key={i} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ width: '40%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ width: '100%', height: '48px', backgroundColor: '#f1f5f9', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
                </div>
              ))}
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', height: 'fit-content', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ width: '60%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '6px', marginBottom: '24px', animation: 'pulse 1.5s infinite' }} />
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#e2e8f0', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ flex: 1, height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    const isPlanError = error.includes('Plans are product listings');
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: isPlanError ? '#fef3c7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={isPlanError ? '#f59e0b' : '#dc2626'} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
            {isPlanError ? 'This is a Plan, Not a Task' : 'Failed to Load Task'}
          </h2>
          <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/tasks')}
              style={{ padding: '12px 24px', backgroundColor: '#f1f5f9', color: '#475569', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
            >
              Back to Tasks
            </button>
            {isPlanError && (
              <button
                onClick={() => navigate('/plans')}
                style={{ padding: '12px 24px', backgroundColor: '#6366f1', color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
              >
                View Plans
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const statusStyle = getStatusStyle(task.status);
  const priorityStyle = getPriorityStyle(task.priority);
  const allowedTransitions = STATUS_TRANSITIONS[originalTask?.status || 'PENDING'] || [];
  const isTerminal = task.status === 'COMPLETED' || task.status === 'CANCELLED';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#6366f1',
          color: '#fff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, animation: 'slideDown 0.3s ease'
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Back Button */}
        <button
          onClick={() => navigate('/tasks')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', marginBottom: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontWeight: '500' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Tasks
        </button>

        {/* Task Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0', lineHeight: 1.3 }}>{task.title}</h1>
              <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
                Client: <span style={{ fontWeight: '600', color: '#334155' }}>{task.clientIdentifier || `#${task.clientId?.slice(-6)}`}</span>
                <span style={{ margin: '0 12px', color: '#cbd5e1' }}>•</span>
                ID: <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{task.id?.slice(-8)}</span>
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                padding: '8px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                backgroundColor: statusStyle.bg, color: statusStyle.color, border: `2px solid ${statusStyle.border}`
              }}>
                {task.status}
              </span>
              <span style={{
                padding: '8px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                backgroundColor: priorityStyle.bg, color: priorityStyle.color, border: `2px solid ${priorityStyle.border}`
              }}>
                {task.priority} Priority
              </span>
            </div>
          </div>
        </div>

        {/* CLIENT DISCUSSION (Phase 6) - MOVED TO TOP */}
        <div ref={discussionRef} style={{
          backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Client Discussion</h3>
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>Chat history with client</p>
            </div>
            {task.messages && task.messages.length > 0 && (
              <span style={{ marginLeft: 'auto', padding: '4px 10px', backgroundColor: '#eff6ff', color: '#3b82f6', fontSize: '11px', fontWeight: '600', borderRadius: '8px' }}>
                {task.messages.length} message{task.messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Messages */}
          <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '12px', padding: '4px' }}>
            {(!task.messages || task.messages.length === 0) ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '30px 0' }}>
                No messages yet
              </p>
            ) : (
              task.messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  justifyContent: msg.sender === 'ADMIN' ? 'flex-end' : 'flex-start',
                  marginBottom: '10px'
                }}>
                  <div style={{
                    maxWidth: '70%', padding: '10px 14px', borderRadius: '14px',
                    backgroundColor: msg.sender === 'ADMIN' ? '#6366f1' : '#f1f5f9',
                    color: msg.sender === 'ADMIN' ? '#fff' : '#0f172a',
                  }}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: msg.text && msg.text !== '[Image]' ? '6px' : 0 }}>
                        {msg.attachments.map((att, attIdx) => (
                          <img 
                            key={attIdx} 
                            src={att} 
                            alt="" 
                            onClick={() => setLightboxImage(att)}
                            style={{ maxWidth: '160px', maxHeight: '120px', borderRadius: '6px', cursor: 'pointer', objectFit: 'cover' }} 
                          />
                        ))}
                      </div>
                    )}
                    {msg.text && msg.text !== '[Image]' && (
                      <p style={{ fontSize: '13px', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{linkifyText(msg.text)}</p>
                    )}
                    <p style={{ 
                      fontSize: '10px', margin: '5px 0 0', 
                      color: msg.sender === 'ADMIN' ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                      textAlign: 'right'
                    }}>
                      {msg.sender === 'CLIENT' ? 'Client • ' : ''}
                      {new Date(msg.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div>
            {/* Attachment Preview */}
            {messageAttachments.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                {messageAttachments.map((att, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img src={att.previewUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '6px', objectFit: 'cover' }} />
                    <button 
                      onClick={() => removeAttachment(idx)}
                      style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={messageAttachments.length >= 5}
                style={{
                  padding: '10px', backgroundColor: '#f1f5f9', borderRadius: '12px', border: 'none',
                  cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer', opacity: messageAttachments.length >= 5 ? 0.5 : 1
                }}
                title="Attach image"
              >
                📎
              </button>
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Reply to client..."
                rows={2}
                style={{
                  flex: 1, padding: '10px 14px', fontSize: '13px',
                  border: '2px solid #e2e8f0', borderRadius: '12px',
                  outline: 'none', resize: 'none', lineHeight: 1.5
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              />
              <button
                onClick={handleSendMessage}
                disabled={(!messageText.trim() && messageAttachments.length === 0) || sendingMessage}
                style={{
                  padding: '10px 16px', backgroundColor: (messageText.trim() || messageAttachments.length > 0) ? '#6366f1' : '#e2e8f0',
                  color: (messageText.trim() || messageAttachments.length > 0) ? '#fff' : '#94a3b8', fontSize: '13px', fontWeight: '600',
                  borderRadius: '12px', border: 'none',
                  cursor: (messageText.trim() || messageAttachments.length > 0) && !sendingMessage ? 'pointer' : 'not-allowed',
                  opacity: sendingMessage ? 0.6 : 1
                }}
              >
                {sendingMessage ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div 
            onClick={() => setLightboxImage(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}
          >
            <img src={lightboxImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
          </div>
        )}

        {/* Main Content Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {/* Left Column - Editable Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 900 ? '1fr 380px' : '1fr', gap: '24px' }}>
            <div>
              {/* Basic Information Section */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Basic Information</h2>
                </div>

                {/* Title */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Task Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    style={{ width: '100%', padding: '14px 16px', fontSize: '15px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box', transition: 'all 0.2s' }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.backgroundColor = '#fff'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                  />
                </div>

                {/* Short Description */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Short Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Brief summary..."
                    style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box', transition: 'all 0.2s' }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.backgroundColor = '#fff'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                  />
                </div>

                {/* Detailed Description / Public Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Detailed Description</label>
                  <textarea
                    value={formData.publicNotes}
                    onChange={(e) => handleInputChange('publicNotes', e.target.value)}
                    placeholder="Add detailed requirements, deliverables..."
                    rows={4}
                    style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: '#f8fafc', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', transition: 'all 0.2s' }}
                    onFocus={(e) => { e.target.style.borderColor = '#6366f1'; e.target.style.backgroundColor = '#fff'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                  />
                </div>
              </div>

              {/* Status & Progress Section */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Status & Progress</h2>
                </div>

                {/* Status */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
                    Status
                    {isTerminal && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>(Terminal state - cannot change)</span>}
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {['PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map(status => {
                      const sStyle = getStatusStyle(status);
                      const isCurrentOriginal = originalTask?.status === status;
                      const isSelected = formData.status === status;
                      const canSelect = isCurrentOriginal || allowedTransitions.includes(status);
                      
                      return (
                        <button
                          key={status}
                          onClick={() => canSelect && handleStatusChange(status)}
                          disabled={!canSelect}
                          style={{
                            padding: '10px 18px', fontSize: '12px', fontWeight: '700', borderRadius: '10px',
                            border: isSelected ? `2px solid ${sStyle.border}` : '2px solid transparent',
                            backgroundColor: sStyle.bg, color: sStyle.color,
                            opacity: canSelect ? 1 : 0.4,
                            cursor: canSelect ? 'pointer' : 'not-allowed',
                            transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                            transition: 'all 0.2s'
                          }}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                  {isTerminal && (
                    <button
                      onClick={handleReopenTask}
                      disabled={saving}
                      style={{ marginTop: '16px', padding: '10px 20px', backgroundColor: '#f59e0b', color: '#fff', fontSize: '13px', fontWeight: '600', borderRadius: '10px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                    >
                      Reopen Task
                    </button>
                  )}
                </div>

                {/* Priority */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>Priority</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {['Low', 'Medium', 'High'].map(priority => {
                      const pStyle = getPriorityStyle(priority);
                      const isSelected = formData.priority === priority;
                      
                      return (
                        <button
                          key={priority}
                          onClick={() => handleInputChange('priority', priority)}
                          style={{
                            padding: '10px 18px', fontSize: '12px', fontWeight: '700', borderRadius: '10px',
                            border: isSelected ? `2px solid ${pStyle.border}` : '2px solid transparent',
                            backgroundColor: pStyle.bg, color: pStyle.color,
                            cursor: 'pointer', transform: isSelected ? 'scale(1.02)' : 'scale(1)', transition: 'all 0.2s'
                          }}
                        >
                          {priority}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Progress Slider */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '12px' }}>
                    Progress: <span style={{ fontSize: '16px', color: '#0f172a' }}>{formData.progress}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.progress}
                    onChange={(e) => handleInputChange('progress', Number(e.target.value))}
                    style={{ width: '100%', height: '8px', borderRadius: '4px', background: `linear-gradient(to right, #6366f1 ${formData.progress}%, #e2e8f0 ${formData.progress}%)`, appearance: 'none', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>0%</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>100%</span>
                  </div>
                </div>
              </div>

              {/* Dates Section */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Timeline</h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => handleInputChange('startDate', e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>End Date</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => handleInputChange('endDate', e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              {/* Milestones & Progress Config Section */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Milestones & Progress Config</h2>
                </div>

                {/* Icon */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Task Icon</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '32px' }}>{formData.icon || '📋'}</span>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) => handleInputChange('icon', e.target.value)}
                      placeholder="Enter emoji (e.g., 📊)"
                      style={{ flex: 1, padding: '10px 14px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                {/* Auto Completion Cap */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Auto Completion Cap (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={formData.autoCompletionCap}
                    onChange={(e) => handleInputChange('autoCompletionCap', Number(e.target.value))}
                    style={{ width: '120px', padding: '10px 14px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Maximum auto-progress percentage</p>
                </div>

                {/* Milestones Editor */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Milestones</label>
                    <button
                      type="button"
                      onClick={() => {
                        const newMilestones = [...formData.milestones, { name: '', percentage: 0, color: '#6366f1' }];
                        handleInputChange('milestones', newMilestones);
                      }}
                      style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#6366f1', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>+</span> Add Milestone
                    </button>
                  </div>

                  {formData.milestones.length === 0 ? (
                    <div style={{ padding: '24px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', border: '2px dashed #e2e8f0' }}>
                      <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No milestones defined. Click "Add Milestone" to create one.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[...formData.milestones]
                        .sort((a, b) => (a.percentage || 0) - (b.percentage || 0))
                        .map((milestone, idx) => {
                          const originalIdx = formData.milestones.findIndex(m => m === milestone);
                          return (
                            <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                              {/* Color Picker */}
                              <input
                                type="color"
                                value={milestone.color || '#6366f1'}
                                onChange={(e) => {
                                  const updated = [...formData.milestones];
                                  updated[originalIdx] = { ...updated[originalIdx], color: e.target.value };
                                  handleInputChange('milestones', updated);
                                }}
                                style={{ width: '32px', height: '32px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
                              />
                              {/* Name */}
                              <input
                                type="text"
                                value={milestone.name || ''}
                                placeholder="Milestone name"
                                onChange={(e) => {
                                  const updated = [...formData.milestones];
                                  updated[originalIdx] = { ...updated[originalIdx], name: e.target.value };
                                  handleInputChange('milestones', updated);
                                }}
                                style={{ flex: 1, padding: '8px 12px', fontSize: '13px', border: '1px solid #e2e8f0', borderRadius: '8px', outline: 'none', backgroundColor: '#fff' }}
                              />
                              {/* Percentage */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {(() => {
                                  const otherPercentages = formData.milestones
                                    .filter((_, i) => i !== originalIdx)
                                    .map(m => m.percentage);
                                  const isDuplicate = otherPercentages.includes(milestone.percentage);
                                  return (
                                    <>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={milestone.percentage || 0}
                                        onChange={(e) => {
                                          let val = Number(e.target.value);
                                          if (val > 100) val = 100;
                                          if (val < 0) val = 0;
                                          const updated = [...formData.milestones];
                                          updated[originalIdx] = { ...updated[originalIdx], percentage: val };
                                          handleInputChange('milestones', updated);
                                        }}
                                        style={{ 
                                          width: '70px', padding: '8px 10px', fontSize: '13px', 
                                          border: isDuplicate ? '2px solid #ef4444' : '1px solid #e2e8f0', 
                                          borderRadius: '8px', outline: 'none', backgroundColor: isDuplicate ? '#fef2f2' : '#fff', textAlign: 'center' 
                                        }}
                                      />
                                      <span style={{ fontSize: '13px', color: '#64748b' }}>%</span>
                                      {isDuplicate && <span style={{ fontSize: '10px', color: '#ef4444', marginLeft: '4px' }}>dup</span>}
                                    </>
                                  );
                                })()}
                              </div>
                              {/* Remove Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = formData.milestones.filter((_, i) => i !== originalIdx);
                                  handleInputChange('milestones', updated);
                                }}
                                style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
                                title="Remove milestone"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Milestones are sorted by percentage automatically</p>
                </div>
              </div>

              {/* Internal Notes Section */}
              <div style={{ backgroundColor: '#fffbeb', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '2px solid #fcd34d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#92400e', margin: 0 }}>Internal Notes</h2>
                    <p style={{ fontSize: '12px', color: '#b45309', margin: '4px 0 0 0' }}>Admin only - not visible to client</p>
                  </div>
                </div>

                <textarea
                  value={formData.internalNotes}
                  onChange={(e) => handleInputChange('internalNotes', e.target.value)}
                  placeholder="Add private notes, reminders, or admin comments..."
                  rows={4}
                  style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #fcd34d', borderRadius: '12px', outline: 'none', backgroundColor: '#fff', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
              </div>

              {/* FINAL DELIVERY SECTION (Phase 3) */}
              <div style={{ backgroundColor: task.finalDeliveryLink ? '#f0fdf4' : '#fff', borderRadius: '20px', padding: '28px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: task.finalDeliveryLink ? '2px solid #22c55e' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: task.finalDeliveryLink ? '#dcfce7' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={task.finalDeliveryLink ? '#22c55e' : '#64748b'} strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Final Delivery Folder</h2>
                  </div>
                  {task.finalDeliveryLink && (
                    <span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d' }}>
                      ✓ Delivered
                    </span>
                  )}
                </div>

                {/* Show existing delivery info */}
                {task.finalDeliveryLink && task.finalDeliveredAt && (
                  <div style={{ padding: '14px 16px', backgroundColor: '#fff', borderRadius: '12px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px' }}>Delivered on</p>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#15803d', margin: 0 }}>{formatDateTime(task.finalDeliveredAt)}</p>
                  </div>
                )}

                {/* Delivery Folder Link Input */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Delivery Folder Link *</label>
                  <input
                    type="url"
                    value={deliveryLink}
                    onChange={(e) => setDeliveryLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    disabled={task.status === 'COMPLETED'}
                    style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: task.status === 'COMPLETED' ? '#f8fafc' : '#fff', boxSizing: 'border-box', opacity: task.status === 'COMPLETED' ? 0.7 : 1 }}
                  />
                </div>

                {/* Delivery Notes */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>Delivery Notes (optional)</label>
                  <textarea
                    value={deliveryText}
                    onChange={(e) => setDeliveryText(e.target.value)}
                    placeholder="Instructions for the client..."
                    rows={3}
                    disabled={task.status === 'COMPLETED'}
                    style={{ width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px', outline: 'none', backgroundColor: task.status === 'COMPLETED' ? '#f8fafc' : '#fff', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box', opacity: task.status === 'COMPLETED' ? 0.7 : 1 }}
                  />
                </div>

                {/* Save Button */}
                {task.status !== 'COMPLETED' ? (
                  <button
                    onClick={handleSaveDelivery}
                    disabled={savingDelivery || !deliveryLink.trim()}
                    style={{
                      width: '100%', padding: '14px 20px',
                      background: deliveryLink.trim() ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : '#e2e8f0',
                      color: deliveryLink.trim() ? '#fff' : '#94a3b8',
                      fontSize: '14px', fontWeight: '600', borderRadius: '12px', border: 'none',
                      cursor: deliveryLink.trim() && !savingDelivery ? 'pointer' : 'not-allowed',
                      opacity: savingDelivery ? 0.6 : 1, transition: 'all 0.2s'
                    }}
                  >
                    {savingDelivery ? 'Saving...' : (task.finalDeliveryLink ? 'Update Delivery' : 'Save Delivery')}
                  </button>
                ) : (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, textAlign: 'center' }}>Editing disabled for COMPLETED tasks</p>
                )}
              </div>
            </div>

            {/* Right Sidebar */}
            <div>
              {/* Wallet / Credits Section */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v12M9 9h6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Wallet Deduction</h3>
                </div>

                <div style={{ backgroundColor: '#f0fdf4', borderRadius: '14px', padding: '16px', border: '1px solid #bbf7d0' }}>
                  <p style={{ fontSize: '12px', color: '#166534', margin: '0 0 8px 0', fontWeight: '500' }}>Credits Charged</p>
                  <p style={{ fontSize: '28px', fontWeight: '800', color: '#15803d', margin: 0 }}>₹{task.creditCost || task.creditsUsed || 0}</p>
                </div>

                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px', marginBottom: 0 }}>
                  This amount was deducted from the client's wallet when the task was created.
                </p>
              </div>

              {/* Activity Timeline */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Activity Timeline</h3>
                </div>

                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                  {/* Timeline line */}
                  <div style={{ position: 'absolute', left: '7px', top: '8px', bottom: '8px', width: '2px', backgroundColor: '#e2e8f0' }} />
                  
                  {/* Created */}
                  <div style={{ position: 'relative', marginBottom: '20px' }}>
                    <div style={{ position: 'absolute', left: '-24px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#22c55e', border: '3px solid #dcfce7' }} />
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>Task Created</p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{formatDateTime(task.createdAt)}</p>
                  </div>

                  {/* Last Updated */}
                  {task.updatedAt && task.updatedAt !== task.createdAt && (
                    <div style={{ position: 'relative', marginBottom: '20px' }}>
                      <div style={{ position: 'absolute', left: '-24px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#6366f1', border: '3px solid #e0e7ff' }} />
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>Last Updated</p>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{formatDateTime(task.updatedAt)}</p>
                    </div>
                  )}

                  {/* Current Status */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-24px', top: '4px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: statusStyle.border, border: `3px solid ${statusStyle.bg}` }} />
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>Current Status</p>
                    <p style={{ fontSize: '12px', color: statusStyle.color, fontWeight: '600', margin: 0 }}>{task.status}</p>
                  </div>
                </div>

                {/* Progress Mode Badge */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>Progress Mode</p>
                  <span style={{
                    display: 'inline-block', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                    backgroundColor: task.progressMode === 'AUTO' ? '#dbeafe' : '#f3e8ff',
                    color: task.progressMode === 'AUTO' ? '#1d4ed8' : '#7c3aed'
                  }}>
                    {task.progressMode || 'AUTO'}
                  </span>
                </div>
              </div>

              {/* CLIENT SUBMITTED CONTENT (Phase 2) */}
              <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '24px', marginTop: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: task.clientContentSubmitted ? '2px solid #bbf7d0' : (task.requireClientContent ? '2px solid #fbbf24' : '1px solid #f1f5f9') }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: task.requireClientContent && !task.clientContentSubmitted ? '#fef3c7' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={task.requireClientContent && !task.clientContentSubmitted ? '#d97706' : '#22c55e'} strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round" />
                        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round" />
                      </svg>
                    </div>
                    <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Client Submitted Content</h3>
                  </div>
                  {task.clientContentSubmitted && (
                    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d' }}>
                      ✓ Received
                    </span>
                  )}
                </div>

                {task.clientContentSubmitted ? (
                  <>
                    {/* Submitted Text */}
                    {task.clientContentText && (
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content / Instructions</label>
                        <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: '10px', fontSize: '13px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflowY: 'auto' }}>
                          {task.clientContentText}
                        </div>
                      </div>
                    )}

                    {/* Client Content Folder */}
                    {task.clientDriveLink && (
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Content Folder</label>
                        <a
                          href={task.clientDriveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            padding: '12px 16px', backgroundColor: '#3b82f6', borderRadius: '10px', 
                            fontSize: '13px', fontWeight: '600', color: '#fff', textDecoration: 'none',
                            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Open Client Content Folder
                        </a>
                      </div>
                    )}

                    {/* Additional Links */}
                    {task.clientContentLinks && task.clientContentLinks.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additional Links</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {task.clientContentLinks.map((link, idx) => (
                            <a
                              key={idx}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'block', padding: '8px 12px', backgroundColor: '#f1f5f9', borderRadius: '8px', fontSize: '12px', color: '#6366f1', textDecoration: 'none', wordBreak: 'break-all' }}
                            >
                              {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Submitted Timestamp */}
                    {task.clientContentSubmittedAt && (
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, textAlign: 'right' }}>
                        Submitted: {formatDateTime(task.clientContentSubmittedAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '20px', backgroundColor: task.requireClientContent ? '#fef3c7' : '#f8fafc', borderRadius: '12px', textAlign: 'center', border: task.requireClientContent ? '2px solid #fcd34d' : '2px dashed #e2e8f0' }}>
                    {task.requireClientContent ? (
                      <>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ margin: '0 auto 10px' }}>
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6M12 14.5v1.5" strokeLinecap="round" />
                        </svg>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: '0 0 4px' }}>Waiting for client content</p>
                        <p style={{ fontSize: '12px', color: '#b45309', margin: 0 }}>Content required before work can start</p>
                      </>
                    ) : (
                      <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Client has not submitted content yet</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
        padding: '16px', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 50
      }}>
        <div>
          {hasChanges && (
            <span style={{ fontSize: '13px', color: '#f59e0b', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              Unsaved changes
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleCancel}
            disabled={saving}
            style={{
              padding: '12px 24px', fontSize: '14px', fontWeight: '600', borderRadius: '12px',
              border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#475569',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, transition: 'all 0.2s'
            }}
          >
            {hasChanges ? 'Discard' : 'Back'}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{
              padding: '12px 32px', fontSize: '14px', fontWeight: '600', borderRadius: '12px',
              border: 'none', backgroundColor: hasChanges ? '#6366f1' : '#cbd5e1', color: '#fff',
              cursor: (!hasChanges || saving) ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            {saving && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #6366f1; cursor: pointer; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        input[type="range"]::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #6366f1; cursor: pointer; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
      `}</style>
    </div>
  );
};

export default TaskDetail;
