/**
 * SMART PROGRESS CALCULATION SERVICE
 * Handles AUTO (time-based) and MANUAL (numeric-based) modes with milestone tracking
 */

/**
 * Calculate progress percentage based on mode
 * @param {Object} task - Task document
 * @returns {number} - Progress percentage (can exceed 100 in MANUAL mode)
 */
const calculateProgress = (task) => {
  const { progressMode, startDate, endDate, progressTarget, progressAchieved, autoCompletionCap } = task;

  switch (progressMode) {
    case 'AUTO':
      // AUTO = TIME-BASED (calendar speed)
      return calculateAutoProgress(startDate, endDate, autoCompletionCap);
    
    case 'MANUAL':
      // MANUAL = NUMERIC-BASED (achieved/target)
      return calculateManualProgress(progressTarget, progressAchieved);
    
    default:
      // Fallback to AUTO mode if invalid
      return calculateAutoProgress(startDate, endDate, autoCompletionCap);
  }
};

/**
 * AUTO MODE: Calendar-based progress (TIME SPEED)
 * Progress increases automatically with time passage
 * Caps at admin-defined autoCompletionCap when end date reached
 * Target & Achieved are for CONTEXT only (not used in calculation)
 */
const calculateAutoProgress = (startDate, endDate, cap = 100) => {
  if (!startDate || !endDate) return 0;

  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  // If not started yet
  if (now < start) return 0;

  // If past end date, return cap
  if (now >= end) return cap;

  // Calculate time-based progress
  const totalDuration = end - start;
  const elapsed = now - start;
  const rawProgress = (elapsed / totalDuration) * 100;

  // Cap at autoCompletionCap
  return Math.min(rawProgress, cap);
};

/**
 * MANUAL MODE: Target vs Achieved (can exceed 100%)
 */
const calculateManualProgress = (target, achieved) => {
  if (!target || target === 0) return 0;
  if (!achieved) return 0;

  // Allow overachievement
  return (achieved / target) * 100;
};

/**
 * Update milestone status based on current progress
 * @param {Object} task - Task document
 * @param {number} newProgress - New progress percentage
 * @returns {Array} - Updated milestones array
 */
const updateMilestones = (task, newProgress) => {
  if (!task.milestones || task.milestones.length === 0) {
    return [];
  }

  const now = new Date();
  
  return task.milestones.map(milestone => {
    // Check if milestone should be marked as reached
    if (newProgress >= milestone.percentage && !milestone.reached) {
      return {
        ...milestone.toObject ? milestone.toObject() : milestone,
        reached: true,
        reachedAt: now,
      };
    }
    
    // If progress drops below milestone (e.g., admin adjustment), unmark it
    if (newProgress < milestone.percentage && milestone.reached) {
      return {
        ...milestone.toObject ? milestone.toObject() : milestone,
        reached: false,
        reachedAt: null,
      };
    }
    
    return milestone.toObject ? milestone.toObject() : milestone;
  });
};

/**
 * Get active milestone (highest reached milestone)
 * @param {Array} milestones - Array of milestones
 * @returns {Object|null} - Active milestone or null
 */
const getActiveMilestone = (milestones) => {
  if (!milestones || milestones.length === 0) return null;

  // Filter reached milestones and sort by percentage descending
  const reachedMilestones = milestones
    .filter(m => m.reached)
    .sort((a, b) => b.percentage - a.percentage);

  return reachedMilestones.length > 0 ? reachedMilestones[0] : null;
};

/**
 * Get next milestone (lowest unreached milestone)
 * @param {Array} milestones - Array of milestones
 * @returns {Object|null} - Next milestone or null
 */
const getNextMilestone = (milestones) => {
  if (!milestones || milestones.length === 0) return null;

  // Filter unreached milestones and sort by percentage ascending
  const unreachedMilestones = milestones
    .filter(m => !m.reached)
    .sort((a, b) => a.percentage - b.percentage);

  return unreachedMilestones.length > 0 ? unreachedMilestones[0] : null;
};

/**
 * Get progress bar color based on active milestone
 * @param {Object|null} activeMilestone - Active milestone
 * @param {number} progress - Current progress percentage
 * @returns {string} - Color hex code
 */
const getProgressColor = (activeMilestone, progress) => {
  // If milestone has custom color, use it
  if (activeMilestone && activeMilestone.color) {
    return activeMilestone.color;
  }

  // Default color progression based on progress
  if (progress >= 120) return '#10b981'; // Green - Overachievement
  if (progress >= 100) return '#059669'; // Dark green - Complete
  if (progress >= 80) return '#3b82f6'; // Blue - Almost done
  if (progress >= 50) return '#6366f1'; // Indigo - Good progress
  if (progress >= 25) return '#8b5cf6'; // Purple - Started
  return '#64748b'; // Gray - Just started
};

/**
 * Create default milestones for a task
 * @returns {Array} - Default milestone configuration
 */
const createDefaultMilestones = () => {
  return [
    { name: 'Work Started', percentage: 10, color: '#8b5cf6', reached: false, reachedAt: null },
    { name: 'First Draft', percentage: 30, color: '#6366f1', reached: false, reachedAt: null },
    { name: 'Review Phase', percentage: 60, color: '#3b82f6', reached: false, reachedAt: null },
    { name: 'Almost Ready', percentage: 80, color: '#0ea5e9', reached: false, reachedAt: null },
    { name: 'Delivered', percentage: 100, color: '#059669', reached: false, reachedAt: null },
    { name: 'Overachieved', percentage: 120, color: '#10b981', reached: false, reachedAt: null },
  ];
};

/**
 * Full progress update - calculate progress, update milestones, save
 * @param {Object} task - Mongoose Task document
 * @returns {Object} - Updated task with new progress data
 */
const updateTaskProgress = async (task) => {
  // Calculate new progress
  const newProgress = calculateProgress(task);
  
  // Update milestones
  const updatedMilestones = updateMilestones(task, newProgress);
  
  // Update task
  task.progress = Math.round(newProgress * 10) / 10; // Round to 1 decimal
  task.milestones = updatedMilestones;
  
  await task.save();
  
  return task;
};

/**
 * Format progress data for client view (respects visibility settings)
 * @param {Object} task - Task document
 * @returns {Object} - Formatted progress data
 */
const getClientProgressView = (task) => {
  const activeMilestone = getActiveMilestone(task.milestones);
  const nextMilestone = getNextMilestone(task.milestones);
  const color = getProgressColor(activeMilestone, task.progress);

  const baseView = {
    progress: task.progress,
    progressMode: task.progressMode,
    color,
    activeMilestone: activeMilestone ? {
      name: activeMilestone.name,
      percentage: activeMilestone.percentage,
      color: activeMilestone.color,
    } : null,
    nextMilestone: nextMilestone ? {
      name: nextMilestone.name,
      percentage: nextMilestone.percentage,
    } : null,
  };

  // Include quantity if visible
  if (task.showQuantityToClient && task.quantity) {
    baseView.quantity = task.quantity;
  }

  // Include target/achieved if visible
  if (task.showProgressDetails) {
    baseView.target = task.progressTarget;
    baseView.achieved = task.progressAchieved;
  }

  return baseView;
};

module.exports = {
  calculateProgress,
  calculateAutoProgress,
  calculateManualProgress,
  updateMilestones,
  getActiveMilestone,
  getNextMilestone,
  getProgressColor,
  createDefaultMilestones,
  updateTaskProgress,
  getClientProgressView,
};
