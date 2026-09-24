const Notification = require('../models/Notification');
const { Order } = require('../models/Order');
const { Task } = require('../models/Task');

// These are persisted transition records, not inferred from the current status.
const taskTimelineNotificationFilter = {
  $or: [
    { type: 'TASK_COMPLETED' },
    { type: 'TASK_APPROVED' },
    { type: 'TASK_STATUS_CHANGED', title: 'Task Approved' },
  ],
};

// Keep completion matches separate from newly added approvals so approvals cannot
// consume the original completion result window. Like distinct(), this returns
// one record per task, not every notification; the date/type scope is unchanged.
async function findTimelineEventTaskIds(rangeFilter) {
  const events = await Notification.aggregate([
    { $match: { ...taskTimelineNotificationFilter,
      'relatedEntity.entityType': 'TASK', createdAt: rangeFilter } },
    { $group: { _id: '$relatedEntity.entityId',
      completed: { $max: { $cond: [{ $eq: ['$type', 'TASK_COMPLETED'] }, 1, 0] } } } },
  ]);
  return {
    completedIds: events.filter(event => event.completed).map(event => event._id),
    approvedIds: events.filter(event => !event.completed).map(event => event._id),
  };
}

// Preserve the original bounded result window before admitting new event/overlap
// matches. At most two task queries, with a combined limit of 500 or 1,000; no
// per-task queries, limit removal, or over-fetching an unbounded result set.
async function findTimelineTasks({ taskScope, rangeFilter, completedIds = [], approvedIds = [], orderIds = [], limit = 500 }) {
  if (limit !== 500 && limit !== 1000) throw new Error('Invalid Timeline task limit');
  const select = 'title status startDate endDate deadline creditCost clientId createdAt orderId progress milestones';
  const find = (filter, count) => Task.find(filter).sort({ startDate: 1 }).select(select).limit(count).lean();
  if (!Object.keys(rangeFilter).length) return find(taskScope, limit);
  const legacyDates = { $or: [
    { startDate: rangeFilter }, { endDate: rangeFilter }, { deadline: rangeFilter },
    { _id: { $in: completedIds } },
  ] };
  const existing = await find({ $and: [taskScope, legacyDates] }, limit);
  const remaining = limit - existing.length;
  if (!remaining) return existing;

  // Inclusive interval intersection. Deadline is an end-date fallback only when
  // endDate is absent. Missing dates never become invented interval endpoints.
  const startsBeforeEnd = rangeFilter.$lte ? { $lte: rangeFilter.$lte } : { $ne: null };
  const endsAfterStart = rangeFilter.$gte ? { $gte: rangeFilter.$gte } : { $ne: null };
  const overlap = { $and: [
    { startDate: startsBeforeEnd },
    { $or: [{ endDate: endsAfterStart }, { endDate: null, deadline: endsAfterStart }] },
  ] };
  const additional = await find({ $and: [taskScope, { $nor: [legacyDates] }, { $or: [
    overlap, { createdAt: rangeFilter },
    { milestones: { $elemMatch: { reached: true, reachedAt: rangeFilter } } },
    { orderId: { $in: orderIds } }, { _id: { $in: approvedIds } },
  ] }] }, remaining);
  // Defensive deduplication also covers a task changing dates between queries.
  return [...new Map([...existing, ...additional].map(task => [String(task._id), task])).values()]
    .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0));
}

// Read-only enrichment of already-authorized tasks. Two batched queries at most,
// regardless of task count; no task detail calls, writes, or progress recalculation.
async function buildTimelineJourneyMap(tasks, orderClientId = null, knownOrders = []) {
  const journeys = new Map();
  if (!tasks.length) return journeys;
  const knownOrderIds = new Set(knownOrders.map(order => String(order._id)));
  const orderIds = [...new Set(tasks
    .filter(t => t.orderId && !knownOrderIds.has(String(t.orderId))
      && (!orderClientId || String(t.clientId) === String(orderClientId)))
    .map(t => String(t.orderId)))];
  const [notifications, orders] = await Promise.all([
    Notification.find({
      ...taskTimelineNotificationFilter,
      'relatedEntity.entityType': 'TASK',
      'relatedEntity.entityId': { $in: tasks.map(t => t._id) },
    }).select('type relatedEntity.entityId createdAt').sort({ createdAt: 1 }).lean().catch(error => {
      console.error('Timeline event dates unavailable:', error.message);
      return [];
    }),
    orderIds.length ? Order.find({
      _id: { $in: orderIds },
      ...(orderClientId ? { clientId: orderClientId } : {}),
    }).select('orderId clientId createdAt approvedAt').lean().catch(error => {
      console.error('Timeline order dates unavailable:', error.message);
      return [];
    }) : [],
  ]);
  const eventDates = new Map();
  for (const notification of notifications) {
    const id = String(notification.relatedEntity?.entityId || '');
    const dates = eventDates.get(id) || {};
    const field = notification.type === 'TASK_COMPLETED' ? 'completedAt' : 'approvedAt';
    if (!dates[field]) dates[field] = notification.createdAt;
    eventDates.set(id, dates);
  }
  const orderMap = new Map([...knownOrders, ...orders].map(order => [String(order._id), order]));
  for (const task of tasks) {
    const dates = eventDates.get(String(task._id)) || {};
    const candidate = orderMap.get(String(task.orderId));
    // An assignment grants task access, not access to the buyer's order.
    const order = candidate && String(candidate.clientId) === String(task.clientId)
      && (!orderClientId || String(task.clientId) === String(orderClientId)) ? candidate : null;
    journeys.set(String(task._id), {
      createdAt: task.createdAt || null,
      approvedAt: order?.approvedAt || dates.approvedAt || null,
      completedAt: dates.completedAt || null,
      progress: typeof task.progress === 'number' ? task.progress : null,
      orderContext: task.orderId ? (order ? 'available' : 'unavailable') : 'not_applicable',
      order: order ? { id: String(order._id), orderId: order.orderId,
        createdAt: order.createdAt || null, approvedAt: order.approvedAt || null } : null,
      milestones: (task.milestones || []).map(milestone => ({
        name: milestone.name,
        percentage: milestone.percentage,
        reached: milestone.reached === true,
        reachedAt: milestone.reached === true ? (milestone.reachedAt || null) : null,
      })),
    });
  }
  return journeys;
}

module.exports = { buildTimelineJourneyMap, taskTimelineNotificationFilter, findTimelineEventTaskIds, findTimelineTasks };
