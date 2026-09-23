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
// task.companyEarning only; the CALLER persists the task. projectUserCommission
// is a read-only, display-only preview of the same calculation used for the
// pre-settlement "Commission in process" display.
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
//
// Pure core of the EXISTING completion-flow commission calculation
// (computeCommissionAmounts): no writes, no task mutation. Both the
// settlement writer below and the read-only display preview
// (projectUserCommission) consume this ONE calculation, so preview and
// settlement amounts can never drift.
function computeCommissionAmounts(task) {
  const validAssignedUsers = (task.assignedUsers || []).filter(u => u.userId && u.percentage > 0);

  if (validAssignedUsers.length > 0) {
    // CASE 1: Multi-assignment commission split
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
    const entries = validAssignedUsers.map(member => {
      const amount = Math.round((member.percentage / 100) * netValue);
      return {
        userId: uidOf(member.userId),
        userIdStr: uidOf(member.userId).toString(),
        amount,
        commissionType: 'percentage',
        commissionValue: member.percentage,
      };
    });
    const totalDistributed = entries.reduce((sum, entry) => sum + entry.amount, 0);
    return {
      kind: 'split',
      entries,
      netValue,
      totalDistributed,
      companyEarning: Math.max(0, netValue - totalDistributed),
    };
  }

  if (task.commissionValue > 0 && task.assignedTo) {
    // CASE 2: Fallback - existing single-assign logic
    // Use commissionBaseAmount (INR) if set, otherwise fall back to credit-based value
    const taskValue = (task.commissionBaseAmount && task.commissionBaseAmount > 0) ? task.commissionBaseAmount : (task.creditsUsed || task.creditCost || 0);
    const earned = task.commissionType === 'percentage'
      ? Math.round((taskValue * task.commissionValue) / 100)
      : task.commissionValue;
    return {
      kind: 'single',
      entries: [{
        userId: uidOf(task.assignedTo),
        userIdStr: uidOf(task.assignedTo).toString(),
        amount: earned,
        commissionType: task.commissionType,
        commissionValue: task.commissionValue,
      }],
      totalDistributed: earned,
    };
  }

  return null;
}

// Read-only preview of one user's applicable commission BEFORE settlement
// ("Commission in process" display). Uses the SAME calculation core as the
// settlement writer — it never writes CommissionLog/EarningsLedger and never
// mutates the task. Returns the user's projected amount, or null when the
// user has no applicable commission on this task.
function projectUserCommission(task, userId) {
  if (!userId) return null;
  const calc = computeCommissionAmounts(task);
  if (!calc) return null;
  const userIdStr = uidOf(userId).toString();
  const entry = calc.entries.find(e => e.userIdStr === userIdStr);
  return entry && typeof entry.amount === 'number' && entry.amount > 0 ? entry.amount : null;
}

async function settleTaskCommissionOnCompletion(task) {
  const memberAmounts = new Map();

  // Guard: only settle once. Tasks completed in the past without commission
  // keep commissionEarned === null and are NOT re-settled here (no backfill).
  if (task.commissionEarned !== null && task.commissionEarned !== undefined) {
    return { settled: false, memberAmounts };
  }

  const calc = computeCommissionAmounts(task);
  if (!calc) {
    return { settled: false, memberAmounts };
  }

  if (calc.kind === 'split') {
    console.log(`[COMMISSION-SPLIT] Settling split for task ${task._id}`);
  } else {
    console.log(`[COMMISSION] Settling commission for task ${task._id}`);
  }

  for (const entry of calc.entries) {
    memberAmounts.set(entry.userIdStr, entry.amount);
    try {
      await createCommissionWithLedger({
        userId: entry.userId,
        taskId: task._id,
        taskTitle: task.title,
        amount: entry.amount,
        commissionType: entry.commissionType,
        commissionValue: entry.commissionValue,
      });
      if (calc.kind === 'split') {
        console.log(`[COMMISSION-SPLIT] User ${entry.userId} earned \u20b9${entry.amount} (${entry.commissionValue}%)`);
      } else {
        console.log(`[COMMISSION] Earned: \u20b9${entry.amount} (${entry.commissionType}: ${entry.commissionValue})`);
      }
    } catch (logErr) {
      console.error(calc.kind === 'split' ? `[COMMISSION-SPLIT] Failed to create log:` : `[COMMISSION] Failed to create log:`, logErr.message);
    }
  }

  task.commissionEarned = calc.totalDistributed;
  if (calc.kind === 'split') {
    task.companyEarning = calc.companyEarning;
    console.log(`[COMMISSION-SPLIT] Company earning \u20b9${calc.companyEarning}, Total distributed \u20b9${calc.totalDistributed}`);
  }

  return { settled: true, memberAmounts };
}

module.exports = {
  createCommissionWithLedger,
  settleTaskCommissionOnCompletion,
  projectUserCommission,
};
