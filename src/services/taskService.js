const { Task, TASK_STATUS } = require('../models/Task');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const TaskTemplate = require('../models/TaskTemplate');
const User = require('../models/User');
const { Employee, EMPLOYEE_STATUS } = require('../models/Employee');
const { ClientEmployeeAssignment, ASSIGNMENT_STATUS } = require('../models/ClientEmployeeAssignment');
const progressService = require('./progressService');

/**
 * Fetch client's assigned team and convert to task.assignedUsers format.
 * Returns array of { userId, percentage } from active employee assignments.
 * Only includes employees that have a linked userId (User account).
 */
async function getClientTeamAssignedUsers(clientId) {
  try {
    const assignments = await ClientEmployeeAssignment.find({
      clientId,
      status: ASSIGNMENT_STATUS.ACTIVE,
    }).populate('employeeId').exec();

    const assignedUsers = [];
    for (const assignment of assignments) {
      const emp = assignment.employeeId;
      if (!emp || !emp.userId) continue; // Skip employees without linked User accounts
      assignedUsers.push({
        userId: emp.userId,
        percentage: (assignment.commissionSettings?.enabled ? Number(assignment.commissionSettings.percentage) || 0 : 0),
      });
    }
    return assignedUsers;
  } catch (err) {
    console.error('getClientTeamAssignedUsers error:', err.message);
    return [];
  }
}

async function purchaseTaskFromTemplate(clientId, templateId, taskOptions = {}) {
  // Validate client exists
  const client = await User.findById(clientId).exec();
  if (!client || client.role !== 'CLIENT') {
    throw new Error('Client not found');
  }

  // Validate template exists and is active
  const template = await TaskTemplate.findById(templateId).exec();
  if (!template) {
    throw new Error('Task template not found');
  }
  if (!template.isActive) {
    throw new Error('Task template is not available');
  }

  // Validate wallet exists
  let wallet = await Wallet.findOne({ clientId }).exec();
  if (!wallet) {
    throw new Error('Client wallet not found');
  }

  // HYBRID CREDIT DEDUCTION: subscriptionCredits first, then walletCredits
  const now = new Date();
  const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
  const availableSubCredits = subNotExpired ? (wallet.subscriptionCredits || 0) : 0;
  const availableWalletCredits = wallet.walletCredits || 0;
  const totalAvailable = availableSubCredits + availableWalletCredits;

  if (totalAvailable < template.creditCost) {
    throw new Error('Insufficient balance');
  }

  const subDeduct = Math.min(availableSubCredits, template.creditCost);
  const remainingAfterSub = template.creditCost - subDeduct;
  const walletDeduct = Math.min(availableWalletCredits, remainingAfterSub);

  let newBalance, transaction, task;
  
  try {
    // Deduct from dual-pool system (NOT legacy balance)
    const incUpdate = {};
    if (subDeduct > 0) incUpdate.subscriptionCredits = -subDeduct;
    if (walletDeduct > 0) incUpdate.walletCredits = -walletDeduct;
    await Wallet.findByIdAndUpdate(wallet._id, { $inc: incUpdate });

    const updatedWallet = await Wallet.findById(wallet._id);
    const updatedSubNotExpired = updatedWallet.subscriptionExpiresAt && new Date(updatedWallet.subscriptionExpiresAt) > now;
    newBalance = (updatedSubNotExpired ? (updatedWallet.subscriptionCredits || 0) : 0) + (updatedWallet.walletCredits || 0);

    // Auto-populate assignedUsers from client's team
    const teamAssignedUsers = await getClientTeamAssignedUsers(clientId);

    // Create Task entry
    task = await Task.create({ 
      clientId,
      title: template.name,
      description: template.description,
      creditCost: template.creditCost,
      creditsUsed: template.creditCost,
      status: TASK_STATUS.PENDING,
      templateId: template._id,
      priority: taskOptions.priority || 'MEDIUM',
      startDate: taskOptions.startDate || new Date(),
      endDate: taskOptions.endDate || null,
      publicNotes: taskOptions.publicNotes || '',
      internalNotes: taskOptions.internalNotes || '',
      progressMode: taskOptions.progressMode || 'AUTO',
      progress: taskOptions.progress || 0,
      // Auto-populate from client's assigned team
      ...(teamAssignedUsers.length > 0 ? { assignedUsers: teamAssignedUsers } : {}),
    });

    // Create WalletTransaction entry
    transaction = await WalletTransaction.create({ 
      walletId: wallet._id,
      type: TRANSACTION_TYPES.TASK_PURCHASE,
      amount: -template.creditCost,
      description: `Purchased task: ${template.name}`,
      referenceId: task._id,
    });
  } catch (err) {
    console.error('Purchase task partial error:', err.message);
    if (!task) {
      // Rollback wallet if task creation failed
      const rollbackInc = {};
      if (subDeduct > 0) rollbackInc.subscriptionCredits = subDeduct;
      if (walletDeduct > 0) rollbackInc.walletCredits = walletDeduct;
      await Wallet.findByIdAndUpdate(wallet._id, { $inc: rollbackInc });
      throw err;
    }
  }

  return { task, newBalance, transaction };
}

