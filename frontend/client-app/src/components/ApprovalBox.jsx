import React, { useState } from 'react';
import { submitApprovalSelection } from '../services/approvalService';

/**
 * Reusable Approval Box Component
 * Used in both TaskDetail and Support pages
 * 
 * @param {Object} props
 * @param {Object} props.approval - Approval object from backend
 * @param {string} props.taskId - Task ID
 * @param {Function} props.onSubmitSuccess - Callback after successful submission
 * @param {Function} props.onViewHistory - Callback to open history modal (optional)
 * @param {boolean} props.compact - Use compact styling (optional)
 */
const ApprovalBox = ({ 
  approval, 
  taskId, 
  onSubmitSuccess, 
  onViewHistory,
  compact = false 
}) => {
  // Local state for this approval
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Derive values from approval
  const latestSelection = approval.selectionsHistory?.[approval.selectionsHistory.length - 1];
  const savedOptions = latestSelection?.selectedOptions || [];
  const currentSelection = selectedOptions.length > 0 ? selectedOptions : savedOptions;
  const hasHistory = (approval.selectionsHistory || []).length > 0;
  const isLocked = approval.isLocked;

  // Handle option toggle
  const handleOptionToggle = (option) => {
    if (isLocked) return;
    
    setSelectedOptions(prev => {
      if (approval.type === 'single') {
        // Single choice - replace
        return [option];
      } else {
        // Multi choice - toggle
        if (prev.includes(option)) {
          return prev.filter(o => o !== option);
        } else {
          return [...prev, option];
        }
      }
    });
  };

  // Handle submit
  const handleSubmit = async () => {
    if (selectedOptions.length === 0 || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await submitApprovalSelection(taskId, approval.id, selectedOptions);
      setSelectedOptions([]); // Clear local selection
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err) {
      console.error('[ApprovalBox] Submit error:', err);
      setError(err.response?.data?.error || 'Failed to submit selection');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSubmitting(false);
    }
  };

  // Styles
  const baseFontSize = compact ? '13px' : '14px';
  const padding = compact ? '12px' : '16px';
  const borderRadius = compact ? '12px' : '16px';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      marginBottom: compact ? '12px' : '16px'
    }}>
      <span style={{ 
        fontSize: '11px', 
        fontWeight: '600', 
        color: '#f59e0b', 
        marginBottom: '4px' 
      }}>
        Admin (Approval)
      </span>
      
      <div style={{
        maxWidth: compact ? '85%' : '90%',
        padding,
        borderRadius,
        backgroundColor: '#fef3c7',
        border: '2px solid #fbbf24'
      }}>
        {/* Title */}
        <p style={{ 
          fontSize: baseFontSize, 
          fontWeight: '600', 
          color: '#92400e', 
          margin: '0 0 12px 0' 
        }}>
          {approval.title}
        </p>

        {/* Options */}
        {approval.options?.map((opt, idx) => {
          const isSelected = currentSelection.includes(opt);
          return (
            <button
              key={idx}
              onClick={() => handleOptionToggle(opt)}
              disabled={isLocked}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: baseFontSize,
                marginBottom: '8px',
                backgroundColor: isSelected ? '#dcfce7' : '#fff',
                border: isSelected ? '2px solid #22c55e' : '2px solid #e5e7eb',
                textAlign: 'left',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
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

        {/* Submit Button - Only show if not locked */}
        {!isLocked && (
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedOptions.length === 0}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: baseFontSize,
              fontWeight: '600',
              backgroundColor: selectedOptions.length > 0 ? '#6366f1' : '#e2e8f0',
              color: selectedOptions.length > 0 ? '#fff' : '#94a3b8',
              border: 'none',
              borderRadius: '10px',
              cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.6 : 1
            }}
          >
            {submitting 
              ? 'Submitting...' 
              : (savedOptions.length > 0 ? 'Update Selection' : 'Submit Selection')}
          </button>
        )}

        {/* Error Message */}
        {error && (
          <p style={{ 
            fontSize: '12px', 
            color: '#dc2626', 
            margin: '8px 0 0', 
            textAlign: 'center' 
          }}>
            {error}
          </p>
        )}

        {/* Status */}
        <p style={{ 
          fontSize: '11px', 
          color: '#92400e', 
          margin: '8px 0', 
          textAlign: 'center' 
        }}>
          {isLocked && hasHistory 
            ? '✅ Approved (Locked)' 
            : isLocked 
              ? '🔒 Locked' 
              : (savedOptions.length > 0 ? '✓ Submitted' : 'Awaiting selection')}
        </p>

        {/* View History Button - Only if allowed and has history */}
        {approval.showHistoryToClient && hasHistory && onViewHistory && (
          <button
            onClick={() => onViewHistory(approval)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              border: '1px solid #7dd3fc',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            View History
          </button>
        )}
      </div>
    </div>
  );
};

export default ApprovalBox;
