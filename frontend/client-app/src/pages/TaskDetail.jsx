import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import api from '../services/api';
import Header from '../components/Header';
import ProgressWithFlag from '../components/ProgressWithFlag';
import ApprovalBox from '../components/ApprovalBox';
import { PresetIcon, isValidPreset } from '../components/PresetIcons';
import AttachSheet from '../components/chat/AttachSheet';
import MediaBubble from '../components/chat/MediaBubble';
import VoiceRecorder, { isRecordingSupported } from '../components/chat/VoiceRecorder';
import { probeMediaEnabled, putToR2, mbToBytes, limitFor, VIDEO_ACCEPT, VIDEO_MIME_TYPES, deleteMedia } from '../components/chat/mediaUpload';

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

// ==================== FAQ-STYLE COLLAPSIBLE SECTION HELPERS (UI interaction only) ====================
// CSS grid-rows collapse: children stay MOUNTED while collapsed (no remount, no refetch),
// so chat polling / message state / approvals are completely unaffected.
const Collapse = ({ open, children }) => (
  <div
    aria-hidden={!open}
    style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 0.25s ease' }}
  >
    <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
  </div>
);

// Expand/collapse indicator (rotates with state)
const Chevron = ({ open }) => (
  <svg
    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
// ==================== END COLLAPSIBLE HELPERS ====================

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [task, setTask] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
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
      console.error('[TaskDetail] Failed to get current user ID:', err);
    }
  }, []);

  // CHAT MEDIA: one-time capability probe per task. Flag OFF (or probe failure) =>
  // media controls stay hidden, exact legacy UI. Also aborts any in-flight uploads
  // when leaving the page.
  useEffect(() => {
    if (!taskId) { setMediaEnabled(false); return; }
    let cancelled = false;
    probeMediaEnabled(taskId)
      .then(on => { if (!cancelled) setMediaEnabled(!!on); })
      .catch(() => { if (!cancelled) setMediaEnabled(false); });
    return () => {
      cancelled = true;
      uploadsRef.current.forEach(u => { try { u.abortController?.abort(); } catch (_) {} });
      uploadsRef.current.clear();
    };
  }, [taskId]);

  // Content submission state (Phase 2)
  const [contentText, setContentText] = useState('');
  const [contentLinks, setContentLinks] = useState(['']);
  const [driveLink, setDriveLink] = useState('');
  const [submittingContent, setSubmittingContent] = useState(false);
  const [contentToast, setContentToast] = useState(null);
  
  // User default folder (Phase 4A+)
  const [userDefaultFolder, setUserDefaultFolder] = useState('');
  const [userDefaultUploadFolder, setUserDefaultUploadFolder] = useState('');
  
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
  
  // Chat pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [allMessages, setAllMessages] = useState([]); // Combined messages from pagination

  // CHAT MEDIA (Phase 2C parity): direct-to-R2 video/audio state. Fully independent
  // from the text/image send path. Optimistic bubbles live in pendingMedia (this page
  // has no polling, same model as Admin TaskDetail) and merge into the timeline at
  // render; success removes them and reuses the existing fetchTask() refresh.
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaToast, setMediaToast] = useState(null);
  const [pendingMedia, setPendingMedia] = useState([]); // optimistic uploading/failed media messages
  const videoInputRef = useRef(null);
  const uploadsRef = useRef(new Map()); // _tempId -> { blob, abortController, ... } (outside React state — no re-renders)

  // Discussion is the only collapsible section and it is OPEN BY DEFAULT —
  // it is the primary interaction surface. Everything else (progress, state,
  // next step, task info) is always visible and never behind a toggle.
  const [openSections, setOpenSections] = useState({ discussion: true });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  const sectionKeyDown = (e, key) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(key); } };
  
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
    console.log('Task ID from URL:', taskId); // Debug log
    try {
      const [taskResponse, receiptResponse] = await Promise.all([
        api.get(`/client/tasks/${taskId}`),
        api.get(`/client/tasks/${taskId}/receipt`).catch(() => ({ data: { receipt: null } }))
      ]);
      setTask(taskResponse.data.task);
      setReceipt(receiptResponse.data.receipt);
      // Initialize messages from task (latest 30)
      setAllMessages(taskResponse.data.task.messages || []);
      setCurrentPage(0); // Reset page on fresh fetch
      setError('');
    } catch (err) {
      console.error('Task detail error:', err.response?.data || err.message);
      // Better error message for access/not found errors
      const status = err.response?.status;
      if (status === 404 || status === 403 || status === 401) {
        setError('Task not found or access denied');
      } else {
        setError(err.response?.data?.error || 'Failed to load task details');
      }
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Load more (older) messages
  const loadMoreMessages = async () => {
    if (loadingMoreMessages || !task?.hasMoreMessages) return;
    setLoadingMoreMessages(true);
    try {
      const nextPage = currentPage + 1;
      const res = await api.get(`/client/tasks/${taskId}/messages?page=${nextPage}&limit=30`);
      if (res.data.messages && res.data.messages.length > 0) {
        // Prepend older messages to the beginning
        setAllMessages(prev => [...res.data.messages, ...prev]);
        setCurrentPage(nextPage);
        // Update task's hasMoreMessages
        setTask(prev => ({ ...prev, hasMoreMessages: res.data.hasMore }));
      } else {
        setTask(prev => ({ ...prev, hasMoreMessages: false }));
      }
    } catch (err) {
      console.error('Load more messages error:', err);
    } finally {
      setLoadingMoreMessages(false);
    }
  };

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

  // ==================== CHAT MEDIA (Phase 2C parity) — direct-to-R2 video/audio ====================
  // Mirrors Client Support / Admin TaskDetail behavior. Bytes go browser -> R2 via
  // presigned PUT (XHR, no 30s timeout); the Node backend only sees server-issued
  // metadata. The text/image flow above is untouched.
  const showMediaToast = (msg) => {
    setMediaToast(msg);
    setTimeout(() => setMediaToast(null), 4000);
  };

  const patchPendingMedia = (tempId, patch) => {
    setPendingMedia(prev => prev.map(m => m._tempId === tempId ? { ...m, ...patch } : m));
  };

  const startMediaUpload = async (fileOrBlob, kind, { tempId: existingTempId = null, name = null, mime = null } = {}) => {
    if (!taskId) return;
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
      setPendingMedia(prev => [...prev, {
        _tempId: tempId,
        sender: 'CLIENT',
        text: '',
        attachments: [{ _upload: 'uploading', _progress: 0, kind, name: fileName, size: fileOrBlob.size }],
        createdAt: new Date().toISOString(),
        _optimistic: true
      }]);
    } else {
      patchPendingMedia(tempId, { attachments: [{ _upload: 'uploading', _progress: 0, kind, name: fileName, size: fileOrBlob.size }] });
    }

    const abortController = new AbortController();
    uploadsRef.current.set(tempId, { blob: fileOrBlob, kind, name: fileName, mime: fileMime, taskId, abortController });

    try {
      // Fresh presigned URL for EVERY attempt (initial + retries) — never reused
      const urlRes = await api.post(`/client/tasks/${taskId}/media/upload-url`, {
        kind, filename: fileName, size: fileOrBlob.size, mime: fileMime
      });
      const { uploadUrl, attachment } = urlRes.data || {};
      if (!uploadUrl || !attachment) throw new Error('No upload URL returned');

      await putToR2(uploadUrl, fileOrBlob, {
        contentType: fileMime,
        signal: abortController.signal,
        onProgress: (pct) => patchPendingMedia(tempId, {
          attachments: [{ _upload: 'uploading', _progress: pct, kind, name: fileName, size: fileOrBlob.size }]
        })
      });

      patchPendingMedia(tempId, { attachments: [{ _upload: 'sending', kind, name: fileName, size: fileOrBlob.size }] });
      // Send with the SERVER-ISSUED metadata; server re-validates + HEAD-checks the R2 object
      await api.post(`/client/tasks/${taskId}/message`, { text: '', attachments: [attachment] });
      // Remove the optimistic bubble, then reuse the existing authoritative refresh
      setPendingMedia(prev => prev.filter(m => m._tempId !== tempId));
      // Terminal success — the Blob is no longer needed for Retry; release it.
      uploadsRef.current.delete(tempId);
      await fetchTask();
    } catch (err) {
      if (err.message === 'cancelled') return; // discard/unmount already cleaned up
      // FAILED upload: keep the Blob in uploadsRef so Retry can re-upload it
      // with a fresh presigned URL. Only success / Discard / unmount release it.
      patchPendingMedia(tempId, {
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
    setPendingMedia(prev => prev.filter(m => m._tempId !== tempId));
  };

  // CHAT MEDIA (delete): confirmed media only (pendingMedia has no server key and
  // never reaches this handler). Delete affordance is ONLY rendered for the client's
  // OWN CLIENT-sent media — admin media never gets onDelete. All authorization is
  // re-verified server-side; on success we mark the attachment deleted locally so the
  // bubble flips to the inert "Media deleted" chip without resetting pagination.
  const handleDeleteMedia = (msg, att) => {
    if (!msg?._id || !att?.key) {
      // Never fail silently — surface exactly which value the delete flow is missing
      const missing = !msg?._id ? 'messageId' : 'attachment key';
      console.error('[Delete Media] Aborted — missing', missing, { msg, att });
      showMediaToast(`Cannot delete media: missing ${missing}`);
      return;
    }
    if (!window.confirm('Delete this media?')) return;
    deleteMedia(taskId, msg._id, att.key)
      .then(() => {
        setAllMessages(prev => prev.map(m =>
          m._id === msg._id
            ? { ...m, attachments: (m.attachments || []).map(a => (a && typeof a === 'object' && a.key === att.key ? { ...a, deleted: true } : a)) }
            : m
        ));
      })
      .catch(err => {
        showMediaToast(err.response?.data?.error || 'Could not delete media');
      });
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
    
    approvedItems.forEach((approval, idx) => {
      const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
      const status = approval.allowChanges === false ? 'Locked ✓' : 'Editable';
      
      report += `[ ${approval.title} ]\n\n`;
      report += `Final: ${latest?.selectedOptions?.join(', ') || 'No selection'}\n\n`;
      report += `Status: ${status}\n`;
      
      if ((approval.selectionsHistory || []).length > 0) {
        report += `\nHistory:\n`;
        approval.selectionsHistory.forEach((h) => {
          report += `  • ${h.selectedOptions?.join(', ')} (${formatTimestamp(h.timestamp)})\n`;
        });
      }
      
      // Add spacing between approvals
      if (idx < approvedItems.length - 1) {
        report += `\n${'—'.repeat(30)}\n\n`;
      }
    });
    
    report += `\n---`;
    
    navigator.clipboard.writeText(report).then(() => {
      setCopyToast('Report copied');
      setTimeout(() => setCopyToast(null), 2500);
    }).catch((error) => {
      console.error('Copy failed:', error);
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
          {visibleApprovals.map((approval, idx) => (
            <div key={`filter-approval-${approval.id || idx}`}>
              <ApprovalBox
                approval={approval}
                taskId={taskId}
                onSubmitSuccess={fetchTask}
                onViewHistory={(a) => setHistoryModalApproval(a)}
                compact={isFullScreen}
                readOnly={task?.isAssignedUser}
              />
              {/* View in Chat button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-8px', marginBottom: '12px' }}>
                <button
                  onClick={() => setShowOnlyApprovals(false)}
                  style={{
                    padding: '6px 12px', fontSize: '11px', fontWeight: '600',
                    backgroundColor: '#f1f5f9', color: '#64748b',
                    border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer'
                  }}
                >
                  ← View in Chat
                </button>
              </div>
            </div>
          ))}
        </>
      );
    }

    // Merge messages and approvals into single timeline, sorted by timestamp
    // Use allMessages (paginated) instead of task.messages
    // CHAT MEDIA: optimistic pending media merges at this single point; its
    // timestamp is Date.now() at creation, so it always sorts at the end.
    const messages = [...allMessages, ...pendingMedia];
    const approvalItems = visibleApprovals.map(a => ({ ...a, _type: 'approval', _timestamp: new Date(a.createdAt || 0).getTime() }));
    const messageItems = messages.map(m => ({ ...m, _type: 'message', _timestamp: new Date(m.createdAt || 0).getTime() }));
    const timeline = [...messageItems, ...approvalItems].sort((a, b) => a._timestamp - b._timestamp);

    // Empty state
    if (timeline.length === 0) {
      return (
        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: baseFontSize, padding: isFullScreen ? '40px 0' : '40px 0' }}>
          No messages yet. {isFullScreen ? 'Start the conversation!' : 'Start a conversation!'}
        </p>
      );
    }

    // Render helper for approval card
    const renderApprovalCard = (approval, idx) => (
      <ApprovalBox
        key={`approval-${approval.id || idx}`}
        approval={approval}
        taskId={taskId}
        onSubmitSuccess={fetchTask}
        onViewHistory={(a) => setHistoryModalApproval(a)}
        compact={isFullScreen}
        readOnly={task?.isAssignedUser}
      />
    );

    // Render helper for message
    const renderMessage = (msg, idx) => {
      const isAdmin = msg.sender === 'ADMIN';
      const isAssignedUser = msg.senderLabel === 'ASSIGNED_USER';
      const isCurrentUser = msg.senderId === currentUserId;
      const isTaskOwner = task && task.clientId === msg.senderId;
      
      // Determine sender display label
      let senderLabel = 'CLIENT';
      if (isAdmin) {
        senderLabel = 'Admin';
      } else if (isCurrentUser && isAssignedUser) {
        // Current user is an assigned operational user
        const assignedUser = (task.assignedUsers || []).find(u => u.userId === msg.senderId);
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
        const assignedUser = (task.assignedUsers || []).find(u => u.userId === msg.senderId);
        if (assignedUser && assignedUser.designation) {
          senderLabel = assignedUser.designation;
        } else {
          senderLabel = 'Team';
        }
      } else if (isTaskOwner) {
        // Real client/customer (task owner)
        senderLabel = 'Client';
      }
      
      return (
      <div key={`msg-${idx}`} style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isAdmin ? 'flex-end' : 'flex-start',
        marginBottom
      }}>
        {/* Sender Label */}
        <span style={{
          fontSize: '11px', fontWeight: '600',
          color: isAdmin ? '#6366f1' : '#64748b',
          marginBottom: '4px',
          paddingLeft: isAdmin ? '0' : '4px',
          paddingRight: isAdmin ? '4px' : '0'
        }}>
          {senderLabel}
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
                // CHAT MEDIA: server media objects render via MediaBubble (video/audio
                // player + upload states); legacy strings / plain-url objects keep the
                // exact existing <img> path.
                if (att && typeof att === 'object' && att.kind) {
                  // Delete affordance only on the client's OWN confirmed media;
                  // server re-verifies senderId ownership. Admin media never gets onDelete.
                  const senderIdStr = msg.senderId && typeof msg.senderId === 'object' ? (msg.senderId._id || '') : (msg.senderId || '');
                  const canDelete = msg.sender === 'CLIENT' && currentUserId && String(senderIdStr) === String(currentUserId);
                  return (
                    <MediaBubble
                      key={attIdx}
                      att={att}
                      taskId={taskId}
                      onRetry={handleRetryMedia}
                      onDiscard={handleDiscardMedia}
                      onDelete={canDelete ? (a) => handleDeleteMedia(msg, a) : undefined}
                    />
                  );
                }
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
    );
  };

    return (
      <>
        {/* Load More button - shown when there are older messages */}
        {task?.hasMoreMessages && (
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <button
              onClick={loadMoreMessages}
              disabled={loadingMoreMessages}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '500',
                color: '#6366f1',
                backgroundColor: '#f0f9ff',
                border: '1px solid #e0e7ff',
                borderRadius: '8px',
                cursor: loadingMoreMessages ? 'not-allowed' : 'pointer',
                opacity: loadingMoreMessages ? 0.7 : 1
              }}
            >
              {loadingMoreMessages ? 'Loading...' : `Load older messages (${task.totalMessages - allMessages.length} more)`}
            </button>
          </div>
        )}
        {timeline.map((item, idx) => 
          item._type === 'approval' ? renderApprovalCard(item, idx) : renderMessage(item, idx)
        )}
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
        const defaultUpload = res.data.profile?.defaultUploadFolder || '';
        setUserDefaultFolder(defaultFolder);
        setUserDefaultUploadFolder(defaultUpload);
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
      // Deep link lands on a collapsed-by-default section — open it so the chat is visible
      setOpenSections(prev => ({ ...prev, discussion: true }));
      setTimeout(() => {
        discussionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [loading, task, searchParams]);

  // Auto-scroll to latest message when messages update (delayed to ensure DOM is ready)
  useEffect(() => {
    if (task?.messages?.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 350);
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

  // Commission-task deadline label — existing deadline data only (e.g. "29 Aug, 6:00 PM")
  const formatDeadline = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const dayMonth = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayMonth}, ${time}`;
  };

  // Time remaining until the deadline — pure display, derived ONLY from the
  // existing deadline value. Returns null when no valid deadline exists.
  const getRemainingLabel = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const diff = d.getTime() - Date.now();
    if (diff <= 0) return 'Deadline passed';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} left`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} left`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} left`;
  };

  // Skeleton Loader
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
          <div style={{ width: '92px', height: '16px', backgroundColor: '#f1f1f1', borderRadius: '8px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ backgroundColor: '#fff', borderRadius: '18px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #eef0f3' }}>
            <div style={{ width: '55%', height: '20px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '100%', height: '6px', backgroundColor: '#f1f1f1', borderRadius: '999px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '18px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #eef0f3' }}>
            <div style={{ width: '40%', height: '14px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '100%', height: '44px', backgroundColor: '#f1f1f1', borderRadius: '10px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ backgroundColor: '#fff', borderRadius: '18px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)', border: '1px solid #eef0f3' }}>
            <div style={{ width: '100%', height: '10px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '8px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '75%', height: '10px', backgroundColor: '#f1f1f1', borderRadius: '6px', animation: 'pulse 1.5s infinite' }} />
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
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>Unable to Load Task</h2>
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
  const activeMilestone = getActiveMilestone(task.milestones, progress);

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

        {/* ==========================================================
            HEADER CARD — identity + state + progress at a glance.
            ONE strong card replaces the old hero + separate progress
            accordion. Progress/milestones are DISPLAY ONLY (existing
            data; no calculation changes). */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '18px', padding: '18px', marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
          border: isPendingApproval ? '1.5px solid #6366f1' : '1px solid #eef0f3'
        }}>
          {/* Row 1: platform icon + status pill (ONE consistent status system) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {task.progressIcon && task.progressIcon.type === 'preset' && isValidPreset(task.progressIcon.value) && (
              <PresetIcon name={task.progressIcon.value} size={24} />
            )}
            <span style={{
              fontSize: '11px', fontWeight: '700', color: humanStatus.color,
              backgroundColor: humanStatus.bg, padding: '4px 10px',
              borderRadius: '100px', whiteSpace: 'nowrap'
            }}>
              {humanStatus.label}
            </span>
            {task.isAssignedUser && (
              <span style={{
                fontSize: '9px', fontWeight: '700', color: '#15803d',
                backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                padding: '3px 7px', borderRadius: '6px', letterSpacing: '0.04em',
                textTransform: 'uppercase', whiteSpace: 'nowrap'
              }}>
                {'\uD83D\uDCB0 Commission'}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '10px 0 0 0',
            lineHeight: 1.35, letterSpacing: '-0.01em', overflowWrap: 'anywhere'
          }}>
            {task.title}
          </h1>

          {/* Meta row: Order ref + dates (existing fields only) */}
          {(task.orderCode || task.startDate || task.createdAt) && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
              {task.orderCode && <span style={{ color: '#64748b', fontWeight: '600' }}>Order {task.orderCode}</span>}
              {task.orderCode && (task.startDate || task.createdAt) && <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />}
              {task.startDate && <span>Started {formatDate(task.startDate)}</span>}
              {!task.startDate && task.createdAt && <span>Created {formatDate(task.createdAt)}</span>}
              {(task.endDate || task.deadline) && (
                <>
                  <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
                  <span>Due {formatDate(task.endDate || task.deadline)}</span>
                </>
              )}
              {/* Quantity — existing privacy conditions kept identical */}
              {task.quantity && task.showQuantityToClient && !(task.myCommission > 0) && (
                <>
                  <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#cbd5e1', flexShrink: 0 }} />
                  <span>Qty {task.quantity}</span>
                </>
              )}
            </div>
          )}

          {/* Feature image (single render — was duplicated before) */}
          {task.featureImage && (
            <div style={{ marginTop: '12px', borderRadius: '12px', overflow: 'hidden' }}>
              <img
                src={task.featureImage}
                alt=""
                style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.target.parentElement.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Progress — ALWAYS visible (existing ProgressWithFlag, display only) */}
          <div style={{ marginTop: '14px' }}>
            {isPendingApproval ? (
              <div style={{ padding: '12px 14px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, fontWeight: '500' }}>
                  {'\u23F3'} Booked {'\u2014'} admin will review and start it shortly.
                </p>
              </div>
            ) : task.isAssignedUser ? (
              /* COMMISSION TASK — deadline-oriented presentation (existing
                 backend deadline only; never a calculated/invented date).
                 Non-commission tasks keep ProgressWithFlag below, untouched. */
              (() => {
                const deadlineValue = task.deadline || task.endDate;
                const deadlineLabel = deadlineValue ? formatDeadline(deadlineValue) : null;
                const remainingLabel = deadlineValue ? getRemainingLabel(deadlineValue) : null;
                const overdue = remainingLabel === 'Deadline passed';
                return (
                  <div style={{
                    padding: '14px', borderRadius: '12px',
                    backgroundColor: overdue ? '#fffbeb' : '#eef2ff',
                    border: overdue ? '1px solid #fde68a' : '1px solid #e0e7ff',
                    display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
                  }}>
                    <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{'\u23F1'}</span>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: overdue ? '#92400e' : '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                        Deadline
                      </p>
                      <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '2px 0 0' }}>
                        {deadlineLabel || 'No deadline set'}
                      </p>
                    </div>
                    {remainingLabel && (
                      <span style={{
                        fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
                        padding: '5px 10px', borderRadius: '100px',
                        backgroundColor: overdue ? '#fef3c7' : '#fff',
                        color: overdue ? '#92400e' : '#4f46e5',
                        border: overdue ? '1px solid #fde68a' : '1px solid #e0e7ff'
                      }}>
                        {remainingLabel}
                      </span>
                    )}
                  </div>
                );
              })()
            ) : (
              <>
                <ProgressWithFlag
                  progress={progress}
                  milestones={milestones}
                  size="default"
                  showLabel={true}
                  showPercentage={true}
                  progressIcon={task.progressIcon}
                />
                {/* Milestone stepper — same visual language as the approved Task
                    List. Existing milestone data only; hidden when none. */}
                {(() => {
                  if (!milestones || milestones.length === 0) return null;
                  const sortedAsc = [...milestones].sort((a, b) => a.percentage - b.percentage);
                  const reachedAny = sortedAsc.some(m => m.reached);
                  const focusMilestone = activeMilestone || (!reachedAny ? sortedAsc[0] : null);
                  return (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {sortedAsc.map((m, i) => {
                          const isCurrent = focusMilestone && m.name === focusMilestone.name && m.percentage === focusMilestone.percentage;
                          return (
                            <React.Fragment key={`${m.name}-${i}`}>
                              {i > 0 && (
                                <span style={{ flex: 1, height: '2px', backgroundColor: sortedAsc[i - 1].reached ? (sortedAsc[i - 1].color || '#22c55e') : '#e2e8f0', minWidth: '6px' }} />
                              )}
                              <span
                                title={m.name}
                                style={{
                                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '10px', fontWeight: '700',
                                  backgroundColor: m.reached ? (m.color || '#22c55e') : '#fff',
                                  color: m.reached ? '#fff' : '#94a3b8',
                                  border: m.reached ? 'none' : `1.5px solid ${isCurrent ? '#6366f1' : '#e2e8f0'}`,
                                  boxShadow: isCurrent ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none'
                                }}
                              >
                                {m.reached ? (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                ) : (i + 1)}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {focusMilestone && (
                        <p style={{ fontSize: '11px', fontWeight: '600', color: focusMilestone.color || '#64748b', margin: '6px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {focusMilestone.name}{focusMilestone.percentage ? ` \u00B7 ${focusMilestone.percentage}%` : ''}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Description (existing value, normal compact section) */}
          {formatDescription(task.description) && (
            <p style={{
              fontSize: '14px', color: '#475569', margin: '14px 0 0 0', lineHeight: 1.55,
              whiteSpace: 'pre-wrap', borderTop: '1px solid #f1f5f9', paddingTop: '12px'
            }}>
              {formatDescription(task.description)}
            </p>
          )}
        </div>

        {/* FINAL DELIVERY — promoted directly after the header/state section so
            the deliverable is seen immediately when ready. Link, permissions,
            notes and timestamp rendering unchanged. */}
        {task.finalDeliveryLink && (
          <div style={{
            backgroundColor: '#fff', borderRadius: '18px', padding: '16px', marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
            border: '1px solid #eef0f3', borderTop: '3px solid #22c55e'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Final Delivery</p>
              <span style={{ padding: '3px 10px', borderRadius: '100px', fontSize: '10px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>
                {'\u2713'} Ready
              </span>
            </div>

            {/* Download Button */}
            <a
              href={task.finalDeliveryLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                width: '100%', padding: '13px 20px', marginBottom: task.finalDeliveryText ? '12px' : '0',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff', fontSize: '14px', fontWeight: '600', borderRadius: '12px',
                textDecoration: 'none', boxShadow: '0 4px 14px rgba(34, 197, 94, 0.3)',
                boxSizing: 'border-box', minHeight: '44px'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Open Final Delivery Folder
            </a>

            {/* Delivery Notes */}
            {task.finalDeliveryText && (
              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Delivery Notes</label>
                <p style={{ fontSize: '13px', color: '#334155', lineHeight: 1.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {task.finalDeliveryText}
                </p>
              </div>
            )}

            {/* Delivered Timestamp */}
            {task.finalDeliveredAt && (
              <p style={{ fontSize: '11px', color: '#15803d', margin: '10px 0 0', textAlign: 'right' }}>
                Delivered on {new Date(task.finalDeliveredAt).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>
        )}

        <div ref={discussionRef} style={{
          backgroundColor: '#fff', borderRadius: '18px', padding: '16px', marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
          border: '1px solid #eef0f3'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: openSections.discussion ? '14px' : '0' }}>
            {/* Clickable title area only — header action buttons remain separate */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={openSections.discussion}
              onClick={() => toggleSection('discussion')}
              onKeyDown={(e) => sectionKeyDown(e, 'discussion')}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, cursor: 'pointer' }}
            >
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Discussion</h2>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Chat with admin about this task</p>
              </div>
            </div>
            {/* Approval Filter Toggle — same filter behavior, brand pill styling */}
            {(task.approvalRequests?.filter(a => a.isVisibleToClient !== false).length > 0) && (
              <button
                onClick={() => setShowOnlyApprovals(!showOnlyApprovals)}
                style={{
                  padding: '6px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600',
                  backgroundColor: showOnlyApprovals ? '#eef2ff' : '#f8fafc',
                  color: showOnlyApprovals ? '#4f46e5' : '#64748b',
                  border: showOnlyApprovals ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.2s'
                }}
              >
                {task.approvalRequests.filter(a => a.isVisibleToClient !== false).length > 0 && (
                  <>{'\u2705'} Approvals ({task.approvalRequests.filter(a => a.isVisibleToClient !== false).length})</>
                )}
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
                width: '34px', height: '34px', borderRadius: '10px',
                backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.2s'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span style={{ color: '#94a3b8', flexShrink: 0 }} aria-hidden="true"><Chevron open={openSections.discussion} /></span>
          </div>

          <Collapse open={openSections.discussion}>
          {/* Messages */}
          <div style={{ maxHeight: '340px', overflowY: 'auto', marginBottom: '16px', padding: '4px' }}>
            {renderChatContent(false)}
          </div>

          {/* Input */}
          <div>
            {/* CHAT MEDIA: compact media error/info strip */}
            {mediaToast && (
              <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>{mediaToast}</div>
            )}
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
            {isRecording && mediaEnabled ? (
              <VoiceRecorder onRecorded={handleRecorded} onCancel={handleRecordCancel} onError={handleRecordError} />
            ) : (
            <div className="gva-composer-row" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                style={{ display: 'none' }}
              />
              {mediaEnabled && <input type="file" ref={videoInputRef} onChange={handleVideoSelect} accept={VIDEO_ACCEPT} style={{ display: 'none' }} />}
              <button
                onClick={() => (mediaEnabled ? setAttachSheetOpen(true) : fileInputRef.current?.click())}
                disabled={messageAttachments.length >= 5}
                style={{
                  padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none',
                  cursor: messageAttachments.length >= 5 ? 'not-allowed' : 'pointer', opacity: messageAttachments.length >= 5 ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px'
                }}
                title="Attach"
              >
                📎
              </button>
              <textarea
                className="gva-composer-input"
                ref={textareaRef}
                value={messageText}
                onChange={handleTextareaChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
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
              {mediaEnabled && isRecordingSupported() && (
                <button
                  onClick={() => setIsRecording(true)}
                  title="Record voice note"
                  style={{ padding: '12px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
            )}
          </div>
          </Collapse>
        </div>

        {/* FINAL APPROVED DECISIONS — important outcome, kept as its own
            section but substantially lighter: white premium card, subtle
            green accent, compact rows. Export Proof action unchanged. */}
        {(() => {
          const approvedItems = (task.approvalRequests || [])
            .filter(a => a.isVisibleToClient !== false && (a.selectionsHistory || []).length > 0);
          if (approvedItems.length === 0) return null;
          return (
            <div style={{
              backgroundColor: '#fff', borderRadius: '18px', padding: '16px', marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid #eef0f3', borderTop: '3px solid #22c55e', position: 'relative'
            }}>
              {/* Copy Toast */}
              {copyToast && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px',
                  backgroundColor: '#166534', color: '#fff', padding: '6px 12px',
                  borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 10
                }}>
                  {copyToast}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#166534', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{'\u2705'}</span> Final Approved Decisions
                </h4>
                <button
                  onClick={handleExportProof}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '100px',
                    fontSize: '11px', fontWeight: '600',
                    backgroundColor: '#f0fdf4', color: '#166534',
                    border: '1px solid #bbf7d0', cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                  Export Proof
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {approvedItems.map((approval, idx) => {
                  const latest = approval.selectionsHistory[approval.selectionsHistory.length - 1];
                  const isLocked = approval.isLocked;
                  return (
                    <div key={`summary-${approval.id || idx}`} style={{
                      padding: '10px 2px',
                      borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 2px 0' }}>{approval.title}</p>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#166534', margin: 0, overflowWrap: 'anywhere' }}>
                            {latest?.selectedOptions?.join(', ') || 'No selection'}
                          </p>
                        </div>
                        {isLocked && (
                          <span style={{
                            padding: '3px 8px', fontSize: '10px', fontWeight: '700',
                            backgroundColor: '#dcfce7', color: '#166534', borderRadius: '100px',
                            whiteSpace: 'nowrap'
                          }}>
                            Locked {'\u2713'}
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

        {/* Lightbox */}
        {lightboxImage && (
          <div 
            onClick={() => setLightboxImage(null)}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer' }}
          >
            <img src={lightboxImage} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px' }} />
          </div>
        )}

        {/* TASK INFO — ONE compact information section merging the old
            Details / Pricing / Countdown / Receipt / Timeline reference data
            into clean key/value rows. All privacy conditions remain
            semantically identical. */}
        {(() => {
          // Privacy conditions kept SEMANTICALLY IDENTICAL to the previous cards
          // Recipient privacy: commission recipients see ONLY their commission
          const showQty = task.quantity && task.showQuantityToClient && !(task.myCommission > 0);
          const showCommission = task.myCommission > 0;
          // FIX preserved: creditsUsed (actual deducted) over creditCost (base price)
          const showCredits = !showCommission && (task.creditsUsed || task.creditCost) && task.showCreditsToClient !== false;
          // Recipient privacy: commission recipients must never see task pricing
          const showOffer = task.offerPrice && !(task.myCommission > 0);
          const showCountdown = task.countdownEndDate && new Date(task.countdownEndDate) > new Date();
          const hasInfo = task.publicNotes || showQty || showCommission || showCredits || showOffer || showCountdown || receipt;
          if (!hasInfo) return null;

          const Row = ({ label, value, valueColor }) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 2px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '13px', color: '#64748b', flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: valueColor || '#0f172a', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
            </div>
          );

          return (
            <div style={{
              backgroundColor: '#fff', borderRadius: '18px', padding: '16px', marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid #eef0f3'
            }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Task Info</p>

              {/* Public notes/details */}
              {task.publicNotes && (
                <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.55, margin: '6px 0 4px', whiteSpace: 'pre-wrap' }}>
                  {task.publicNotes}
                </p>
              )}

              <div>
                {/* Scope Quantity */}
                {showQty && <Row label="Scope Quantity" value={task.quantity} />}

                {/* Commission (Phase 3) — shown ONLY to the task's commission
                    recipient; amount comes verbatim from the persisted
                    EarningsLedger record. Falls back to existing Credits Used. */}
                {showCommission && <Row label="Commission" value={'\u20B9' + Number(task.myCommission).toLocaleString('en-IN')} valueColor="#15803d" />}
                {showCredits && <Row label="Credits Used" value={`${task.creditsUsed || task.creditCost || 0} credits`} valueColor="#15803d" />}

                {/* Offer Price */}
                {showOffer && (
                  <Row label="Offer Price" value={
                    <span>
                      {task.originalPrice && (
                        <span style={{ fontSize: '12px', color: '#a16207', textDecoration: 'line-through', marginRight: '6px', fontWeight: '500' }}>{task.originalPrice} credits</span>
                      )}
                      <span style={{ color: '#f59e0b' }}>{task.offerPrice} credits</span>
                    </span>
                  } />
                )}

                {/* Countdown — compact row instead of the oversized red card */}
                {showCountdown && <Row label="Offer Ends" value={formatDateTime(task.countdownEndDate)} valueColor="#dc2626" />}
              </div>

              {/* SERVICE RECEIPT — existing data + download behavior unchanged */}
              {receipt && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#334155', margin: 0 }}>Service Receipt</p>
                    <span style={{
                      padding: '3px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: '700',
                      backgroundColor: '#dcfce7', color: '#15803d'
                    }}>
                      Paid via Wallet
                    </span>
                  </div>
                  <Row label="Receipt Number" value={receipt.receiptNumber} />
                  <Row label="Credits Used" value={`${receipt.creditsUsed?.toFixed(2)} credits`} valueColor="#15803d" />
                  <Row label="Date" value={new Date(receipt.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
                  {receipt.isDownloadableByClient && (
                    <button
                      onClick={handleDownloadReceipt}
                      disabled={downloadingReceipt}
                      style={{
                        width: '100%', padding: '14px 20px', marginTop: '8px', minHeight: '44px',
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

              {/* Created / Updated footer (existing timeline data, compact) */}
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '12px 2px 0' }}>
                Created {formatDateTime(task.createdAt)}
                {task.updatedAt && task.updatedAt !== task.createdAt && ` · Updated ${formatDateTime(task.updatedAt)}`}
              </p>
            </div>
          );
        })()}

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
                  backgroundColor: showOnlyApprovals ? '#eef2ff' : '#f1f5f9',
                  color: showOnlyApprovals ? '#4f46e5' : '#64748b',
                  border: showOnlyApprovals ? '1px solid #6366f1' : '1px solid #e2e8f0',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
              >
                {'\u2705'} Approvals ({task.approvalRequests.filter(a => a.isVisibleToClient !== false).length})
              </button>
            )}
          </div>

          {/* Messages - Full Height */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {renderChatContent(true)}
          </div>

          {/* Footer - Input */}
          <div className="gva-composer-bar" style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
            {/* CHAT MEDIA: compact media error/info strip */}
            {mediaToast && (
              <div style={{ marginBottom: '8px', padding: '8px 12px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>{mediaToast}</div>
            )}
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
            {isRecording && mediaEnabled ? (
              <VoiceRecorder onRecorded={handleRecorded} onCancel={handleRecordCancel} onError={handleRecordError} />
            ) : (
            <div className="gva-composer-row" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                style={{ display: 'none' }}
              />
              {mediaEnabled && <input type="file" ref={videoInputRef} onChange={handleVideoSelect} accept={VIDEO_ACCEPT} style={{ display: 'none' }} />}
              <button
                onClick={() => (mediaEnabled ? setAttachSheetOpen(true) : fileInputRef.current?.click())}
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
                className="gva-composer-input"
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
              {mediaEnabled && isRecordingSupported() && (
                <button
                  onClick={() => setIsRecording(true)}
                  title="Record voice note"
                  style={{ padding: '14px', backgroundColor: '#f1f5f9', borderRadius: '14px', border: 'none', cursor: 'pointer', minWidth: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </div>
            )}
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

      {/* CHAT MEDIA: attachment menu — ONE shared instance for both composers (inline
          + fullscreen). zIndex 10001 sits above the fullscreen chat overlay (9999)
          and the history modal (10000). */}
      {attachSheetOpen && (
        <AttachSheet
          onClose={() => setAttachSheetOpen(false)}
          onPickPhoto={() => { setAttachSheetOpen(false); fileInputRef.current?.click(); }}
          onPickVideo={() => { setAttachSheetOpen(false); videoInputRef.current?.click(); }}
        />
      )}
    </div>
  );
};

export default TaskDetail;
