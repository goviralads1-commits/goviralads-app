import React from 'react';

/**
 * ProgressWithFlag - Standardized progress bar with moving flag indicator
 * 
 * Props:
 * - progress: number (0-100+, supports overachieving)
 * - milestones: array of { name, percentage, color, reached }
 * - size: 'default' | 'compact' (for list views)
 * - showLabel: boolean (show milestone label below bar)
 * - showPercentage: boolean (show percentage value)
 */
const ProgressWithFlag = ({ 
  progress = 0, 
  milestones = [], 
  size = 'default',
  showLabel = true,
  showPercentage = true
}) => {
  // Get progress color based on percentage (clean gradient journey)
  const getProgressColor = (p) => {
    if (p >= 100) return '#22c55e'; // Green
    if (p >= 75) return '#84cc16';  // Lime
    if (p >= 50) return '#f59e0b';  // Amber
    if (p >= 25) return '#f97316';  // Orange
    return '#6366f1'; // Indigo
  };

  // Get current milestone: highest milestone where progress >= percentage
  const getCurrentMilestone = (milestoneList, currentProgress) => {
    if (!milestoneList || milestoneList.length === 0) return null;
    
    // First try to find highest reached milestone (from backend flag)
    const reachedMilestones = milestoneList
      .filter(m => m.reached)
      .sort((a, b) => b.percentage - a.percentage);
    if (reachedMilestones.length > 0) return reachedMilestones[0];
    
    // Fallback: Find highest milestone that progress has crossed
    const sortedMilestones = [...milestoneList].sort((a, b) => b.percentage - a.percentage);
    return sortedMilestones.find(m => currentProgress >= m.percentage) || null;
  };

  const progressColor = getProgressColor(progress);
  const currentMilestone = getCurrentMilestone(milestones, progress);
  const isOverachieving = progress > 100;

  // Size configurations
  const config = size === 'compact' 
    ? { trackHeight: '6px', flagSize: '18px', flagEmoji: '10px', paddingTop: '14px', percentSize: '14px', labelSize: '11px' }
    : { trackHeight: '6px', flagSize: '22px', flagEmoji: '10px', paddingTop: '20px', percentSize: '16px', labelSize: '14px' };

  return (
    <div style={{ width: '100%' }}>
      {/* Progress Header - Percentage on right */}
      {showPercentage && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: size === 'compact' ? '8px' : '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isOverachieving && (
              <span style={{ 
                fontSize: '10px', fontWeight: '800', color: '#10b981', 
                textTransform: 'uppercase', letterSpacing: '0.05em',
                backgroundColor: '#dcfce7', padding: '2px 6px', borderRadius: '4px'
              }}>
                Overachieving
              </span>
            )}
            <span style={{ fontSize: config.percentSize, fontWeight: '700', color: progressColor }}>
              {Math.round(progress)}%
            </span>
            {isOverachieving && <span style={{ fontSize: config.percentSize }}>🎉</span>}
          </div>
        </div>
      )}

      {/* Progress Bar with Moving Flag */}
      <div style={{ position: 'relative', width: '100%', overflow: 'visible', paddingTop: config.paddingTop }}>
        {/* Track */}
        <div style={{
          width: '100%', 
          height: config.trackHeight, 
          backgroundColor: '#f0f0f0', 
          borderRadius: '999px', 
          position: 'relative'
        }}>
          {/* Fill */}
          <div style={{
            width: `${Math.min(progress, 100)}%`, 
            height: '100%', 
            background: `linear-gradient(90deg, #6366f1 0%, ${progressColor} 100%)`,
            borderRadius: '999px', 
            transition: 'width 0.6s ease',
            boxShadow: progress > 0 ? `0 0 8px ${progressColor}40` : 'none'
          }} />
          
          {/* Moving Flag Indicator - positioned at progress % */}
          <div style={{
            position: 'absolute',
            left: `${Math.min(Math.max(progress, 0), 100)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            transition: 'left 0.6s ease',
            zIndex: 10
          }}>
            <div style={{
              width: config.flagSize, 
              height: config.flagSize, 
              borderRadius: '50%',
              backgroundColor: currentMilestone ? '#22c55e' : progressColor,
              border: '3px solid #fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: config.flagEmoji }}>🚩</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Milestone Label - Only show CURRENT milestone */}
      {showLabel && (
        <div style={{ textAlign: 'center', marginTop: size === 'compact' ? '8px' : '12px' }}>
          <p style={{ 
            fontSize: config.labelSize, 
            fontWeight: '500', 
            color: currentMilestone ? (currentMilestone.color || '#1a1a1a') : '#94a3b8', 
            margin: 0 
          }}>
            {currentMilestone ? `🚩 ${currentMilestone.name}` : (progress > 0 ? 'In Progress' : 'Scheduled')}
          </p>
        </div>
      )}

      {/* Overachieving Message - Only in default size */}
      {isOverachieving && size === 'default' && (
        <div style={{ 
          marginTop: '12px', padding: '10px 14px', 
          backgroundColor: '#dcfce7', borderRadius: '10px', 
          textAlign: 'center' 
        }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#15803d', margin: 0 }}>
            🎉 Overachieving! You're doing amazing work!
          </p>
        </div>
      )}
    </div>
  );
};

export default ProgressWithFlag;
