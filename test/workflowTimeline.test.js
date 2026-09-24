'use strict';

// Offline fixtures only. Never import the app, load .env, or connect to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clientView = 'frontend/client-app/src/components/WorkflowJourney.jsx';
const adminView = 'frontend/admin-panel/src/components/WorkflowJourney.jsx';
const plain = value => JSON.parse(JSON.stringify(value));
const day = '2026-09-10';

function loadView(file) {
  const source = read(file).split('export const TaskJourney =')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({ journeyDay, journeyDateAxis, journeyColor, taskJourneyEvents, taskJourneyRange, numberJourneyTasks, buildWorkflowGraph });`);
}

for (const file of [clientView, adminView]) {
  const ui = loadView(file);
  test(`${file}: missing dates never fall back to deadline, updatedAt, or task creation`, () => {
    const task = { id: 't', status: 'COMPLETED', createdAt: day, updatedAt: day, endDate: day,
      order: { id: 'o', createdAt: null }, milestones: [], progress: 100 };
    const stages = ui.taskJourneyEvents(task);
    assert.equal(stages.length, 6);
    assert.ok(stages.every(stage => !stage.date));
    assert.equal(ui.journeyDay('bad-date'), null);
    assert.equal(ui.journeyDay(null), null);
  });
  test(`${file}: real milestone dates and status meanings are preserved`, () => {
    const task = { status: 'PENDING', startDate: day, progress: 120, milestones: [
      { name: 'Draft', percentage: 40, reached: true, reachedAt: day },
      { name: 'Reset', percentage: 90, reached: false, reachedAt: '2026-09-12' },
      { name: 'Legacy', percentage: 20, reached: true, reachedAt: null },
    ] };
    const before = plain(task);
    const stages = ui.taskJourneyEvents(task);
    assert.equal(stages.find(stage => stage.key === 'started').date, day);
    assert.equal(stages.find(stage => stage.key === 'process').date, undefined);
    assert.equal(stages.find(stage => stage.key === 'milestone:0').date, day);
    assert.deepEqual(task, before);
    assert.equal(ui.taskJourneyEvents({ orderContext: 'unavailable', createdAt: day })[0].date, undefined);
  });
  test(`${file}: own event dates, UTC boundaries, deduplication, and busy dates`, () => {
    const order = { id: 'o', orderId: 'ORD', createdAt: day, approvedAt: day };
    const tasks = Array.from({ length: 65 }, (_, i) => ({ id: `t${i}`, order,
      createdAt: '2026-08-01', startDate: '2026-08-02', endDate: '2026-10-01',
      milestones: [{ name: 'Draft', reached: true, reachedAt: '2026-09-10T23:59:59.999Z' }],
      completedAt: '2026-09-11T00:00:00.000Z' }));
    const model = ui.buildWorkflowGraph({ orders: [order], tasks }, day, day);
    assert.equal(model.series.length, 65); // linked orders do not create duplicate lines
    assert.equal(model.series.flatMap(line => line.points).filter(point => point.day === day).length, 130);
    assert.equal(model.count, 1);
    assert.equal(model.numbered.find(task => task.id === 't0').startDate, '2026-08-02');
  });
  test(`${file}: empty/invalid ranges and unknown legacy completion`, () => {
    const model = ui.buildWorkflowGraph({ tasks: [{ id: 't', status: 'COMPLETED', endDate: day }] }, day, day);
    assert.equal(model.series[0].points.length, 0);
    assert.equal(model.numbered.length, 1);
    assert.equal(ui.buildWorkflowGraph(null, day, day).series.length, 0);
    assert.equal(ui.buildWorkflowGraph(null, 'bad', day).count, 0);
    assert.equal(ui.buildWorkflowGraph(null, '2026-09-11', day).count, 0);
    assert.equal(ui.buildWorkflowGraph(null, '2025-01-01', '2026-12-31').ticks.at(-1), '2026-12-31');
  });
}
test('independently deployed frontends keep identical journey rendering', () => {
  assert.equal(read(clientView).replace(/\r/g, ''), read(adminView).replace(/\r/g, ''));
});

const values = (item, segments) => {
  if (!segments.length) return [item];
  if (Array.isArray(item)) return item.flatMap(value => values(value, segments));
  return values(item?.[segments[0]], segments.slice(1));
};
const matches = (item, filter) => Object.entries(filter).every(([key, condition]) => {
  if (key === '$and') return condition.every(child => matches(item, child));
  if (key === '$or') return condition.some(child => matches(item, child));
  if (key === '$nor') return !condition.some(child => matches(item, child));
  const candidates = values(item, key.split('.'));
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    return Object.entries(condition).every(([op, value]) => {
      if (op === '$ne') return candidates.every(candidate => value === null ? candidate != null : candidate !== value);
      if (op === '$in') return candidates.some(candidate => value.some(v => String(v) === String(candidate)));
      if (op === '$gte') return candidates.some(candidate => candidate != null && new Date(candidate) >= new Date(value));
      if (op === '$lte') return candidates.some(candidate => candidate != null && new Date(candidate) <= new Date(value));
      if (op === '$elemMatch') return candidates.some(candidate => Array.isArray(candidate) && candidate.some(v => matches(v, value)));
      throw new Error(`Unsupported fixture operator ${op}`);
    });
  }
  return candidates.some(candidate => condition === null ? candidate == null : String(candidate) === String(condition));
});
function fixture() {
  const tasks = [
    { _id: 'owned', clientId: 'buyer', orderId: 'order', status: 'ACTIVE', progress: 50, startDate: '2026-09-09',
      milestones: [{ name: 'Draft', percentage: 50, reached: true, reachedAt: day }] },
    { _id: 'assigned', clientId: 'other', orderId: 'private-order', assignedUsers: [{ userId: 'buyer' }],
      createdAt: day, milestones: [{ name: 'Legacy', reached: true }, { name: 'Reset', reached: false, reachedAt: day }] },
    { _id: 'legacy-assigned', clientId: 'other', assignedTo: 'buyer', startDate: day },
    { _id: 'foreign', clientId: 'stranger', startDate: day },
    { _id: 'linked', clientId: 'buyer', orderId: 'order', createdAt: '2026-09-15', startDate: '2026-09-16' },
    { _id: 'deleted', clientId: 'buyer', isDeleted: true, startDate: day },
    { _id: 'plan', clientId: 'buyer', isListedInPlans: true, startDate: day },
  ];
  const orders = [
    { _id: 'order', clientId: 'buyer', orderId: 'ORD', createdAt: day, approvedAt: '2026-09-11', totalAmount: 100, items: [] },
    { _id: 'private-order', clientId: 'other', orderId: 'PRIVATE', createdAt: day, approvedAt: day, totalAmount: 999 },
  ];
  const notifications = [
    { type: 'TASK_COMPLETED', relatedEntity: { entityType: 'TASK', entityId: 'owned' }, createdAt: '2026-09-14' },
    { type: 'TASK_COMPLETED', relatedEntity: { entityType: 'TASK', entityId: 'owned' }, createdAt: '2026-09-13' },
    { type: 'TASK_STATUS_CHANGED', title: 'Task Approved', relatedEntity: { entityType: 'TASK', entityId: 'legacy-assigned' }, createdAt: day },
    { type: 'TASK_STATUS_CHANGED', title: 'Task Rejected', relatedEntity: { entityType: 'TASK', entityId: 'assigned' }, createdAt: day },
    { type: 'TASK_COMPLETED', relatedEntity: { entityType: 'TASK', entityId: 'foreign' }, createdAt: day },
  ];
  const queries = [];
  const model = (name, docs) => ({ find(filter) {
    const record = { name, filter, operation: 'find' };
    queries.push(record);
    let result = docs.filter(doc => matches(doc, filter));
    const query = {
      select() { return query; },
      sort(fields) { const key = Object.keys(fields)[0]; result = [...result].sort((a, b) => new Date(a[key]) - new Date(b[key])); return query; },
      limit(n) { record.limit = n; result = result.slice(0, n); return query; },
      lean() { record.returned = result.length; return Promise.resolve(result); },
      distinct(key) { return Promise.resolve([...new Set(result.flatMap(doc => values(doc, key.split('.'))))]); },
    };
    return query;
  } });
  const Notification = model('Notification', notifications);
  Notification.aggregate = async pipeline => {
    queries.push({ name: 'Notification', pipeline, operation: 'aggregate' });
    assert.equal(pipeline.length, 2);
    assert.deepEqual(plain(pipeline[1]), { $group: { _id: '$relatedEntity.entityId',
      completed: { $max: { $cond: [{ $eq: ['$type', 'TASK_COMPLETED'] }, 1, 0] } } } });
    const grouped = new Map();
    for (const notification of notifications.filter(n => matches(n, pipeline[0].$match))) {
      const id = notification.relatedEntity.entityId;
      grouped.set(id, { _id: id, completed: Math.max(grouped.get(id)?.completed || 0, notification.type === 'TASK_COMPLETED' ? 1 : 0) });
    }
    return [...grouped.values()];
  };
  const Order = model('Order', orders);
  const Task = model('Task', tasks);
  Task.distinct = async (field, filter) => {
    queries.push({ name: 'Task', filter, operation: 'distinct' });
    return [...new Set(tasks.filter(t => matches(t, filter)).map(t => t[field]))];
  };
  const User = model('User', [{ _id: 'other', profile: { name: 'Authorized client' } }]);
  const module = { exports: {} };
  vm.runInNewContext(read('src/utils/workflowTimeline.js'), { module, console: { error() {} }, require(name) {
    if (name === '../models/Notification') return Notification;
    if (name === '../models/Order') return { Order };
    if (name === '../models/Task') return { Task };
    throw new Error(`Unexpected import: ${name}`);
  } });
  return { tasks, orders, notifications, queries, Task, Order, Notification, User, ...module.exports };
}

test('batched enrichment preserves dates, whitelists fields, and hides assigned-user order context', async () => {
  const f = fixture();
  const before = plain(f.tasks);
  const result = await f.buildTimelineJourneyMap(f.tasks.slice(0, 3), 'buyer');
  assert.equal(f.queries.filter(q => q.name === 'Notification').length, 1);
  assert.equal(f.queries.filter(q => q.name === 'Order').length, 1);
  assert.deepEqual(plain(f.queries.find(q => q.name === 'Order').filter._id.$in), ['order']);
  assert.equal(result.get('owned').completedAt, '2026-09-13');
  assert.equal(result.get('owned').approvedAt, '2026-09-11');
  assert.equal(result.get('owned').order.totalAmount, undefined);
  assert.equal(result.get('assigned').order, null);
  assert.equal(result.get('assigned').orderContext, 'unavailable');
  assert.equal(result.get('assigned').approvedAt, null);
  assert.equal(result.get('assigned').milestones[1].reachedAt, null);
  assert.equal(result.get('legacy-assigned').approvedAt, day);
  assert.deepEqual(f.tasks, before);
});

test('existing order results are reused and empty task lists issue no queries', async () => {
  const f = fixture();
  assert.equal((await f.buildTimelineJourneyMap([])).size, 0);
  assert.equal(f.queries.length, 0);
  await f.buildTimelineJourneyMap([f.tasks[0]], 'buyer', [f.orders[0]]);
  assert.equal(f.queries.length, 1);
  assert.equal(f.queries[0].name, 'Notification');
});

test('mismatched order owner is rejected even for an existing order result', async () => {
  const f = fixture();
  const map = await f.buildTimelineJourneyMap([{ _id: 't', clientId: 'buyer', orderId: 'private-order' }], null, f.orders);
  assert.equal(map.get('t').order, null);
  assert.equal(map.get('t').approvedAt, null);
});

function handler(file, route, globals) {
  const source = read(file);
  const start = source.indexOf(`router.get('${route}',`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n});', start) + 4;
  let callback;
  vm.runInNewContext(source.slice(start, end), { ...globals, console: { error() {} }, router: { get(_route, fn) { callback = fn; } } });
  return callback;
}
async function call(callback, req) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = plain(data); return this; } };
  await callback(req, res);
  return res;
}

test('actual client handler ANDs date and order linkage with ownership/assignment authorization', async () => {
  const f = fixture();
  const route = handler('src/routes/client.js', '/insights/timeline', f);
  const res = await call(route, { user: { id: 'buyer' }, query: { startDate: day, endDate: day, clientId: 'stranger' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data.tasks.map(t => t.id).sort(), ['assigned', 'legacy-assigned', 'linked', 'owned']);
  assert.deepEqual(res.data.orders.map(o => o.orderId), ['ORD']);
  assert.equal(res.data.tasks.find(t => t.id === 'assigned').order, null);
  assert.equal(f.queries.filter(q => q.name === 'Task').length, 2);
  assert.equal(f.queries.filter(q => q.name === 'Order').length, 1);
});

test('client custom dates reject malformed and reversed ranges before any queries', async () => {
  const f = fixture();
  const route = handler('src/routes/client.js', '/insights/timeline', f);
  for (const query of [{ startDate: 'bad' }, { startDate: '2026-09-11', endDate: day }]) {
    assert.equal((await call(route, { user: { id: 'buyer' }, query })).statusCode, 400);
  }
  assert.equal(f.queries.length, 0);
});

const timelineModes = [
  { name: 'client', file: 'src/routes/client.js', route: '/insights/timeline', limit: 500 },
  { name: 'selected-client admin', file: 'src/routes/adminAnalytics.js', route: '/client/timeline', limit: 500 },
  { name: 'all-client admin', file: 'src/routes/adminAnalytics.js', route: '/timeline', limit: 1000 },
];

function timelineHandler(mode, f, caller = { _id: 'admin', role: 'ADMIN' }) {
  const source = read('src/routes/adminAnalytics.js');
  const start = source.indexOf('async function buildTimelineTaskPayload(');
  const end = source.indexOf('\n// Resolve and authorize', start);
  const buildTimelineTaskPayload = vm.runInNewContext(
    `${source.slice(start, end)}\nbuildTimelineTaskPayload;`, { User: f.User, console });
  return handler(mode.file, mode.route, { ...f,
    User: { ...f.User, findById: () => ({ populate: async () => caller }) },
    resolveAuthorizedClient: async () => ({ clientId: 'buyer' }),
    buildDateFilters: () => ({}), buildTimelineTaskPayload,
  });
}

function calendarModel(file, tasks, rangeStart) {
  const source = read(file);
  const helpers = source.slice(0, source.indexOf('const WorkflowCalendar ='))
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${helpers}\nbuildCalendarRanges(tasks, rangeStart, rangeStart);`, {
    tasks, rangeStart, ...loadView(file.replace('WorkflowCalendar', 'WorkflowJourney')),
  });
}

