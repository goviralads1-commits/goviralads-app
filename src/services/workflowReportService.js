// Read-only Workflow Report model builder for the Admin panel PDF report.
//
// DATA HONESTY RULES (identical to the Workflow Timeline presentation layer):
//  - Stage thresholds are 0% Scheduled, 1%-4% Started, 5%-99% In Process,
//    100% Completed. They describe the CURRENT progress only.
//  - No Scheduled / Started / In Process transition timestamp is persisted, so
//    those dates are reported as unavailable and never inferred from progress.
//  - Milestones are saved evidence, not workflow stage transitions.
//  - Order relationships use the exact recorded order id; an ambiguous display
//    code can never create or hide a relationship.
// This module is pure: it performs no database access and mutates no input.

const REPORT_STAGES = Object.freeze([
  'ORDER PLACED',
  'SCHEDULED (0%)',
  'STARTED (1%-4%)',
  'IN PROCESS (5%-99%)',
  'COMPLETED (100%)',
]);

const STAGE_UNAVAILABLE = 'Stage unavailable';

// Mirrors the Timeline's currentStage() exactly, including the fractional
// 0 < progress < 1 gap, so the PDF and the Timeline can never disagree.
function reportStage(progress) {
  if (!Number.isFinite(progress)) return STAGE_UNAVAILABLE;
  if (progress === 0) return 'Scheduled';
  if (progress >= 100) return 'Completed';
  if (progress >= 5) return 'In Process';
  if (progress >= 1) return 'Started';
  return STAGE_UNAVAILABLE;
}

