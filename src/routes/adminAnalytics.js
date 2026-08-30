// ================== CLIENT-SCOPED BUSINESS ANALYTICS (READ-ONLY) ==================
// GET /admin/analytics/client        - Business Analytics for ONE selected client + date range
// GET /admin/analytics/client/drill  - Drill-down lists (tasks/revenue/commission) for ONE client
//
// DESIGN NOTES:
//  - This file exists so the WIP /admin/analytics endpoint in admin.js stays untouched.
//  - Every aggregation MIRRORS the exact semantics of /admin/analytics (same metric
//    definitions, same date-boundary handling, same status enums) but adds a clientId
//    scope to every query. Metrics are never redefined.
//  - Scoping map (verified against models):
//      Task.clientId, Order.clientId, RechargeRequest.clientId, Ticket.clientId,
//      UserSubscription.userId, Wallet.clientId (WalletTransaction is scoped via its
//      walletId -> Wallet.clientId relation), CommissionLog via taskId -> Task.clientId.
//  - The caller's existing authorization is enforced: main admins may query any
//    CLIENT id; managers only the clients already visible to them through task
//    assignment (same rule as GET /admin/clients). Unknown/unauthorized ids -> 404.
//  - Strictly read-only: no writes, no deletes, no business-data mutation.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { WalletTransaction } = require('../models/WalletTransaction');
const { Order } = require('../models/Order');
const { Task } = require('../models/Task');
const Ticket = require('../models/Ticket');
const UserSubscription = require('../models/UserSubscription');
const { RechargeRequest } = require('../models/RechargeRequest');
const CommissionLog = require('../models/CommissionLog');

router.use(authenticateJWT);
router.use(requireAdmin);

// Shared UTC date-boundary builder — identical logic to /admin/analytics so the
// selected period includes/excludes exactly the same records in both modes.
function buildDateFilters(startDate, endDate) {
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate + 'T00:00:00.000Z');
  if (endDate) dateFilter.$lte = new Date(endDate + 'T23:59:59.999Z');
  const hasDateFilter = Object.keys(dateFilter).length > 0;
  return {
    createdAtFilter: hasDateFilter ? { createdAt: dateFilter } : {},
    updatedAtFilter: hasDateFilter ? { updatedAt: dateFilter } : {},
  };
}

// Resolve and authorize the target client. Returns { clientId } when allowed,
// or a { status, error } object the handler must return to the caller.
async function resolveAuthorizedClient(req) {
  const { clientId } = req.query;
  if (!clientId || !mongoose.isValidObjectId(clientId)) {
    return { status: 400, error: 'Valid clientId is required' };
  }

  const target = await User.findById(clientId).select('role status isDeleted').lean();
  if (!target || target.role !== 'CLIENT' || target.isDeleted) {
    return { status: 404, error: 'Client not found' };
  }

  // Reuse the caller's EXISTING authorization surface (same rule as GET /admin/clients)
  const caller = await User.findById(req.user.id).populate('customRole');
  const isMainAdmin = caller && caller.role === 'ADMIN' && !caller.customRole;
  if (!isMainAdmin) {
    const visibleClientIds = await Task.distinct('clientId', { assignedTo: caller._id });
    const allowed = visibleClientIds.some(id => id && String(id) === String(clientId));
    if (!allowed) return { status: 404, error: 'Client not found' };
  }

  return { clientId: new mongoose.Types.ObjectId(String(clientId)) };
}

