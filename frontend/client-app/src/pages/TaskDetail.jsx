import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

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

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

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
          {task.description && (
            <p style={{
              fontSize: '16px', color: '#666', margin: '16px 0 0 0', lineHeight: 1.6
            }}>
              {task.description}
            </p>
          )}
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
            <>
              {/* Progress Header - Only percentage on right */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isOverachieving && (
                    <span style={{ 
                      fontSize: '11px', fontWeight: '800', color: '#10b981', 
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '6px'
                    }}>
                      Overachieving
                    </span>
                  )}
                  <span style={{ fontSize: '36px', fontWeight: '700', color: progressColor }}>{Math.round(progress)}%</span>
                  {isOverachieving && <span style={{ fontSize: '24px' }}>🎉</span>}
                </div>
              </div>

              {/* Progress Bar - Single Moving Flag */}
              <div style={{ position: 'relative', width: '100%', overflow: 'hidden', marginBottom: '24px', paddingTop: '16px' }}>
                {/* Track */}
                <div style={{
                  width: '100%', height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', 
                  position: 'relative'
                }}>
                  {/* Fill */}
                  <div style={{
                    width: `${Math.min(progress, 100)}%`, height: '100%', 
                    background: `linear-gradient(90deg, #6366f1 0%, ${progressColor} 100%)`,
                    borderRadius: '4px', transition: 'width 0.6s ease',
                    boxShadow: progress > 0 ? `0 0 8px ${progressColor}40` : 'none'
                  }} />
                  
                  {/* Single Moving Flag - positioned at progress % */}
                  <div style={{
                    position: 'absolute',
                    left: `${Math.min(Math.max(progress, 0), 100)}%`,
                    top: '-12px',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.6s ease',
                    zIndex: 10
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      backgroundColor: progressColor,
                      border: '3px solid #fff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <span style={{ fontSize: '12px' }}>🚩</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Milestone Label - Single clean display */}
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <p style={{ 
                  fontSize: '14px', 
                  fontWeight: '500', 
                  color: activeMilestone ? (activeMilestone.color || '#1a1a1a') : '#f59e0b', 
                  margin: 0 
                }}>
                  {activeMilestone ? `🚩 ${activeMilestone.name}` : 'Scheduled'}
                </p>
              </div>

              {/* Overachieving Message */}
              {isOverachieving && (
                <div style={{ 
                  marginTop: '16px', padding: '12px 16px', 
                  backgroundColor: '#dcfce7', borderRadius: '12px', 
                  textAlign: 'center' 
                }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#15803d', margin: 0 }}>
                    🎉 Overachieving! You're doing amazing work!
                  </p>
                </div>
              )}
            </>
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