const calendarViews = [
  'frontend/client-app/src/components/WorkflowCalendar.jsx',
  'frontend/admin-panel/src/components/WorkflowCalendar.jsx',
];
const timelineRequest = { user: { id: 'buyer' }, query: { startDate: day, endDate: day } };

for (const mode of timelineModes) {
  test(`${mode.name}: expanded OR branches preserve distinct tasks and Calendar date indexing`, async () => {
    const f = fixture();
    f.notifications.splice(0);
    f.orders.splice(0, f.orders.length, {
      _id: 'range-order', clientId: 'buyer', orderId: 'ORD', createdAt: day, items: [],
    });
    f.tasks.splice(0, f.tasks.length,
      { _id: 'created', clientId: 'buyer', createdAt: day, startDate: '2026-09-01', endDate: '2026-09-20' },
      { _id: 'milestone', clientId: 'buyer', startDate: '2026-09-01', endDate: '2026-09-20',
        milestones: [{ reached: true, reachedAt: `${day}T23:59:59.999Z` }] },
      { _id: 'order-linked', clientId: 'buyer', orderId: 'range-order', startDate: '2026-09-01', endDate: '2026-09-20' },
      { _id: 'multi-match', clientId: 'buyer', orderId: 'range-order', createdAt: day, startDate: day, endDate: day,
        milestones: [{ reached: true, reachedAt: day }] },
      { _id: 'not-reached', clientId: 'buyer', milestones: [{ reached: false, reachedAt: day }] },
      { _id: 'outside', clientId: 'buyer', createdAt: '2026-09-11T00:00:00.000Z' });
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.data.tasks.map(t => t.id).sort(), ['created', 'milestone', 'multi-match', 'order-linked']);
    for (const file of calendarViews) {
      const model = calendarModel(file, response.data.tasks, day);
      assert.equal(model.tasks.length, 2); // only linked orders have reliable range starts here
      assert.deepEqual(plain(model.undated.map(t => t.id).sort()), ['created', 'milestone']);
      assert.equal(new Set([...model.tasks.map(r => r.task.id), ...model.undated.map(t => t.id)]).size, 4);
    }
    for (const file of [clientView, adminView]) {
      const graph = loadView(file).buildWorkflowGraph(response.data, day, day);
      assert.equal(graph.series.filter(line => line.points.some(point => point.day === day)).length, 3);
      assert.equal(graph.series.flatMap(line => line.points).length, 4); // two task lines share the same order, plus two milestones
    }
    assert.equal(f.queries.filter(q => q.name === 'Task').length, 2);
    assert.equal(f.queries.filter(q => q.name === 'Order').length, 1);
  });

  test(`${mode.name}: widened date filters must not displace an existing in-range task at the result limit`, async () => {
    const f = fixture();
    f.orders.splice(0);
    f.notifications.splice(0);
    const original = { _id: 'existing-in-range', clientId: 'buyer', startDate: day, endDate: day };
    const newlyIncluded = Array.from({ length: mode.limit }, (_, index) => ({
      _id: `new-${index}`, clientId: 'buyer', startDate: '2026-09-01', endDate: '2026-09-02', createdAt: day,
    }));
    f.tasks.splice(0, f.tasks.length, ...newlyIncluded, original);
    // Under the previous event filter, only the original task matched this day.
    const previous = f.tasks.filter(t => matches(t, { $or: [
      { startDate: { $gte: day, $lte: `${day}T23:59:59.999Z` } },
      { endDate: { $gte: day, $lte: `${day}T23:59:59.999Z` } },
      { deadline: { $gte: day, $lte: `${day}T23:59:59.999Z` } },
    ] }));
    assert.deepEqual(previous.map(t => t._id), ['existing-in-range']);
    for (const file of calendarViews) {
      assert.equal(calendarModel(file, previous.map(t => ({ ...t, id: t._id })), day).undated.length, 1);
    }
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.equal(response.data.tasks.length, mode.limit);
    const calendarCounts = calendarViews.map(file => calendarModel(file, response.data.tasks, day).undated.filter(t => t.id === 'existing-in-range').length);
    assert.ok(response.data.tasks.some(t => t.id === 'existing-in-range'),
      `An existing in-range task was displaced by new matches; Calendar task counts: ${calendarCounts.join(', ')}`);
    assert.deepEqual(calendarCounts, [1, 1]);
    assert.equal(new Set(response.data.tasks.map(t => t.id)).size, response.data.tasks.length);
    const taskQueries = f.queries.filter(q => q.name === 'Task');
    assert.deepEqual(taskQueries.map(q => q.limit), [mode.limit, mode.limit - 1]);
    assert.equal(taskQueries.reduce((sum, q) => sum + q.returned, 0), mode.limit);
  });

  test(`${mode.name}: Calendar must receive a task spanning the selected range`, async () => {
    const f = fixture();
    f.orders.splice(0);
    f.notifications.splice(0);
    f.tasks.splice(0, f.tasks.length, { _id: 'spanning', clientId: 'buyer',
      createdAt: '2026-08-01', startDate: '2026-09-01', endDate: '2026-09-20' });
    for (const file of calendarViews) {
      assert.equal(calendarModel(file, f.tasks.map(t => ({ ...t, id: t._id })), day).undated.length, 1);
    }
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.data.tasks.map(t => t.id), ['spanning']);
  });
}

