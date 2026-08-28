import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import api from '../services/api';
import { isAuthenticated } from '../services/authService';
import Header from '../components/Header';
import { PresetIcon, isValidPreset } from '../components/PresetIcons';

// Utility: Clean description - handles HTML and plain text
const formatDescription = (desc) => {
  if (!desc || typeof desc !== 'string') return null;
  const hasHtml = /<[^>]+>/.test(desc);
  if (hasHtml) {
    const clean = DOMPurify.sanitize(desc, { ALLOWED_TAGS: [] });
    return clean.trim() || null;
  }
  return desc.trim() || null;
};

const Tasks = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | last7 | thisMonth | pending | completed

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.get('/client/tasks');
      setTasks(response.data.tasks || []);
      setError('');
    } catch (err) {
      if (!isAuthenticated() && err.response?.status === 401) {
        setTasks([]); // Show existing "No tasks yet" empty state for unauth visitors
      } else {
        setError(err.response?.data?.error || 'Failed to load tasks');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Filter definitions
  const filters = [
    { key: 'all', label: 'All Tasks' },
    { key: 'last7', label: 'Last 7 Days' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
  ];

  // Filtered tasks based on active filter
  const filteredTasks = useMemo(() => {
    const now = new Date();
    switch (activeFilter) {
      case 'last7': {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return tasks.filter(t => new Date(t.createdAt) >= sevenDaysAgo);
      }
      case 'thisMonth': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return tasks.filter(t => new Date(t.createdAt) >= monthStart);
      }
      case 'pending':
        return tasks.filter(t => t.status === 'PENDING' || t.status === 'PENDING_APPROVAL');
      case 'completed':
        return tasks.filter(t => t.status === 'COMPLETED');
      default:
        return tasks;
    }
  }, [tasks, activeFilter]);

  const totalFiltered = filteredTasks.length;

  // Memoized filter counts — avoid recalculating on every render
  const filterCounts = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      all: tasks.length,
      last7: tasks.filter(t => new Date(t.createdAt) >= sevenDaysAgo).length,
      thisMonth: tasks.filter(t => new Date(t.createdAt) >= monthStart).length,
      pending: tasks.filter(t => t.status === 'PENDING' || t.status === 'PENDING_APPROVAL').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
    };
  }, [tasks]);

  // Human-readable status (hide internal codes)
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

  // Get active milestone and color from task
  const getActiveMilestone = (milestones, progress) => {
    if (!milestones || milestones.length === 0) return null;
    
    // First try to find highest reached milestone (from backend)
    const reachedMilestones = milestones.filter(m => m.reached).sort((a, b) => b.percentage - a.percentage);
    if (reachedMilestones.length > 0) return reachedMilestones[0];
    
    // Fallback: Find the highest milestone that's been reached based on progress
    const sortedMilestones = [...milestones].sort((a, b) => b.percentage - a.percentage);
    return sortedMilestones.find(m => progress >= m.percentage) || null;
  };

  // Progress color based on active milestone or fallback
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

  // Deadline formatting — same safe logic as TaskDetail (shared display convention)
  const formatDeadline = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const dayMonth = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayMonth}, ${time}`;
  };

  const getRemainingLabel = (dateStr) => {
    if (!dateStr) return null;
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
          <div style={{ marginBottom: '32px' }}>
            <div style={{ width: '120px', height: '32px', backgroundColor: '#f1f1f1', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                backgroundColor: '#fff', borderRadius: '24px', padding: '28px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
              }}>
                <div style={{ width: '70%', height: '22px', backgroundColor: '#f1f1f1', borderRadius: '6px', marginBottom: '12px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '100px', height: '28px', backgroundColor: '#f1f1f1', borderRadius: '14px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }} />
                <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f1f1', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
              </div>
            ))}
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
          <p style={{ fontSize: '15px', color: '#666', marginBottom: '32px' }}>{error}</p>
          <button
            onClick={() => { setLoading(true); setError(''); fetchTasks(); }}
            style={{
              padding: '14px 32px', backgroundColor: '#1a1a1a', color: '#fff',
              fontSize: '14px', fontWeight: '600', borderRadius: '14px', border: 'none', cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty State
  if (tasks.length === 0) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
        <Header />
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '64px 24px', textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f5f5f5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12h6M9 8h6M9 16h3" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#1a1a1a', marginBottom: '12px' }}>No tasks yet</h2>
          <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.5 }}>
            Your tasks will appear here once they're assigned to you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <Header />
      
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px', paddingBottom: '120px' }}>
        {/* Page Title */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: 'clamp(18px, 5vw, 28px)', fontWeight: '700', color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>
            My Tasks
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: '8px 0 0 0' }}>
            {totalFiltered} task{totalFiltered !== 1 ? 's' : ''}{activeFilter !== 'all' ? ` (${tasks.length} total)` : ''}
          </p>
        </div>

        {/* Filter — compact native select (same filters/counts as before) */}
        <div style={{ marginBottom: '24px' }}>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            aria-label="Filter tasks"
            style={{
              width: '100%', maxWidth: '320px', minHeight: '44px',
              padding: '10px 14px', fontSize: '16px', fontWeight: '600',
              color: '#1a1a1a', backgroundColor: '#fff',
              border: '2px solid #e2e8f0', borderRadius: '12px',
              outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
              appearance: 'auto'
            }}
          >
            {filters.map(f => (
              <option key={f.key} value={f.key}>
                {f.label} ({filterCounts[f.key] ?? 0})
              </option>
            ))}
          </select>
        </div>

        {/* Task Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredTasks.map((task, index) => {
            const progress = task.progress || 0;
            const progressColor = getProgressColor(task);

            const isPendingApproval = task.status === 'PENDING_APPROVAL';

            const position = index + 1;
            const taskNum = String(position).padStart(2, '0');

            // Status pill — same existing values/colors from getHumanStatus
            const humanStatus = getHumanStatus(task.status);

            // Existing platform identity via the existing progressIcon + PresetIcon system
            const platformPreset = (task.progressIcon && task.progressIcon.type === 'preset' && isValidPreset(task.progressIcon.value))
              ? task.progressIcon.value
              : null;

            // Milestones — existing data only, rendered as a compact stepper
            const milestones = task.milestones || [];
            const sortedAsc = [...milestones].sort((a, b) => a.percentage - b.percentage);
            const reachedAny = sortedAsc.some(m => m.reached);
            const currentMilestone = getActiveMilestone(milestones, progress);
            const focusMilestone = currentMilestone || (!reachedAny ? sortedAsc[0] : null);

            // Existing date source
            const dateLabel = task.createdAt
              ? new Date(task.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : null;

            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                style={{
                  backgroundColor: '#fff', borderRadius: '18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
                  border: isPendingApproval ? '1.5px solid #6366f1' : '1px solid #eef0f3',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)';
                }}
              >
                <div style={{ padding: '14px 16px 12px' }}>
                  {/* Row 1: Task # + platform icon + status pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      color: '#fff', fontSize: '12px', fontWeight: '700',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(99,102,241,0.3)'
                    }}>
                      {taskNum}
                    </span>
                    {platformPreset && <PresetIcon name={platformPreset} size={22} />}
                    <span style={{ flex: 1 }} />
                    <span style={{
                      fontSize: '11px', fontWeight: '700', color: humanStatus.color,
                      backgroundColor: humanStatus.bg, padding: '4px 10px',
                      borderRadius: '100px', whiteSpace: 'nowrap'
                    }}>
                      {humanStatus.label}
                    </span>
                  </div>

                  {/* Row 2: Order ID + Date (existing sources) */}
                  {(task.orderCode || dateLabel) && (
                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#94a3b8', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {task.orderCode && <span style={{ color: '#64748b', fontWeight: '600' }}>Order {task.orderCode}</span>}
                      {task.orderCode && dateLabel && <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#cbd5e1' }} />}
                      {dateLabel && <span>{dateLabel}</span>}
                    </div>
                  )}

                  {/* Row 3: Title (existing value, mobile-safe clamp) */}
                  <h3 style={{
                    fontSize: '15px', fontWeight: '700', color: '#1a1a1a', margin: '8px 0 0 0',
                    lineHeight: 1.35, letterSpacing: '-0.01em',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {task.title} {isPendingApproval && <span style={{fontSize: '13px', verticalAlign: 'middle'}}>\u23F3</span>}
                  </h3>

                  {/* Commission-only badge (existing behavior) */}
                  {task.isAssignedUser && (
                    <span style={{
                      display: 'inline-block', marginTop: '6px', padding: '2px 8px',
                      fontSize: '9px', fontWeight: '700', borderRadius: '6px',
                      backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                      letterSpacing: '0.04em', textTransform: 'uppercase'
                    }}>
                      {'\uD83D\uDCB0 Commission'}
                    </span>
                  )}

                  {/* Body */}
                  {isPendingApproval ? (
                    <div style={{ marginTop: '10px', padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                      <p style={{ fontSize: '12px', color: '#1e40af', margin: 0, fontWeight: '500' }}>
                        ⏳ Booked — admin will review and start it shortly.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Milestones — compact stepper, existing data/states only.
                          Hidden entirely when the task has no milestones. */}
                      {milestones.length > 0 && (
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
                                      width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '9px', fontWeight: '700',
                                      backgroundColor: m.reached ? (m.color || '#22c55e') : '#fff',
                                      color: m.reached ? '#fff' : '#94a3b8',
                                      border: m.reached ? 'none' : `1.5px solid ${isCurrent ? '#6366f1' : '#e2e8f0'}`,
                                      boxShadow: isCurrent ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none'
                                    }}
                                  >
                                    {m.reached ? (
                                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                    ) : (i + 1)}
                                  </span>
                                </React.Fragment>
                              );
                            })}
                          </div>
                          {focusMilestone && (
                            <p style={{ fontSize: '10px', fontWeight: '600', color: focusMilestone.color || '#64748b', margin: '4px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {focusMilestone.name}{focusMilestone.percentage ? ` · ${focusMilestone.percentage}%` : ''}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Progress — existing value, slim presentation.
                          COMMISSION tasks show the authoritative backend deadline
                          instead of the percentage bar (same value shown on the
                          detail page). NON-COMMISSION tasks keep the bar, untouched. */}
                      {task.isAssignedUser ? (
                        (() => {
                          const deadlineValue = task.deadline || task.endDate;
                          const deadlineLabel = deadlineValue ? formatDeadline(deadlineValue) : null;
                          const remainingLabel = deadlineValue ? getRemainingLabel(deadlineValue) : null;
                          const overdue = remainingLabel === 'Deadline passed';
                          return (
                            <div style={{
                              marginTop: milestones.length > 0 ? '10px' : '12px',
                              padding: '10px 12px', borderRadius: '10px',
                              backgroundColor: overdue ? '#fffbeb' : '#eef2ff',
                              border: overdue ? '1px solid #fde68a' : '1px solid #e0e7ff',
                              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
                            }}>
                              <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>{'\u23F1'}</span>
                              <div style={{ flex: 1, minWidth: '110px' }}>
                                <p style={{ fontSize: '9px', fontWeight: '700', color: overdue ? '#92400e' : '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                                  Deadline
                                </p>
                                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', margin: '1px 0 0' }}>
                                  {deadlineLabel || 'No deadline set'}
                                </p>
                              </div>
                              {remainingLabel && (
                                <span style={{
                                  fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap',
                                  padding: '3px 8px', borderRadius: '100px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: milestones.length > 0 ? '10px' : '12px' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(progress, 100)}%`, height: '100%',
                            background: `linear-gradient(90deg, #6366f1 0%, ${progressColor} 100%)`,
                            borderRadius: '999px'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: progressColor, flexShrink: 0 }}>
                          {Math.round(progress)}%{progress > 100 ? ' 🎉' : ''}
                        </span>
                      </div>
                      )}
                    </>
                  )}

                  {/* Short Description (if exists) */}
                  {formatDescription(task.description) && (
                    <p style={{
                      fontSize: '12px', color: '#64748b', margin: '10px 0 0 0', lineHeight: 1.45,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                    }}>
                      {formatDescription(task.description)}
                    </p>
                  )}
                </div>

                {/* Footer: Commission/Credits/Quantity + chat + View Details.
                    Commission (Phase 3) logic kept VERBATIM — shown ONLY to the
                    task's commission recipient; falls back to Credits Used for
                    task owners with the existing privacy gate. */}
                <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {task.myCommission > 0 ? (
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>Commission</span>
                      ₹{Number(task.myCommission).toLocaleString('en-IN')}
                    </span>
                  ) : (
                  /* Credits - CONDITIONAL (only if showCreditsToClient = true) */
                  /* FIX: Use creditsUsed (actual deducted) over creditCost (base price) */
                  !task.isAssignedUser && (task.creditsUsed || task.creditCost) && task.showCreditsToClient !== false && (
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>Credits Used</span>
                      {task.creditsUsed || task.creditCost || 0} credits
                    </span>
                  )
                  )}

                  {/* Quantity - CONDITIONAL (only if showQuantityToClient = true) */}
                  {task.quantity && task.showQuantityToClient && (
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>Qty</span>
                      {task.quantity}
                    </span>
                  )}

                  {/* Chat shortcut - existing navigation, if messages exist */}
                  {task.messages && task.messages.length > 0 && (
                    <span
                      onClick={(e) => { e.stopPropagation(); navigate(`/tasks/${task.id || task._id}?scrollToChat=true`); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6366f1', fontWeight: '600' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {task.messages.length}
                    </span>
                  )}

                  <span style={{ flex: 1 }} />

                  {/* View Details — same existing navigation target */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '7px 12px', borderRadius: '8px',
                    backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                    fontSize: '12px', fontWeight: '600', color: '#334155', whiteSpace: 'nowrap'
                  }}>
                    View Details
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty filter result */}
        {totalFiltered === 0 && tasks.length > 0 && (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            backgroundColor: '#fff', borderRadius: '24px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
          }}>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 8px 0' }}>
              No tasks match this filter
            </p>
            <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
              Try selecting a different filter above
            </p>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

export default Tasks;
