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
const Notification = require('../models/Notification');
const { buildTimelineJourneyMap, findTimelineEventTaskIds, findTimelineTasks } = require('../utils/workflowTimeline');

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

// Shared additive task mapper for existing admin timeline responses. One client
// lookup per response prevents calendar rendering from causing N+1 queries.
async function buildTimelineTaskPayload(tasks, journeyByTask) {
  const clientIds = [...new Set((tasks || []).filter(t => t.clientId).map(t => t.clientId.toString()))];
  const clientNameById = new Map();
  if (clientIds.length > 0) {
    try {
      const clients = await User.find({ _id: { $in: clientIds } }).select('profile.name').lean();
      for (const client of clients) clientNameById.set(client._id.toString(), client.profile?.name || null);
    } catch (clientNameErr) {
      console.error('Timeline client name lookup failed:', clientNameErr.message);
    }
  }
  return (tasks || []).map(t => ({
    id: t._id.toString(),
    title: t.title || 'Task',
    status: t.status,
    startDate: t.startDate || null,
    endDate: t.endDate || null,
    deadline: t.deadline || null,
    clientId: t.clientId?.toString() || null,
    clientName: t.clientId ? (clientNameById.get(t.clientId.toString()) || null) : null,
    ...journeyByTask.get(t._id.toString()),
    creditCost: t.creditCost || 0,
  }));
}