for (const mode of timelineModes) {
  test(`${mode.name}: overlap uses inclusive boundaries and deadline only as an absent-end fallback`, async () => {
    const f = fixture();
    f.notifications.splice(0);
    f.orders.splice(0);
    const task = (_id, startDate, endDate, extra = {}) => ({ _id, clientId: 'buyer', startDate, endDate,
      createdAt: '2026-08-01', ...extra });
    f.tasks.splice(0, f.tasks.length,
      task('span', '2026-09-01', '2026-09-20'),
      task('deadline', '2026-09-01', null, { deadline: '2026-09-20' }),
      task('missing-end', '2026-09-01', undefined, { deadline: '2026-09-20' }),
      task('left-boundary', '2026-09-01', `${day}T00:00:00.000Z`),
      task('right-boundary', `${day}T23:59:59.999Z`, '2026-09-20'),
      task('before', '2026-09-01', '2026-09-09T23:59:59.999Z'),
      task('after', '2026-09-11T00:00:00.000Z', '2026-09-20'),
      task('ignore-deadline', '2026-09-01', '2026-09-02', { deadline: '2026-09-20' }),
      task('unknown-end', '2026-09-01', null), task('unknown-start', null, '2026-09-20'),
      task('deleted-span', '2026-09-01', '2026-09-20', { isDeleted: true }),
      task('plan-span', '2026-09-01', '2026-09-20', { isListedInPlans: true }));
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.data.tasks.map(t => t.id).sort(), ['deadline', 'left-boundary', 'missing-end', 'right-boundary', 'span']);
  });

  test(`${mode.name}: approval-only matches cannot displace a legacy completion and duplicate notifications stay grouped`, async () => {
    const f = fixture();
    f.orders.splice(0);
    f.notifications.splice(0);
    f.tasks.splice(0, f.tasks.length, ...Array.from({ length: mode.limit }, (_, index) => ({
      _id: `approved-${index}`, clientId: 'buyer', startDate: '2026-08-01', endDate: '2026-08-02',
    })), { _id: 'completed', clientId: 'buyer', startDate: '2026-08-03', endDate: '2026-08-04' });
    f.notifications.push(...f.tasks.map(t => ({ type: 'TASK_APPROVED', createdAt: day,
      relatedEntity: { entityType: 'TASK', entityId: t._id } })),
    ...Array.from({ length: 3 }, () => ({ type: 'TASK_COMPLETED', createdAt: day,
      relatedEntity: { entityType: 'TASK', entityId: 'completed' } })));
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.equal(response.data.tasks.length, mode.limit);
    assert.equal(response.data.tasks.filter(t => t.id === 'completed').length, 1);
    assert.equal(response.data.tasks.find(t => t.id === 'completed').completedAt, day);
    assert.equal(f.queries.filter(q => q.name === 'Notification').length, 2);
  });

  test(`${mode.name}: a full legacy window remains unchanged and skips the supplemental query`, async () => {
    const f = fixture();
    f.orders.splice(0);
    f.notifications.splice(0);
    const original = Array.from({ length: mode.limit }, (_, index) => ({
      _id: `legacy-${index}`, clientId: 'buyer', startDate: day, endDate: day,
    }));
    f.tasks.splice(0, f.tasks.length, { _id: 'new-span', clientId: 'buyer', startDate: '2026-09-01', endDate: '2026-09-20' }, ...original);
    const response = await call(timelineHandler(mode, f), timelineRequest);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.data.tasks.map(t => t.id), original.map(t => t._id));
    const taskQueries = f.queries.filter(q => q.name === 'Task');
    assert.equal(taskQueries.length, 1);
    assert.equal(taskQueries[0].limit, mode.limit);
  });
}

