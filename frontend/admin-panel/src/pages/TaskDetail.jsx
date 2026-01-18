import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  
  // State
  const [task, setTask] = useState(null);
  const [originalTask, setOriginalTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
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
    endDate: ''
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
        endDate: taskData.endDate ? taskData.endDate.split('T')[0] : ''
      });
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
        endDate: originalTask.endDate ? originalTask.endDate.split('T')[0] : ''
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
        endDate: originalTask.endDate ? originalTask.endDate.split('T')[0] : ''
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
                  <div style={{ display: 'flex', gap: '10px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
        padding: '16px 24px', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
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