// Resolve and authorize the target client. Returns { clientId } when allowed,
// or a { status, error } object the handler must return to the caller.
async function resolveAuthorizedClient(req) {
  const raw = req.query.clientIds ?? req.query.clientId;
  if (typeof raw !== 'string') return { status: 400, error: 'Valid clientId or comma-separated clientIds is required' };
  const ids = [...new Set(raw.split(',').map(id => id.trim()))];
  if (!ids.length || ids.length > 100 || ids.some(id => !mongoose.isValidObjectId(id))) {
    return { status: 400, error: 'Select between 1 and 100 valid clients' };
  }
  const targets = await User.find({ _id: { $in: ids }, role: 'CLIENT', isDeleted: { $ne: true } }).select('_id').lean();
  if (targets.length !== ids.length) return { status: 404, error: 'Client not found' };

  // Reuse the caller's EXISTING authorization surface (same rule as GET /admin/clients)
  const caller = await User.findById(req.user.id).populate('customRole');
  const isMainAdmin = caller && caller.role === 'ADMIN' && !caller.customRole;
  if (!isMainAdmin) {
    if (!caller) return { status: 404, error: 'Client not found' };
    const visibleClientIds = await Task.distinct('clientId', { assignedTo: caller._id });
    const allowed = new Set(visibleClientIds.filter(Boolean).map(String));
    if (ids.some(id => !allowed.has(id))) return { status: 404, error: 'Client not found' };
  }

  const clientIds = ids.map(id => new mongoose.Types.ObjectId(id));
  return { clientId: clientIds.length === 1 ? clientIds[0] : { $in: clientIds }, clientIds };
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
        { $lookup: { from: Task.collection.name, localField: 'taskId', foreignField: '_id', as: 'task' } },
        { $unwind: '$task' },
        { $group: { _id: '$task.clientId', total: { $sum: '$amount' } } }
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
        { $lookup: { from: Wallet.collection.name, localField: 'walletId', foreignField: '_id', as: 'wallet' } },
        { $unwind: '$wallet' },
        { $group: { _id: '$wallet.clientId', total: { $sum: '$amount' } } }
      ]),
      Order.aggregate([
        { $match: { clientId, orderStatus: { $ne: 'REJECTED' }, ...createdAtFilter } },
        { $group: { _id: '$clientId', total: { $sum: '$totalAmount' } } }
      ])
    ]);
    const clientUsers = await User.find({ _id: clientId }).select('identifier profile.name billing.companyName billing.name').lean();
    const names = new Map(clientUsers.map(user => [String(user._id), user.profile?.name || user.billing?.companyName || user.billing?.name || user.identifier || 'Unknown']));
    const identifier = clientUsers.length === 1 ? names.get(String(clientUsers[0]._id)) : `${clientUsers.length} selected clients`;
    const totals = rows => new Map(rows.map(row => [String(row._id), row.total || 0]));
    const recharges = totals(rechargeAgg), spends = totals(spendAgg), commissions = totals(commissionTotal);
    const top10 = clientUsers.map(user => ({ clientId: user._id, identifier: names.get(String(user._id)),
      totalRecharge: recharges.get(String(user._id)) || 0, totalSpend: spends.get(String(user._id)) || 0,
      totalCommission: commissions.get(String(user._id)) || 0 })).sort((a, b) => b.totalRecharge - a.totalRecharge).slice(0, 10);

    // Recent activity — only this client's records (same merge/sort as global)
    const [recentOrders, recentTasks, recentRecharges] = await Promise.all([
      Order.find({ clientId, ...createdAtFilter }).sort({ createdAt: -1 }).limit(5).select('orderId clientId totalAmount orderStatus createdAt').lean(),
      Task.find({ ...taskBase, status: 'COMPLETED', ...updatedAtFilter }).sort({ updatedAt: -1 }).limit(5).select('title clientId creditCost updatedAt').lean(),
      RechargeRequest.find({ clientId, status: 'APPROVED', ...createdAtFilter }).sort({ createdAt: -1 }).limit(5).select('amount clientId createdAt').lean()
    ]);
    const recentActivity = [
      ...recentOrders.map(o => ({ type: 'order', label: `Order ${o.orderId || ''}`, value: o.totalAmount, status: o.orderStatus, date: o.createdAt, clientName: names.get(String(o.clientId)) || 'Unknown' })),
      ...recentTasks.map(t => ({ type: 'task', label: t.title || 'Task', value: t.creditCost, status: 'COMPLETED', date: t.updatedAt, clientName: names.get(String(t.clientId)) || 'Unknown' })),
      ...recentRecharges.map(r => ({ type: 'recharge', label: 'Recharge Approved', value: r.amount, status: 'APPROVED', date: r.createdAt, clientName: names.get(String(r.clientId)) || 'Unknown' }))
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
      scope: { clientId: auth.clientIds?.length === 1 ? String(auth.clientIds[0]) : null, clientIds: auth.clientIds?.map(String), identifier },
      metrics: {
        totalTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        amountReceived: amountReceivedAgg[0]?.total || 0,
        creditSend: creditSendAgg[0]?.total || 0,
        commissionGenerate: commissionTotal.reduce((total, row) => total + (row.total || 0), 0),
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
//  - Task has NO on-document completion timestamp (no completedAt field; updatedAt
//    changes on unrelated edits like chat/approvals). The ACTUAL completion date is
//    taken from the earliest persisted TASK_COMPLETED notification per task and
//    exposed as `completedAt`; tasks without that record report completedAt = null
//    (no legacy backfill, never derived from endDate or updatedAt). endDate is
//    returned as the END DATE together with the task's CURRENT status; the UI must
//    not present it as a completion date.
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
    // A task belongs on the timeline when its START or END date falls inside the
    // range, OR when its ACTUAL completion event (a TASK_COMPLETED notification
    // createdAt inside the range) falls inside it — even if startDate/endDate are
    // outside. One batched server-side query; the clientId base filter below still
    // ANDs over the whole $or, so no other client's task can ever be included.
    const eventTaskIds = hasRange
      ? await findTimelineEventTaskIds(rangeFilter)
      : { completedIds: [], approvedIds: [] };
    const orders = await Order.find({ clientId, ...(hasRange ? {
      $or: [{ createdAt: rangeFilter }, { approvedAt: rangeFilter }, { completedAt: rangeFilter }],
    } : {}) }).sort({ createdAt: 1 })
      .select('orderId clientId totalAmount orderStatus createdAt approvedAt completedAt items.planTitle').lean();
    const tasks = await findTimelineTasks({
      taskScope: taskBase, rangeFilter, ...eventTaskIds,
      orderIds: orders.map(o => o._id), limit: 500,
    });

    // One batched lookup for the whole page — the task ids come from the
    // client-scoped query above, so no other client's notifications are exposed.
    const journeyByTask = await buildTimelineJourneyMap(tasks, null, orders);
    const timelineTasks = await buildTimelineTaskPayload(tasks, journeyByTask);

    res.json({
      scope: { clientId: auth.clientIds?.length === 1 ? String(auth.clientIds[0]) : null, clientIds: auth.clientIds?.map(String) },
      range: { startDate: startDate || null, endDate: endDate || null },
      orders: orders.map(o => ({
        id: o._id.toString(),
        orderId: o.orderId || '',
        approvedAt: o.approvedAt || null,
        completedAt: o.completedAt || null,
        totalAmount: o.totalAmount || 0,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        services: (o.items || []).map(i => i.planTitle).filter(Boolean)
      })),
      tasks: timelineTasks
    });
  } catch (err) {
    console.error('Client timeline error:', err);
    res.status(500).json({ error: 'Failed to load client timeline' });
  }
});