test('Timeline overlap preserves client ownership, both assignment forms, and staff visibility', async () => {
  const f = fixture();
  f.orders.splice(0);
  f.notifications.splice(0);
  const span = (_id, clientId, extra = {}) => ({ _id, clientId, startDate: '2026-09-01', endDate: '2026-09-20', ...extra });
  f.tasks.splice(0, f.tasks.length,
    span('owned', 'buyer', { assignedTo: 'manager' }),
    span('assigned', 'other', { assignedUsers: [{ userId: 'buyer' }] }),
    span('legacy-assigned', 'other', { assignedTo: 'buyer' }), span('foreign', 'stranger'),
    span('deleted', 'buyer', { isDeleted: true }), span('plan', 'buyer', { isListedInPlans: true }));
  const client = await call(timelineHandler(timelineModes[0], f), { ...timelineRequest,
    query: { ...timelineRequest.query, clientId: 'stranger' } });
  assert.equal(client.statusCode, 200);
  assert.deepEqual(client.data.tasks.map(t => t.id).sort(), ['assigned', 'legacy-assigned', 'owned']);
  const staff = await call(timelineHandler(timelineModes[2], f,
    { _id: 'manager', role: 'ADMIN', customRole: 'staff' }), timelineRequest);
  assert.equal(staff.statusCode, 200);
  assert.deepEqual(staff.data.tasks.map(t => t.id), ['owned']);
  const denied = await call(timelineHandler(timelineModes[2], f,
    { _id: 'unassigned-manager', role: 'ADMIN', customRole: 'staff' }), timelineRequest);
  assert.equal(denied.statusCode, 200);
  assert.equal(denied.data.tasks.length, 0);
});

