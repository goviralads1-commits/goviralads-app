import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import api from '../services/api';
import Header from '../components/Header';
import ProgressWithFlag from '../components/ProgressWithFlag';

// Utility: Clean description - handles HTML and plain text
const formatDescription = (desc) => {
  if (!desc || typeof desc !== 'string') return null;
  
  // Check if contains HTML tags
  const hasHtml = /<[^>]+>/.test(desc);
  
  if (hasHtml) {
    // For legacy HTML content - sanitize and strip tags for clean display
    const clean = DOMPurify.sanitize(desc, { ALLOWED_TAGS: [] });
    return clean.trim() || null;
  }
  
  // Plain text - return as-is
  return desc.trim() || null;
};

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [task, setTask] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  
  // Content submission state (Phase 2)
  const [contentText, setContentText] = useState('');
  const [contentLinks, setContentLinks] = useState(['']);
  const [driveLink, setDriveLink] = useState('');
  const [submittingContent, setSubmittingContent] = useState(false);
  const [contentToast, setContentToast] = useState(null);
  
  // User default folder (Phase 4A+)
  const [userDefaultFolder, setUserDefaultFolder] = useState('');
  
  // Discussion state (Phase 6)
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const discussionRef = useRef(null);

  const fetchTask = useCallback(async () => {
    try {
      const [taskResponse, receiptResponse] = await Promise.all([
        api.get(`/client/tasks/${taskId}`),
        api.get(`/client/tasks/${taskId}/receipt`).catch(() => ({ data: { receipt: null } }))
      ]);
      setTask(taskResponse.data.task);
      setReceipt(receiptResponse.data.receipt);
      setError('');
    } catch (err) {
      console.error('Task detail error:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const handleDownloadReceipt = async () => {
    if (!receipt) return;
    setDownloadingReceipt(true);
    try {
      const response = await api.get(`/client/billing/receipts/${receipt._id}/pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `receipt-${receipt.receiptNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Receipt download error:', err);
      // Silent fail - user can try again
    } finally {
      setDownloadingReceipt(false);
    }
  };

  // Handle content submission (Phase 2)
  const handleContentSubmit = async () => {
    // Prevent multiple clicks
    if (submittingContent) return;
    
    if (!contentText.trim() && !driveLink.trim() && contentLinks.every(l => !l.trim())) {
      setContentToast({ type: 'error', message: 'Please add some content before submitting' });
      setTimeout(() => setContentToast(null), 3000);
      return;
    }

    setSubmittingContent(true);
    try {
      const payload = {
        contentText: contentText.trim(),
        contentLinks: contentLinks.filter(l => l.trim()),
        driveLink: driveLink.trim()
      };
      
      await api.post(`/client/tasks/${taskId}/content`, payload);
      
      setContentToast({ type: 'success', message: 'Content submitted successfully!' });
      setTimeout(() => setContentToast(null), 3000);
      
      // Refresh task to get updated content fields
      fetchTask();
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to submit content';
      setContentToast({ type: 'error', message: errorMsg });
      setTimeout(() => setContentToast(null), 4000);
    } finally {
      setSubmittingContent(false);
    }
  };

  // Add content link field
  const addContentLink = () => {
    if (contentLinks.length < 10) {
      setContentLinks([...contentLinks, '']);
    }
  };

  // Update content link
  const updateContentLink = (index, value) => {
    const updated = [...contentLinks];
    updated[index] = value;
    setContentLinks(updated);
  };

  // Remove content link
  const removeContentLink = (index) => {
    if (contentLinks.length > 1) {
      setContentLinks(contentLinks.filter((_, i) => i !== index));
    }
  };

  // Send discussion message (Phase 6)
  const handleSendMessage = async () => {
    if (!messageText.trim() || sendingMessage) return;
    
    setSendingMessage(true);
    try {
      await api.post(`/client/tasks/${taskId}/message`, { text: messageText.trim() });
      setMessageText('');
      fetchTask(); // Refresh to get new message
    } catch (err) {
      setContentToast({ type: 'error', message: err.response?.data?.error || 'Failed to send message' });
      setTimeout(() => setContentToast(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Fetch user default folder and prefill (Phase 4A+)
  useEffect(() => {
    const fetchUserDefaults = async () => {
      try {
        const res = await api.get('/client/profile');
        const defaultFolder = res.data.profile?.defaultContentFolder || '';
        setUserDefaultFolder(defaultFolder);
      } catch (err) {
        // Silent fail - user can still enter manually
      }
    };
    fetchUserDefaults();
  }, []);

  // Prefill drive link with user default if task has no content yet
  useEffect(() => {
    if (task && !task.clientContentSubmitted && !task.clientDriveLink && userDefaultFolder && !driveLink) {
      setDriveLink(userDefaultFolder);
    }
  }, [task, userDefaultFolder]);

  // Auto-scroll to discussion if scrollToChat=true
  useEffect(() => {
    if (!loading && task && searchParams.get('scrollToChat') === 'true' && discussionRef.current) {
      setTimeout(() => {
        discussionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [loading, task, searchParams]);

  // Human-readable status labels (hide internal codes)
  const getHumanStatus = (status) => {
    const labels = {
      PENDING_APPROVAL: { label: 'Pending Admin Approval', color: '#6366f1', bg: '#eef2ff' },
      PENDING: { label: 'Scheduled', color: '#f59e0b', bg: '#fffbeb' },
      ACTIVE: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff' },
      COMPLETED: { label: 'Delivered', color: '#22c55e', bg: '#f0fdf4' },
      CANCELLED: { label: 'Cancelled', color: '#6b7280', bg: '#f9fafb' }
    };
    return labels[status] || { label: status, color: '#64748b', bg: '#f1f5f9' };
  };

  // Get active milestone from task
  const getActiveMilestone = (milestones, progress) => {
    if (!milestones || milestones.length === 0) return null;
    
    // First try to find highest reached milestone (from backend)
    const reachedMilestones = milestones.filter(m => m.reached).sort((a, b) => b.percentage - a.percentage);
    if (reachedMilestones.length > 0) return reachedMilestones[0];
    
    // Fallback: Find the highest milestone that's been reached based on progress
    const sortedMilestones = [...milestones].sort((a, b) => b.percentage - a.percentage);
    return sortedMilestones.find(m => progress >= m.percentage) || null;
  };

  // Progress color based on progress percentage (clean gradient)
  const getProgressColor = (progress) => {
    if (progress >= 100) return '#22c55e'; // Green
    if (progress >= 75) return '#84cc16';  // Lime
    if (progress >= 50) return '#f59e0b';  // Amber
    if (progress >= 25) return '#f97316';  // Orange
    return '#6366f1'; // Indigo
  };

  // Get milestone flag color based on percentage position (journey gradient)
  const getMilestoneFlagColor = (percentage, isReached) => {
    if (!isReached) return '#d1d5db'; // Gray for unreached
    // Color journey: Dark Red → Orange → Light Green → Green
    if (percentage >= 100) return '#22c55e'; // Green (final)
    if (percentage >= 75) return '#84cc16';  // Lime green
    if (percentage >= 50) return '#f59e0b';  // Amber/Orange
    if (percentage >= 25) return '#f97316';  // Orange
    return '#dc2626'; // Dark red (early)
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  // Format datetime
  const formatDateTime = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
          <div style={{ width: '100px', height: '32px', backgroundColor: '#f1f1f1', borderRadius: '8px', marginBottom: '32px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '75%', height: '32px', backgroundColor: '#f1f1f1', borderRadius: '8px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '120px', height: '36px', backgroundColor: '#f1f1f1', borderRadius: '18px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '100%', height: '12px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '16px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '60%', height: '48px', backgroundColor: '#f1f1f1', borderRadius: '8px', margin: '0 auto', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '28px', padding: '32px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '100%', height: '80px', backgroundColor: '#f1f1f1', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Something went wrong</h2>
          <p style={{ fontSize: '15px', color: '#666', marginBottom: '32px', lineHeight: 1.5 }}>{error}</p>
          <button
            onClick={() => navigate('/tasks')}
            style={{
              padding: '14px 32px', backgroundColor: '#1a1a1a', color: '#fff',
              fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer'
            }}
          >
            Back to Tasks
          </button>
        </div>
      </div>
    );
  }

  if (!task) return null;

  // ========== HARD GUARD: BLOCK PLANS ==========
  // Plans are product listings. They do NOT have execution views.
  if (task.isListedInPlans === true || task.status === 'LISTED') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Not a Task</h2>
          <p style={{ fontSize: '15px', color: '#666', marginBottom: '32px', lineHeight: 1.5 }}>
            Plans are product listings. They do not have execution views.<br/>
            To purchase this plan, visit the marketplace.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => navigate('/tasks')}
              style={{
                padding: '14px 24px', backgroundColor: '#f1f5f9', color: '#475569',
                fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer'
              }}
            >
              My Tasks
            </button>
            <button
              onClick={() => navigate('/plans')}
              style={{
                padding: '14px 24px', backgroundColor: '#1a1a1a', color: '#fff',
                fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer'
              }}
            >
              View Marketplace
            </button>
          </div>
        </div>
      </div>
    );
  }
  // ========== END HARD GUARD ==========

  const humanStatus = getHumanStatus(task.status);
  const progress = task.progress || 0;
  const progressColor = getProgressColor(progress);
  const activeMilestone = getActiveMilestone(task.milestones, progress);
  const isOverachieving = progress > 100;

  // Build milestones from task if available
  const milestones = task.milestones || [];

  const isPendingApproval = task.status === 'PENDING_APPROVAL';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <Header />
      
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
        {/* Back Button - Minimal */}
        <button
          onClick={() => navigate('/tasks')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '0',
            backgroundColor: 'transparent', border: 'none', fontSize: '14px', fontWeight: '500',
            color: '#666', cursor: 'pointer', marginBottom: '24px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All Tasks
        </button>

        {/* Feature Image Header - If Available */}
        {task.featureImage && (
          <div style={{
            borderRadius: '24px', overflow: 'hidden', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', position: 'relative'
          }}>
            <img 
              src={task.featureImage} 
              alt="" 
              style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
              onError={(e) => { e.target.parentElement.style.display = 'none'; }}
            />
            <div style={{
              position: 'absolute', bottom: '16px', left: '20px',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <span style={{ 
                fontSize: '36px', 
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' 
              }}>
                {task.icon || '📝'}
              </span>
            </div>
          </div>
        )}

        {/* Hero Card - Title + Status */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '28px', padding: '36px 32px', marginBottom: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
        }}>
          {/* Status Chip - Dynamic based on progress */}
          <div style={{ marginBottom: '20px' }}>
            {(() => {
              const isStarted = progress > 0;
              // If task has started and has an active milestone, show milestone as status
              if (isStarted && activeMilestone) {
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                    backgroundColor: `${activeMilestone.color}15`, color: activeMilestone.color
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeMilestone.color }} />
                    🚩 {activeMilestone.name}
                  </span>
                );
              }
              // If started but no milestone, show "In Progress"
              if (isStarted && !activeMilestone) {
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                    backgroundColor: '#eff6ff', color: '#3b82f6'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                    In Progress
                  </span>
                );
              }
              // Default: show original humanStatus (Scheduled, Pending Approval, etc.)
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                  backgroundColor: humanStatus.bg, color: humanStatus.color
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: humanStatus.color }} />
                  {humanStatus.label}
                </span>
              );
            })()}
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: '28px', fontWeight: '700', color: '#1a1a1a', margin: 0, lineHeight: 1.35,
            letterSpacing: '-0.02em'
          }}>
            {task.title}
          </h1>

          {/* Plan Name - Explicitly for booked tasks */}
          {isPendingApproval && (
            <p style={{ fontSize: '14px', color: '#6366f1', fontWeight: '600', margin: '8px 0 0 0' }}>
              Plan: {task.title}
            </p>
          )}

          {/* Short Description */}
          {formatDescription(task.description) && (
            <p style={{
              fontSize: '16px', color: '#666', margin: '16px 0 0 0', lineHeight: 1.6,
              whiteSpace: 'pre-wrap' // Preserve line breaks from backend
            }}>
              {formatDescription(task.description)}
            </p>
          )}
        </div>

        {/* TASK DISCUSSION (Phase 6) - MOVED TO TOP */}
        <div ref={discussionRef} style={{
          backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Discussion</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chat with admin about this task</p>
            </div>
          </div>

          {/* Messages */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px', padding: '4px' }}>
            {(!task.messages || task.messages.length === 0) ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '14px', padding: '40px 0' }}>
                No messages yet. Start a conversation!
              </p>
            ) : (
              task.messages.map((msg, idx) => (
                <div key={idx} style={{ 
                  display: 'flex', 
                  justifyContent: msg.sender === 'CLIENT' ? 'flex-end' : 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div style={{
                    maxWidth: '75%', padding: '12px 16px', borderRadius: '16px',
                    backgroundColor: msg.sender === 'CLIENT' ? '#6366f1' : '#f1f5f9',
                    color: msg.sender === 'CLIENT' ? '#fff' : '#0f172a',
                  }}>
                    <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                    <p style={{ 
                      fontSize: '10px', margin: '6px 0 0', 
                      color: msg.sender === 'CLIENT' ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                      textAlign: 'right'
                    }}>
                      {new Date(msg.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              rows={2}
              style={{
                flex: 1, padding: '12px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '14px',
                outline: 'none', resize: 'none', lineHeight: 1.5
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sendingMessage}
              style={{
                padding: '12px 20px', backgroundColor: messageText.trim() ? '#6366f1' : '#e2e8f0',
                color: messageText.trim() ? '#fff' : '#94a3b8', fontSize: '14px', fontWeight: '600',
                borderRadius: '14px', border: 'none',
                cursor: messageText.trim() && !sendingMessage ? 'pointer' : 'not-allowed',
                opacity: sendingMessage ? 0.6 : 1
              }}
            >
              {sendingMessage ? '...' : 'Send'}
            </button>
          </div>
        </div>

        {/* PROGRESS CARD - Clean Client View */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
        }}>
          {/* Section Header */}
          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Progress</span>
          </div>

          {isPendingApproval ? (
            <div style={{ padding: '24px', backgroundColor: '#eff6ff', borderRadius: '20px', border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>Pending Admin Approval</h3>
              <p style={{ fontSize: '15px', color: '#1e40af', margin: 0, lineHeight: 1.6 }}>
                Your task is booked. Admin will review and start it shortly.
              </p>
            </div>
          ) : (
            <ProgressWithFlag 
              progress={progress} 
              milestones={milestones} 
              size="default"
              showLabel={true}
              showPercentage={true}
            />
          )}
        </div>

        {/* Details Card */}
        {task.publicNotes && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Details</p>
            <p style={{
              fontSize: '15px', color: '#444', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap'
            }}>
              {task.publicNotes}
            </p>
          </div>
        )}

        {/* Feature Image - CONDITIONAL */}
        {task.featureImage && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '0', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden'
          }}>
            <img 
              src={task.featureImage} 
              alt={task.title}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        )}

        {/* Pricing & Quantity Card - CONDITIONAL */}
        {((task.quantity && task.showQuantityToClient) || ((task.creditCost || task.creditsUsed) && task.showCreditsToClient !== false) || task.offerPrice || task.originalPrice) && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '20px' }}>Pricing & Details</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Quantity - CONDITIONAL (Scope Clarity) */}
              {task.quantity && task.showQuantityToClient && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', backgroundColor: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                  <div>
                    <span style={{ fontSize: '14px', color: '#166534', fontWeight: '600', display: 'block', marginBottom: '3px' }}>Scope Quantity</span>
                    <span style={{ fontSize: '11px', color: '#15803d' }}>Total units of work</span>
                  </div>
                  <span style={{ fontSize: '28px', fontWeight: '700', color: '#15803d' }}>{task.quantity}</span>
                </div>
              )}

              {/* Credits - CONDITIONAL */}
              {/* FIX: Use creditsUsed (actual deducted) over creditCost (base price) */}
              {(task.creditsUsed || task.creditCost) && task.showCreditsToClient !== false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                  <div>
                    <span style={{ fontSize: '14px', color: '#166534', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Credits Used</span>
                    <span style={{ fontSize: '12px', color: '#15803d' }}>Deducted from wallet</span>
                  </div>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#15803d' }}>₹{task.creditsUsed || task.creditCost || 0}</span>
                </div>
              )}

              {/* Offer Price - CONDITIONAL */}
              {task.offerPrice && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#fffbeb', borderRadius: '14px', border: '1px solid #fef3c7' }}>
                  <div>
                    <span style={{ fontSize: '14px', color: '#92400e', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Offer Price</span>
                    {task.originalPrice && (
                      <span style={{ fontSize: '12px', color: '#a16207', textDecoration: 'line-through' }}>₹{task.originalPrice}</span>
                    )}
                  </div>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>₹{task.offerPrice}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Countdown Timer - CONDITIONAL */}
        {task.countdownEndDate && new Date(task.countdownEndDate) > new Date() && (
          <div style={{
            backgroundColor: '#fef2f2', borderRadius: '28px', padding: '28px 32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #fecaca', textAlign: 'center'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Offer Ends</p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626', margin: 0 }}>
              {formatDateTime(task.countdownEndDate)}
            </p>
          </div>
        )}

        {/* Receipt Card - CONDITIONAL */}
        {receipt && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '2px solid #e0e7ff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Service Receipt</p>
              <span style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                backgroundColor: '#dcfce7', color: '#15803d'
              }}>
                Paid via Wallet
              </span>
            </div>
            
            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', color: '#64748b' }}>Receipt Number</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{receipt.receiptNumber}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', color: '#64748b' }}>Credits Used</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#15803d' }}>₹{receipt.creditsUsed?.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#64748b' }}>Date</span>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#334155' }}>
                  {new Date(receipt.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            {receipt.isDownloadableByClient && (
              <button
                onClick={handleDownloadReceipt}
                disabled={downloadingReceipt}
                style={{
                  width: '100%', padding: '14px 20px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#fff', fontSize: '14px', fontWeight: '600',
                  borderRadius: '14px', border: 'none',
                  cursor: downloadingReceipt ? 'not-allowed' : 'pointer',
                  opacity: downloadingReceipt ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                <span>📄</span>
                {downloadingReceipt ? 'Downloading...' : 'Download Receipt PDF'}
              </button>
            )}
          </div>
        )}

        {/* FINAL DELIVERY SECTION (Phase 3) */}
        {task.finalDeliveryLink && (
          <div style={{
            backgroundColor: '#f0fdf4', borderRadius: '28px', padding: '32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '2px solid #22c55e'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Final Delivery Folder</p>
              <span style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d' }}>
                ✓ Ready
              </span>
            </div>

            {/* Download Button */}
            <a
              href={task.finalDeliveryLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                width: '100%', padding: '16px 20px', marginBottom: task.finalDeliveryText ? '16px' : '0',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff', fontSize: '15px', fontWeight: '600', borderRadius: '14px',
                textDecoration: 'none', boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Open Final Delivery Folder
            </a>

            {/* Delivery Notes */}
            {task.finalDeliveryText && (
              <div style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Delivery Notes</label>
                <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {task.finalDeliveryText}
                </p>
              </div>
            )}

            {/* Delivered Timestamp */}
            {task.finalDeliveredAt && (
              <p style={{ fontSize: '12px', color: '#15803d', margin: '16px 0 0', textAlign: 'right' }}>
                Delivered on {new Date(task.finalDeliveredAt).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        )}

        {/* CLIENT CONTENT SUBMISSION (Phase 2) */}
        {/* Show if content not yet submitted - regardless of status */}
        {!task.clientContentSubmitted && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', 
            border: task.clientContentSubmitted ? '2px solid #bbf7d0' : (task.requireClientContent ? '2px solid #fbbf24' : '2px solid #e0e7ff')
          }}>
            {/* Content Required Warning */}
            {task.requireClientContent && !task.clientContentSubmitted && (
              <div style={{
                padding: '14px 18px', backgroundColor: '#fef3c7', borderRadius: '14px', marginBottom: '20px',
                border: '1px solid #fcd34d', display: 'flex', alignItems: 'flex-start', gap: '12px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', margin: 0 }}>Please submit content to start this task</p>
                  <p style={{ fontSize: '13px', color: '#b45309', margin: '4px 0 0', lineHeight: 1.4 }}>Work will begin once you submit the required content below.</p>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                {task.clientContentSubmitted ? 'Submitted Content' : 'Submit Content'}
              </p>
              {task.clientContentSubmitted && (
                <span style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                  backgroundColor: '#dcfce7', color: '#15803d'
                }}>
                  ✓ Submitted
                </span>
              )}
            </div>

            {/* Content Toast */}
            {contentToast && (
              <div style={{
                padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
                backgroundColor: contentToast.type === 'error' ? '#fef2f2' : '#f0fdf4',
                color: contentToast.type === 'error' ? '#dc2626' : '#15803d',
                fontSize: '14px', fontWeight: '500'
              }}>
                {contentToast.message}
              </div>
            )}

            {/* IF NOT SUBMITTED - Show Form */}
            {!task.clientContentSubmitted ? (
              <>
                {/* Content Text */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                    Content / Instructions
                  </label>
                  <textarea
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)}
                    placeholder="Enter your content, captions, instructions, or any details..."
                    maxLength={5000}
                    style={{
                      width: '100%', minHeight: '120px', padding: '14px 16px',
                      fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '14px',
                      outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                      fontFamily: 'inherit', lineHeight: 1.6
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
                    {contentText.length}/5000
                  </p>
                </div>

                {/* Content Folder Link */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                    Content Folder Link (Google Drive)
                  </label>
                  <input
                    type="url"
                    value={driveLink}
                    onChange={(e) => setDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    style={{
                      width: '100%', padding: '14px 16px',
                      fontSize: '14px', 
                      border: driveLink && !driveLink.includes('drive.google.com') ? '2px solid #f59e0b' : '2px solid #e2e8f0', 
                      borderRadius: '14px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
                    Upload all files in one folder and paste the link here
                  </p>
                  {driveLink && !driveLink.includes('drive.google.com') && (
                    <p style={{ fontSize: '12px', color: '#f59e0b', margin: '6px 0 0', fontWeight: '500' }}>
                      ⚠ Link should be a Google Drive folder URL
                    </p>
                  )}
                </div>

                {/* Content Links */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                    Additional Links (optional)
                  </label>
                  {contentLinks.map((link, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => updateContentLink(index, e.target.value)}
                        placeholder={`Link ${index + 1}`}
                        style={{
                          flex: 1, padding: '12px 14px',
                          fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '12px',
                          outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                      {contentLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContentLink(index)}
                          style={{
                            padding: '12px 14px', backgroundColor: '#fef2f2', color: '#dc2626',
                            border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '14px'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {contentLinks.length < 10 && (
                    <button
                      type="button"
                      onClick={addContentLink}
                      style={{
                        padding: '10px 16px', backgroundColor: '#f1f5f9', color: '#64748b',
                        border: 'none', borderRadius: '10px', cursor: 'pointer',
                        fontSize: '13px', fontWeight: '500'
                      }}
                    >
                      + Add Link
                    </button>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleContentSubmit}
                  disabled={submittingContent}
                  style={{
                    width: '100%', padding: '16px 24px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff', fontSize: '15px', fontWeight: '600',
                    borderRadius: '14px', border: 'none',
                    cursor: submittingContent ? 'not-allowed' : 'pointer',
                    opacity: submittingContent ? 0.6 : 1
                  }}
                >
                  {submittingContent ? 'Submitting...' : 'Submit Content'}
                </button>
              </>
            ) : (
              /* IF SUBMITTED - Show Read-Only Content */
              <>
                {/* Submitted Text */}
                {task.clientContentText && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                      Content / Instructions
                    </label>
                    <div style={{
                      padding: '16px', backgroundColor: '#f8fafc', borderRadius: '14px',
                      fontSize: '14px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap'
                    }}>
                      {task.clientContentText}
                    </div>
                  </div>
                )}

                {/* Submitted Content Folder */}
                {task.clientDriveLink && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                      Content Folder Link
                    </label>
                    <a
                      href={task.clientDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'block', padding: '14px 16px', backgroundColor: '#eff6ff',
                        borderRadius: '12px', fontSize: '14px', color: '#3b82f6',
                        textDecoration: 'none', wordBreak: 'break-all'
                      }}
                    >
                      {task.clientDriveLink}
                    </a>
                  </div>
                )}

                {/* Submitted Links */}
                {task.clientContentLinks && task.clientContentLinks.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                      Additional Links
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {task.clientContentLinks.map((link, index) => (
                        <a
                          key={index}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block', padding: '12px 14px', backgroundColor: '#f1f5f9',
                            borderRadius: '10px', fontSize: '14px', color: '#6366f1',
                            textDecoration: 'none', wordBreak: 'break-all'
                          }}
                        >
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submitted At */}
                {task.clientContentSubmittedAt && (
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '16px 0 0 0', textAlign: 'right' }}>
                    Submitted on {new Date(task.clientContentSubmittedAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Timeline Card */}
        {!isPendingApproval && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '28px', padding: '32px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '24px' }}>Timeline</p>

            {/* Date Range Visual */}
            {(task.startDate || task.endDate) && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 24px', backgroundColor: '#fafafa', borderRadius: '16px', marginBottom: '24px'
              }}>
                {/* Start */}
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: '11px', color: '#999', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Started</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{formatDate(task.startDate) || '—'}</p>
                </div>

                {/* Arrow */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
                  <div style={{ flex: 1, height: '2px', backgroundColor: '#e5e5e5' }} />
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{ margin: '0 -4px' }}>
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* End */}
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '11px', color: '#999', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Due</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{formatDate(task.endDate || task.deadline) || '—'}</p>
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div style={{ position: 'relative', paddingLeft: '24px' }}>
              <div style={{ position: 'absolute', left: '7px', top: '8px', bottom: '8px', width: '2px', backgroundColor: '#f0f0f0' }} />

              {/* Created */}
              <div style={{ position: 'relative', marginBottom: '20px' }}>
                <div style={{
                  position: 'absolute', left: '-24px', top: '2px', width: '16px', height: '16px',
                  borderRadius: '50%', backgroundColor: '#22c55e', border: '3px solid #dcfce7'
                }} />
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 2px 0' }}>Task created</p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>{formatDateTime(task.createdAt)}</p>
              </div>

              {/* Updated */}
              {task.updatedAt && task.updatedAt !== task.createdAt && (
                <div style={{ position: 'relative', marginBottom: '20px' }}>
                  <div style={{
                    position: 'absolute', left: '-24px', top: '2px', width: '16px', height: '16px',
                    borderRadius: '50%', backgroundColor: '#8b5cf6', border: '3px solid #ede9fe'
                  }} />
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 2px 0' }}>Last updated</p>
                  <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>{formatDateTime(task.updatedAt)}</p>
                </div>
              )}

              {/* Current State */}
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: '-24px', top: '2px', width: '16px', height: '16px',
                  borderRadius: '50%', backgroundColor: humanStatus.color, border: `3px solid ${humanStatus.bg}`
                }} />
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 2px 0' }}>Current status</p>
                <p style={{ fontSize: '13px', color: humanStatus.color, fontWeight: '600', margin: 0 }}>{humanStatus.label}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      `}</style>
    </div>
  );
};

export default TaskDetail;