// ---------- GET /admin/analytics/timeline ----------
// Office-wide (ALL CLIENTS) workflow timeline: identical event semantics and the same
// inclusive UTC date-boundary convention as /client/timeline, aggregated across the
// clients the caller is allowed to see (main admin: all clients; other staff: only
// clients already visible to them through task assignment — same rule as
// resolveAuthorizedClient / GET /admin/clients). Strictly read-only.
router.get('/timeline', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const { createdAtFilter } = buildDateFilters(startDate, endDate);

    const rangeFilter = {};
    if (startDate) rangeFilter.$gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate) rangeFilter.$lte = new Date(endDate + 'T23:59:59.999Z');
    const hasRange = Object.keys(rangeFilter).length > 0;

    // Caller visibility scoping (server-side authoritative)
    const caller = await User.findById(req.user.id).populate('customRole');
    const isMainAdmin = caller && caller.role === 'ADMIN' && !caller.customRole;
    let clientScope = {};
    if (!isMainAdmin) {
      const visibleIds = (await Task.distinct('clientId', { assignedTo: caller._id })).filter(Boolean);
      if (visibleIds.length === 0) {
        return res.json({ scope: { allClients: true }, range: { startDate: startDate || null, endDate: endDate || null }, orders: [], tasks: [] });
      }
      clientScope = { clientId: { $in: visibleIds } };
    }

    const taskBase = { isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, ...clientScope };
    // Same inclusion rule as /client/timeline: START or END date in range, OR the
    // ACTUAL completion event (TASK_COMPLETED notification createdAt) in range.
    // One batched server-side query; the client-visibility clientScope base filter
    // still ANDs over the whole $or, so the caller's existing scope is preserved.
    const eventTaskIds = hasRange
      ? await findTimelineEventTaskIds(rangeFilter)
      : { completedIds: [], approvedIds: [] };
    const orders = await Order.find({ ...clientScope, ...(hasRange ? {
      $or: [{ createdAt: rangeFilter }, { approvedAt: rangeFilter }, { completedAt: rangeFilter }],
    } : {}) }).sort({ createdAt: 1 })
      .select('orderId clientId totalAmount orderStatus createdAt approvedAt completedAt items.planTitle')
      .limit(1000).lean();
    const tasks = await findTimelineTasks({
      taskScope: taskBase, rangeFilter, ...eventTaskIds,
      orderIds: orders.map(o => o._id), limit: 1000,
    });

    // One batched lookup for the whole page — the task ids already obey the
    // caller's client-visibility scope computed above.
    const journeyByTask = await buildTimelineJourneyMap(tasks, null, orders);
    const timelineTasks = await buildTimelineTaskPayload(tasks, journeyByTask);

    res.json({
      scope: { allClients: true },
      range: { startDate: startDate || null, endDate: endDate || null },
      orders: orders.map(o => ({
        id: o._id.toString(),
        orderId: o.orderId || '',
        approvedAt: o.approvedAt || null,
        completedAt: o.completedAt || null,
        totalAmount: o.totalAmount || 0,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        services: (o.items || []).map(i => i.planTitle).filter(Boolean)
      })),
      tasks: timelineTasks
    });
  } catch (err) {
    console.error('Office timeline error:', err);
    res.status(500).json({ error: 'Failed to load office timeline' });
  }
});

module.exports = router;