async function assignTaskToClient(adminId, clientId, taskDetails) {
  console.log('=== TASK SERVICE: ASSIGN START ===' );
  
  // Validate client exists
  const client = await User.findById(clientId).exec();
  if (!client || client.role !== 'CLIENT') {
    throw new Error('Client not found');
  }
  console.log('Step 1: Client found');

  // Validate wallet exists
  let wallet = await Wallet.findOne({ clientId }).exec();
  if (!wallet) {
    throw new Error('Client wallet not found');
  }
  // HYBRID CREDIT DEDUCTION: subscriptionCredits first, then walletCredits
  const now = new Date();
  const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
  const availableSubCredits = subNotExpired ? (wallet.subscriptionCredits || 0) : 0;
  const availableWalletCredits = wallet.walletCredits || 0;
  const totalAvailable = availableSubCredits + availableWalletCredits;

  console.log('Step 2: Wallet found, walletCredits:', availableWalletCredits, 'subscriptionCredits:', availableSubCredits);

  // TASK PRICING RULE: Determine final charge amount
  const finalChargeAmount = (taskDetails.offerPrice && taskDetails.offerPrice > 0) 
    ? taskDetails.offerPrice 
    : taskDetails.creditCost;
  
  console.log('=== TASK PRICING CALCULATION ===');
  console.log('Original Amount (creditCost):', taskDetails.creditCost);
  console.log('Offer Price:', taskDetails.offerPrice || 'not set');
  console.log('Final Wallet Deduction:', finalChargeAmount);

  if (totalAvailable < finalChargeAmount) {
    throw new Error('Insufficient balance');
  }
  console.log('Step 3: Balance check passed');

  const subDeduct = Math.min(availableSubCredits, finalChargeAmount);
  const remainingAfterSub = finalChargeAmount - subDeduct;
  const walletDeduct = Math.min(availableWalletCredits, remainingAfterSub);

  let newBalance, transaction, task;
  
  try {
    // Step 4: Deduct from dual-pool system (NOT legacy balance)
    const incUpdate = {};
    if (subDeduct > 0) incUpdate.subscriptionCredits = -subDeduct;
    if (walletDeduct > 0) incUpdate.walletCredits = -walletDeduct;
    await Wallet.findByIdAndUpdate(wallet._id, { $inc: incUpdate });

    const updatedWallet = await Wallet.findById(wallet._id);
    const updatedSubNotExpired = updatedWallet.subscriptionExpiresAt && new Date(updatedWallet.subscriptionExpiresAt) > now;
    newBalance = (updatedSubNotExpired ? (updatedWallet.subscriptionCredits || 0) : 0) + (updatedWallet.walletCredits || 0);
    console.log('Step 4: Wallet deducted, new balance:', newBalance);

    // Step 4.5: Auto-populate assignedUsers from client's team if not explicitly provided
    let resolvedAssignedUsers = taskDetails.assignedUsers;
    if (!resolvedAssignedUsers || !Array.isArray(resolvedAssignedUsers) || resolvedAssignedUsers.length === 0) {
      const teamUsers = await getClientTeamAssignedUsers(clientId);
      if (teamUsers.length > 0) {
        resolvedAssignedUsers = teamUsers;
        console.log('Step 4.5: Auto-populated assignedUsers from client team:', teamUsers.length, 'members');
      }
    }

    // Step 5: Create Task entry
    task = await Task.create({ 
      clientId,
      title: taskDetails.title,
      description: taskDetails.description,
      creditCost: taskDetails.creditCost,
      creditsUsed: finalChargeAmount,
      status: TASK_STATUS.PENDING,
      assignedBy: adminId,
      priority: taskDetails.priority || 'MEDIUM',
      startDate: taskDetails.startDate || new Date(),
      endDate: taskDetails.endDate || null,
      publicNotes: taskDetails.publicNotes || '',
      internalNotes: taskDetails.internalNotes || '',
      progressMode: taskDetails.progressMode || 'AUTO',
      progress: taskDetails.progress || 0,
      // SMART PROGRESS SYSTEM
      progressTarget: taskDetails.progressTarget || 100,
      progressAchieved: taskDetails.progressAchieved || 0,
      showProgressDetails: taskDetails.showProgressDetails || false,
      milestones: taskDetails.milestones || progressService.createDefaultMilestones(),
      // PHASE F: PLAN SYSTEM EXTENSIONS
      quantity: taskDetails.quantity,
      showQuantityToClient: taskDetails.showQuantityToClient,
      showCreditsToClient: taskDetails.showCreditsToClient,
      isListedInPlans: taskDetails.isListedInPlans || false,
      targetClients: taskDetails.targetClients || null,
      featureImage: taskDetails.featureImage,
      offerPrice: taskDetails.offerPrice,
      originalPrice: taskDetails.originalPrice,
      countdownEndDate: taskDetails.countdownEndDate,
      // TASK ASSIGNMENT SYSTEM
      assignedTo: taskDetails.assignedTo || null,
      commissionType: taskDetails.commissionType || 'percentage',
      commissionValue: taskDetails.commissionValue || 0,
      // MULTI-ASSIGNMENT & COMMISSION ROLE TEMPLATES
      ...(resolvedAssignedUsers && resolvedAssignedUsers.length > 0 ? { assignedUsers: resolvedAssignedUsers } : {}),
      ...(taskDetails.defaultCommissionRoles ? { defaultCommissionRoles: taskDetails.defaultCommissionRoles } : {}),
    });
    console.log('Step 5: Task created:', task._id.toString());

    // Step 5.5: Calculate initial progress and update milestones
    await progressService.updateTaskProgress(task);

    // Step 6: Create WalletTransaction entry with task reference
    transaction = await WalletTransaction.create({ 
      walletId: wallet._id,
      type: TRANSACTION_TYPES.TASK_ASSIGNED,
      amount: -finalChargeAmount,
      description: `Assigned task: ${taskDetails.title}`,
      referenceId: task._id,
    });
    console.log('Step 6: Transaction created:', transaction._id.toString());

    // --- Billing Hook removed (module not available) ---
    console.log('Step 7: Billing hook skipped');
    
    console.log('=== TASK SERVICE: ASSIGN COMPLETE ===' );
  } catch (err) {
    // If task was created but transaction failed, we still return success
    // because the core operation (task + wallet deduction) succeeded
    console.error('Task assign partial error:', err.message);
    if (!task) {
      // Rollback wallet if task creation failed
      const rollbackInc = {};
      if (subDeduct > 0) rollbackInc.subscriptionCredits = subDeduct;
      if (walletDeduct > 0) rollbackInc.walletCredits = walletDeduct;
      await Wallet.findByIdAndUpdate(wallet._id, { $inc: rollbackInc });
      throw err;
    }
  }

  return { task, newBalance, transaction };
}