test('Timeline limits remain bounded without a date range and reject unbounded limit values', async () => {
  const f = fixture();
  await f.findTimelineTasks({ taskScope: { clientId: 'buyer' }, rangeFilter: {}, limit: 500 });
  assert.equal(f.queries.length, 1);
  assert.equal(f.queries[0].limit, 500);
  await assert.rejects(f.findTimelineTasks({ taskScope: {}, rangeFilter: {}, limit: 0 }), /Invalid Timeline task limit/);
  assert.equal(f.queries.length, 1);
});

test('admin client timeline preserves authorized client scoping and handles denial before queries', async () => {
  const f = fixture();
  let deny = false;
  const route = handler('src/routes/adminAnalytics.js', '/client/timeline', { ...f,
    resolveAuthorizedClient: async () => deny ? { status: 404, error: 'Client not found' } : { clientId: 'buyer' },
    buildDateFilters: () => ({}),
    buildTimelineTaskPayload: async (tasks, journeys) => tasks.map(t => ({ id: t._id, ...journeys.get(t._id) })),
  });
  const req = { query: { startDate: day, endDate: day } };
  const res = await call(route, req);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.data.tasks.map(t => t.id).sort(), ['linked', 'owned']);
  const count = f.queries.length;
  deny = true;
  assert.equal((await call(route, req)).statusCode, 404);
  assert.equal(f.queries.length, count);
});

