'use strict';

// Offline fixtures only: real JSX and persisted-event models, no app/database startup.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const clientRequire = createRequire(path.join(root, 'frontend/client-app/package.json'));
const { transformSync } = clientRequire('esbuild');
const task = {
  id: 'task-1', title: 'Campaign launch', status: 'COMPLETED', progress: 100, creditCost: 40,
  order: { id: 'order-1', orderId: 'ORD-1', createdAt: '2026-09-15', approvedAt: '2026-09-16' },
  approvedAt: '2026-09-16', startDate: '2026-09-16', completedAt: '2026-09-24', deadline: '2026-09-30',
  milestones: [
    { name: 'Draft', percentage: 1, reached: true, reachedAt: '2026-09-17' },
    { name: 'Review', percentage: 60, reached: true, reachedAt: '2026-09-17T23:59:59.999Z' },
    { name: 'Delivery', percentage: 100, reached: true, reachedAt: '2026-09-24' },
    { name: 'Reset milestone', percentage: 75, reached: false, reachedAt: '2026-09-18' },
  ],
};

for (const app of ['client-app', 'admin-panel']) {
  const appRequire = createRequire(path.join(root, `frontend/${app}/package.json`));
  const load = (name, overrides = {}) => {
    const module = { exports: {} };
    const source = read(`frontend/${app}/src/components/${name}.jsx`);
    vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, {
      module, exports: module.exports, require: name => overrides[name] || appRequire(name),
    });
    return module.exports;
  };
  const view = load('WorkflowJourney');
  const calendar = load('WorkflowCalendar', { './WorkflowJourney': view });
  const React = appRequire('react');
  const { renderToStaticMarkup } = appRequire('react-dom/server');
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

  test(`${app}: 0% Scheduled, 1% Started, dynamic 50% evidence, no inferred startDate`, () => {
    const zero = { ...task, progress: 0, milestones: [], completedAt: null };
    const events = view.taskJourneyEvents(zero);
    assert.equal(events.find(e => e.key === 'scheduled').date, undefined);
    assert.equal(events.find(e => e.key === 'approval').date, zero.approvedAt);
    assert.equal(view.taskJourneyEvents({ ...zero, progress: 1 }).find(e => e.key === 'approval').date, zero.approvedAt);
    assert.deepEqual(plain(view.taskJourneyRange(zero)), plain(view.taskJourneyRange({ ...zero, progress: 1 })));
    assert.equal(view.taskJourneyEvents({ ...zero, milestones: [{ name: 'Approved at zero', percentage: 0, reached: true, reachedAt: zero.approvedAt }] }).find(e => e.key === 'scheduled').date, zero.approvedAt);
    assert.equal(events.find(e => e.key === 'started').date, undefined);
    assert.match(render(view.TaskJourney, { task: zero }), /0%.*Scheduled/);
    assert.match(render(view.TaskJourney, { task: { ...zero, progress: 1 } }), /1%.*Started/);
    const reached = view.taskJourneyEvents(task);
    assert.equal(reached.find(e => e.key === 'started').date, '2026-09-17');
    assert.equal(reached.find(e => e.key === 'process').date, '2026-09-17T23:59:59.999Z');
    assert.match(reached.find(e => e.key === 'process').detail, /First available evidence/);
    assert.equal(reached.filter(e => e.key.startsWith('milestone:')).length, 3);
    assert.ok(!reached.some(e => e.label === 'Reset milestone'));
    assert.equal(reached.find(e => e.key === 'scheduled').date, undefined);
    assert.deepEqual([...new Set(reached.filter(e => view.journeyDay(e.date)).map(e => view.journeyDay(e.date)))].sort(), ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-24']);
  });

  test(`${app}: recorded completion and saved 100% evidence; unavailable history stays undated`, () => {
    const unknown = { ...task, order: null, createdAt: '2026-09-15', approvedAt: null, completedAt: null, milestones: [] };
    assert.equal(view.taskJourneyEvents(unknown).filter(e => view.journeyDay(e.date)).length, 0);
    assert.equal(view.taskJourneyRange(unknown).start, null);
    assert.equal(view.taskJourneyRange(unknown).end, null);
    const milestoneOnly = { ...task, completedAt: null };
    assert.equal(view.taskJourneyEvents(milestoneOnly).find(e => e.key === 'completed').date, '2026-09-24');
    assert.equal(view.taskJourneyRange(task).end, '2026-09-24');
    assert.equal(view.taskJourneyRange({ ...task, completedAt: null, milestones: task.milestones.slice(0, 2) }).end, '2026-09-17');
  });

  test(`${app}: range-local order numbers survive completion order and duplicates`, () => {
    const second = { ...task, id: 'second', order: { id: 'order-2', createdAt: '2026-09-16' }, completedAt: '2026-09-18' };
    const shared = { ...task, id: 'shared' };
    const tasks = [second, task, task, shared];
    const before = plain(tasks);
    assert.deepEqual(plain(view.numberJourneyTasks(tasks).map(t => [t.id, t.sequence])), [['shared', 1], ['task-1', 1], ['second', 2]]);
    assert.equal(view.numberJourneyTasks([second])[0].sequence, 1);
    assert.equal(view.numberJourneyTasks([{ ...task, order: null }])[0].sequence, null);
    const orderOnly = { id: 'pending-order', createdAt: '2026-09-14' };
    assert.equal(view.numberJourneyTasks([task], [orderOnly])[0].sequence, 2);
    assert.equal(calendar.buildCalendarRanges([task], '2026-09-15', '2026-09-24', [orderOnly]).tasks[0].task.sequence, 1);
    const narrowed = view.numberJourneyTasks(tasks, [], '2026-09-16', '2026-09-24');
    assert.equal(narrowed.find(t => t.id === 'second').sequence, 1);
    assert.equal(narrowed.find(t => t.id === 'task-1').sequence, null);
    assert.equal(view.numberJourneyTasks(tasks, [], '2026-09-15', '2026-09-24').find(t => t.id === 'second').sequence, 2);
    assert.deepEqual(tasks, before);
  });

  test(`${app}: connected SVG, same-day milestones, all spanning task details retained`, () => {
    const assigned = { ...task, id: 'assigned', title: 'Assigned campaign', clientName: 'Authorized buyer', order: null };
    const html = render(view.default, {
      timeline: { tasks: [task, task, assigned] }, startDate: '2026-09-18', endDate: '2026-09-20',
      selectedDate: '2026-09-19', onSelectDate() {},
    });
    assert.equal((html.match(/<article aria-label="Workflow journey for/g) || []).length, 2);
    assert.equal((html.match(/data-workflow-path="true"/g) || []).length, 2);
    assert.equal((html.match(/aria-label="Task journeys by actual date and workflow stage"/g) || []).length, 1);
    assert.doesNotMatch(html, /Timeline dates|data-day=/);
    for (const text of ['Draft', 'Review', 'Completed', 'Planned end:', 'Authorized buyer', 'Dates unavailable', 'Scheduled start:']) assert.ok(html.includes(text), text);
    const source = read(`frontend/${app}/src/components/WorkflowJourney.jsx`);
    assert.doesNotMatch(source, /api\.get|fetch\(/);
    assert.match(source, /scroller.current.scrollLeft/);
    assert.match(source, /\[model\]/);
  });

  test(`${app}: Calendar connects Sept 15–24, clips middle windows, and separates overlapping lanes`, () => {
    const busy = Array.from({ length: 8 }, (_, i) => ({ ...task, id: `task-${i}` }));
    const model = calendar.buildCalendarRanges(busy, '2026-09-15', '2026-09-24');
    assert.equal(model.tasks.length, 8);
    assert.equal(new Set(model.tasks.map(range => range.row)).size, 8);
    const segment = model.tasks[0];
    assert.equal(segment.start, '2026-09-15');
    assert.equal(segment.end, '2026-09-24');
    assert.equal(segment.left, 0);
    assert.equal(segment.width, 10 * 80);
    const middle = calendar.buildCalendarRanges([task], '2026-09-19', '2026-09-20');
    assert.equal(middle.tasks.length, 1);
    assert.equal(middle.tasks[0].width, middle.width);
    assert.equal(middle.tasks[0].visibleStart, '2026-09-19');
    assert.equal(middle.tasks[0].visibleEnd, '2026-09-20');
    assert.equal(calendar.buildCalendarRanges([task], '2026-09-25', '2026-09-30').undated.length, 1);
    const html = render(calendar.default, { tasks: busy, rangeStart: '2026-09-15', rangeEnd: '2026-09-24', selectedDate: '2026-09-19', onSelectDate() {} });
    assert.equal((html.match(/data-calendar-row=/g) || []).length, 8);
    assert.match(html, /data-range-start="2026-09-15" data-range-end="2026-09-24"/);
    assert.match(html, /2026-09-19 · 8 tasks/);
    assert.equal(calendar.buildCalendarRanges([task], 'bad', '2026-09-24').count, 0);
    const notStarted = { ...task, progress: 0, completedAt: null, milestones: [] };
    assert.equal(calendar.buildCalendarRanges([notStarted], '2026-09-15', '2026-09-24').tasks[0].end, '2026-09-16');
    assert.equal(calendar.buildCalendarRanges([{ ...notStarted, order: null }], '2026-09-15', '2026-09-24').undated.length, 1);
  });

  test(`${app}: fixed stage coordinates, proportional dates, one path per task, same-day milestones`, () => {
    const model = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-01', '2026-09-30');
    const line = model.series[0];
    assert.equal(model.firstActual, '2026-09-15');
    assert.equal(model.x('2026-09-17') - model.x('2026-09-15'), 160);
    assert.equal(model.rows.length, 6);
    assert.ok(model.rows[0] > model.rows[5]);
    for (const point of line.points) assert.equal(point.y, model.rows[point.row] + line.lane + (point.offset || 0));
    assert.equal(line.points.find(p => p.key === 'order').row, 0);
    assert.equal(line.points.find(p => p.key === 'started').row, 2);
    assert.equal(line.points.find(p => p.key === 'process').row, 3);
    assert.equal(line.points.find(p => p.key === 'completed').row, 5);
    const milestones = line.points.filter(p => p.day === '2026-09-17' && p.row === 4);
    assert.equal(milestones.length, 2);
    assert.equal(milestones[0].x, milestones[1].x);
    assert.notEqual(milestones[0].y, milestones[1].y);
    assert.equal((line.path.match(/M/g) || []).length, 1);
    assert.equal((line.path.match(/H/g) || []).length, line.points.length - 1);
    assert.equal(calendar.buildCalendarRanges([task], '2026-09-01', '2026-09-30').tasks[0].start, line.points.find(p => p.key === 'order').day);
    const later = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-18', '2026-09-20');
    assert.equal(later.firstActual, '2026-09-18');
    assert.ok(later.series[0].path.length > 0); // clipped journey still spans this middle window
    const today = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-24', '2026-09-24');
    assert.equal(today.count, 1);
    assert.equal(today.series[0].task.sequence, null);
    for (const end of ['2026-09-18', '2026-09-19', '2026-09-20']) {
      const axis = view.journeyDateAxis('2026-09-18', end);
      assert.equal(axis.dayWidth * axis.count, axis.width);
      assert.ok(axis.x('2026-09-17') < 0);
      assert.ok(axis.x('2026-09-21') > axis.width);
    }
    assert.equal(view.taskJourneyRange({ ...task, order: null }).start, null);
  });
}

test('identical Calendar models in independently built apps', () => {
  assert.equal(read('frontend/client-app/src/components/WorkflowCalendar.jsx'), read('frontend/admin-panel/src/components/WorkflowCalendar.jsx'));
});

test('existing normalization keeps planned end separate from completion', () => {
  const normalize = vm.runInNewContext(read('frontend/client-app/src/components/workflowTimelineTask.js').replace(/export /g, '') + '\nnormalizeWorkflowTask;');
  assert.equal(normalize(task).endDate, task.deadline);
  assert.equal(normalize(task).completedAt, task.completedAt);
  assert.equal(task.endDate, undefined);
});

test('existing date presets, custom ranges, and local client selector issue no extra requests', () => {
  const source = read('frontend/client-app/src/components/WorkflowTimeline.jsx');
  const prefix = source.split('const RANGE_OPTIONS =')[0].replace(/^import .*;\r?\n/gm, '');
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-23T12:00:00Z'])); } }
  const buildRange = vm.runInNewContext(prefix + '\nbuildRange;', { Date: FixedDate });
  for (const [type, expected] of [['today', '2026-09-23'], ['7d', '2026-09-17'], ['15d', '2026-09-09'], ['30d', '2026-08-25'], ['month', '2026-09-01']]) {
    assert.deepEqual(plain(buildRange(type)), { startDate: expected, endDate: '2026-09-23' });
  }
  assert.deepEqual(plain(buildRange('custom', '2026-08-05', '2026-09-12')), { startDate: '2026-08-05', endDate: '2026-09-12' });
  assert.equal((source.match(/api\.get\('/g) || []).length, 1);
  assert.match(source, /selectedClients.length > 0 \|\| clientOptions.some/);
  assert.match(source, /<WorkflowCalendar tasks=\{journeyTimeline\?\.tasks/);
  assert.match(source, /<WorkflowJourney timeline=\{journeyTimeline\}/);
});
