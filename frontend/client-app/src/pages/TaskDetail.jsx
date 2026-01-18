import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const TaskDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const response = await api.get(`/client/tasks/${taskId}`);
      setTask(response.data.task);
      setError('');
    } catch (err) {
      console.error('Task detail error:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to load task details');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

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
    
    // Find the highest milestone that's been reached
    const sortedMilestones = [...milestones].sort((a, b) => b.percentage - a.percentage);
    return sortedMilestones.find(m => progress >= m.percentage) || null;
  };

  // Get next milestone
  const getNextMilestone = (milestones, progress) => {
    if (!milestones || milestones.length === 0) return null;
    
    const sortedMilestones = [...milestones].sort((a, b) => a.percentage - b.percentage);
    return sortedMilestones.find(m => progress < m.percentage) || null;
  };

  // Progress color based on milestone or fallback
  const getProgressColor = (task) => {
    const progress = task.progress || 0;
    const activeMilestone = getActiveMilestone(task.milestones, progress);
    
    if (activeMilestone) {
      return activeMilestone.color;
    }
    
    // Fallback gradient
    if (progress >= 100) return '#22c55e';
    if (progress >= 70) return '#3b82f6';
    if (progress >= 40) return '#6366f1';
    return '#8b5cf6';
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
  const progressColor = getProgressColor(task);
  const activeMilestone = getActiveMilestone(task.milestones, progress);
  const nextMilestone = getNextMilestone(task.milestones, progress);
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
            color: '#666', cursor: 'pointer', marginBottom: '32px'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All Tasks
        </button>

        {/* Hero Card - Title + Status */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '28px', padding: '36px 32px', marginBottom: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
        }}>
          {/* Status Chip */}
          <div style={{ marginBottom: '20px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
              backgroundColor: humanStatus.bg, color: humanStatus.color
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: humanStatus.color }} />
              {humanStatus.label}
            </span>
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

        {/* SMART PROGRESS CARD */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '28px', padding: '32px', marginBottom: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
        }}>
          {/* Section Header */}
          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Smart Progress</span>
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
              {/* Progress Display */}
              <div style={{ marginBottom: '28px' }}>
                {/* Header with Active Milestone */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {activeMilestone && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '8px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: '600',
                        backgroundColor: `${activeMilestone.color}15`, color: activeMilestone.color
                      }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeMilestone.color }} />
                        {activeMilestone.name}
                      </div>
                    )}
                    {task.progressMode && (
                      <span style={{ fontSize: '12px', color: '#999', fontWeight: '500' }}>
                        {task.progressMode === 'AUTO' && 'Time-based progress'}
                        {task.progressMode === 'MANUAL' && 'Number-based progress'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isOverachieving && (
                      <span style={{ 
                        fontSize: '11px', fontWeight: '800', color: '#10b981', 
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '6px',
                        marginRight: '4px'
                      }}>
                        Overachieving
                      </span>
                    )}
                    <span style={{ fontSize: '36px', fontWeight: '700', color: progressColor }}>{Math.round(progress)}%</span>
                    {isOverachieving && <span style={{ fontSize: '24px' }}>🎉</span>}
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                  width: '100%', height: '12px', backgroundColor: '#f0f0f0', borderRadius: '6px', overflow: 'visible', position: 'relative'
                }}>
                  <div style={{
                    width: `${Math.min(progress, 100)}%`, height: '100%', backgroundColor: progressColor,
                    borderRadius: '6px', transition: 'all 0.6s ease',
                    boxShadow: progress > 0 ? `0 0 12px ${progressColor}50` : 'none'
                  }} />
                  {isOverachieving && (
                    <div style={{
                      position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)',
                      width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#22c55e',
                      border: '3px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      animation: 'pulse-ring 2s infinite'
                    }} />
                  )}
                </div>

                {/* Next Milestone Indicator */}
                {nextMilestone && (
                  <div style={{ marginTop: '14px', fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>→ Next:</span>
                    <strong style={{ color: '#1a1a1a' }}>{nextMilestone.name}</strong>
                    <span>at {nextMilestone.percentage}%</span>
                  </div>
                )}
              </div>

              {/* Manual Mode: Target & Achieved Details */}
              {task.progressMode === 'MANUAL' && task.showProgressDetails && task.progressTarget && (
                <div style={{
                  padding: '20px', backgroundColor: '#fef3c7', borderRadius: '16px', marginBottom: '28px',
                  border: '2px dashed #fbbf24'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '24px' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <p style={{ fontSize: '11px', color: '#92400e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Target (Goal)</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#92400e', margin: 0 }}>{task.progressTarget}</p>
                    </div>
                    <div style={{ width: '2px', height: '40px', backgroundColor: '#fbbf24' }} />
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <p style={{ fontSize: '11px', color: '#15803d', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Achieved (Current)</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#15803d', margin: 0 }}>{task.progressAchieved || 0}</p>
                    </div>
                  </div>
                  {isOverachieving && (
                    <div style={{ marginTop: '16px', textAlign: 'center', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '10px' }}>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: '#15803d', margin: 0 }}>
                        🎉 Overachieving! You're doing amazing work!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Milestones Timeline */}
              {milestones.length > 0 && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Milestones</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {milestones
                      .sort((a, b) => a.percentage - b.percentage)
                      .map((milestone, idx) => {
                        const reached = progress >= milestone.percentage;
                        return (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 18px',
                            backgroundColor: reached ? `${milestone.color}10` : '#fafafa',
                            borderRadius: '14px',
                            border: reached ? `2px solid ${milestone.color}30` : '1px solid #e5e5e5',
                            transition: 'all 0.3s ease'
                          }}>
                            {/* Milestone Icon */}
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                              backgroundColor: reached ? milestone.color : '#e5e5e5',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.3s ease'
                            }}>
                              {reached ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#999' }}>{idx + 1}</span>
                              )}
                            </div>
                            
                            {/* Milestone Info */}
                            <div style={{ flex: 1 }}>
                              <p style={{
                                fontSize: '14px', fontWeight: '600', margin: '0 0 2px 0',
                                color: reached ? '#1a1a1a' : '#666'
                              }}>
                                {milestone.name}
                              </p>
                              {reached && milestone.reachedAt && (
                                <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
                                  Reached on {formatDateTime(milestone.reachedAt)}
                                </p>
                              )}
                            </div>
                            
                            {/* Percentage Badge */}
                            <div style={{
                              padding: '6px 12px', borderRadius: '8px',
                              backgroundColor: reached ? milestone.color : '#f5f5f5',
                              fontSize: '13px', fontWeight: '700',
                              color: reached ? '#fff' : '#999'
                            }}>
                              {milestone.percentage}%
                            </div>
                          </div>
                        );
                      })}
                  </div>
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
              {(task.creditCost || task.creditsUsed) && task.showCreditsToClient !== false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', backgroundColor: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                  <div>
                    <span style={{ fontSize: '14px', color: '#166534', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Credits Used</span>
                    <span style={{ fontSize: '12px', color: '#15803d' }}>Deducted from wallet</span>
                  </div>
                  <span style={{ fontSize: '24px', fontWeight: '700', color: '#15803d' }}>₹{task.creditCost || task.creditsUsed || 0}</span>
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
