import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const Tasks = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTasks = useCallback(async () => {
    try {
      const response = await api.get('/client/tasks');
      setTasks(response.data.tasks || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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
    
    // Find the highest milestone that's been reached
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
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>
            My Tasks
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: '8px 0 0 0' }}>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Task Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tasks.map((task) => {
            const humanStatus = getHumanStatus(task.status);
            const progress = task.progress || 0;
            const progressColor = getProgressColor(task);
            const activeMilestone = getActiveMilestone(task.milestones, progress);
            const isOverachieving = progress > 100;

            const isPendingApproval = task.status === 'PENDING_APPROVAL';

            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}`)}
                style={{
                  backgroundColor: '#fff', borderRadius: '24px', padding: '28px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.04)', cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  border: isPendingApproval ? '2px solid #6366f1' : 'none'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)';
                }}
              >
                {/* Title */}
                <h3 style={{
                  fontSize: '18px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 12px 0',
                  lineHeight: 1.4, letterSpacing: '-0.01em'
                }}>
                  {task.title} {isPendingApproval && <span style={{fontSize: '14px', verticalAlign: 'middle'}}>⏳</span>}
                </h3>

                {isPendingApproval && (
                  <p style={{ fontSize: '12px', color: '#6366f1', fontWeight: '600', margin: '-8px 0 12px 0' }}>
                    Plan: {task.title}
                  </p>
                )}

                {/* Status Chip */}
                <div style={{ marginBottom: '20px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '100px', fontSize: '12px', fontWeight: '600',
                    backgroundColor: humanStatus.bg, color: humanStatus.color
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: humanStatus.color }} />
                    {humanStatus.label}
                  </span>
                </div>

                {/* SMART PROGRESS SYSTEM */}
                {!isPendingApproval ? (
                  <div style={{ marginBottom: '12px' }}>
                  {/* Progress Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#999', fontWeight: '500' }}>
                        {task.progressMode === 'AUTO' && 'Time-based progress'}
                        {task.progressMode === 'MANUAL' && 'Number-based progress'}
                      </span>
                      {activeMilestone && (
                        <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '4px', backgroundColor: `${activeMilestone.color}15`, color: activeMilestone.color }}>
                          {activeMilestone.name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isOverachieving && (
                        <span style={{ 
                          fontSize: '10px', fontWeight: '800', color: '#10b981', 
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px'
                        }}>
                          Overachieving
                        </span>
                      )}
                      <span style={{ fontSize: '16px', fontWeight: '700', color: progressColor }}>{Math.round(progress)}%</span>
                      {isOverachieving && <span style={{ fontSize: '16px' }}>🎉</span>}
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{
                    width: '100%', height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'visible', position: 'relative'
                  }}>
                    <div style={{
                      width: `${Math.min(progress, 100)}%`, height: '100%', backgroundColor: progressColor,
                      borderRadius: '4px', transition: 'all 0.5s ease',
                      boxShadow: progress > 0 ? `0 0 8px ${progressColor}40` : 'none'
                    }} />
                    {isOverachieving && (
                      <div style={{
                        position: 'absolute', right: '-4px', top: '50%', transform: 'translateY(-50%)',
                        width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#22c55e',
                        border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                      }} />
                    )}
                  </div>
                  
                  {/* Manual Mode: Target & Achieved (if visible) */}
                  {task.progressMode === 'MANUAL' && task.showProgressDetails && task.progressTarget && (
                    <div style={{ marginTop: '10px', display: 'flex', gap: '12px', fontSize: '11px', color: '#666' }}>
                      <span><strong style={{ color: '#1a1a1a' }}>{task.progressAchieved || 0}</strong> / {task.progressTarget} achieved</span>
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '14px', border: '1px solid #bfdbfe' }}>
                    <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, fontWeight: '500' }}>
                      Your task is booked. Admin will review and start it shortly.
                    </p>
                  </div>
                )}

                {/* Short Description (if exists) */}
                {task.description && (
                  <p style={{
                    fontSize: '14px', color: '#666', margin: '16px 0 0 0', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {task.description}
                  </p>
                )}

                {/* Quantity - CONDITIONAL (only if showQuantityToClient = true) */}
                {task.quantity && task.showQuantityToClient && (
                  <div style={{ 
                    marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '12px', color: '#999', fontWeight: '500' }}>Quantity</span>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#6366f1' }}>{task.quantity}</span>
                  </div>
                )}

                {/* Credits - CONDITIONAL (only if showCreditsToClient = true) */}
                {(task.creditCost || task.creditsUsed) && task.showCreditsToClient !== false && (
                  <div style={{ 
                    marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '12px', color: '#999', fontWeight: '500' }}>Credits</span>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#15803d' }}>₹{task.creditCost || task.creditsUsed || 0}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
};

export default Tasks;