// Utility function to calculate progress based on start/end dates
const calculateProgressFromTimeline = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0;
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  // If end date is in the past, max out at 80% until manual override
  if (now >= end) {
    return 80;
  }
  
  // Calculate percentage of time elapsed between start and end
  const totalTime = end - start;
  const elapsedTime = now - start;
  
  if (elapsedTime <= 0) {
    return 0;
  }
  
  // Calculate progress percentage
  let progress = Math.round((elapsedTime / totalTime) * 100);
  
  // Cap at 80% until manual review
  return Math.min(progress, 80);
};

// Function to update task progress automatically
const updateTaskProgressAutomatically = async (taskId) => {
  try {
    const task = await Task.findById(taskId);
    if (!task || task.progressMode !== 'AUTO') {
      return task;
    }
    
    // Only update progress if it's auto-mode and less than 80%
    if (task.progress < 80) {
      const calculatedProgress = calculateProgressFromTimeline(task.startDate, task.endDate);
      
      // Only update if the calculated progress is greater than current progress
      if (calculatedProgress > task.progress) {
        const updatedTask = await Task.findByIdAndUpdate(
          taskId,
          { progress: calculatedProgress },
          { new: true }
        );
        return updatedTask;
      }
    }
    
    return task;
  } catch (error) {
    console.error('Error updating task progress automatically:', error);
    throw error;
  }
};

module.exports = {
  purchaseTaskFromTemplate,
  assignTaskToClient,
  updateTaskProgressAutomatically,
  calculateProgressFromTimeline,
  getClientTeamAssignedUsers,
};