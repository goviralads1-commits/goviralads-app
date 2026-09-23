const mongoose = require('mongoose');
const CommissionLog = require('../models/CommissionLog');
const EarningsLedger = require('../models/EarningsLedger');

// ============================================================================
// COMMISSION SERVICE — the transactional commission writer (createCommission-
// WithLedger, moved verbatim from src/routes/admin.js so both admin and client
// routes share ONE implementation) plus the completion settlement used by the
// client-side auto-completion paths.
//
// settleTaskCommissionOnCompletion mirrors the admin completion paths
// (PATCH /admin/tasks/:taskId and PATCH /admin/tasks/:taskId/status) EXACTLY:
// same commissionEarned guard, same CASE 1 (multi-assignment split) / CASE 2
// (single-assign fallback) calculation, same commissionBaseAmount precedence,
// same per-member error isolation. It mutates task.commissionEarned /
// task.companyEarning only; the CALLER persists the task.
//
// Historical data is never touched: the commissionEarned guard means tasks
// that already settled — including tasks completed in the past without
// commission (pre-fix client-path completions) — are never re-settled,
// backfilled, or inferred.
// ============================================================================

// Helper: Create CommissionLog + EarningsLedger entry (transactional with fallback)
async function createCommissionWithLedger({ userId, taskId, taskTitle, amount, commissionType, commissionValue }) {
  try {
    const session = await mongoose.startSession();
    try {
      let commissionLog;
      await session.withTransaction(async () => {
        [commissionLog] = await CommissionLog.create([{
          userId, taskId, taskTitle, amount, commissionType, commissionValue,
        }], { session });
        // Idempotency check: skip if ledger entry already exists for this user+task
        const existingLedger = await EarningsLedger.findOne({
          userId, sourceTaskId: taskId, type: 'COMMISSION_EARNED',
        }).session(session);
        if (!existingLedger) {
          await EarningsLedger.create([{
            userId,
            type: 'COMMISSION_EARNED',
            amount,
            sourceTaskId: taskId,
            sourceCommissionLogId: commissionLog._id,
          }], { session });
        }
      });
      return commissionLog;
    } finally {
      session.endSession();
    }
  } catch (txErr) {
    // Fallback: non-transactional (environment may not support replica set)
    console.warn('[EARNINGS-LEDGER] Transaction not supported \u2014 running in fallback mode (partial-financial-risk)');
    const commissionLog = await CommissionLog.create({
      userId, taskId, taskTitle, amount, commissionType, commissionValue,
    });
    // Idempotency check in fallback
    const existingLedger = await EarningsLedger.findOne({
      userId, sourceTaskId: taskId, type: 'COMMISSION_EARNED',
    });
    if (!existingLedger) {
      await EarningsLedger.create({
        userId,
        type: 'COMMISSION_EARNED',
        amount,
        sourceTaskId: taskId,
        sourceCommissionLogId: commissionLog._id,
      });
    }
    return commissionLog;
  }
}

// Normalize an assignee reference: assignedUsers.userId may be a populated
// User document (client single-task route) or a raw ObjectId (everywhere
// else). Returns the raw ObjectId in both cases.
const uidOf = (u) => (u && u._id ? u._id : u);

// Settle commission for a task at the moment it crosses INTO COMPLETED.
// Returns { settled: boolean, memberAmounts: Map<userIdString, amount> } so
// callers can surface the authenticated user's own share in the SAME response.
async function settleTaskCommissionOnCompletion(task) {
  const memberAmounts = new Map();

  // Guard: only settle once. Tasks completed in the past without commission
  // keep commissionEarned === null and are NOT re-settled here (no backfill).
  if (task.commissionEarned !== null && task.commissionEarned !== undefined) {
    return { settled: false, memberAmounts };
  }

  const validAssignedUsers = (task.assignedUsers || []).filter(u => u.userId && u.percentage > 0);

  if (validAssignedUsers.length > 0) {
    // CASE 1: Multi-assignment commission split
    console.log(`[COMMISSION-SPLIT] Settling split for task ${task._id}`);
    // Use commissionBaseAmount (INR) if set, otherwise fall back to credit-based value
    let netValue;
    if (task.commissionBaseAmount && task.commissionBaseAmount > 0) {
      netValue = task.commissionBaseAmount;
    } else {
      const taskValue = task.creditsUsed || task.creditCost || 0;
      const costs = task.costBreakdown || { expenses: 0, tax: 0, other: 0 };
      const totalCosts = (Number(costs.expenses) || 0) + (Number(costs.tax) || 0) + (Number(costs.other) || 0);
      netValue = Math.max(0, taskValue - totalCosts);
    }
    let totalDistributed = 0;

    for (const member of validAssignedUsers) {
      const memberAmount = Math.round((member.percentage / 100) * netValue);
      totalDistributed += memberAmount;
      memberAmounts.set(uidOf(member.userId).toString(), memberAmount);
      try {
        await createCommissionWithLedger({
          userId: uidOf(member.userId),
          taskId: task._id,
          taskTitle: task.title,
          amount: memberAmount,
          commissionType: 'percentage',
          commissionValue: member.percentage,
        });
        console.log(`[COMMISSION-SPLIT] User ${uidOf(member.userId)} earned \u20b9${memberAmount} (${member.percentage}%)`);
      } catch (logErr) {
        console.error(`[COMMISSION-SPLIT] Failed to create log:`, logErr.message);
      }
    }

    task.commissionEarned = totalDistributed;
    task.companyEarning = Math.max(0, netValue - totalDistributed);
    console.log(`[COMMISSION-SPLIT] Company earning \u20b9${task.companyEarning}, Total distributed \u20b9${totalDistributed}`);
    return { settled: true, memberAmounts };
  }

  if (task.commissionValue > 0 && task.assignedTo) {
    // CASE 2: Fallback - existing single-assign logic
    console.log(`[COMMISSION] Settling commission for task ${task._id}`);
    // Use commissionBaseAmount (INR) if set, otherwise fall back to credit-based value
    const taskValue = (task.commissionBaseAmount && task.commissionBaseAmount > 0) ? task.commissionBaseAmount : (task.creditsUsed || task.creditCost || 0);
    if (task.commissionType === 'percentage') {
      task.commissionEarned = Math.round((taskValue * task.commissionValue) / 100);
    } else {
      task.commissionEarned = task.commissionValue;
    }
    memberAmounts.set(uidOf(task.assignedTo).toString(), task.commissionEarned);
    try {
      await createCommissionWithLedger({
        userId: uidOf(task.assignedTo),
        taskId: task._id,
        taskTitle: task.title,
        amount: task.commissionEarned,
        commissionType: task.commissionType,
        commissionValue: task.commissionValue,
      });
      console.log(`[COMMISSION] Earned: \u20b9${task.commissionEarned} (${task.commissionType}: ${task.commissionValue})`);
    } catch (logErr) {
      console.error(`[COMMISSION] Failed to create log:`, logErr.message);
    }
    return { settled: true, memberAmounts };
  }

  return { settled: false, memberAmounts };
}

module.exports = {
  createCommissionWithLedger,
  settleTaskCommissionOnCompletion,
};