// Same UTC day bucketing as the Timeline (journeyDay).
function reportDay(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function formatReportDate(value) {
  const day = reportDay(value);
  if (!day) return 'Date unavailable';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function formatReportDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Date unavailable';
  return `${date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

const orderKey = order => (order ? order.id || order.orderId || null : null);
const statusOf = value => String(value || '').toUpperCase();

// Same exact-id rule as the Timeline's resolveJourneyOrder.
function resolveReportOrder(task, orders = []) {
  const linked = task?.order;
  if (!linked) return linked || null;
  const matches = orders.filter(order => linked.id ? order.id === linked.id : linked.orderId && order.orderId === linked.orderId);
  const unique = new Map(matches.map(order => [orderKey(order), order]));
  if (unique.size !== 1) return linked;
  const recorded = [...unique.values()][0];
  return { ...linked, id: linked.id || recorded.id, createdAt: reportDay(linked.createdAt) ? linked.createdAt : recorded.createdAt };
}

// A rejected order or a cancelled task is not normal work. Exclusion requires an
// explicit recorded status: unavailable dates or unavailable order context must
// never hide approved, active or completed work.
function isRejectedReportTask(task, orders = []) {
  if (statusOf(task?.status) === 'CANCELLED') return true;
  const linked = task?.order;
  if (!linked) return false;
  const matches = orders.filter(order => linked.id ? order.id === linked.id : linked.orderId && order.orderId === linked.orderId);
  const unique = new Map(matches.map(order => [orderKey(order), order]));
  if (unique.size !== 1) return false;
  return statusOf([...unique.values()][0].orderStatus) === 'REJECTED';
}

// Chronological numbering from the RECORDED order date inside the selected
// range. Order approval, task creation and completion dates never renumber.
function numberReportOrders(tasks = [], orders = [], startDate, endDate) {
  const available = [...orders, ...tasks.map(task => resolveReportOrder(task, orders)).filter(Boolean)]
    .filter(order => {
      const day = reportDay(order.createdAt);
      return day && orderKey(order) && (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  const unique = [...new Map(available.map(order => [orderKey(order), order])).values()]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(orderKey(a)).localeCompare(String(orderKey(b))));
  return new Map(unique.map((order, index) => [orderKey(order), index + 1]));
}

// Plain text only: task descriptions are stored as rich text, and a PDF must
// never carry markup or an unbounded amount of text.
function plainText(value, limit = 420) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

// Only http/https links are printed, and always as plain text (never as a PDF
// link annotation), so stored content cannot inject another protocol.
function safeLinks(task, limit = 6) {
  const raw = [
    ...(task?.clientInputs || []).map(input => input?.link),
    ...(task?.clientContentLinks || []),
    task?.clientDriveLink,
  ];
  const links = [];
  for (const value of raw) {
    const link = String(value || '').trim();
    if (!link || links.includes(link)) continue;
    let parsed;
    try { parsed = new URL(link); } catch (_) { continue; }
    if (!['http:', 'https:'].includes(parsed.protocol)) continue;
    links.push(link);
    if (links.length >= limit) break;
  }
  return links;
}

function packageName(order, tasks) {
  const services = [...new Set((order?.services || []).map(title => plainText(title, 120)).filter(Boolean))];
  if (services.length) return services.join(', ');
  const fromTask = (tasks || []).map(task => plainText(task.title, 120)).filter(Boolean);
  return fromTask.length ? fromTask.join(', ') : 'Package title unavailable';
}

function buildTaskEntry(task) {
  const progress = Number.isFinite(task.progress) ? task.progress : null;
  const stage = reportStage(progress);
  const completedAt = reportDay(task.completedAt) ? task.completedAt : null;
  return {
    id: task.id,
    title: plainText(task.title, 140) || 'Untitled task',
    clientName: task.clientName || null,
    status: statusOf(task.status) || 'UNKNOWN',
    progress,
    stage,
    stageLabel: stage === STAGE_UNAVAILABLE ? STAGE_UNAVAILABLE : `${stage} (${progress}%)`,
    completed: Boolean(completedAt) || statusOf(task.status) === 'COMPLETED' || stage === 'Completed',
    completedLabel: completedAt ? formatReportDate(completedAt) : 'Completion date unavailable',
    orderDateLabel: formatReportDate(task.order?.createdAt),
    approvedLabel: formatReportDateTime(task.approvedAt),
    description: plainText(task.description),
    links: safeLinks(task),
    // Saved milestones only; reachedAt stays null when it was never recorded.
    milestones: (task.milestones || []).map((milestone, index) => ({
      name: plainText(milestone.name, 90) || `Milestone ${index + 1}`,
      percentage: Number.isFinite(milestone.percentage) ? milestone.percentage : null,
      reached: milestone.reached === true,
      dateLabel: milestone.reached === true ? formatReportDate(milestone.reachedAt) : 'Not reached',
    })).filter(milestone => milestone.reached),
  };
}

// Build the complete report model from already-authorized timeline payloads.
function buildReportModel(input = {}) {
  const tasks = [...new Map((input.tasks || []).map(task => [String(task.id), task])).values()];
  const orders = [...new Map((input.orders || []).map(order => [orderKey(order), order])).values()];
  const startDate = reportDay(input.range?.startDate) || null;
  const endDate = reportDay(input.range?.endDate) || null;
  const clients = (input.clients || []).filter(client => client && (client.id || client.name));

  const rejectedTasks = tasks.filter(task => isRejectedReportTask(task, orders));
  const activeTasks = tasks.filter(task => !isRejectedReportTask(task, orders));
  const rejectedKeys = new Set(orders.filter(order => statusOf(order.orderStatus) === 'REJECTED').map(orderKey));
  const activeOrders = orders.filter(order => !rejectedKeys.has(orderKey(order)));

  const numbers = numberReportOrders(activeTasks, activeOrders, startDate, endDate);

  // Group by the exact order identity so one order with several tasks is one
  // numbered journey and no task is ever duplicated across journeys.
  const groups = new Map();
  for (const task of activeTasks) {
    const order = resolveReportOrder(task, orders);
    const key = orderKey(order) ? `order:${orderKey(order)}` : `task:${task.id}`;
    if (!groups.has(key)) groups.set(key, { key, order: orderKey(order) ? order : null, tasks: [] });
    groups.get(key).tasks.push(task);
  }
  // An order in range whose tasks are all cancelled still exists as an order.
  for (const order of activeOrders) {
    const day = reportDay(order.createdAt);
    if (!day || (startDate && day < startDate) || (endDate && day > endDate)) continue;
    const key = `order:${orderKey(order)}`;
    if (!groups.has(key)) groups.set(key, { key, order, tasks: [] });
  }

  const journeys = [...groups.values()].map(group => {
    const key = orderKey(group.order);
    const entries = group.tasks.map(buildTaskEntry).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return {
      sequence: key ? numbers.get(key) || null : null,
      orderCode: group.order?.orderId || null,
      orderDate: reportDay(group.order?.createdAt) || null,
      orderDateLabel: formatReportDate(group.order?.createdAt),
      approvedLabel: formatReportDateTime(group.order?.approvedAt),
      completedLabel: formatReportDate(group.order?.completedAt),
      orderStatus: statusOf(group.order?.orderStatus) || (key ? 'UNKNOWN' : 'NO ORDER RECORD'),
      packageName: packageName(group.order, group.tasks),
      clientNames: [...new Set(entries.map(entry => entry.clientName).filter(Boolean))],
      tasks: entries,
      unnumberedReason: key
        ? (reportDay(group.order?.createdAt) ? 'Order date outside the selected period' : 'Order date unavailable')
        : 'No order record linked to this task',
    };
  }).sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity)
    || (a.orderDate || '9999').localeCompare(b.orderDate || '9999')
    || String(a.orderCode || a.packageName).localeCompare(String(b.orderCode || b.packageName)));

  const rejected = orders.filter(order => rejectedKeys.has(orderKey(order))).map(order => ({
    orderCode: order.orderId || null,
    orderDateLabel: formatReportDate(order.createdAt),
    packageName: packageName(order, []),
    reason: 'Order rejected',
    tasks: tasks.filter(task => orderKey(resolveReportOrder(task, orders)) === orderKey(order)).map(buildTaskEntry),
  })).sort((a, b) => String(a.orderCode || '').localeCompare(String(b.orderCode || '')));
  // Cancelled tasks on a non-rejected order are reported separately, never mixed
  // into the chronological journey list.
  const cancelled = rejectedTasks
    .filter(task => !rejectedKeys.has(orderKey(resolveReportOrder(task, orders))))
    .map(task => ({ ...buildTaskEntry(task), reason: 'Task cancelled' }));

  const allEntries = journeys.flatMap(journey => journey.tasks);
  const open = allEntries.filter(entry => !entry.completed);
  const started = open.filter(entry => entry.stage === 'Started').length;
  const process = open.filter(entry => entry.stage === 'In Process').length;
  const completed = allEntries.filter(entry => entry.completed).length;
  const scheduled = open.filter(entry => entry.stage === 'Scheduled').length;
  const unavailable = open.filter(entry => entry.stage === STAGE_UNAVAILABLE).length;

  const notes = [
    'Scheduled (0%), Started (1%-4%) and In Process (5%-99%) transition timestamps are not persisted by the system. Only recorded order, approval, saved milestone and completion dates are printed; no historical date is inferred from current progress.',
    'Saved milestones are supporting evidence and are not counted as workflow stage transitions.',
  ];
  const unnumbered = journeys.filter(journey => !journey.sequence);
  if (unnumbered.length) notes.push(`${unnumbered.length} journey(s) have no recorded order date inside the selected period and are listed without a chronological number.`);
  if (unavailable) notes.push(`${unavailable} task(s) have no usable progress value, so their stage is reported as unavailable instead of being guessed.`);
  if (!tasks.length && !orders.length) notes.push('No order or task record exists for this client and period.');

  const clientLabel = clients.length === 1
    ? (clients[0].name || clients[0].identifier || 'Client')
    : clients.length ? `${clients.length} selected clients` : 'All authorized clients';

  return {
    brand: input.brand || 'Go Viral Ads',
    title: 'Workflow Report',
    generatedAt: input.generatedAt || new Date(),
    generatedBy: plainText(input.generatedBy?.name || input.generatedBy?.identifier || 'Admin', 80),
    period: {
      startDate,
      endDate,
      label: startDate && endDate ? `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`
        : startDate ? `From ${formatReportDate(startDate)}`
          : endDate ? `Until ${formatReportDate(endDate)}` : 'All time',
    },
    clients: clients.map(client => ({ id: client.id || null, name: client.name || client.identifier || 'Client' })),
    clientLabel,
    stages: REPORT_STAGES,
    summary: {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      rejectedOrders: rejectedKeys.size,
      totalTasks: tasks.length,
      completed,
      started,
      process,
      inProgress: started + process,
      scheduled,
      unavailable,
      rejected: rejectedTasks.length,
    },
    journeys,
    rejected,
    cancelled,
    notes,
    empty: !tasks.length && !orders.length,
  };
}

module.exports = {
  REPORT_STAGES,
  STAGE_UNAVAILABLE,
  reportStage,
  reportDay,
  formatReportDate,
  formatReportDateTime,
  plainText,
  safeLinks,
  resolveReportOrder,
  isRejectedReportTask,
  numberReportOrders,
  buildTaskEntry,
  buildReportModel,
};
