'use strict';

// Offline fixtures only. Never import the app, load .env, or connect to a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const Module = require('node:module');
const os = require('node:os');

const report = require('../src/services/workflowReportService');

// The real-pdfkit byte and text verification lives in test/workflowReportPdf.test.js.
// It must run in its own process: Node caches a module's bare-specifier
// resolution, so once the renderer has loaded real pdfkit, the stub harness
// below would be silently bypassed instead of failing loudly.

// The Timeline presentation layer is the source of truth for stage thresholds;
// the report must never define its own meaning for the same progress value.
function loadTimelineStage() {
  const source = read('frontend/admin-panel/src/components/WorkflowJourney.jsx')
    .split('export const TaskJourney =')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({ currentStage, workflowRows });`);
}

const order = (id, createdAt, orderStatus = 'APPROVED', extra = {}) => ({
  id, orderId: `CODE-${id}`, orderStatus, createdAt,
  approvedAt: null, completedAt: null, services: ['Social Media Package'], ...extra,
});
const task = (id, linked, overrides = {}) => ({
  id, title: `Task ${id}`, status: 'ACTIVE', clientId: 'c1', clientName: 'Acme Media',
  createdAt: '2026-09-01T09:00:00.000Z', approvedAt: null, completedAt: null, progress: 0,
  orderContext: linked ? 'available' : 'not_applicable',
  order: linked ? { id: linked.id, orderId: linked.orderId, createdAt: linked.createdAt, approvedAt: linked.approvedAt } : null,
  milestones: [], description: '', clientInputs: [], clientContentLinks: [], clientDriveLink: '',
  ...overrides,
});
const model = (input) => report.buildReportModel({
  range: { startDate: '2026-09-01', endDate: '2026-09-30' },
  clients: [{ id: 'c1', name: 'Acme Media' }],
  generatedBy: { name: 'Main Admin', identifier: 'ADMIN01' },
  generatedAt: new Date('2026-11-21T10:00:00.000Z'),
  brand: 'Go Viral Ads',
  ...input,
});

test('report stage thresholds match the Workflow Timeline exactly', () => {
  const timeline = loadTimelineStage();
  const values = [-5, 0, 0.4, 0.5, 1, 2, 4, 4.9, 5, 50, 99, 99.9, 100, 150, NaN, Infinity, null, undefined, '7', {}];
  for (const value of values) {
    assert.equal(report.reportStage(value), timeline.currentStage(value), `progress ${String(value)}`);
  }
  assert.equal(report.reportStage(0), 'Scheduled');
  assert.equal(report.reportStage(1), 'Started');
  assert.equal(report.reportStage(4), 'Started');
  assert.equal(report.reportStage(5), 'In Process');
  assert.equal(report.reportStage(99), 'In Process');
  assert.equal(report.reportStage(100), 'Completed');
  assert.equal(report.reportStage(0.5), report.STAGE_UNAVAILABLE);
  assert.equal(report.reportStage(null), report.STAGE_UNAVAILABLE);
  // The five published rows are reused verbatim, never redefined. Compared as
  // text because the Timeline helper comes from another vm realm.
  assert.equal(report.REPORT_STAGES.length, 5);
  assert.equal(report.REPORT_STAGES[0], 'ORDER PLACED');
  assert.equal(report.REPORT_STAGES[4], 'COMPLETED (100%)');
  assert.equal(report.REPORT_STAGES.slice(1).join('|'), timeline.workflowRows.slice(1).map(row => row.replace(/–/g, '-')).join('|'));
});

test('numbering is chronological by the recorded order date only', () => {
  // Deliberately out of order, and the approval/completion dates contradict the
  // order dates: numbering must follow order createdAt, nothing else.
  const late = order('o-late', '2026-09-20T09:00:00.000Z', 'APPROVED', { approvedAt: '2026-09-02T09:00:00.000Z' });
  const early = order('o-early', '2026-09-05T09:00:00.000Z', 'COMPLETED', { approvedAt: '2026-09-25T09:00:00.000Z', completedAt: '2026-09-26T09:00:00.000Z' });
  const middle = order('o-mid', '2026-09-12T09:00:00.000Z');
  const built = model({ orders: [late, early, middle], tasks: [task('t1', late), task('t2', early), task('t3', middle)] });
  assert.deepEqual(built.journeys.map(journey => journey.sequence), [1, 2, 3]);
  assert.deepEqual(built.journeys.map(journey => journey.orderCode), ['CODE-o-early', 'CODE-o-mid', 'CODE-o-late']);
  assert.deepEqual(built.journeys.map(journey => journey.orderDate), ['2026-09-05', '2026-09-12', '2026-09-20']);
  // Every task of one order carries the same number; the order is one journey.
  assert.equal(built.journeys[0].tasks.length, 1);
  assert.equal(built.summary.totalOrders, 3);
  assert.equal(built.summary.totalTasks, 3);
});

test('an order outside the selected period is not numbered', () => {
  const inside = order('o-in', '2026-09-10T09:00:00.000Z');
  const outside = order('o-out', '2026-08-10T09:00:00.000Z');
  const built = model({ orders: [inside, outside], tasks: [task('t1', inside), task('t2', outside)] });
  const numbered = built.journeys.find(journey => journey.orderCode === 'CODE-o-in');
  const unnumbered = built.journeys.find(journey => journey.orderCode === 'CODE-o-out');
  assert.equal(numbered.sequence, 1);
  assert.equal(unnumbered.sequence, null);
  assert.equal(unnumbered.unnumberedReason, 'Order date outside the selected period');
  assert.ok(built.notes.some(note => note.includes('1 journey(s) have no recorded order date')));
});

test('rejected orders and cancelled tasks are separated, valid completed work is kept', () => {
  const ok = order('o-ok', '2026-09-05T09:00:00.000Z', 'COMPLETED');
  const rejected = order('o-bad', '2026-09-06T09:00:00.000Z', 'REJECTED');
  const pending = order('o-pending', '2026-09-07T09:00:00.000Z', 'PENDING_APPROVAL');
  const built = model({
    orders: [ok, rejected, pending],
    tasks: [
      task('done', ok, { status: 'COMPLETED', progress: 100, completedAt: '2026-09-20T09:00:00.000Z' }),
      task('on-rejected', rejected, { status: 'PENDING', progress: 0 }),
      task('cancelled', pending, { status: 'CANCELLED', progress: 40 }),
      task('working', pending, { status: 'ACTIVE', progress: 35 }),
    ],
  });
  assert.deepEqual(built.journeys.map(journey => journey.orderCode), ['CODE-o-ok', 'CODE-o-pending']);
  assert.deepEqual(built.journeys.map(journey => journey.sequence), [1, 2]);
  assert.deepEqual(built.journeys.flatMap(journey => journey.tasks.map(item => item.id)), ['done', 'working']);
  assert.equal(built.rejected.length, 1);
  assert.equal(built.rejected[0].orderCode, 'CODE-o-bad');
  assert.equal(built.rejected[0].reason, 'Order rejected');
  assert.deepEqual(built.rejected[0].tasks.map(item => item.id), ['on-rejected']);
  assert.deepEqual(built.cancelled.map(item => item.id), ['cancelled']);
  assert.equal(built.cancelled[0].reason, 'Task cancelled');
  assert.equal(built.summary.rejected, 2);
  assert.equal(built.summary.completed, 1);
  assert.equal(built.summary.inProgress, 1);
  assert.equal(built.summary.totalTasks, 4);
  assert.equal(built.summary.rejectedOrders, 1);
  // A completed order is never treated as rejected.
  assert.ok(report.isRejectedReportTask(task('done', ok), [ok, rejected, pending]) === false);
  assert.ok(report.isRejectedReportTask(task('on-rejected', rejected), [ok, rejected, pending]) === true);
});

test('tasks and orders are never duplicated', () => {
  const first = order('o1', '2026-09-05T09:00:00.000Z');
  const duplicateOrder = { ...first };
  const built = model({
    orders: [first, duplicateOrder],
    tasks: [task('t1', first), { ...task('t1', first) }, task('t2', first), task('t3', null)],
  });
  assert.equal(built.summary.totalOrders, 1);
  assert.equal(built.summary.totalTasks, 3);
  assert.equal(built.journeys.length, 2);
  assert.deepEqual(built.journeys[0].tasks.map(item => item.id), ['t1', 't2']);
  assert.equal(built.journeys[0].sequence, 1);
  assert.equal(built.journeys[1].sequence, null);
  assert.equal(built.journeys[1].unnumberedReason, 'No order record linked to this task');
  assert.deepEqual(built.journeys[1].tasks.map(item => item.id), ['t3']);
});

test('order relationships use exact ids, never an ambiguous display code', () => {
  // Two different orders deliberately share one display code; one is rejected.
  const a = order('o-a', '2026-09-05T09:00:00.000Z', 'APPROVED', { orderId: 'SAME-CODE' });
  const b = order('o-b', '2026-09-06T09:00:00.000Z', 'REJECTED', { orderId: 'SAME-CODE' });
  const ambiguous = task('t-amb', null, { order: { id: null, orderId: 'SAME-CODE', createdAt: null, approvedAt: null } });
  const built = model({ orders: [a, b], tasks: [ambiguous] });
  assert.equal(report.isRejectedReportTask(ambiguous, [a, b]), false);
  // The rejected order is still reported as rejected, but the ambiguously linked
  // task is never claimed by it.
  assert.equal(built.rejected.length, 1);
  assert.deepEqual(built.rejected[0].tasks, []);
  const ambiguousJourney = built.journeys.find(journey => journey.tasks.some(item => item.id === 't-amb'));
  assert.ok(ambiguousJourney, 'the ambiguous task keeps its own journey');
  assert.equal(ambiguousJourney.sequence, null);
  assert.equal(ambiguousJourney.orderDateLabel, 'Date unavailable');
  const approvedJourney = built.journeys.find(journey => journey.orderStatus === 'APPROVED');
  assert.ok(approvedJourney, 'the approved order is still reported');
  assert.equal(approvedJourney.sequence, 1);
  assert.equal(approvedJourney.orderDate, '2026-09-05');
  // An exact internal id still resolves, and only that order decides rejection.
  const exact = task('t-exact', null, { order: { id: 'o-b', orderId: 'SAME-CODE', createdAt: '2026-09-06T09:00:00.000Z', approvedAt: null } });
  assert.equal(report.isRejectedReportTask(exact, [a, b]), true);
});

test('missing historical dates stay unavailable and are never inferred', () => {
  const dated = order('o1', '2026-09-05T09:00:00.000Z', 'IN_PROGRESS', { approvedAt: '2026-09-06T09:00:00.000Z' });
  const undated = order('o2', null, 'IN_PROGRESS');
  const built = model({
    orders: [dated, undated],
    tasks: [
      task('t1', dated, { status: 'COMPLETED', progress: 100 }),
      task('t2', dated, { progress: 60, milestones: [
        { name: 'Script approved', percentage: 30, reached: true, reachedAt: '2026-09-11T09:00:00.000Z' },
        { name: 'Edit pending', percentage: 70, reached: false, reachedAt: null },
      ] }),
      task('t3', undated, { progress: 0 }),
    ],
  });
  const [first, second] = built.journeys;
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, null);
  assert.equal(second.orderDateLabel, 'Date unavailable');
  assert.equal(second.unnumberedReason, 'Order date unavailable');
  // 100% progress without a recorded completion event has no completion date.
  assert.equal(first.tasks[0].completed, true);
  assert.equal(first.tasks[0].completedLabel, 'Completion date unavailable');
  assert.equal(first.approvedLabel.includes('Sep'), true);
  // Milestones are evidence only: unreached ones are dropped and no stage
  // transition date is created from them or from the current progress.
  assert.deepEqual(first.tasks[1].milestones.map(item => item.name), ['Script approved']);
  assert.equal(first.tasks[1].milestones[0].dateLabel, 'Sep 11, 2026');
  assert.equal(first.tasks[1].stage, 'In Process');
  assert.equal(first.tasks[1].stageLabel, 'In Process (60%)');
  assert.ok(!('scheduledAt' in first.tasks[1]) && !('startedAt' in first.tasks[1]) && !('processAt' in first.tasks[1]));
  assert.equal(second.tasks[0].stage, 'Scheduled');
  assert.equal(second.tasks[0].orderDateLabel, 'Date unavailable');
  assert.ok(built.notes.some(note => note.includes('transition timestamps are not persisted')));
  assert.ok(built.notes.some(note => note.includes('not counted as workflow stage transitions')));
});

test('stage counts are derived from recorded progress, and unusable progress is reported', () => {
  const first = order('o1', '2026-09-05T09:00:00.000Z');
  const built = model({
    orders: [first],
    tasks: [
      task('scheduled', first, { progress: 0 }),
      task('started', first, { progress: 3 }),
      task('process', first, { progress: 42 }),
      task('done', first, { progress: 100 }),
      task('unknown', first, { progress: null }),
      task('fraction', first, { progress: 0.4 }),
    ],
  });
  assert.deepEqual(built.summary, {
    totalOrders: 1, activeOrders: 1, rejectedOrders: 0, totalTasks: 6,
    completed: 1, started: 1, process: 1, inProgress: 2, scheduled: 1, unavailable: 2, rejected: 0,
  });
  assert.ok(built.notes.some(note => note.includes('2 task(s) have no usable progress value')));
});

test('an empty period produces a graceful report instead of an error', () => {
  const built = model({ orders: [], tasks: [] });
  assert.equal(built.empty, true);
  assert.deepEqual(built.journeys, []);
  assert.deepEqual(built.rejected, []);
  assert.deepEqual(built.cancelled, []);
  assert.equal(built.summary.totalTasks, 0);
  assert.ok(built.notes.some(note => note.includes('No order or task record exists')));
  assert.equal(built.period.label, 'Sep 1, 2026 – Sep 30, 2026');
  assert.equal(built.clientLabel, 'Acme Media');
  assert.equal(report.buildReportModel({}).empty, true);
  assert.equal(report.buildReportModel({}).period.label, 'All time');
  assert.equal(report.buildReportModel({}).clientLabel, 'All authorized clients');
});

test('multi-client and employee filters are labelled, content links are sanitized', () => {
  const first = order('o1', '2026-09-05T09:00:00.000Z');
  const built = model({
    orders: [first],
    clients: [{ id: 'c1', name: 'Acme Media' }, { id: 'c2', name: 'Beta Films' }],
    employee: { id: 'e1', name: 'Riya (Editor)' },
    tasks: [task('t1', first, {
      clientName: 'Beta Films',
      description: '<p>Shoot &amp; edit&nbsp;the promo</p><script>alert(1)</script>',
      clientInputs: [{ link: 'https://example.com/brief' }, { link: 'javascript:alert(1)' }, { link: '' }, { link: 'https://example.com/brief' }],
      clientContentLinks: ['https://drive.example.com/assets', 'not a url'],
      clientDriveLink: 'https://drive.example.com/final',
      title: 'A'.repeat(220),
    })],
  });
  assert.equal(built.clientLabel, '2 selected clients');
  assert.equal(built.employee, 'Riya (Editor)');
  assert.ok(built.notes.some(note => note.includes('Filtered to work assigned to Riya (Editor)')));
  const entry = built.journeys[0].tasks[0];
  assert.deepEqual(entry.links, ['https://example.com/brief', 'https://drive.example.com/assets', 'https://drive.example.com/final']);
  assert.equal(entry.description, 'Shoot & edit the promo alert(1)');
  assert.ok(entry.title.length <= 140);
  assert.equal(built.journeys[0].clientNames.length, 1);
});

test('the report model carries no financial, wallet or commission data', () => {
  const first = order('o1', '2026-09-05T09:00:00.000Z', 'COMPLETED', { totalAmount: 4999 });
  const built = model({
    orders: [first],
    tasks: [task('t1', first, { creditCost: 250, creditsUsed: 250, progress: 100, completedAt: '2026-09-20T09:00:00.000Z' })],
  });
  const serialized = JSON.stringify(plain(built)).toLowerCase();
  for (const forbidden of ['totalamount', 'creditcost', 'creditsused', 'wallet', 'commission', 'invoice', 'payment', 'gst', 'revenue', 'amount']) {
    assert.ok(!serialized.includes(forbidden), `report model must not expose ${forbidden}`);
  }
  // The input objects are never mutated by the builder.
  assert.equal(first.totalAmount, 4999);
});

// pdfkit contract stub: proves the renderer only calls the documented pdfkit
// surface, always with finite coordinates, valid colors and string text. The
// real-pdfkit byte and text verification is in test/workflowReportPdf.test.js.
function makePdfKitStub() {
  const calls = { text: [], rects: [], fonts: new Set(), colors: new Set(), pages: 1, switched: [] };
  const finite = (name, values) => {
    for (const value of values) {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`non-finite ${name}: ${value}`);
    }
  };
  class StubDocument extends require('node:events').EventEmitter {
    constructor(options = {}) {
      super();
      this.options = options;
      this.page = { width: 595.28, height: 841.89, margins: { top: 46, bottom: 46, left: 46, right: 46 } };
      this.x = 46;
      this.y = 46;
      this._font = 'Helvetica';
      this._fontSize = 12;
      calls.pages = 1;
      if (options.bufferPages !== true) throw new Error('report PDF must enable bufferPages for footers');
    }

    save() { return this; }
    restore() { return this; }
    opacity(value) { finite('opacity', [value]); return this; }
    fillOpacity(value) { finite('fillOpacity', [value]); return this; }
    lineWidth(value) { finite('lineWidth', [value]); return this; }
    fillColor(color) {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`invalid color ${color}`);
      calls.colors.add(color);
      return this;
    }

    strokeColor(color) { return this.fillColor(color); }
    font(name) {
      if (!/^Helvetica(-Bold|-Oblique|-BoldOblique)?$/.test(name)) throw new Error(`non-standard font ${name}`);
      calls.fonts.add(name);
      this._font = name;
      return this;
    }

    fontSize(size) {
      if (!Number.isFinite(size) || size <= 0) throw new Error(`invalid fontSize ${size}`);
      this._fontSize = size;
      return this;
    }

    roundedRect(x, y, width, height, radius) {
      finite('roundedRect', [x, y, width, height, radius]);
      if (width < 0 || height < 0) throw new Error('negative roundedRect size');
      calls.rects.push([x, y, width, height]);
      return this;
    }

    circle(x, y, radius) { finite('circle', [x, y, radius]); return this; }
    moveTo(x, y) { finite('moveTo', [x, y]); return this; }
    lineTo(x, y) { finite('lineTo', [x, y]); return this; }
    stroke() { return this; }
    fill() { return this; }
    widthOfString(value) {
      if (typeof value !== 'string') throw new Error('widthOfString needs a string');
      return value.length * this._fontSize * 0.5;
    }

    heightOfString(value, options = {}) {
      if (typeof value !== 'string') throw new Error('heightOfString needs a string');
      if (options.width !== undefined) finite('heightOfString.width', [options.width]);
      const width = options.width || 500;
      const perLine = Math.max(8, Math.floor(width / (this._fontSize * 0.5)));
      return Math.max(1, Math.ceil(value.length / perLine)) * this._fontSize * 1.2;
    }

    text(value, x, y, options = {}) {
      if (typeof value !== 'string') throw new Error(`text needs a string, got ${typeof value}`);
      if (x !== undefined && x !== null) finite('text.x', [x]);
      if (y !== undefined && y !== null) finite('text.y', [y]);
      if (options.width !== undefined) finite('text.width', [options.width]);
      calls.text.push(value);
      const height = this.heightOfString(value, options);
      this.y = typeof y === 'number' ? y + height : this.y + height;
      return this;
    }

    moveDown(lines = 1) { this.y += lines * this._fontSize * 1.2; return this; }
    addPage() {
      calls.pages += 1;
      this.y = this.page.margins.top;
      this.x = this.page.margins.left;
      return this;
    }

    switchToPage(index) {
      if (!Number.isInteger(index) || index < 0) throw new Error(`invalid page index ${index}`);
      calls.switched.push(index);
      return this;
    }

    bufferedPageRange() { return { start: 0, count: calls.pages }; }
    end() {
      this.emit('data', Buffer.from('%PDF-1.4 stub\n'));
      this.emit('end');
    }
  }
  StubDocument.calls = calls;
  return StubDocument;
}

const rendererPath = require.resolve('../src/services/workflowReportPdf');

// Load the renderer against the stub by pre-seeding require.cache, so no file is
// written and no real dependency is needed.
async function renderWithStub(model) {
  const pdfkitPath = path.join(os.tmpdir(), 'gva-report-stub-pdfkit.js');
  const settingsPath = path.join(os.tmpdir(), 'gva-report-stub-settings.js');
  const StubDocument = makePdfKitStub();
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patched(request, ...rest) {
    if (request === 'pdfkit') return pdfkitPath;
    if (request === '../models/Settings') return settingsPath;
    return resolveFilename.call(this, request, ...rest);
  };
  require.cache[pdfkitPath] = { id: pdfkitPath, filename: pdfkitPath, loaded: true, exports: StubDocument, children: [], paths: [] };
  require.cache[settingsPath] = { id: settingsPath, filename: settingsPath, loaded: true, exports: { getSettings: async () => ({ agencyName: 'Stub Agency' }) }, children: [], paths: [] };
  delete require.cache[rendererPath];
  try {
    const buffer = await require(rendererPath).generateWorkflowReportPDF(model);
    return { buffer, calls: StubDocument.calls };
  } finally {
    Module._resolveFilename = resolveFilename;
    delete require.cache[pdfkitPath];
    delete require.cache[settingsPath];
    delete require.cache[rendererPath];
  }
}

test('the renderer only uses the pdfkit contract, with finite coordinates', async () => {
  const orders = Array.from({ length: 6 }, (_, index) => order(`o${index}`, `2026-09-${String(index + 3).padStart(2, '0')}T09:00:00.000Z`, index === 5 ? 'REJECTED' : 'APPROVED'));
  const tasks = orders.flatMap((linked, index) => [
    task(`t${index}a`, linked, { progress: index * 17, title: `${'Premium Viral Content Package '.repeat(3)}${index}`, description: '<p>Detail</p>', clientContentLinks: ['https://example.com/a'] }),
    task(`t${index}b`, linked, { progress: 100, status: 'COMPLETED', completedAt: '2026-09-25T09:00:00.000Z', milestones: [{ name: 'Published', percentage: 100, reached: true, reachedAt: '2026-09-25T09:00:00.000Z' }] }),
  ]);
  const { buffer, calls } = await renderWithStub(model({ orders, tasks }));
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(calls.pages >= 3, `expected summary, detail and closing pages, got ${calls.pages}`);
  assert.equal(calls.switched.length, calls.pages, 'every page receives a footer');
  assert.ok(calls.rects.length > 10);
  assert.ok(calls.rects.every(([x, y, width, height]) => x >= 0 && y >= 0 && width > 0 && height > 0), 'no rectangle is misplaced');
  // The stub rejects any non-standard font name, so reaching this point proves
  // no external font file is embedded. Only built-in Helvetica faces are used.
  assert.deepEqual([...calls.fonts].sort(), ['Helvetica', 'Helvetica-Bold']);
  const printed = calls.text.join('\n');
  for (const expected of ['Executive Summary', 'Workflow Stages', 'Order & Task Details', 'Summary', 'Important Notes',
    'Completed work', 'Pending / in-progress work', 'Rejected / cancelled work', 'Acme Media', 'Sep 1, 2026', 'Page 1 of']) {
    assert.ok(printed.includes(expected), `report must print ${expected}`);
  }
  for (const forbidden of ['totalAmount', 'credits', 'wallet', 'commission', 'invoice', 'amount']) {
    assert.ok(!printed.toLowerCase().includes(forbidden), `report must never print ${forbidden}`);
  }
  // Chronological numbers, order codes, package names and recorded dates all
  // reach the page.
  assert.ok(calls.text.includes('1') && calls.text.includes('5'), 'chronological numbers are printed');
  assert.ok(printed.includes('CODE-o0'), 'the recorded order code is printed');
  assert.ok(printed.includes('Premium Viral Content Package'), 'long package names are printed');
  assert.ok(printed.includes('Order date: Sep 3, 2026'), 'the recorded order date is printed');
  assert.ok(!printed.includes('Script'), 'no milestone name is invented');
});

test('the renderer handles an empty report and unavailable dates', async () => {
  const empty = await renderWithStub(model({ orders: [], tasks: [] }));
  assert.equal(empty.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(empty.calls.pages >= 3);
  assert.ok(empty.calls.text.join('\n').includes('No order or task record exists'));

  const undated = await renderWithStub(model({
    orders: [order('o1', null, 'PENDING_APPROVAL'), order('o2', '2026-09-08T09:00:00.000Z', 'REJECTED')],
    tasks: [
      task('t1', { id: 'o1', orderId: 'CODE-o1', createdAt: null }, { progress: null, title: 'x'.repeat(300) }),
      task('t2', null, { progress: 0.2, status: 'CANCELLED' }),
    ],
  }));
  const printed = undated.calls.text.join('\n');
  assert.ok(printed.includes('Date unavailable'));
  assert.ok(printed.includes('Stage unavailable'));
  assert.ok(printed.includes('Completion date unavailable'));
  assert.ok(printed.includes('Order date unavailable'));
  assert.ok(printed.includes('Task cancelled'));
  assert.ok(undated.calls.rects.every(([, , width, height]) => width > 0 && height > 0));
});

test('the report route reuses the existing authorization surface and never widens it', () => {
  const source = read('src/routes/adminAnalytics.js');
  const start = source.indexOf("router.get('/report/pdf'");
  assert.ok(start > 0, 'report route is present');
  const body = source.slice(start, source.indexOf('module.exports = router;', start));
  // Router-level guards for the whole analytics file remain in place.
  assert.match(source, /router\.use\(authenticateJWT\);\s*\r?\n\s*router\.use\(requireAdmin\);/);
  // The report reuses the same authorized-client resolver as the Timeline.
  assert.match(body, /const auth = await resolveAuthorizedClient\(req, \{ assignmentUnion: true \}\);/);
  assert.match(body, /if \(auth\.status\) return res\.status\(auth\.status\)\.json\(\{ error: auth\.error \}\);/);
  // Both assignment relationships authorize a staff caller for the report: the
  // legacy assignedTo reference and the assignedUsers[].userId percentage split.
  assert.match(source, /async function resolveAuthorizedClient\(req, options = \{\}\) \{/);
  assert.match(source, /const assignmentFilter = options\.assignmentUnion\s*\r?\n\s*\? \{ \$or: \[\{ assignedTo: caller\._id \}, \{ 'assignedUsers\.userId': caller\._id \}\] \}\s*\r?\n\s*: \{ assignedTo: caller\._id \};/);
  assert.match(source, /const visibleClientIds = await Task\.distinct\('clientId', assignmentFilter\);/);
  // The union is opt-in: every pre-existing endpoint still calls the resolver
  // with no options, so its behaviour is byte-identical.
  const optionFreeCalls = source.match(/resolveAuthorizedClient\(req\);/g) || [];
  assert.equal(optionFreeCalls.length, 3, 'the three existing client-scoped endpoints keep the default rule');
  const unionCalls = source.match(/resolveAuthorizedClient\(req, \{ assignmentUnion: true \}\);/g) || [];
  assert.equal(unionCalls.length, 1, 'only the report route opts into the union rule');
  // Assigned staff are restricted at TASK level to their own assignment, and the
  // employee filter is only reachable in the main-admin branch.
  assert.match(body, /if \(!isMainAdmin\) \{\s*\r?\n\s*assignmentScope = \{ \$or: \[\{ assignedTo: caller\._id \}, \{ 'assignedUsers\.userId': caller\._id \}\] \};\s*\r?\n\s*\} else if \(req\.query\.employeeId\) \{/);
  assert.match(body, /const isMainAdmin = caller\.role === 'ADMIN' && !caller\.customRole;/);
  // Orders for an assignment-scoped caller come only from that caller's tasks.
  assert.match(body, /Order\.find\(\{ _id: \{ \$in: linkedIds \}, clientId \}\)/);
  assert.match(body, /const taskScope = assignmentScope \? \{ \$and: \[taskBase, assignmentScope\] \} : taskBase;/);
  assert.match(body, /isDeleted: \{ \$ne: true \}, isListedInPlans: \{ \$ne: true \}, clientId/);
  assert.match(body, /REPORT_DATE\.test\(String\(startDate\)\)/);
  assert.match(body, /res\.setHeader\('Content-Type', 'application\/pdf'\)/);
  // Strictly read-only: no write helper is used anywhere in the report route.
  assert.doesNotMatch(body, /\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|insertMany|bulkWrite)\(/);
});

test('the report route and renderer select no financial field', () => {
  const source = read('src/routes/adminAnalytics.js');
  const start = source.indexOf("router.get('/report/pdf'");
  // Code only: the explanatory comment above the handler names the fields that
  // are deliberately NOT selected, so it must not be scanned as a violation.
  const body = source.slice(start, source.indexOf('module.exports = router;', start));
  assert.match(source, /const REPORT_ORDER_SELECT = 'orderId clientId orderStatus createdAt approvedAt completedAt items\.planTitle items\.quantity';/);
  assert.match(source, /const REPORT_TASK_DETAIL_SELECT = 'description clientInputs\.link clientContentLinks clientDriveLink';/);
  for (const forbidden of ['totalAmount', 'creditCost', 'creditsUsed', 'Wallet', 'CommissionLog', 'Invoice', 'RechargeRequest', 'billingSnapshot']) {
    assert.ok(!body.includes(forbidden), `report route must not touch ${forbidden}`);
  }
  const renderer = read('src/services/workflowReportPdf.js');
  for (const forbidden of ['totalAmount', 'creditCost', 'credits', 'wallet', 'commission', 'invoice', 'BillingConfig']) {
    assert.ok(!renderer.toLowerCase().includes(forbidden.toLowerCase()), `report renderer must not print ${forbidden}`);
  }
});

test('the report feature never reaches the client app or the workflow views', () => {
  assert.ok(!read('src/routes/client.js').includes('report/pdf'));
  assert.ok(!read('src/services/workflowReportService.js').includes('frontend'));
  const clientSources = fs.readdirSync(path.join(root, 'frontend/client-app/src'), { recursive: true })
    .map(file => String(file).split(path.sep).join('/'))
    .filter(file => file.endsWith('.jsx') || file.endsWith('.js'));
  assert.ok(clientSources.length > 10, 'client app sources were enumerated');
  for (const file of clientSources) {
    assert.ok(!read(`frontend/client-app/src/${file}`).includes('analytics/report/pdf'), `client app must not call the report endpoint (${file})`);
  }
  // The existing workflow presentation components are untouched by this feature.
  for (const file of ['frontend/client-app/src/components/WorkflowJourney.jsx', 'frontend/admin-panel/src/components/WorkflowJourney.jsx',
    'frontend/client-app/src/components/WorkflowCalendar.jsx', 'frontend/admin-panel/src/components/WorkflowCalendar.jsx']) {
    assert.ok(!read(file).includes('report/pdf'));
  }
});

// ---------- Behavioral verification of the REAL report route source ----------
// The project requires mongoose ^9.1.2, which is not installed in this
// workspace, and the only local copy (7.8.8) must not be substituted, so the
// Mongoose model surface is faked offline. What actually runs here is the exact
// source of resolveAuthorizedClient plus the /report/pdf handler, evaluated in a
// vm with the same harness test/workflowTimeline.test.js already uses, so the
// query objects the route really builds can be asserted literally instead of
// only being matched as text.
const REPORT_TASK_FIXTURES = [
  { _id: 't-union', clientId: 'c-union', orderId: 'o-union', title: 'Union task', status: 'ACTIVE', progress: 40, assignedUsers: [{ userId: 'staff', percentage: 100 }] },
  { _id: 't-legacy', clientId: 'c-legacy', orderId: 'o-legacy', title: 'Legacy task', status: 'COMPLETED', progress: 100, assignedTo: 'staff' },
  { _id: 't-other', clientId: 'c-other', orderId: 'o-other', title: 'Another employee task', status: 'ACTIVE', progress: 10, assignedTo: 'other', assignedUsers: [{ userId: 'other', percentage: 100 }] },
];
const REPORT_ORDER_FIXTURES = [
  { _id: 'o-union', clientId: 'c-union', orderId: 'CODE-UNION', orderStatus: 'APPROVED', createdAt: new Date('2026-09-05T09:00:00.000Z'), items: [{ planTitle: 'Union package' }] },
  { _id: 'o-legacy', clientId: 'c-legacy', orderId: 'CODE-LEGACY', orderStatus: 'COMPLETED', createdAt: new Date('2026-09-06T09:00:00.000Z'), items: [] },
  { _id: 'o-other', clientId: 'c-other', orderId: 'CODE-OTHER', orderStatus: 'APPROVED', createdAt: new Date('2026-09-07T09:00:00.000Z'), items: [] },
];
const REPORT_CLIENT_IDS = ['c-union', 'c-legacy', 'c-other'];

// Reproduces how MongoDB evaluates the two assignment filters the resolver can
// build, so a task assigned only through assignedUsers[].userId is found exactly
// as the database would find it.
function matchesAssignment(fixture, filter) {
  if (filter.$or) return filter.$or.some(branch => matchesAssignment(fixture, branch));
  if ('assignedTo' in filter) return String(fixture.assignedTo) === String(filter.assignedTo);
  if ('assignedUsers.userId' in filter) {
    return (fixture.assignedUsers || []).some(entry => String(entry.userId) === String(filter['assignedUsers.userId']));
  }
  return false;
}

// A clientId arrives either as one value or as { $in: [...] }, and either as a
// string or as an ObjectId.
function clientMatches(filter, value) {
  if (!filter) return true;
  const list = filter.$in ? filter.$in.map(String) : [String(filter)];
  return list.includes(String(value));
}

async function runReportRoute(caller, query) {
  const source = read('src/routes/adminAnalytics.js');
  const resolver = source.slice(source.indexOf('async function resolveAuthorizedClient('),
    source.indexOf('// ---------- GET /admin/analytics/client ----------'));
  const constStart = source.indexOf('const REPORT_ORDER_SELECT');
  const route = source.slice(constStart,
    source.indexOf('\n});', source.indexOf("router.get('/report/pdf'", constStart)) + 4);

  const calls = { distinct: [], taskScope: [], orderFind: [], taskFind: [], employee: 0, models: [] };
  const chain = value => {
    const q = { sort: () => q, select: () => q, populate: async () => value, lean: async () => value };
    return q;
  };
  const clientDocs = ids => REPORT_CLIENT_IDS.filter(id => ids.map(String).includes(id))
    .map(_id => ({ _id, profile: { name: `Client ${_id}` }, identifier: `${_id}@example.test` }));
  const User = { find: filter => chain(clientDocs(filter._id.$in)), findById: () => ({ populate: async () => caller }) };
  const Task = {
    distinct: async (key, filter) => {
      calls.distinct.push({ key, filter });
      return [...new Set(REPORT_TASK_FIXTURES.filter(item => matchesAssignment(item, filter)).map(item => item.clientId))];
    },
    find: filter => {
      calls.taskFind.push(filter);
      return chain(REPORT_TASK_FIXTURES.filter(item => filter._id.$in.map(String).includes(String(item._id)))
        .map(item => ({ _id: item._id, description: 'Detail', clientInputs: [], clientContentLinks: [], clientDriveLink: '' })));
    },
  };
  const Order = {
    find: filter => {
      calls.orderFind.push(filter);
      const ids = filter._id && filter._id.$in ? filter._id.$in.map(String) : null;
      return chain(REPORT_ORDER_FIXTURES.filter(item => (!ids || ids.includes(String(item._id)))
        && clientMatches(filter.clientId, item.clientId)));
    },
  };
  const Employee = { findOne: () => { calls.employee += 1; return chain(null); } };

  let handler;
  const resolveAuthorizedClient = vm.runInNewContext(`${resolver}${route}\nresolveAuthorizedClient;`, {
    User, Task, Order, Employee, Date,
    mongoose: {
      isValidObjectId: value => REPORT_CLIENT_IDS.includes(String(value)),
      Types: { ObjectId: class { constructor(value) { this.value = value; } toString() { return this.value; } toJSON() { return this.value; } } },
    },
    findTimelineEventTaskIds: async () => ({ completedIds: [], approvedIds: [] }),
    findTimelineTasks: async (args) => {
      calls.taskScope.push(args.taskScope);
      const scope = args.taskScope;
      // An assignment-scoped caller nests the client filter inside $and[0].
      const clientFilter = scope.clientId || (scope.$and && scope.$and[0].clientId);
      return REPORT_TASK_FIXTURES.filter(item => clientMatches(clientFilter, item.clientId)
        && (!scope.$and || matchesAssignment(item, scope.$and[1])));
    },
    buildTimelineJourneyMap: async (tasks, _clientIds, orders) => new Map(tasks.map(item => {
      const linked = orders.find(candidate => String(candidate._id) === String(item.orderId)) || null;
      return [String(item._id), {
        progress: item.progress,
        order: linked ? { id: String(linked._id), orderId: linked.orderId, createdAt: linked.createdAt, approvedAt: linked.approvedAt || null } : null,
      }];
    })),
    buildReportModel: report.buildReportModel,
    generateWorkflowReportPDF: async model => { calls.models.push(model); return Buffer.from('%PDF-1.3 offline\n'); },
    console: { error() {} },
    router: { get(_route, fn) { handler = fn; } },
  });
  assert.equal(typeof handler, 'function', 'the real /report/pdf handler was extracted from the route source');
  assert.equal(typeof resolveAuthorizedClient, 'function', 'the real resolver was extracted from the route source');

  const res = {
    statusCode: 200, headers: {}, body: null, data: null,
    setHeader(key, value) { this.headers[key] = value; return this; },
    send(value) { this.body = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.data = value; return this; },
  };
  await handler({ user: { id: String(caller._id) }, query }, res);
  return { res, calls, resolveAuthorizedClient };
}

const STAFF_CALLER = { _id: 'staff', role: 'ADMIN', customRole: 'manager', identifier: 'staff@example.test', profile: { name: 'Riya' } };
const MAIN_CALLER = { _id: 'main', role: 'ADMIN', customRole: null, identifier: 'admin@example.test', profile: { name: 'Owner' } };
const PERIOD = { startDate: '2026-09-01', endDate: '2026-09-30' };

test('the real report route authorizes staff through both assignment relationships', async () => {
  // Assigned ONLY through assignedUsers[].userId — the relationship the resolver
  // used to ignore — must still produce a report.
  const union = await runReportRoute(STAFF_CALLER, { clientId: 'c-union', ...PERIOD });
  assert.equal(union.res.statusCode, 200);
  assert.equal(union.res.body.subarray(0, 5).toString(), '%PDF-');
  assert.equal(union.res.headers['Content-Type'], 'application/pdf');
  assert.equal(union.res.headers['Content-Disposition'], 'attachment; filename="workflow-report-2026-09-01-to-2026-09-30.pdf"');
  assert.equal(union.res.headers['Cache-Control'], 'no-store');
  assert.equal(union.calls.distinct[0].key, 'clientId');
  assert.deepEqual(plain(union.calls.distinct[0].filter), { $or: [{ assignedTo: 'staff' }, { 'assignedUsers.userId': 'staff' }] });
  // The task query is ANDed with the caller's own assignment union, so the
  // report can only ever contain that caller's work.
  assert.deepEqual(plain(union.calls.taskScope[0]), { $and: [
    { isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, clientId: 'c-union' },
    { $or: [{ assignedTo: 'staff' }, { 'assignedUsers.userId': 'staff' }] },
  ] });
  assert.deepEqual(union.calls.models[0].journeys.flatMap(journey => journey.tasks.map(item => item.id)), ['t-union']);
  assert.equal(union.calls.models[0].clientLabel, 'Client c-union');

  // The legacy assignedTo relationship keeps working through the same resolver.
  const legacy = await runReportRoute(STAFF_CALLER, { clientId: 'c-legacy', ...PERIOD });
  assert.equal(legacy.res.statusCode, 200);
  assert.deepEqual(legacy.calls.models[0].journeys.flatMap(journey => journey.tasks.map(item => item.id)), ['t-legacy']);

  // The union is opt-in: an endpoint that calls the resolver with no options
  // keeps the assignedTo-only rule, so nothing else was widened.
  const defaulted = await runReportRoute(STAFF_CALLER, { clientId: 'c-union', ...PERIOD });
  const defaultRule = await defaulted.resolveAuthorizedClient({ query: { clientId: 'c-union' }, user: { id: 'staff' } });
  assert.equal(defaultRule.status, 404, 'a union-only client stays hidden from endpoints that did not opt in');
  assert.deepEqual(plain(defaulted.calls.distinct.at(-1).filter), { assignedTo: 'staff' });
});

test('the real report route never exposes another employee task or an unauthorized client', async () => {
  // A client whose work belongs to another employee: denied before any data read.
  const foreign = await runReportRoute(STAFF_CALLER, { clientId: 'c-other', ...PERIOD });
  assert.equal(foreign.res.statusCode, 404);
  assert.deepEqual(plain(foreign.res.data), { error: 'Client not found' });
  assert.equal(foreign.res.body, null);
  assert.equal(foreign.calls.orderFind.length, 0);
  assert.equal(foreign.calls.taskFind.length, 0);
  assert.equal(foreign.calls.taskScope.length, 0);
  assert.equal(foreign.calls.models.length, 0);

  // A mixed multi-client request fails closed for the whole request.
  const mixed = await runReportRoute(STAFF_CALLER, { clientIds: 'c-union,c-other', ...PERIOD });
  assert.equal(mixed.res.statusCode, 404);
  assert.equal(mixed.calls.models.length, 0);

  // employeeId is a main-admin control: ignored for staff and never queried.
  const filtered = await runReportRoute(STAFF_CALLER, { clientId: 'c-union', ...PERIOD, employeeId: 'other' });
  assert.equal(filtered.res.statusCode, 200);
  assert.equal(filtered.calls.employee, 0);
  assert.equal(filtered.calls.models[0].employee, null);
  assert.deepEqual(plain(filtered.calls.taskScope[0].$and[1]), { $or: [{ assignedTo: 'staff' }, { 'assignedUsers.userId': 'staff' }] });

  // Orders are reachable only through exact ids linked from in-scope tasks.
  const union = await runReportRoute(STAFF_CALLER, { clientId: 'c-union', ...PERIOD });
  assert.deepEqual(plain(union.calls.orderFind[0]._id.$in), ['o-union']);
  assert.equal(String(union.calls.orderFind[0].clientId), 'c-union');

  // Malformed, reversed and unknown-client requests are rejected with no PDF.
  for (const query of [{ clientId: 'c-union' }, { clientId: 'c-union', startDate: 'bad', endDate: '2026-09-30' },
    { clientId: 'c-union', startDate: '2026-09-30', endDate: '2026-09-01' }, { clientId: 'unknown', ...PERIOD }]) {
    const denied = await runReportRoute(STAFF_CALLER, query);
    assert.ok([400, 404].includes(denied.res.statusCode), `${JSON.stringify(query)} -> ${denied.res.statusCode}`);
    assert.equal(denied.calls.models.length, 0);
  }
});

test('the real report route keeps the unrestricted main-admin scope', async () => {
  const all = await runReportRoute(MAIN_CALLER, { clientIds: 'c-union,c-other', ...PERIOD, mode: 'inline' });
  assert.equal(all.res.statusCode, 200);
  assert.equal(all.res.headers['Content-Disposition'], 'inline; filename="workflow-report-2026-09-01-to-2026-09-30.pdf"');
  assert.equal(all.calls.distinct.length, 0, 'the main admin is never restricted by an assignment lookup');
  assert.deepEqual(plain(all.calls.taskScope[0]), {
    isDeleted: { $ne: true }, isListedInPlans: { $ne: true }, clientId: { $in: ['c-union', 'c-other'] },
  });
  assert.deepEqual(all.calls.models[0].journeys.flatMap(journey => journey.tasks.map(item => item.id)).sort(), ['t-other', 't-union']);
  assert.deepEqual(all.calls.models[0].journeys.map(journey => journey.sequence), [1, 2]);
  assert.equal(all.calls.models[0].clientLabel, '2 selected clients');
});
