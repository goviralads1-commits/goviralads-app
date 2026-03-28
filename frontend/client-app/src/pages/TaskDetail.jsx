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
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isChatFullScreen, setIsChatFullScreen] = useState(false); // Full screen chat mode
  const [showOnlyApprovals, setShowOnlyApprovals] = useState(false); // Approval filter toggle
  const [historyModalApproval, setHistoryModalApproval] = useState(null); // Approval history modal
  const [copyToast, setCopyToast] = useState(null); // Export proof toast
  const discussionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const fullscreenInputRef = useRef(null); // For fullscreen auto-focus
  
  // Approval selection state (Phase 7)
  const [approvalSelections, setApprovalSelections] = useState({}); // { approvalId: [selectedOptions] }
  const [submittingApproval, setSubmittingApproval] = useState(null); // approvalId being submitted
  
  // Auto-resize textarea
  const handleTextareaChange = (e) => {
    setMessageText(e.target.value);
    // Auto-expand
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

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
    if ((!messageText.trim() && messageAttachments.length === 0) || sendingMessage) return;
    
    setSendingMessage(true);
    try {
      let attachmentUrls = [];
      
      // STEP 1: Upload images first if any
      if (messageAttachments.length > 0) {
        try {
          console.log('[UPLOAD DEBUG] Starting upload...');
          console.log('[UPLOAD DEBUG] API URL:', import.meta.env.VITE_API_URL);
          console.log('[UPLOAD DEBUG] Files to upload:', messageAttachments.length);
          
          const formData = new FormData();
          messageAttachments.forEach((att, idx) => {
            console.log(`[UPLOAD DEBUG] File ${idx}:`, att.file.name, att.file.type, att.file.size, 'bytes');
            formData.append('images', att.file);
          });
          
          // Note: Don't set Content-Type manually - browser sets it with correct boundary for FormData
          const uploadRes = await api.post('/upload/chat', formData);
          console.log('[UPLOAD DEBUG] Response:', uploadRes.status, uploadRes.data);
          attachmentUrls = uploadRes.data?.urls || [];
          
          // If upload returned no URLs, fail
          if (messageAttachments.length > 0 && attachmentUrls.length === 0) {
            throw new Error('Image upload failed - no URLs returned');
          }
        } catch (uploadErr) {
          console.error('[UPLOAD DEBUG] ERROR:', uploadErr);
          console.error('[UPLOAD DEBUG] Response status:', uploadErr.response?.status);
          console.error('[UPLOAD DEBUG] Response data:', uploadErr.response?.data);
          console.error('[UPLOAD DEBUG] Error message:', uploadErr.message);
          setContentToast({ type: 'error', message: uploadErr.response?.data?.error || uploadErr.message || 'Failed to upload image' });
          setTimeout(() => setContentToast(null), 5000);
          setSendingMessage(false);
          return; // DO NOT send message
        }
      }
      
      // STEP 2: Only send message after successful upload
      await api.post(`/client/tasks/${taskId}/message`, { 
        text: messageText.trim() || (attachmentUrls.length > 0 ? '[Image]' : ''),
        attachments: attachmentUrls
      });
      
      // Cleanup preview URLs
      messageAttachments.forEach(att => URL.revokeObjectURL(att.previewUrl));
      setMessageText('');
      setMessageAttachments([]);
      fetchTask(); // Refresh to get new message
    } catch (err) {
      setContentToast({ type: 'error', message: err.response?.data?.error || 'Failed to send message' });
      setTimeout(() => setContentToast(null), 3000);
    } finally {
      setSendingMessage(false);
    }
  };

  // Handle approval selection toggle
  const handleApprovalOptionToggle = (approvalId, option, type) => {
    setApprovalSelections(prev => {
      const current = prev[approvalId] || [];
      if (type === 'single') {
        // Single choice - replace
        return { ...prev, [approvalId]: [option] };
      } else {
        // Multi choice - toggle
        if (current.includes(option)) {
          return { ...prev, [approvalId]: current.filter(o => o !== option) };
        } else {
          return { ...prev, [approvalId]: [...current, option] };
        }
      }
    });
  };

  // Submit approval selection
  const handleSubmitApproval = async (approvalId) => {
    const selectedOptions = approvalSelections[approvalId] || [];
    if (selectedOptions.length === 0) {
      setContentToast({ type: 'error', message: 'Please select at least one option' });
      setTimeout(() => setContentToast(null), 3000);
      return;
    }

    setSubmittingApproval(approvalId);
    try {
      await api.post(`/client/tasks/${taskId}/approvals/${approvalId}/select`, {
        selectedOptions
      });

      setContentToast({ type: 'success', message: 'Selection submitted!' });
      setTimeout(() => setContentToast(null), 3000);
      setApprovalSelections(prev => ({ ...prev, [approvalId]: [] })); // Clear local selection
      fetchTask(); // Refresh to show updated selection
    } catch (err) {
      setContentToast({ type: 'error', message: err.response?.data?.error || 'Failed to submit selection' });
      setTimeout(() => setContentToast(null), 3000);
    } finally {
      setSubmittingApproval(null);
    }
  };

  // Export Proof: Generate text report and copy to clipboard
  const handleExportProof = () => {
    const approvedItems = (task.approvalRequests || [])
      .filter(a => a.isVisibleToClient !== false && (a.selectionsHistory || []).length > 0);
    
    if (approvedItems.length === 0) return;
    
    const formatTimestamp = (ts) => {
      return new Date(ts).toLocaleString('en-US', { 
        day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true 
      });
    };
    
    let report = `--- CLIENT APPROVAL REPORT ---\n\n`;
    report += `Task: ${task.title}\n\n`;
    
    approvedItems.forEach((approval) => {
      const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
      
      report += `${approval.title}:\n`;
      report += `Final → ${latest?.selectedOptions?.join(', ') || 'No selection'}\n`;
      
      if ((approval.selectionsHistory || []).length > 1) {
        report += `\nHistory:\n`;
        approval.selectionsHistory.forEach((h, idx) => {
          report += `  • ${h.selectedOptions?.join(', ')} (${formatTimestamp(h.timestamp)})\n`;
        });
      }
      report += `\n`;
    });
    
    report += `---`;
    
    navigator.clipboard.writeText(report).then(() => {
      setCopyToast('Report copied');
      setTimeout(() => setCopyToast(null), 2500);
    }).catch(() => {
      setCopyToast('Copy failed');
      setTimeout(() => setCopyToast(null), 2500);
    });
  };

  // Handle image selection for chat
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const remaining = 5 - messageAttachments.length;
    const toProcess = files.slice(0, remaining);
    
    toProcess.forEach(file => {
      if (!file.type.startsWith('image/')) {
        setContentToast({ type: 'error', message: 'Only images allowed' });
        setTimeout(() => setContentToast(null), 3000);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setContentToast({ type: 'error', message: 'Image too large (max 5MB)' });
        setTimeout(() => setContentToast(null), 3000);
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

  // SHARED CHAT CONTENT RENDERER - Single source of truth for both normal and fullscreen views
  const renderChatContent = (isFullScreen = false) => {
    const baseFontSize = isFullScreen ? '15px' : '14px';
    const basePadding = isFullScreen ? '12px 16px' : '12px 16px';
    const maxWidth = isFullScreen ? '80%' : '75%';
    const marginBottom = isFullScreen ? '16px' : '12px';
    
    // Filter visible approvals for client
    const visibleApprovals = task.approvalRequests?.filter(a => a.isVisibleToClient !== false) || [];

    // Approval Filter: Show only approvals
    if (showOnlyApprovals) {
      if (visibleApprovals.length === 0) {
        return (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: baseFontSize, padding: isFullScreen ? '40px 0' : '30px 0' }}>
            No approvals found
          </p>
        );
      }
      return (
        <>
          {visibleApprovals.map((approval, idx) => {
            const latestSel = approval.selectionsHistory?.[approval.selectionsHistory.length - 1];
            const savedOpts = latestSel?.selectedOptions || [];
            const localSel = approvalSelections[approval.id] || [];
            const currentSel = localSel.length > 0 ? localSel : savedOpts;
            const hasHistory = (approval.selectionsHistory || []).length > 0;
            const isLocked = approval.isLocked;

            return (
              <div key={`filter-approval-${approval.id || idx}`} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom
              }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366f1', marginBottom: '4px' }}>Admin (Approval)</span>
                <div style={{
                  maxWidth: isFullScreen ? '85%' : '90%', padding: isFullScreen ? '14px' : '16px', borderRadius: isFullScreen ? '14px' : '16px',
                  backgroundColor: '#fef3c7', border: '2px solid #fbbf24'
                }}>
                  <p style={{ fontSize: baseFontSize, fontWeight: '600', color: '#92400e', margin: '0 0 12px 0' }}>{approval.title}</p>
                  {approval.options.map((opt, optIdx) => {
                    const isSel = currentSel.includes(opt);
                    return (
                      <button
                        key={optIdx}
                        onClick={() => !isLocked && handleApprovalOptionToggle(approval.id, opt, approval.type)}
                        disabled={isLocked}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: '10px', fontSize: isFullScreen ? '13px' : '14px', marginBottom: '8px',
                          backgroundColor: isSel ? '#dcfce7' : '#fff',
                          border: isSel ? '2px solid #22c55e' : '2px solid #e5e7eb',
                          textAlign: 'left', cursor: isLocked ? 'not-allowed' : 'pointer',
                          opacity: isLocked ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>
                          {approval.type === 'single' ? (isSel ? '◉' : '○') : (isSel ? '☑' : '☐')}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                  {!isLocked && (
                    <button
                      onClick={() => handleSubmitApproval(approval.id)}
                      disabled={submittingApproval === approval.id || localSel.length === 0}
                      style={{
                        width: '100%', padding: '10px', fontSize: isFullScreen ? '13px' : '14px', fontWeight: '600',
                        backgroundColor: localSel.length > 0 ? '#6366f1' : '#e2e8f0',
                        color: localSel.length > 0 ? '#fff' : '#94a3b8',
                        border: 'none', borderRadius: '10px',
                        cursor: localSel.length > 0 ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {submittingApproval === approval.id ? 'Submitting...' : (savedOpts.length > 0 ? 'Update Selection' : 'Submit Selection')}
                    </button>
                  )}
                  <p style={{ fontSize: '11px', color: '#92400e', margin: '8px 0', textAlign: 'center' }}>
                    {isLocked && hasHistory ? '✅ Approved (Locked)' : isLocked ? '🔒 Locked' : (savedOpts.length > 0 ? '✓ Submitted' : 'Awaiting selection')}
                  </p>
                  {/* View History Button - Only visible if admin allows */}
                  {approval.showHistoryToClient && hasHistory && (
                    <button
                      onClick={() => setHistoryModalApproval(approval)}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        fontSize: '12px', fontWeight: '600',
                        backgroundColor: '#e0f2fe', color: '#0369a1',
                        border: '1px solid #7dd3fc', cursor: 'pointer',
                        marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      View History ({approval.selectionsHistory.length})
                    </button>
                  )}
                  {/* View in Chat button */}
                  <button
                    onClick={() => setShowOnlyApprovals(false)}
                    style={{
                      padding: '6px 12px', fontSize: '11px', fontWeight: '600',
                      backgroundColor: '#f1f5f9', color: '#64748b',
                      border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    ← View in Chat
                  </button>
                </div>
              </div>
            );
          })}
        </>
      );
    }

    // Normal chat view
    if (!task.messages || task.messages.length === 0) {
      return (
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: baseFontSize, padding: isFullScreen ? '40px 0' : '40px 0' }}>
          No messages yet. {isFullScreen ? 'Start the conversation!' : 'Start a conversation!'}
        </p>
      );
    }

    return (
      <>
        {task.messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex', flexDirection: 'column',
            alignItems: msg.sender === 'ADMIN' ? 'flex-end' : 'flex-start',
            marginBottom
          }}>
            {/* Sender Label */}
            <span style={{
              fontSize: '11px', fontWeight: '600',
              color: msg.sender === 'ADMIN' ? '#6366f1' : '#64748b',
              marginBottom: '4px',
              paddingLeft: msg.sender === 'ADMIN' ? '0' : '4px',
              paddingRight: msg.sender === 'ADMIN' ? '4px' : '0'
            }}>
              {msg.sender === 'ADMIN' ? 'Admin' : (isFullScreen ? 'You' : 'Client')}
            </span>
            {/* Message Bubble */}
            <div style={{
              maxWidth, padding: basePadding, borderRadius: '16px',
              backgroundColor: msg.sender === 'ADMIN' ? '#6366f1' : '#f1f5f9',
              color: msg.sender === 'ADMIN' ? '#fff' : (isFullScreen ? '#334155' : '#0f172a')
            }}>
              {msg.attachments && msg.attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: msg.text && msg.text !== '[Image]' ? '8px' : 0 }}>
                  {msg.attachments.map((att, attIdx) => {
                    const imgUrl = typeof att === 'string' ? att : att.url;
                    return (
                      <img
                        key={attIdx}
                        src={imgUrl}
                        alt=""
                        onClick={() => setLightboxImage(imgUrl)}
                        style={{
                          maxWidth: isFullScreen ? '100px' : '200px',
                          maxHeight: isFullScreen ? '100px' : '150px',
                          borderRadius: '8px', cursor: 'pointer', objectFit: 'cover'
                        }}
                      />
                    );
                  })}
                </div>
              )}
              {msg.text && msg.text !== '[Image]' && (
                <p style={{ fontSize: baseFontSize, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{linkifyText(msg.text)}</p>
              )}
              <p style={{
                fontSize: '10px', margin: '6px 0 0',
                color: msg.sender === 'ADMIN' ? 'rgba(255,255,255,0.7)' : '#94a3b8',
                textAlign: 'right'
              }}>
                {new Date(msg.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {/* Approval Cards - Client can select options */}
        {visibleApprovals.map((approval, idx) => {
          const latestSelection = approval.selectionsHistory?.[approval.selectionsHistory.length - 1];
          const savedOptions = latestSelection?.selectedOptions || [];
          const localSelection = approvalSelections[approval.id] || [];
          const currentSelection = localSelection.length > 0 ? localSelection : savedOptions;
          const isLocked = approval.isLocked;
          const hasSubmission = (approval.selectionsHistory || []).length > 0;

          return (
            <div key={`approval-${approval.id || idx}`} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginBottom
            }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#6366f1', marginBottom: '4px' }}>Admin (Approval Request)</span>
              <div style={{
                maxWidth: isFullScreen ? '85%' : '90%', padding: isFullScreen ? '14px' : '16px', borderRadius: isFullScreen ? '14px' : '16px',
                backgroundColor: '#fef3c7', border: '2px solid #fbbf24'
              }}>
                <p style={{ fontSize: baseFontSize, fontWeight: '600', color: '#92400e', margin: '0 0 12px 0' }}>
                  {approval.title}
                </p>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                  {approval.options.map((opt, optIdx) => {
                    const isSelected = currentSelection.includes(opt);
                    return (
                      <button
                        key={optIdx}
                        onClick={() => !isLocked && handleApprovalOptionToggle(approval.id, opt, approval.type)}
                        disabled={isLocked}
                        style={{
                          padding: '10px 14px', borderRadius: '10px', fontSize: isFullScreen ? '13px' : '14px',
                          backgroundColor: isSelected ? '#dcfce7' : '#fff',
                          border: isSelected ? '2px solid #22c55e' : '2px solid #e5e7eb',
                          color: isSelected ? '#15803d' : '#374151',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px',
                          opacity: isLocked ? 0.7 : 1
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>
                          {approval.type === 'single'
                            ? (isSelected ? '◉' : '○')
                            : (isSelected ? '☑' : '☐')}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>

                {/* Submit Button - Only show if not locked */}
                {!isLocked && (
                  <button
                    onClick={() => handleSubmitApproval(approval.id)}
                    disabled={submittingApproval === approval.id || localSelection.length === 0}
                    style={{
                      width: '100%', padding: '10px', fontSize: isFullScreen ? '13px' : '14px', fontWeight: '600',
                      backgroundColor: localSelection.length > 0 ? '#6366f1' : '#e2e8f0',
                      color: localSelection.length > 0 ? '#fff' : '#94a3b8',
                      border: 'none', borderRadius: '10px',
                      cursor: localSelection.length > 0 && submittingApproval !== approval.id ? 'pointer' : 'not-allowed',
                      opacity: submittingApproval === approval.id ? 0.6 : 1
                    }}
                  >
                    {submittingApproval === approval.id ? 'Submitting...' : (savedOptions.length > 0 ? 'Update Selection' : 'Submit Selection')}
                  </button>
                )}

                {/* Status */}
                <p style={{ fontSize: '11px', color: '#92400e', margin: '8px 0 0', textAlign: 'center' }}>
                  {isLocked && hasSubmission
                    ? '✅ Approved ✓ (Locked by admin)'
                    : isLocked
                      ? '🔒 Locked'
                      : (savedOptions.length > 0
                          ? `✓ Submitted (${savedOptions.join(', ')})`
                          : 'Awaiting your selection')}
                </p>

                {/* View History Button - Only visible if admin allows */}
                {approval.showHistoryToClient && (approval.selectionsHistory || []).length > 0 && (
                  <button
                    onClick={() => setHistoryModalApproval(approval)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px',
                      fontSize: '12px', fontWeight: '600',
                      backgroundColor: '#e0f2fe', color: '#0369a1',
                      border: '1px solid #7dd3fc', cursor: 'pointer',
                      marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    View History ({approval.selectionsHistory.length})
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </>
    );
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

  // Auto-scroll to latest message when messages update
  useEffect(() => {
    if (task?.messages?.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [task?.messages?.length]);

  // History modal: ESC key handler + scroll lock
  useEffect(() => {
    if (historyModalApproval) {
      // Lock body scroll
      document.body.style.overflow = 'hidden';
      
      // ESC key handler
      const handleEsc = (e) => {
        if (e.key === 'Escape') setHistoryModalApproval(null);
      };
      window.addEventListener('keydown', handleEsc);
      
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
      };
    }
  }, [historyModalApproval]);

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

  const progress = task.progress || 0;
  const progressColor = getProgressColor(progress);
  const activeMilestone = getActiveMilestone(task.milestones, progress);
  const isOverachieving = progress > 100;

  // Build milestones from task if available
  const milestones = task.milestones || [];

  const isPendingApproval = task.status === 'PENDING_APPROVAL';
  const humanStatus = getHumanStatus(task.status);

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
          {/* Progress Chip - milestone-based, no internal status label */}
          <div style={{ marginBottom: '20px' }}>
            {(() => {
              if (isPendingApproval) {
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                    backgroundColor: '#eef2ff', color: '#6366f1'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                    ⏳ Booked
                  </span>
                );
              }
              if (progress >= 100 || task.status === 'COMPLETED') {
                return (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                    backgroundColor: '#f0fdf4', color: '#22c55e'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    ✅ Delivered
                  </span>
                );
              }
              if (progress > 0 && activeMilestone) {
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
              if (progress > 0) {
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
              return (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                  backgroundColor: '#fffbeb', color: '#f59e0b'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  Starting Soon
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
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Discussion</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Chat with admin about this task</p>
            </div>
            {/* Approval Filter Toggle */}
            {(task.approvalRequests?.filter(a => a.isVisibleToClient !== false).length > 0) && (
              <button
                onClick={() => setShowOnlyApprovals(!showOnlyApprovals)}
                style={{
                  padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                  backgroundColor: showOnlyApprovals ? '#fef3c7' : '#f1f5f9',
                  color: showOnlyApprovals ? '#92400e' : '#64748b',
                  border: showOnlyApprovals ? '2px solid #fbbf24' : '1px solid #e2e8f0',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                ✅ Approvals ({task.approvalRequests.filter(a => a.isVisibleToClient !== false).length})
              </button>
            )}
            {/* Full Screen Toggle */}
            <button
              onClick={() => {
                setIsChatFullScreen(true);
                setTimeout(() => fullscreenInputRef.current?.focus(), 100);
              }}
              title="Expand chat"
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px', padding: '4px' }}>
            {renderChatContent(false)}
          </div>

          {/* Input */}
          <div>
            {/* Attachment Preview */}
            {messageAttachments.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {messageAttachments.map((att, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img src={att.previewUrl} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                    <button 
                      onClick={() => removeAttachment(idx)}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}
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
                  padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none',
                  cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer', opacity: messageAttachments.length >= 5 ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px'
                }}
                title="Attach image"
              >
                📎
              </button>
              <textarea
                ref={textareaRef}
                value={messageText}
                onChange={handleTextareaChange}
                placeholder="Type your message..."
                style={{
                  flex: 1, padding: '12px 16px', fontSize: '14px',
                  border: '2px solid #e2e8f0', borderRadius: '14px',
                  outline: 'none', resize: 'none', lineHeight: 1.5,
                  minHeight: '44px', maxHeight: '120px', overflow: 'auto'
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={(!messageText.trim() && messageAttachments.length === 0) || sendingMessage}
                style={{
                  padding: '12px 20px', backgroundColor: (messageText.trim() || messageAttachments.length > 0) ? '#6366f1' : '#e2e8f0',
                  color: (messageText.trim() || messageAttachments.length > 0) ? '#fff' : '#94a3b8', fontSize: '14px', fontWeight: '600',
                  borderRadius: '14px', border: 'none', minHeight: '44px',
                  cursor: (messageText.trim() || messageAttachments.length > 0) && !sendingMessage ? 'pointer' : 'not-allowed',
                  opacity: sendingMessage ? 0.6 : 1
                }}
              >
                {sendingMessage ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        {/* FINAL APPROVED DECISIONS - Summary below chat */}
        {(() => {
          const approvedItems = (task.approvalRequests || [])
            .filter(a => a.isVisibleToClient !== false && (a.selectionsHistory || []).length > 0);
          if (approvedItems.length === 0) return null;
          return (
            <div style={{
              backgroundColor: '#f0fdf4', borderRadius: '20px', padding: '20px', marginBottom: '20px',
              border: '1px solid #bbf7d0', position: 'relative'
            }}>
              {/* Copy Toast */}
              {copyToast && (
                <div style={{
                  position: 'absolute', top: '16px', right: '16px',
                  backgroundColor: '#166534', color: '#fff', padding: '8px 14px',
                  borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10
                }}>
                  {copyToast}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#166534', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✅</span> Final Approved Decisions
                </h4>
                <button
                  onClick={handleExportProof}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '8px',
                    fontSize: '12px', fontWeight: '600',
                    backgroundColor: '#dcfce7', color: '#166534',
                    border: '1px solid #bbf7d0', cursor: 'pointer'
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                  Export Proof
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {approvedItems.map((approval, idx) => {
                  const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
                  const hasHistory = (approval.selectionsHistory || []).length > 0;
                  const isLocked = approval.isLocked;
                  return (
                    <div key={`summary-${approval.id || idx}`} style={{
                      backgroundColor: '#fff', padding: '14px', borderRadius: '12px',
                      border: '1px solid #dcfce7'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px 0' }}>{approval.title}</p>
                          <p style={{ fontSize: '15px', fontWeight: '600', color: '#166534', margin: 0 }}>
                            {latest?.selectedOptions?.join(', ') || 'No selection'}
                          </p>
                        </div>
                        {isLocked && (
                          <span style={{
                            padding: '4px 10px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: '#dcfce7', color: '#166534', borderRadius: '8px'
                          }}>
                            Locked ✓
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* CLIENT UPLOAD FOLDER - Upload Your Files (Phase 4B) */}
        {task.clientUploadFolderLink && (
          <div style={{ 
            backgroundColor: '#eff6ff', borderRadius: '28px', padding: '28px', marginBottom: '20px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '2px solid #3b82f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#1e40af', margin: 0 }}>Upload Your Files</h3>
                <p style={{ fontSize: '13px', color: '#3b82f6', margin: '2px 0 0' }}>Click to open the upload folder</p>
              </div>
            </div>
            <a
              href={task.clientUploadFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block', width: '100%', padding: '16px 24px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', fontSize: '15px', fontWeight: '600',
                borderRadius: '14px', textAlign: 'center', textDecoration: 'none',
                boxSizing: 'border-box', marginBottom: '12px'
              }}
            >
              Upload Content →
            </a>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0, textAlign: 'center' }}>
              Upload your files directly in this Google Drive folder
            </p>
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

                {/* Content Folder Link - REMOVED: Now handled by admin-set upload folder */}

                {/* Content Links - REMOVED: Simplified workflow */}

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

        {/* Lightbox */}
        {lightboxImage && (
          <div 
            onClick={() => setLightboxImage(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}
          >
            <img src={lightboxImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
          </div>
        )}

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
              progressIcon={task.progressIcon}
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
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* FULL SCREEN CHAT OVERLAY */}
      {isChatFullScreen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#fff', zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.3s ease-out'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', gap: '12px',
            backgroundColor: '#fff'
          }}>
            <button
              onClick={() => setIsChatFullScreen(false)}
              style={{
                width: '40px', height: '40px', borderRadius: '12px',
                backgroundColor: '#f1f5f9', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Discussion</h2>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{task.title}</p>
            </div>
            {/* Approval Filter Toggle in Fullscreen */}
            {(task.approvalRequests?.filter(a => a.isVisibleToClient !== false).length > 0) && (
              <button
                onClick={() => setShowOnlyApprovals(!showOnlyApprovals)}
                style={{
                  padding: '8px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: '600',
                  backgroundColor: showOnlyApprovals ? '#fef3c7' : '#f1f5f9',
                  color: showOnlyApprovals ? '#92400e' : '#64748b',
                  border: showOnlyApprovals ? '2px solid #fbbf24' : '1px solid #e2e8f0',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                ✅ Approvals ({task.approvalRequests.filter(a => a.isVisibleToClient !== false).length})
              </button>
            )}
          </div>

          {/* Messages - Full Height */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {renderChatContent(true)}
          </div>

          {/* Footer - Input */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
            {/* Attachment Preview */}
            {messageAttachments.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {messageAttachments.map((att, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img src={att.previewUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                    <button 
                      onClick={() => removeAttachment(idx)}
                      style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
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
                  padding: '14px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none',
                  cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <textarea
                ref={fullscreenInputRef}
                value={messageText}
                onChange={handleTextareaChange}
                placeholder="Type a message..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                style={{
                  flex: 1, padding: '14px 16px', fontSize: '15px', borderRadius: '14px',
                  border: '2px solid #e2e8f0', outline: 'none', resize: 'none',
                  minHeight: '48px', maxHeight: '120px', lineHeight: 1.4
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || (!messageText.trim() && messageAttachments.length === 0)}
                style={{
                  padding: '14px 20px', backgroundColor: '#6366f1', borderRadius: '14px', border: 'none',
                  color: '#fff', fontWeight: '600', cursor: 'pointer',
                  opacity: sendingMessage || (!messageText.trim() && messageAttachments.length === 0) ? 0.5 : 1
                }}
              >
                {sendingMessage ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL HISTORY MODAL */}
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

            {/* Modal Body - Scrollable */}
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
};

export default TaskDetail;
