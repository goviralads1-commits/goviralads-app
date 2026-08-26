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
  compact = false,
  readOnly = false
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
    if (isLocked || readOnly) return;
    
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

  // Styles — premium visual treatment using the app's existing design tokens.
  // Visual-only: no state, selection, submission, locking or history logic changed.
  const baseFontSize = compact ? '13px' : '14px';
  const padding = compact ? '14px' : '18px';
  const borderRadius = '16px';
  const isSingle = approval.type === 'single';

  // Status pill colors (same status texts as before)
  const statusPill = (isLocked && hasHistory)
    ? { bg: '#dcfce7', fg: '#15803d' }   // ✅ Approved (Locked)
    : isLocked
      ? { bg: '#f1f5f9', fg: '#475569' } // 🔒 Locked
      : savedOptions.length > 0
        ? { bg: '#dcfce7', fg: '#15803d' } // ✓ Submitted
        : { bg: '#fef3c7', fg: '#b45309' }; // Awaiting selection

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
        marginBottom: '6px' 
      }}>
        Admin (Approval)
      </span>
      
      <div style={{
        maxWidth: compact ? '85%' : '90%',
        padding,
        borderRadius,
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Branded accent bar */}
        <div style={{
          height: '4px',
          margin: `-${padding} -${padding} 14px`,
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
        }} />

        {/* Header — icon chip + mode hint + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
          <div style={{
            width: compact ? '30px' : '34px',
            height: compact ? '30px' : '34px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <svg width={compact ? '16' : '18'} height={compact ? '16' : '18'} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="4" y="3" width="16" height="18" rx="3" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: 'block',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#6366f1',
              marginBottom: '2px'
            }}>
              Approval · {isSingle ? 'Choose one' : 'Choose multiple'}
            </span>
            <p style={{ 
              fontSize: compact ? '14px' : '15px', 
              fontWeight: '700',
              lineHeight: '1.35',
              color: '#0f172a', 
              margin: 0
            }}>
              {approval.title}
            </p>
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {approval.options?.map((opt, idx) => {
            const isSelected = currentSelection.includes(opt);
            const disabled = isLocked || readOnly;
            return (
              <button
                key={idx}
                onClick={() => handleOptionToggle(opt)}
                disabled={disabled}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  fontSize: baseFontSize,
                  fontWeight: isSelected ? '600' : '500',
                  color: isSelected ? '#14532d' : '#334155',
                  backgroundColor: isSelected ? '#dcfce7' : '#ffffff',
                  border: isSelected ? '2px solid #22c55e' : '2px solid #e2e8f0',
                  boxShadow: isSelected ? '0 2px 8px rgba(34, 197, 94, 0.18)' : 'none',
                  textAlign: 'left',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
              >
                {isSingle ? (
                  <span style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    border: isSelected ? '2px solid #22c55e' : '2px solid #cbd5e1',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}>
                    {isSelected && (
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                    )}
                  </span>
                ) : (
                  <span style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '5px',
                    flexShrink: 0,
                    border: isSelected ? '2px solid #22c55e' : '2px solid #cbd5e1',
                    backgroundColor: isSelected ? '#22c55e' : 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                )}
                {opt}
              </button>
            );
          })}
        </div>

        {/* Submit Button - Only show if not locked and not read-only */}
        {!isLocked && !readOnly && (
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedOptions.length === 0}
            style={{
              width: '100%',
              minHeight: '46px',
              marginTop: '12px',
              padding: '12px',
              fontSize: baseFontSize,
              fontWeight: '700',
              background: selectedOptions.length > 0
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : '#e2e8f0',
              color: selectedOptions.length > 0 ? '#ffffff' : '#94a3b8',
              boxShadow: selectedOptions.length > 0 ? '0 4px 12px rgba(34, 197, 94, 0.3)' : 'none',
              border: 'none',
              borderRadius: '12px',
              cursor: selectedOptions.length > 0 ? 'pointer' : 'not-allowed',
              opacity: submitting ? 0.65 : 1,
              transition: 'all 0.15s ease'
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
            fontWeight: '500',
            color: '#dc2626', 
            margin: '10px 0 0', 
            textAlign: 'center' 
          }}>
            {error}
          </p>
        )}

        {/* Status */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: '600',
            color: statusPill.fg,
            backgroundColor: statusPill.bg,
            padding: '4px 10px',
            borderRadius: '9999px'
          }}>
            {isLocked && hasHistory 
              ? '✅ Approved (Locked)' 
              : isLocked 
                ? '🔒 Locked' 
                : (savedOptions.length > 0 ? '✓ Submitted' : 'Awaiting selection')}
          </span>
        </div>

        {/* View History Button - Only if allowed and has history */}
        {approval.showHistoryToClient && hasHistory && onViewHistory && (
          <button
            onClick={() => onViewHistory(approval)}
            style={{
              width: '100%',
              minHeight: '38px',
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: '600',
              backgroundColor: '#f8fafc',
              color: '#475569',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
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