// Final-scope selectors use actual handlers with offline models.
test('multi-client resolver batches validation and rejects any unauthorized client', async () => {
  const source = read('src/routes/adminAnalytics.js');
  const body = source.slice(source.indexOf('async function resolveAuthorizedClient('), source.indexOf('// ---------- GET /admin/analytics/client ----------'));
  let caller = { _id: 'staff', role: 'ADMIN', customRole: 'manager' };
  const calls = [];
  const User = {
    find(filter) { calls.push(filter); return { select() { return this; }, lean: async () => filter._id.$in.filter(id => id !== 'missing').map(_id => ({ _id })) }; },
    findById() { return { populate: async () => caller }; },
  };
  const resolve = vm.runInNewContext(body + '\nresolveAuthorizedClient;', {
    User, Task: { distinct: async (key, filter) => { assert.deepEqual(plain(filter), { assignedTo: 'staff' }); return ['one', 'two']; } },
    mongoose: { isValidObjectId: value => ['one', 'two', 'foreign', 'missing'].includes(value), Types: { ObjectId: class { constructor(value) { this.value = value; } toString() { return this.value; } } } },
  });
  const request = clientIds => ({ query: { clientIds }, user: { id: 'staff' } });
  const allowed = await resolve(request('one,two,one'));
  assert.deepEqual(plain(allowed.clientIds.map(String)), ['one', 'two']);
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0]), { _id: { $in: ['one', 'two'] }, role: 'CLIENT', isDeleted: { $ne: true } });
  assert.equal((await resolve(request('one,foreign'))).status, 404);
  assert.equal((await resolve(request('one,missing'))).status, 404);
  assert.equal((await resolve(request('invalid'))).status, 400);
  assert.equal((await resolve(request(['one']))).status, 400);
  caller = { _id: 'main', role: 'ADMIN', customRole: null };
  assert.equal(String((await resolve({ query: { clientId: 'foreign' }, user: { id: 'main' } })).clientId), 'foreign');
});