// ---------- GET /admin/analytics/client ----------
router.get('/client', async (req, res) => {
  try {
    const auth = await resolveAuthorizedClient(req);
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const { clientId } = auth;

    const { startDate, endDate } = req.query;
    const { createdAtFilter, updatedAtFilter } = buildDateFilters(startDate, endDate);

    const now = new Date();
    const renewalWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Same task base as /admin/analytics (exclude plan listings and soft-deleted)
    const taskBase = { isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, clientId };

    // Client-owned id sets for relation-scoped collections
    const [walletIds, clientTaskIds] = await Promise.all([
      Wallet.find({ clientId }).distinct('_id'),
      Task.find({ clientId, isListedInPlans: { $ne: true } }).distinct('_id'),
    ]);
    const commissionFilter = clientTaskIds.length ? { taskId: { $in: clientTaskIds } } : { taskId: null };

    // Run all aggregations in parallel — same 16 metrics as /admin/analytics,
    // each additionally scoped to this client's owned records.
    const [
      totalTasks, pendingTasks, inProgressTasks, completedTasks,
      amountReceivedAgg, creditSendAgg, commissionTotal, taskCostAgg,
      pendingOrders, activeChats, upcomingRenewals, serviceAgg
    ] = await Promise.all([
      // Row 1: Task Metrics (by createdAt)
      Task.countDocuments({ ...taskBase, ...createdAtFilter }),
      Task.countDocuments({ ...taskBase, status: { $in: ['PENDING_APPROVAL', 'PENDING'] }, ...createdAtFilter }),
      Task.countDocuments({ ...taskBase, status: 'ACTIVE', ...createdAtFilter }),
      Task.countDocuments({ ...taskBase, status: 'COMPLETED', ...updatedAtFilter }),

      // Row 2: Financial Metrics — identical type/amount semantics as global endpoint
      // Amount Received: ONLY RECHARGE_APPROVED (actual money received)
      WalletTransaction.aggregate([
        { $match: { type: 'RECHARGE_APPROVED', walletId: { $in: walletIds }, ...createdAtFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      // Credit Send: RECHARGE_APPROVED.amount + SUBSCRIPTION_PURCHASE.credits + MANUAL_CREDIT/CREDIT amount>0
      WalletTransaction.aggregate([
        { $match: { walletId: { $in: walletIds }, $or: [
          { type: 'RECHARGE_APPROVED' },
          { type: 'SUBSCRIPTION_PURCHASE' },
          { type: 'MANUAL_CREDIT', amount: { $gt: 0 } },
          { type: 'CREDIT', amount: { $gt: 0 } }
        ], ...createdAtFilter } },
        { $group: { _id: null, total: { $sum: {
          $cond: [{ $eq: ['$type', 'SUBSCRIPTION_PURCHASE'] }, '$credits', '$amount']
        }}}}
      ]),
      // Commission Generate: CommissionLog.amount sum for THIS client's tasks (by createdAt)
      CommissionLog.aggregate([
        { $match: { ...commissionFilter, ...createdAtFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      // Expenses/Tax/Other: ONLY from COMPLETED tasks, by completion date (updatedAt)
      Task.aggregate([
        { $match: { ...taskBase, status: 'COMPLETED', ...updatedAtFilter } },
        { $group: {
          _id: null,
          totalExpenses: { $sum: { $ifNull: ['$costBreakdown.expenses', 0] } },
          totalTax: { $sum: { $ifNull: ['$costBreakdown.tax', 0] } },
          totalOther: { $sum: { $ifNull: ['$costBreakdown.other', 0] } }
        }}
      ]),

      // Row 3: Operational Metrics
      Order.countDocuments({ orderStatus: 'PENDING_APPROVAL', clientId, ...createdAtFilter }),
      Ticket.countDocuments({
        clientId,
        lastReplyBy: 'ADMIN',
        status: { $in: ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT'] },
        isDeleted: { $ne: true }
      }),
      UserSubscription.countDocuments({
        userId: clientId,
        isActive: true,
        expiresAt: { $gte: now, $lte: renewalWindowEnd }
      }),

      // Top Services (from this client's non-rejected orders — same grouping as global)
      Order.aggregate([
        { $match: { clientId, orderStatus: { $ne: 'REJECTED' }, ...createdAtFilter } },
        { $unwind: '$items' },
        { $group: { _id: '$items.planId', serviceName: { $first: '$items.planTitle' }, totalOrders: { $sum: '$items.quantity' }, totalRevenue: { $sum: '$items.totalPrice' } }},
        { $sort: { totalRevenue: -1 } },
        { $limit: 5 }
      ])
    ]);

    // Single-client row for the Top Clients table (same field meanings as global top10)
    const [rechargeAgg, spendAgg] = await Promise.all([
      WalletTransaction.aggregate([
        { $match: { type: 'RECHARGE_APPROVED', walletId: { $in: walletIds }, ...createdAtFilter } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Order.aggregate([
        { $match: { clientId, orderStatus: { $ne: 'REJECTED' }, ...createdAtFilter } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ])
    ]);
    const clientUser = await User.findById(clientId).select('identifier profile.name billing.companyName billing.name').lean();
    const identifier = clientUser?.profile?.name || clientUser?.billing?.companyName || clientUser?.billing?.name || clientUser?.identifier || 'Unknown';
    const top10 = [{
      clientId,
      identifier,
      totalRecharge: rechargeAgg[0]?.total || 0,
      totalSpend: spendAgg[0]?.total || 0,
      totalCommission: commissionTotal[0]?.total || 0
    }];

    // Recent activity — only this client's records (same merge/sort as global)
    const [recentOrders, recentTasks, recentRecharges] = await Promise.all([
      Order.find({ clientId, ...createdAtFilter }).sort({ createdAt: -1 }).limit(5).select('orderId totalAmount orderStatus createdAt').lean(),
      Task.find({ ...taskBase, status: 'COMPLETED', ...updatedAtFilter }).sort({ updatedAt: -1 }).limit(5).select('title creditCost updatedAt').lean(),
      RechargeRequest.find({ clientId, status: 'APPROVED', ...createdAtFilter }).sort({ createdAt: -1 }).limit(5).select('amount createdAt').lean()
    ]);
    const recentActivity = [
      ...recentOrders.map(o => ({ type: 'order', label: `Order ${o.orderId || ''}`, value: o.totalAmount, status: o.orderStatus, date: o.createdAt, clientName: identifier })),
      ...recentTasks.map(t => ({ type: 'task', label: t.title || 'Task', value: t.creditCost, status: 'COMPLETED', date: t.updatedAt, clientName: identifier })),
      ...recentRecharges.map(r => ({ type: 'recharge', label: 'Recharge Approved', value: r.amount, status: 'APPROVED', date: r.createdAt, clientName: identifier }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    // Earners for this client's tasks (staff attribution preserved — same as global)
    const earners = await CommissionLog.aggregate([
      { $match: { ...commissionFilter, ...createdAtFilter } },
      { $group: { _id: '$userId', totalCommission: { $sum: '$amount' } } },
      { $sort: { totalCommission: -1 } },
      { $limit: 3 }
    ]);
    const earnerUsers = earners.length
      ? await User.find({ _id: { $in: earners.map(e => e._id) } }).select('identifier profile.name billing.companyName billing.name').lean()
      : [];
    const earnerNameMap = {};
    earnerUsers.forEach(u => {
      earnerNameMap[u._id.toString()] = u.profile?.name || u.billing?.companyName || u.billing?.name || u.identifier || 'Unknown';
    });
    const topCommissionEarners = earners.map(e => ({
      userId: e._id ? e._id.toString() : null,
      identifier: e._id ? (earnerNameMap[e._id.toString()] || 'Unknown') : 'Unknown',
      totalCommission: e.totalCommission || 0
    }));

    const costData = taskCostAgg[0] || { totalExpenses: 0, totalTax: 0, totalOther: 0 };

    res.json({
      scope: { clientId: clientId.toString(), identifier },
      metrics: {
        totalTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        amountReceived: amountReceivedAgg[0]?.total || 0,
        creditSend: creditSendAgg[0]?.total || 0,
        commissionGenerate: commissionTotal[0]?.total || 0,
        expenses: costData.totalExpenses,
        tax: costData.totalTax,
        other: costData.totalOther,
        // Cross-client, current-state metric has no single-client meaning —
        // reported as null so the UI hides it instead of showing a global total.
        activeClients: null,
        upcomingRenewal: upcomingRenewals,
        pendingOrders,
        activeChats,
      },
      top10,
      services: { top5: serviceAgg.map(s => ({ planId: s._id, serviceName: s.serviceName || 'Unknown', totalOrders: s.totalOrders, totalRevenue: s.totalRevenue })) },
      recentActivity,
      topCommissionEarners
    });
  } catch (err) {
    console.error('Client analytics error:', err);
    res.status(500).json({ error: 'Failed to load client analytics' });
  }
});

// ---------- GET /admin/analytics/client/drill ----------
// Drill-down detail lists for the selected client (mirrors the existing drill-down
// data shapes: completed tasks, revenue sources, commission logs).
router.get('/client/drill', async (req, res) => {
  try {
    const auth = await resolveAuthorizedClient(req);
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const { clientId } = auth;

    const { type, startDate, endDate } = req.query;
    const { createdAtFilter, updatedAtFilter } = buildDateFilters(startDate, endDate);

    if (type === 'tasks') {
      const tasks = await Task.find({
        isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, clientId,
        status: 'COMPLETED', ...updatedAtFilter
      }).sort({ updatedAt: -1 }).select('title creditCost updatedAt').lean();
      return res.json({ tasks });
    }

    if (type === 'revenue') {
      const walletIds = await Wallet.find({ clientId }).distinct('_id');
      const [transactions, orders] = await Promise.all([
        WalletTransaction.find({ type: { $in: ['RECHARGE_APPROVED', 'CREDIT'] }, walletId: { $in: walletIds }, ...createdAtFilter })
          .sort({ createdAt: -1 }).select('type amount createdAt').lean(),
        Order.find({ clientId, orderStatus: { $ne: 'REJECTED' }, ...createdAtFilter })
          .sort({ createdAt: -1 }).select('orderId totalAmount createdAt').lean()
      ]);
      return res.json({ transactions, orders });
    }

    if (type === 'commission') {
      const clientTaskIds = await Task.find({ clientId, isListedInPlans: { $ne: true } }).distinct('_id');
      const logs = clientTaskIds.length
        ? await CommissionLog.find({ taskId: { $in: clientTaskIds }, ...createdAtFilter })
            .sort({ createdAt: -1 }).select('taskTitle amount createdAt').lean()
        : [];
      return res.json({ logs });
    }

    return res.status(400).json({ error: 'type must be tasks, revenue or commission' });
  } catch (err) {
    console.error('Client analytics drill error:', err);
    res.status(500).json({ error: 'Failed to load drill-down data' });
  }
});

// ---------- GET /admin/analytics/client/timeline ----------
// Date-wise workflow events for ONE selected client: orders (by order createdAt) and
// tasks (by startDate / endDate), scoped to the same date range as the rest of
// Business Analytics. Strictly read-only.
//
// HONESTY NOTES (verified against models — do not change without a data-model review):
//  - Task has NO reliable completion timestamp (no completedAt; updatedAt changes on
//    unrelated edits like chat/approvals), so this endpoint never produces a
//    "completed on" event. endDate is returned as the END DATE together with the
//    task's CURRENT status; the UI must not present it as a completion date.
//  - Tasks whose startDate is null produce no START event: the existing system
//    defines no fallback (auto-start and AUTO progress both require startDate).
router.get('/client/timeline', async (req, res) => {
  try {
    const auth = await resolveAuthorizedClient(req);
    if (auth.status) return res.status(auth.status).json({ error: auth.error });
    const { clientId } = auth;

    const { startDate, endDate } = req.query;
    const { createdAtFilter } = buildDateFilters(startDate, endDate);

    // Same inclusive UTC boundaries as buildDateFilters, applied to Task.startDate /
    // Task.endDate instead of createdAt — one date convention across analytics.
    const rangeFilter = {};
    if (startDate) rangeFilter.$gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate) rangeFilter.$lte = new Date(endDate + 'T23:59:59.999Z');
    const hasRange = Object.keys(rangeFilter).length > 0;

    // Same task base as /admin/analytics/client (exclude plan listings and soft-deleted)
    const taskBase = { isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, clientId };
    // A task belongs on the timeline when its START or END date falls inside the range
    const taskDateScope = hasRange
      ? { $or: [{ startDate: rangeFilter }, { endDate: rangeFilter }] }
      : {};

    const [orders, tasks] = await Promise.all([
      Order.find({ clientId, ...createdAtFilter })
        .sort({ createdAt: 1 })
        .select('orderId totalAmount orderStatus createdAt items.planTitle')
        .lean(),
      Task.find({ ...taskBase, ...taskDateScope })
        .sort({ startDate: 1 })
        .select('title status startDate endDate creditCost')
        .limit(500)
        .lean()
    ]);

    res.json({
      scope: { clientId: clientId.toString() },
      range: { startDate: startDate || null, endDate: endDate || null },
      orders: orders.map(o => ({
        orderId: o.orderId || '',
        totalAmount: o.totalAmount || 0,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        services: (o.items || []).map(i => i.planTitle).filter(Boolean)
      })),
      tasks: tasks.map(t => ({
        title: t.title || 'Task',
        status: t.status,
        startDate: t.startDate || null,
        endDate: t.endDate || null,
        creditCost: t.creditCost || 0
      }))
    });
  } catch (err) {
    console.error('Client timeline error:', err);
    res.status(500).json({ error: 'Failed to load client timeline' });
  }
});

module.exports = router;

