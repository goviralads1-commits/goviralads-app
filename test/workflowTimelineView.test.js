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
      module, exports: module.exports, require: name => overrides[name] || appRequire(name), URL, AbortController,
    });
    return module.exports;
  };
  const view = load('WorkflowJourney');
  const calendar = load('WorkflowCalendar', { './WorkflowJourney': view });
  const React = appRequire('react');
  const { renderToStaticMarkup } = appRequire('react-dom/server');
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

  test(`${app}: current 0% Scheduled, 1–4% Started, 5–99% In Process, 100% Completed; no inferred transition dates`, () => {
    const zero = { ...task, progress: 0, milestones: [], completedAt: null };
    const events = view.taskJourneyEvents(zero);
    assert.equal(events.find(e => e.key === 'scheduled').date, undefined);
    assert.equal(events.find(e => e.key === 'approval').date, zero.approvedAt);
    assert.equal(view.taskJourneyEvents({ ...zero, progress: 1 }).find(e => e.key === 'approval').date, zero.approvedAt);
    assert.deepEqual(plain(view.taskJourneyRange(zero)), plain(view.taskJourneyRange({ ...zero, progress: 1 })));
    assert.equal(view.taskJourneyEvents({ ...zero, milestones: [{ name: 'Approved at zero', percentage: 0, reached: true, reachedAt: zero.approvedAt }] }).find(e => e.key === 'scheduled').date, undefined);
    assert.equal(events.find(e => e.key === 'started').date, undefined);
    // An unfinished journey stays active up to the reporting day; saved 100% ends it.
    assert.equal(view.taskJourneyRange(zero).active, true);
    assert.equal(view.taskJourneyRange(zero).terminal, false);
    assert.equal(view.taskJourneyRange(zero).end, view.journeyDay(new Date()));
    assert.equal(view.taskJourneyRange(zero).endLabel, 'Active today');
    assert.equal(view.taskJourneyRange({ ...zero, progress: 100 }).terminal, true);
    assert.equal(view.taskJourneyRange({ ...zero, progress: 100 }).active, false);
    assert.equal(view.taskJourneyRange({ ...zero, progress: 100 }).end, '2026-09-16');
    assert.match(render(view.TaskJourney, { task: zero }), /0%.*Scheduled/);
    for (let progress = 0; progress <= 100; progress++) {
      const expected = progress === 0 ? 'Scheduled' : progress <= 4 ? 'Started' : progress <= 99 ? 'In Process' : 'Completed';
      assert.equal(view.currentStage(progress), expected);
      assert.match(render(view.TaskJourney, { task: { ...zero, progress } }), new RegExp(`${progress}%.*${expected}`));
      assert.deepEqual(plain(view.taskJourneyEvents({ ...zero, progress })), plain(events));
      if (progress < 100) assert.deepEqual(plain(view.taskJourneyRange({ ...zero, progress })), plain(view.taskJourneyRange(zero)));
    }
    assert.equal(view.currentStage(100), 'Completed');
    assert.equal(view.currentStage(null), 'Stage unavailable');
    assert.match(render(view.TaskJourney, { task }), /100%.*Completed/);
    const reached = view.taskJourneyEvents(task);
    assert.equal(reached.find(e => e.key === 'started').date, undefined);
    assert.equal(reached.find(e => e.key === 'process').date, undefined);
    assert.doesNotMatch(reached.map(e => e.detail).join(' '), /50%/);
    assert.equal(reached.filter(e => e.key.startsWith('milestone:')).length, 3);
    assert.ok(!reached.some(e => e.label === 'Reset milestone'));
    assert.equal(reached.find(e => e.key === 'scheduled').date, undefined);
    assert.deepEqual([...new Set(reached.filter(e => view.journeyDay(e.date)).map(e => view.journeyDay(e.date)))].sort(), ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-24']);
  });

  test(`${app}: only recorded completion becomes a transition; mutable 100% evidence preserves Calendar bounds`, () => {
    const unknown = { ...task, order: null, createdAt: '2026-09-15', approvedAt: null, completedAt: null, milestones: [] };
    assert.equal(view.taskJourneyEvents(unknown).filter(e => view.journeyDay(e.date)).length, 0);
    assert.equal(view.taskJourneyRange(unknown).start, null);
    assert.equal(view.taskJourneyRange(unknown).end, null);
    const milestoneOnly = { ...task, completedAt: null };
    assert.equal(view.taskJourneyEvents(milestoneOnly).find(e => e.key === 'completed').date, null);
    assert.equal(view.taskJourneyRange(milestoneOnly).end, '2026-09-24');
    assert.equal(view.taskJourneyRange(milestoneOnly).completed, false);
    assert.equal(view.taskJourneyRange(milestoneOnly).endLabel, 'Saved 100% evidence');
    assert.equal(view.taskJourneyEvents({ ...task, completedAt: '2026-09-25' }).find(e => e.key === 'completed').date, '2026-09-25');
    assert.equal(view.taskJourneyRange({ ...task, completedAt: '2026-09-25' }).end, '2026-09-24');
    for (const milestones of [task.milestones, task.milestones.map(m => ({ ...m, reached: false })), task.milestones.map(m => ({ ...m, percentage: 0 }))]) {
      const events = view.taskJourneyEvents({ ...task, milestones });
      assert.equal(events.find(e => e.key === 'completed').date, task.completedAt);
      assert.ok(events.filter(e => ['scheduled', 'started', 'process'].includes(e.key)).every(e => !e.date));
      // A reached milestone is dated progress evidence, mapped through the same
      // thresholds as the latest saved progress. 0% is never a stage transition.
      assert.deepEqual(plain(events.filter(e => e.key.startsWith('milestone:')).map(e => [e.progress, e.row])),
        plain(milestones.filter(m => m.reached === true).map(m => [m.percentage, m.percentage > 0 ? view.stageRow(m.percentage) : null])));
    }
    assert.equal(view.taskJourneyRange(task).end, '2026-09-24');
    assert.equal(view.taskJourneyRange({ ...task, completedAt: null, milestones: task.milestones.slice(0, 2) }).end, '2026-09-17');
  });

  test(`${app}: exact order IDs win over colliding display codes; missing and ambiguous history stays unavailable`, () => {
    const wrong = { id: 'wrong', orderId: 'REUSED', createdAt: '2026-09-01' };
    const correct = { id: 'correct', orderId: 'REUSED', createdAt: '2026-09-15' };
    const current = { ...task, order: { id: 'correct', orderId: 'REUSED' } };
    const before = plain(current);
    assert.equal(view.resolveJourneyOrder(current, [wrong, correct]).createdAt, correct.createdAt);
    assert.equal(view.resolveJourneyOrder(current, [wrong]).createdAt, undefined);
    assert.equal(view.resolveJourneyOrder({ ...task, order: null }, [correct]), null);
    const alias = { ...task, order: { orderId: 'REUSED' } };
    assert.equal(view.resolveJourneyOrder(alias, [wrong, correct]).createdAt, undefined);
    const graph = view.buildWorkflowGraph({ tasks: [alias], orders: [correct] }, '2026-09-01', '2026-09-30', 235);
    assert.equal(graph.series.length, 1, 'display-code fallback must not add a duplicate order journey');
    assert.equal(graph.series[0].task.order.id, correct.id);
    assert.equal(graph.series[0].points[0].date, correct.createdAt);
    const range = calendar.buildCalendarRanges([alias], '2026-09-01', '2026-09-30', [correct]).tasks[0];
    assert.equal(range.task.sequence, graph.series[0].task.sequence);
    assert.equal(range.color, graph.series[0].color);
    assert.deepEqual(current, before);
  });

  test(`${app}: each path contains only its own task/order dates, including siblings and order-only journeys`, () => {
    const orders = [
      { id: 'late', orderId: 'LATE', createdAt: '2026-09-16T15:00:00Z' },
      { id: 'early', orderId: 'EARLY', createdAt: '2026-09-15T09:00:00Z' },
      { id: 'pending', orderId: 'PENDING', createdAt: '2026-09-16T08:00:00Z', approvedAt: '2026-09-18' },
    ];
    const tasks = [
      { ...task, id: 'late-task', title: 'Late package', order: { id: 'late' }, approvedAt: '2026-09-17', completedAt: '2026-09-20', milestones: [] },
      { ...task, id: 'early-task', order: orders[1], approvedAt: '2026-09-16', completedAt: '2026-09-24', milestones: [
        { name: 'Only early', reached: true, percentage: 20, reachedAt: '2026-09-19T12:00:00Z' },
        { name: 'Earlier record', reached: true, percentage: 1, reachedAt: '2026-09-19T08:00:00Z' },
      ] },
      { ...task, id: 'sibling', title: 'Sibling package', order: orders[1], approvedAt: null, completedAt: '2026-09-21', milestones: [] },
      { ...task, id: 'assigned', order: null, approvedAt: '2026-09-22', completedAt: null, milestones: [] },
    ];
    const before = plain({ tasks, orders });
    for (const width of [0, 206, 235, 290]) {
      const graph = view.buildWorkflowGraph({ tasks: [...tasks].reverse(), orders }, '2026-09-15', '2026-09-24', width);
      assert.equal(graph.series.length, 5);
      const ranges = calendar.buildCalendarRanges(tasks, '2026-09-15', '2026-09-24', orders);
      const numbers = new Map([['early-task', 1], ['sibling', 1], ['order:pending', 2], ['late-task', 3], ['assigned', null]]);
      for (const line of graph.series) {
        assert.equal(line.task.sequence ?? null, numbers.get(line.task.id));
        const original = tasks.find(item => item.id === line.task.id);
        const expected = original ? view.taskJourneyEvents({ ...original, order: view.resolveJourneyOrder(original, orders) }).filter(event => view.journeyDay(event.date)) : [
          { key: 'order', date: orders[2].createdAt }, { key: 'approval', date: orders[2].approvedAt },
        ];
        const records = line.points.flatMap(point => point.events).map(event => [event.key, event.date]);
        assert.deepEqual(plain(records.sort()), plain(expected.map(event => [event.key, event.date]).sort()));
        assert.equal(line.points.length, new Set(line.points.map(point => point.day)).size);
        for (let i = 1; i < line.points.length; i++) {
          assert.ok(line.points[i].day > line.points[i - 1].day);
          assert.ok(line.points[i].x > line.points[i - 1].x);
        }
        if (line.task.sequence) {
          const start = line.points.find(point => point.isOrder);
          assert.deepEqual(plain(start.labels.find(label => label.kind === 'start').lines), [String(line.task.sequence)]);
        }
        const range = ranges.tasks.find(range => range.task.id === line.task.id);
        if (range) { assert.equal(range.task.sequence, line.task.sequence); assert.equal(range.color, line.color); }
      }
      const days = calendar.buildCalendarDays(ranges, graph.series, '2026-09-15');
      for (const day of days) for (const item of day.journeys) {
        if (item.point) assert.equal(item.point, item.line.points.find(point => point.day === day.day));
        assert.equal(item.line.task.sequence ?? null, numbers.get(item.line.task.id));
      }
      const again = view.buildWorkflowGraph({ tasks, orders: [...orders].reverse() }, '2026-09-15', '2026-09-24', width);
      for (const line of again.series) {
        const prior = graph.series.find(item => item.task.id === line.task.id);
        assert.equal(line.task.sequence, prior.task.sequence);
        assert.equal(line.path, prior.path);
      }
    }
    assert.deepEqual({ tasks, orders }, before);
  });

  test(`${app}: no connector touches another journey's dot, even with identical dates and sibling colors`, () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({ ...task, id: `overlap-${i}`, completedAt: `2026-09-${20 + i % 5}` }));
    for (const width of [0, 206, 235, 290]) {
      const graph = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24', width);
      for (const line of graph.series) {
        const commands = [...line.path.matchAll(/([MLHV])(-?[\d.]+)(?:,(-?[\d.]+))?/g)];
        assert.equal(commands.filter(command => command[1] === 'M').length, 1);
        let from;
        const vertices = [];
        for (const [, command, a, b] of commands) {
          const to = command === 'M' || command === 'L' ? { x: +a, y: +b } : command === 'H' ? { x: +a, y: from.y } : { x: from.x, y: +a };
          if (from) for (const other of graph.series.filter(other => other !== line)) for (const point of other.points) {
            const dx = to.x - from.x, dy = to.y - from.y;
            const fraction = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy || 1)));
            assert.ok(Math.hypot(point.x - from.x - fraction * dx, point.y - from.y - fraction * dy) > 7, `${line.task.id} touches ${other.task.id}`);
          }
          if (from) assert.ok(to.x >= from.x, 'routing cannot reverse chronological position');
          vertices.push(to);
          from = to;
        }
        for (const point of line.points) assert.ok(vertices.some(vertex => vertex.x === point.x && vertex.y === point.y));
      }
      const html = render(view.default, { timeline: { tasks }, startDate: '2026-09-15', endDate: '2026-09-24' });
      assert.equal((html.match(/data-workflow-path="true"/g) || []).length, tasks.length);
      for (const task of tasks) assert.equal((html.match(new RegExp(`data-path-task="${task.id}"`, 'g')) || []).length, 1);
    }
  });

  test(`${app}: mobile shows 7–10 readable dates and number-only start and end labels`, () => {
    for (const width of [206, 220, 235, 270, 290]) for (const days of [7, 8, 10, 30]) {
      const graph = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-01', `2026-09-${String(days).padStart(2, '0')}`, width);
      const visibleDays = Math.min(days, width / graph.dayWidth);
      assert.ok(visibleDays >= 7 && visibleDays <= 10);
      assert.equal(graph.ticks.length, days);
      assert.ok(graph.dayWidth >= 24);
      if (days <= 8) assert.equal(graph.width, width);
    }
    for (const width of [0, 235]) {
      const graph = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-15', '2026-09-24', width);
      const points = graph.series[0].points;
      assert.deepEqual(plain(points[0].labels.map(label => [label.kind, label.lines.join(' ')])), [['start', '1']]);
      assert.deepEqual(plain(points.at(-1).labels.map(label => [label.kind, label.lines.join(' ')])), [['end', '1']]);
      assert.ok(points.slice(1, -1).every(point => point.labels.length === 0));
      const sameDay = { ...task, approvedAt: null, milestones: [], completedAt: task.order.createdAt };
      const one = view.buildWorkflowGraph({ tasks: [sameDay] }, '2026-09-15', '2026-09-15', width).series[0].points;
      assert.equal(one.length, 1);
      assert.deepEqual(plain(one[0].labels.map(label => label.kind)), ['start']);
      const placed = view.buildWorkflowGraph({ tasks: [{ ...sameDay, completedAt: null }] }, '2026-09-15', '2026-09-15', width).series[0].points[0];
      assert.deepEqual(plain(placed.labels.map(label => [label.kind, label.lines.join(' ')])), [['start', '1']]);
    }
    const mobile = load('WorkflowJourney', { react: { ...React, useState: initial => React.useState(initial === 0 ? 235 : initial) } });
    const html = render(mobile.default, { timeline: { tasks: [task] }, startDate: '2026-09-15', endDate: '2026-09-24' });
    const start = html.split('data-endpoint-label="start"')[1].split('</g>')[0];
    const end = html.split('data-endpoint-label="end"')[1].split('</g>')[0];
    assert.doesNotMatch(start, /Campaign|Started|In Process|Completed/);
    assert.match(start, />1<\//);
    assert.doesNotMatch(end, /Campaign|pkg|Started|In Process|Completed/);
    assert.match(end, />1<\//);
    assert.doesNotMatch(html, /textLength=|spacingAndGlyphs/);
    assert.match(end, /text-overflow:ellipsis/);
    assert.match(end, /font-size:12px/);
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

  test(`${app}: rejected orders and cancelled tasks are excluded, approved and completed work is not`, () => {
    const orders = [
      { id: 'order-1', orderId: 'ORD-1', createdAt: '2026-09-15', orderStatus: 'APPROVED' },
      { id: 'rejected', orderId: 'ORD-2', createdAt: '2026-09-16', orderStatus: 'REJECTED', approvedAt: '2026-09-17' },
      { id: 'done', orderId: 'ORD-3', createdAt: '2026-09-17', orderStatus: 'COMPLETED', completedAt: '2026-09-20' },
    ];
    const tasks = [
      { ...task, id: 'ok', order: { id: 'order-1' } },
      { ...task, id: 'on-rejected', title: 'Rejected order package', order: { id: 'rejected' }, status: 'ACTIVE', completedAt: '2026-09-19' },
      { ...task, id: 'cancelled', title: 'Cancelled package', order: { id: 'done' }, status: 'CANCELLED' },
      { ...task, id: 'undated', order: null, status: 'ACTIVE', completedAt: null, milestones: [] },
      { ...task, id: 'finished', order: { id: 'done' }, status: 'COMPLETED', completedAt: '2026-09-20' },
    ];
    const before = plain({ tasks, orders });
    assert.equal(view.isRejectedJourney(tasks[1], orders), true);
    assert.equal(view.isRejectedJourney(tasks[2], orders), true);
    assert.equal(view.isRejectedJourney({ ...tasks[1], order: { orderId: 'ORD-2' } }, orders), true);
    // Ambiguous display codes and unavailable order context never exclude work.
    assert.equal(view.isRejectedJourney({ ...tasks[1], order: { orderId: 'ORD-2' } }, [...orders, { id: 'twin', orderId: 'ORD-2', orderStatus: 'APPROVED' }]), false);
    assert.equal(view.isRejectedJourney({ ...tasks[1], order: { id: 'rejected' } }, []), false);
    assert.equal(view.isRejectedJourney(tasks[3], orders), false);
    assert.equal(view.isRejectedJourney(tasks[4], orders), false);
    assert.equal(view.isRejectedJourney(tasks[0], orders), false);
    for (const width of [0, 235]) {
      const graph = view.buildWorkflowGraph({ tasks, orders }, '2026-09-15', '2026-09-24', width);
      assert.deepEqual(plain(graph.series.map(line => line.task.id)), ['ok', 'finished', 'undated']);
      assert.deepEqual(plain(graph.numbered.map(item => [item.id, item.sequence])), [['ok', 1], ['finished', 2], ['undated', null]]);
      const html = render(view.default, { timeline: { tasks, orders }, startDate: '2026-09-15', endDate: '2026-09-24' });
      assert.doesNotMatch(html, /Rejected order package|Cancelled package|ORD-2/);
      const ranges = calendar.buildCalendarRanges(tasks, '2026-09-15', '2026-09-24', orders);
      assert.deepEqual(plain(ranges.tasks.map(range => [range.task.id, range.task.sequence])), [['ok', 1], ['finished', 2]]);
      assert.deepEqual(plain(ranges.undated.map(item => item.id)), ['undated']);
      for (const range of ranges.tasks) assert.equal(range.color, graph.series.find(line => line.task.id === range.task.id).color);
      const days = calendar.buildCalendarDays(ranges, graph.series, '2026-09-15');
      assert.ok(!days.some(day => day.journeys.some(item => ['on-rejected', 'cancelled'].includes(item.line.task.id))));
      assert.deepEqual(plain(days.find(day => day.day === '2026-09-19').journeys.map(item => item.line.task.id).sort()), ['finished', 'ok']);
    }
    assert.deepEqual({ tasks, orders }, before);
  });

  test(`${app}: Calendar dates carry the same chronological numbers and colors as the Timeline`, () => {
    const orders = [
      { id: 'order-1', orderId: 'ORD-1', createdAt: '2026-09-15' },
      { id: 'order-2', orderId: 'ORD-2', createdAt: '2026-09-16' },
    ];
    const tasks = [
      { ...task, id: 'first', order: { id: 'order-1' }, approvedAt: '2026-09-15', completedAt: '2026-09-20', milestones: [] },
      { ...task, id: 'sibling', title: 'Second package', order: { id: 'order-1' }, approvedAt: null, completedAt: '2026-09-20', milestones: [] },
      { ...task, id: 'second', order: { id: 'order-2' }, approvedAt: '2026-09-17', completedAt: '2026-09-22', milestones: [] },
    ];
    const graph = view.buildWorkflowGraph({ tasks, orders }, '2026-09-15', '2026-09-24');
    const color = sequence => graph.series.find(line => line.task.sequence === sequence).color;
    assert.notEqual(color(1), color(2));
    const html = render(calendar.default, { tasks, orders, rangeStart: '2026-09-15', rangeEnd: '2026-09-24' });
    const cells = html.split('aria-label="Calendar dates"')[1].split('class="calendar-ranges"')[0];
    assert.doesNotMatch(cells, /pkg|Campaign launch|Second package/);
    const chips = day => [...cells.split(`data-calendar-numbers="${day}"`)[1].split('</button>')[0]
      .matchAll(/data-calendar-order="(\d+)"[^>]*background:(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]);
    // A numbered badge only appears on the date the order was actually created, so an
    // ongoing journey is never counted as a newly placed package on a later date.
    assert.deepEqual(chips('2026-09-15'), [['1', color(1)]]);
    assert.deepEqual(chips('2026-09-16'), [['2', color(2)]]);
    assert.deepEqual(chips('2026-09-20'), []);
    assert.deepEqual(chips('2026-09-22'), []);
    assert.deepEqual(chips('2026-09-24'), []);
    assert.match(cells.split('data-calendar-numbers="2026-09-24"')[1].split('</button>')[0], /—/);
    // Continuation days carry one colour dot per active journey instead, and the
    // dots stop after each journey's recorded completion date.
    const dots = day => [...cells.split(`data-calendar-active="${day}"`)[1].split('</button>')[0]
      .matchAll(/data-calendar-active-dot="(#[0-9a-f]{6})"/g)].map(match => match[1]);
    assert.deepEqual(dots('2026-09-15'), []);
    assert.deepEqual(dots('2026-09-16'), [color(1)]);
    assert.deepEqual(dots('2026-09-19'), [color(1), color(2)]);
    assert.deepEqual(dots('2026-09-20'), [color(1), color(2)]);
    assert.deepEqual(dots('2026-09-21'), [color(2)]);
    assert.deepEqual(dots('2026-09-22'), [color(2)]);
    assert.deepEqual(dots('2026-09-23'), []);
    assert.deepEqual(dots('2026-09-24'), []);
    assert.match(cells.split('data-calendar-day="2026-09-19"')[1].split('</button>')[0], /0 packages placed, 2 journeys active/);
    // The same order keeps one number and one color across both views and filters.
    for (const [start, end] of [['2026-09-15', '2026-09-24'], ['2026-09-16', '2026-09-22']]) {
      const narrowed = view.buildWorkflowGraph({ tasks, orders }, start, end);
      for (const range of calendar.buildCalendarRanges(tasks, start, end, orders).tasks) {
        const line = narrowed.series.find(item => item.task.id === range.task.id);
        assert.equal(range.task.sequence, line.task.sequence);
        assert.equal(range.color, line.color);
      }
    }
  });

  test(`${app}: 25 order colors are deterministic, shared by sibling tasks and synchronized with Calendar`, () => {
    const orders = Array.from({ length: 25 }, (_, i) => ({ id: `color-order-${i}`, createdAt: '2026-09-15T10:30:00Z' }));
    const tasks = orders.map((order, i) => ({ ...task, id: `color-task-${i}`, order }));
    tasks.push({ ...tasks[0], id: 'sibling-task', title: 'Second package' });
    const before = plain(tasks);
    const graph = view.buildWorkflowGraph({ tasks, orders }, '2026-09-01', '2026-09-30');
    const byId = new Map(graph.series.map(line => [line.task.id, line]));
    assert.equal(new Set(graph.series.map(line => line.color)).size, 25);
    assert.equal(byId.get('color-task-0').color, byId.get('sibling-task').color);
    const reversed = view.buildWorkflowGraph({ tasks: [...tasks].reverse(), orders: [...orders].reverse() }, '2026-09-01', '2026-09-30');
    const narrowed = view.buildWorkflowGraph({ tasks, orders }, '2026-09-17', '2026-09-20', 235);
    for (const line of [...reversed.series, ...narrowed.series]) assert.equal(line.color, byId.get(line.task.id).color);
    assert.ok(narrowed.numbered.every(item => item.sequence === null));
    for (const [start, end] of [['2026-09-01', '2026-09-30'], ['2026-09-17', '2026-09-20']]) {
      for (const range of calendar.buildCalendarRanges(tasks, start, end, orders).tasks) {
        assert.equal(range.color, byId.get(range.task.id).color);
        assert.equal(range.start, '2026-09-15');
        assert.equal(range.end, '2026-09-24');
        assert.equal(range.visibleStart, start > range.start ? start : range.start);
        assert.equal(range.visibleEnd, end < range.end ? end : range.end);
      }
    }
    const colors = view.buildJourneyColors([], Array.from({ length: 50 }, (_, i) => ({ id: `overflow-${i}` })));
    assert.equal(new Set(colors.values()).size, 25);
    assert.ok([...colors.values()].every(color => [...colors.values()].filter(value => value === color).length === 2));
    for (const width of [220, 235, 290]) {
      const mobile = view.buildWorkflowGraph({ tasks, orders }, '2026-09-01', '2026-09-30', width);
      // All five stages are populated now, so the honest bound is the header plus one
      // full lane stack per band; anything beyond that would be a layout blow-up.
      const lanes = mobile.series.filter(line => line.inRange);
      const stack = Math.max(0, ...lanes.map(line => line.track.offset + line.trackHeight));
      assert.ok(mobile.height <= 48 + mobile.bands.length * (stack + 64), `height ${mobile.height} exceeds one lane stack per band`);
      assert.equal(mobile.bands.length, 5);
    }
    assert.deepEqual(tasks, before);
  });

  test(`${app}: every rendered dot and endpoint uses its order line color, never a stage color`, () => {
    const tasks = [task, { ...task, id: 'other-task', order: { id: 'other-order', createdAt: '2026-09-15' } }];
    const model = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24');
    const html = render(view.default, { timeline: { tasks }, startDate: '2026-09-15', endDate: '2026-09-24' });
    const paths = [...html.matchAll(/<path\b[^>]*data-workflow-path="true"[^>]*stroke="([^"]+)"/g)];
    assert.deepEqual(paths.map(match => match[1]), plain(model.series.map(line => line.color)));
    for (const line of model.series) {
      const group = html.split(`data-journey-task="${line.task.id}"`)[1].split('data-journey-task=')[0].split('</svg>')[0];
      const circles = [...group.matchAll(/<circle\b[^>]*r="[56]"[^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"/g)];
      // UI-only two-dot rule: the permanent Order Placed start plus the current
      // endpoint. Intermediate daily coordinates keep their tap targets, labels and
      // connector geometry, but no visible dot of their own.
      const inRange = line.points.filter(point => point.day >= '2026-09-15' && point.day <= '2026-09-24');
      const startAnchor = [line.anchor, line.origin].find(marker => marker && marker.day >= '2026-09-15' && marker.day <= '2026-09-24') || null;
      const dots = new Set([startAnchor || inRange[0], inRange[inRange.length - 1]].filter(Boolean));
      assert.equal(circles.length, dots.size);
      assert.ok(circles.length <= 2, 'never more than one start dot and one endpoint dot per journey');
      assert.ok(circles.every(match => match[2] === line.color && match[1] === line.color));
      const texts = [...group.matchAll(/<foreignObject\b[^>]*>([\s\S]*?)<\/foreignObject>/g)];
      assert.equal(texts.length, 2);
      for (const text of texts) {
        assert.ok(text[0].includes(`color:${line.color}`));
        assert.doesNotMatch(text[1], /Draft|Review|Delivery/);
      }
    }
  });

  test(`${app}: a journey shows only its Order Placed start dot and its current endpoint dot`, () => {
    // UI-only presentation rule. The daily data model, stage rows and connector
    // geometry are untouched: the intermediate coordinates are still generated and
    // still tappable, they simply no longer draw a dot.
    const active = { ...task, id: 'ui-active', title: 'Active journey', status: 'IN_PROGRESS', progress: 10,
      order: { id: 'ui-active-order', orderId: 'UI-A', createdAt: '2026-11-15T09:00:00Z' },
      approvedAt: '2026-11-15T12:00:00Z', startDate: '2026-11-16', completedAt: null, deadline: '2026-11-30',
      milestones: [{ name: 'Draft', percentage: 10, reached: true, reachedAt: '2026-11-17T09:00:00Z' }] };
    const done = { ...task, id: 'ui-done', title: 'Completed journey', status: 'COMPLETED', progress: 100,
      order: { id: 'ui-done-order', orderId: 'UI-D', createdAt: '2026-11-15T09:00:00Z' },
      approvedAt: '2026-11-16T09:00:00Z', startDate: '2026-11-16', completedAt: '2026-11-19T09:00:00Z', deadline: '2026-11-30',
      milestones: [{ name: 'Delivery', percentage: 100, reached: true, reachedAt: '2026-11-19T09:00:00Z' }] };
    const polyline = path => {
      let x = 0, y = 0;
      return (path.match(/[MLHV][^MLHV]*/g) || []).map(token => {
        const nums = (token.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (token[0] === 'M' || token[0] === 'L') { x = nums[0]; y = nums[1]; }
        else if (token[0] === 'H') x = nums[0];
        else y = nums[0];
        return { x, y };
      });
    };
    for (const journey of [active, done]) {
      const tasks = [journey];
      const completed = Boolean(journey.completedAt);
      for (const width of [0, 235]) {
        const line = view.buildWorkflowGraph({ tasks }, '2026-11-15', '2026-11-21', width).series[0];
        const last = line.points.at(-1);
        assert.ok(line.points.length >= 5, 'every intermediate daily coordinate is retained');
        assert.equal(last.day, completed ? '2026-11-19' : '2026-11-21',
          completed ? 'the final endpoint sits on the actual completion date and the journey stops' : 'the endpoint advances to the latest reporting date');
        assert.equal(last.row, completed ? 4 : 3);
        const nodes = polyline(line.path);
        assert.ok(nodes.length >= line.points.length, 'the connecting line still runs through every daily coordinate');
        assert.deepEqual(nodes.at(-1), { x: last.x, y: last.y }, 'the line ends exactly on the endpoint dot');
        assert.equal(nodes[0].x, line.points[0].x, 'the line starts on the original Order Placed date');
      }
      const model = view.buildWorkflowGraph({ tasks }, '2026-11-15', '2026-11-21');
      const line = model.series[0];
      const last = line.points.at(-1);
      const html = render(view.default, { timeline: { tasks }, startDate: '2026-11-15', endDate: '2026-11-21' });
      const group = html.split(`data-journey-task="${line.task.id}"`)[1].split('</svg>')[0];
      const circles = [...group.matchAll(/<circle\b[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="5"[^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"[^>]*stroke-width="1.5"/g)];
      assert.equal(circles.length, 2, 'exactly two visible dots per journey');
      assert.ok(circles.every(circle => circle[3] === line.color && circle[4] === line.color), 'both dots keep the journey colour');
      assert.ok(circles.some(circle => +circle[1] === last.x && +circle[2] === last.y), 'one dot is the current endpoint');
      const startCircle = circles.find(circle => !(+circle[1] === last.x && +circle[2] === last.y));
      assert.equal(+startCircle[1], line.points[0].x, 'the start dot never leaves the original Order Placed date');
      assert.ok(+startCircle[2] >= model.bands[0].top && +startCircle[2] <= model.bands[0].top + model.bands[0].height, 'the start dot sits on the Order Placed row');
      const middle = line.points.slice(1, -1);
      assert.ok(middle.length >= 3, 'the journey has intermediate daily coordinates');
      for (const point of middle) {
        assert.ok(!circles.some(circle => +circle[1] === point.x && +circle[2] === point.y), `no visible dot on the intermediate coordinate ${point.day}`);
      }
      assert.equal((group.match(/data-point-target="true"/g) || []).length, line.points.length, 'every daily coordinate keeps its tap target');
      assert.equal((group.match(/data-endpoint-label="start"/g) || []).length, 1, 'the journey number at the start is preserved');
      assert.equal((group.match(/data-endpoint-label="end"/g) || []).length, 1, 'the journey number at the endpoint is preserved');
      assert.equal((group.match(/data-stage-marker="true"/g) || []).length, 0, 'a same-date stage rise adds no extra visible dot');
      assert.equal((group.match(/data-origin-marker="true"/g) || []).length, line.anchor || line.origin ? 1 : 0);
      if (line.anchor) {
        assert.ok(group.includes('data-origin-marker="true" data-stage="ORDER PLACED" data-date="2026-11-15"'),
          'same-date recorded stages keep their line geometry behind one Order Placed start dot');
        assert.ok(!circles.some(circle => +circle[1] === line.points[0].x && +circle[2] === line.points[0].y),
          'the lifted same-date coordinate itself draws no dot');
      }
      if (!completed) {
        const earlier = view.buildWorkflowGraph({ tasks }, '2026-11-15', '2026-11-18').series[0];
        assert.equal(earlier.points.at(-1).day, '2026-11-18', 'the endpoint dot moves forward as the reporting date advances');
        assert.ok(earlier.points.at(-1).day < last.day);
      }
    }
  });

  test(`${app}: order timestamp begins a chronological journey without planned-date substitutions`, () => {
    const dated = { ...task, order: { ...task.order, createdAt: '2026-09-15T10:30:45Z' }, milestones: [...task.milestones].reverse() };
    for (const width of [0, 235]) {
      const model = view.buildWorkflowGraph({ tasks: [dated] }, '2026-09-01', '2026-09-30', width);
      const points = model.series[0].points;
      assert.equal(points[0].key, 'order');
      assert.equal(points[0].date, dated.order.createdAt);
      assert.equal(points.at(-1).key, 'completed');
      assert.equal(points.at(-1).date, dated.completedAt);
      assert.equal(points.at(-1).day, '2026-09-24', 'no daily point is drawn after the terminal endpoint');
      for (let i = 1; i < points.length; i++) assert.ok(points[i].day > points[i - 1].day);
      const recorded = points.filter(point => point.date);
      for (let i = 1; i < recorded.length; i++) assert.ok(new Date(recorded[i].date) >= new Date(recorded[i - 1].date));
      assert.ok(points.slice(1, -1).every(point => point.daily === true || point.events.length), 'every drawn day is either a record or a continuation');
      assert.deepEqual(plain(points.filter(point => point.daily).map(point => point.day)),
        ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
      assert.ok(points.filter(point => point.daily).every(point => point.events.length === 0 && point.date === null), 'continuation days carry no fabricated record');
      assert.equal(points.length, 10);
      assert.ok(!points.some(point => point.date === dated.deadline));
      assert.equal(points.filter(point => point.labels.length).length, 2);
      assert.deepEqual(plain(model.numbered.map(item => item.sequence)), [1]);
    }
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

  {
    test(`${app}: one date dot retains every saved record and reflects the stage saved on that date`, () => {
      const busy = { ...task, milestones: Array.from({ length: 20 }, (_, i) => ({ name: `Activity ${i}`, percentage: i * 5, reached: true, reachedAt: `2026-09-17T10:${String(i).padStart(2, '0')}:00Z` })) };
      const before = plain(busy);
      const graph = view.buildWorkflowGraph({ tasks: [busy] }, '2026-09-01', '2026-09-30', 235);
      const line = graph.series[0];
      assert.equal(line.points.length, new Set(line.points.map(point => point.day)).size);
      assert.equal(line.points[0].key, 'order');
      assert.equal(line.points[0].day, busy.order.createdAt);
      assert.deepEqual(plain(line.points.flatMap(point => point.events).map(event => event.key).sort()), plain(view.taskJourneyEvents(busy).filter(event => view.journeyDay(event.date)).map(event => event.key).sort()));
      const point = line.points.find(point => point.day === '2026-09-17');
      assert.equal(point.events.filter(event => event.key.startsWith('milestone:')).length, 20);
      const detail = render(view.JourneyDateEvents, { point });
      for (let i = 0; i < 20; i++) assert.ok(detail.includes(`Activity ${i}`));
      assert.match(detail, /95%/);
      assert.match(detail, /10:19:00 AM UTC/);
      const html = render(view.default, { timeline: { tasks: [busy] }, startDate: '2026-09-01', endDate: '2026-09-30' });
      assert.equal((html.match(/data-date="2026-09-17"/g) || []).length, 1);
      assert.doesNotMatch(html.split('aria-label="Task journeys by actual date and workflow stage"')[1].split('</svg>')[0], /Activity \d|Draft|Review/);
      const sameDay = { ...busy, order: { ...busy.order, createdAt: '2026-09-17T00:00:01Z' }, approvedAt: '2026-09-17', completedAt: '2026-09-17T23:00:00Z' };
      const one = view.buildWorkflowGraph({ tasks: [sameDay] }, '2026-09-17', '2026-09-17', 235).series[0];
      assert.equal(one.points.length, 1);
      // A recorded completion on the order's own date is the furthest recorded
      // stage, and the saved 100% progress agrees with it.
      assert.equal(one.points[0].row, 4);
      assert.equal(one.points[0].date, sameDay.order.createdAt);
      assert.ok(one.points[0].events.some(event => event.key === 'completed'));
      assert.equal(one.points.filter(point => point.labels.length).length, 1);
      // Same-date evidence: the order, its approval and dated 95% milestone records
      // all fall on one date. The dot sits on the furthest recorded stage while the
      // earlier stages keep same-date markers, so no second date is invented and an
      // undated latest progress value never lowers the recorded evidence.
      const anchored = view.buildWorkflowGraph({ tasks: [{ ...sameDay, progress: 0, completedAt: null }] }, '2026-09-17', '2026-09-17', 235).series[0];
      assert.equal(anchored.points.length, 1);
      assert.equal(anchored.points[0].row, 3);
      assert.equal(anchored.points[0].isOrder, true);
      assert.equal(anchored.points[0].fromProgress, undefined);
      assert.deepEqual(plain(anchored.points[0].rises), [0, 1]);
      assert.deepEqual(plain(anchored.markers.map(marker => marker.row)), [0, 1]);
      assert.deepEqual(plain(anchored.markers.map(marker => marker.day)), ['2026-09-17', '2026-09-17']);
      assert.equal(anchored.anchor.row, 0);
      assert.deepEqual(busy, before);
    });

    test(`${app}: unknown order dates remain missing and dated stages never zig-zag`, () => {
      const unknown = { ...task, order: null };
      const line = view.buildWorkflowGraph({ tasks: [unknown] }, '2026-09-01', '2026-09-30', 235).series[0];
      assert.ok(line.missing.some(event => event.key === 'order'));
      assert.ok(line.points.every(point => point.key !== 'order' && !point.isOrder));
      assert.equal(line.points[0].endpoint, false);
      assert.equal(view.taskJourneyRange(unknown).start, null);
      const dated = { ...task, milestones: [
        { name: 'Start evidence', percentage: 1, reached: true, reachedAt: '2026-09-17' },
        { name: 'Activity', percentage: 10, reached: true, reachedAt: '2026-09-18' },
        { name: 'Halfway evidence', percentage: 50, reached: true, reachedAt: '2026-09-19' },
      ] };
      for (const width of [0, 220, 235, 290]) {
        const graph = view.buildWorkflowGraph({ tasks: [dated] }, '2026-09-01', '2026-09-30', width);
        const points = graph.series[0].points;
        assert.equal(points[0].row, 0);
        for (let i = 1; i < points.length; i++) {
          assert.ok(points[i].day > points[i - 1].day);
          assert.ok(points[i].x > points[i - 1].x);
          assert.ok(points[i].y <= points[i - 1].y);
        }
        // A saved 50% milestone is dated In Process evidence, so the stage rises on
        // the recorded date and every later day continues at that same stage.
        assert.equal(points.find(point => point.day === '2026-09-19').events[0].row, 3);
        assert.equal(points.find(point => point.day === '2026-09-19').supporting, false);
        assert.deepEqual(plain(points.map(point => [point.day, point.row])), [
          ['2026-09-15', 0], ['2026-09-16', 1], ['2026-09-17', 2], ['2026-09-18', 3], ['2026-09-19', 3],
          ['2026-09-20', 3], ['2026-09-21', 3], ['2026-09-22', 3], ['2026-09-23', 3], ['2026-09-24', 4]]);
        assert.ok(points.every(point => point.day !== dated.deadline));
      }
    });

    test(`${app}: 360–430px layouts keep compact dates and collision-free targets/labels`, () => {
      for (const width of [220, 235, 290]) for (const total of [1, 8, 25]) {
        const tasks = Array.from({ length: total }, (_, i) => ({ ...task, id: `dense-${i}`, title: `Package ${i} with a very long client-provided title that must not expand the graph`,
          milestones: Array.from({ length: 60 }, (_, j) => ({ name: `Milestone ${j}`, percentage: j + 1, reached: true, reachedAt: j % 2 ? '2026-09-17' : '2026-09-18' })) }));
        const model = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24', width);
        const denseLanes = model.series.filter(line => line.inRange);
        const denseStack = Math.max(0, ...denseLanes.map(line => line.track.offset + line.trackHeight));
        assert.ok(model.height <= 48 + model.bands.length * (denseStack + 64), `height ${model.height} exceeds one lane stack per band`);
        assert.ok(model.width <= width * 1.4, 'dense dates must not widen the mobile axis');
        if (total === 1) assert.ok(model.height < 360);
        assert.equal(model.rows.length, 5);
        for (let row = 1; row < 5; row++) assert.ok(model.rows[row] < model.rows[row - 1]);
        const rectangles = [];
        for (const line of model.series) {
          // One point per calendar day from the order date to the recorded completion.
          assert.equal(line.points.length, 10);
          assert.equal(line.points.filter(point => point.labels.length).length, 2);
          assert.equal((line.path.match(/M/g) || []).length, 1);
          for (const point of line.points) {
            const column = model.columns.find(column => column.day === point.day);
            assert.equal(point.x, column.left + column.width / 2);
            assert.ok(point.x - 12 >= column.left && point.x + 12 <= column.left + column.width);
            rectangles.push({ left: point.x - 12, right: point.x + 12, top: point.y - 12, bottom: point.y + 12 });
            for (const label of point.labels) {
              assert.equal(label.lines.length, 1);
              const box = { left: label.x - 4, right: label.x + label.width + 4, top: label.y - 12, bottom: label.y + 4 };
              assert.ok(box.left >= 0 && box.right <= model.width);
              assert.ok(box.top >= model.bands[point.row].top && box.bottom <= model.bands[point.row].top + model.bands[point.row].height);
              rectangles.push(box);
            }
          }
        }
        rectangles.forEach((a, i) => rectangles.slice(i + 1).forEach(b => assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)));
      }
      const short = { ...task, approvedAt: null, milestones: [], completedAt: '2026-09-16' };
      for (const end of ['2026-09-15', '2026-09-16']) assert.equal(view.buildWorkflowGraph({ tasks: [short] }, '2026-09-15', end, 235).width, 235);
      const mobile = load('WorkflowJourney', { react: { ...React, useState: initial => React.useState(initial === 0 ? 235 : initial) } });
      const html = render(mobile.default, { timeline: { tasks: [task] }, startDate: '2026-09-15', endDate: '2026-09-24' });
      assert.match(html, /aria-label="Workflow stage axis" width="72"/);
      assert.match(html, /data-point-target="true"[^>]*width="24" height="24"/);
      assert.match(html, /max-height:560px/);
      assert.match(html, /overflow-y:auto/);
      assert.match(html, /Scheduled<tspan[^>]*>\(0%\)/);
      assert.match(html, /Started<tspan[^>]*>\(1%–4%\)/);
      assert.match(html, /In Process<tspan[^>]*>\(5%–99%\)/);
      assert.doesNotMatch(html, /Task details and unavailable dates/);
      assert.match(html, /<details[^>]*><summary[^>]*>Packages/);
      const panel = render(view.JourneyDetail, { detail: { task, point: { day: '2026-09-15', events: [] } } });
      assert.match(panel, /84px \+ env\(safe-area-inset-bottom/);
    });

    test(`${app}: compact Calendar dates aggregate packages without inventing daily activity`, () => {
      const tasks = [task, { ...task, id: 'sibling' }, { ...task, id: 'unknown', order: null }];
      const model = calendar.buildCalendarRanges(tasks, '2026-09-15', '2026-09-24');
      const graph = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24');
      const days = calendar.buildCalendarDays(model, graph.series, '2026-09-15');
      assert.equal(days.length, 10);
      assert.equal(days.find(day => day.day === '2026-09-17').journeys.length, 3);
      // Every day of an unfinished journey is a continuation day: the journey is
      // present and active, but never re-counted as a newly placed package.
      const ongoing = days.find(day => day.day === '2026-09-19');
      assert.equal(ongoing.journeys.length, 3);
      assert.equal(ongoing.placed.length, 0);
      assert.equal(ongoing.active.length, 3);
      assert.ok(ongoing.journeys.every(item => item.point && item.point.daily === true));
      assert.deepEqual(plain(days.find(day => day.day === '2026-09-15').placed.map(item => item.line.task.id).sort()), ['sibling', 'task-1']);
      assert.deepEqual(plain(days.find(day => day.day === '2026-09-24').journeys.filter(item => item.completedHere).map(item => item.line.task.id).sort()), ['sibling', 'task-1', 'unknown'],
        'the recorded completion is reported on its own date');
      const html = render(calendar.default, { tasks, rangeStart: '2026-09-15', rangeEnd: '2026-09-24' });
      assert.equal((html.match(/data-calendar-day=/g) || []).length, 10);
      const cells = html.split('aria-label="Calendar dates"')[1].split('class="calendar-ranges"')[0];
      assert.doesNotMatch(cells, /Campaign launch|Draft|Review/);
      assert.match(html, /repeat\(7, minmax\(0, 1fr\)\)/);
      assert.match(html, /min-height:62px/);
      assert.match(html, /data-range-start="2026-09-15" data-range-end="2026-09-24"/);
    });
  }

  test(`${app}: saved inputs include usable links, custom references and content, without unrelated data`, () => {
    const data = { clientInputs: [{ link: 'https://example.com/video', customInput: '+1 555 123 / reference' }],
      customInputLabel: 'Contact / prompt', clientContentText: '<script>instructions</script>',
      clientContentLinks: ['https://example.com/content', 'javascript:alert(1)'], clientDriveLink: 'https://example.com/drive',
      clientUploadFolderLink: 'https://example.com/uploads', commission: 'PRIVATE_ACCOUNTING',
      items: [{ planTitle: 'Unrelated order package', inputs: [{ link: 'https://example.com/unrelated' }] }] };
    const html = render(view.JourneyInputs, { data });
    for (const text of ['https://example.com/video', 'Contact / prompt', '+1 555 123', 'https://example.com/content', 'https://example.com/drive', 'https://example.com/uploads']) assert.ok(html.includes(text));
    assert.equal((html.match(/<a /g) || []).length, 4);
    assert.match(html, /&lt;script&gt;instructions/);
    assert.doesNotMatch(html, /href="javascript:|<script>|PRIVATE_ACCOUNTING|Unrelated order package|example.com\/unrelated/);
    assert.match(render(view.JourneyInputs, { data: { items: [{ planTitle: 'Ordered package', inputs: data.clientInputs, planSnapshot: { customInputLabel: 'Reference' } }] }, orderOnly: true }), /Ordered package · Video\/content link/);
    assert.match(render(view.JourneyInputs, { data: {} }), /No saved client inputs/);
  });

  test(`${app}: endpoint clicks load only the exact task; milestones, cancellation and range changes stay local`, async () => {
    const slots = [];
    let cursor = 0;
    let effects = [];
    const changed = (old, deps) => !old || deps.some((dep, i) => dep !== old[i]);
    const hooks = { ...React,
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
      useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
      useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
      useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
    };
    const interactiveView = load('WorkflowJourney', { react: hooks });
    const component = interactiveView.default;
    const calls = [];
    let props = { timeline: { tasks: [task] }, startDate: '2026-09-01', endDate: '2026-09-30',
      loadInputs: (selected, signal) => new Promise((resolve, reject) => calls.push({ selected, signal, resolve, reject })) };
    const draw = () => { cursor = 0; const tree = component(props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; };
    const find = (tree, predicate) => {
      if (!tree || typeof tree !== 'object') return null;
      if (predicate(tree)) return tree;
      if (tree.type === interactiveView.JourneyDetail) return find(tree.type(tree.props), predicate);
      for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; }
      return null;
    };
    const event = key => find(draw(), node => key.startsWith('milestone:') ? node.props?.['data-date'] === '2026-09-17' : node.props?.['data-event'] === key);
    const detail = () => find(draw(), node => node.props?.['aria-label'] === 'Journey point details');
    draw();
    assert.equal(calls.length, 0);
    await event('milestone:0').props.onClick();
    assert.match(renderToStaticMarkup(detail()), /Draft/);
    {
      assert.match(renderToStaticMarkup(detail()), /Review/);
      assert.match(renderToStaticMarkup(detail()), /60%/);
      assert.doesNotMatch(renderToStaticMarkup(detail()), /Delivery/);
    }
    assert.doesNotMatch(renderToStaticMarkup(detail()), /12:00:00/);
    assert.equal(calls.length, 0);
    const pending = event('order').props.onClick();
    assert.equal(calls[0].selected.id, task.id);
    assert.match(renderToStaticMarkup(detail()), /Loading saved client inputs/);
    await event('milestone:1').props.onClick();
    assert.match(renderToStaticMarkup(detail()), /11:59:59 PM.*UTC/);
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve({ clientInputs: [{ link: 'https://example.com/stale' }] });
    await pending;
    assert.doesNotMatch(renderToStaticMarkup(detail()), /example.com\/stale/);
    event('completed').props.onKeyDown({ key: 'Enter', preventDefault() {} });
    assert.equal(calls[1].selected.id, task.id);
    calls[1].resolve({ clientInputs: [{ link: 'https://example.com/exact-task' }] });
    await new Promise(setImmediate);
    assert.match(renderToStaticMarkup(detail()), /href="https:\/\/example.com\/exact-task"/);
    props = { ...props, timeline: { tasks: [] } };
    assert.equal(detail(), null);
    assert.equal(calls[1].signal.aborted, true);
    props = { ...props, timeline: { tasks: [task] } };
    const denied = event('order').props.onClick();
    calls[2].reject({ response: { status: 403 } });
    await denied;
    assert.match(renderToStaticMarkup(detail()), /You do not have access/);
    assert.equal(calls.length, 3); // No whole-order fallback after a task denial.
    detail().props.onKeyDown({ key: 'Escape' });
    assert.equal(detail(), null);
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
    // An unfinished journey stays active up to the reporting day; the selected window
    // still clips what is drawn, and saved 100% makes it terminal instead.
    const openRange = calendar.buildCalendarRanges([notStarted], '2026-09-15', '2026-09-24').tasks[0];
    assert.equal(openRange.latestEvidence, '2026-09-16');
    assert.equal(openRange.end, view.journeyDay(new Date()));
    assert.equal(openRange.endLabel, 'Active today');
    assert.equal(openRange.visibleEnd, '2026-09-24');
    assert.equal(view.taskJourneyRange({ ...notStarted, progress: 100 }).terminal, true);
    assert.equal(calendar.buildCalendarRanges([{ ...notStarted, progress: 100 }], '2026-09-15', '2026-09-24').tasks[0].end, '2026-09-16');
    assert.equal(calendar.buildCalendarRanges([{ ...notStarted, order: null }], '2026-09-15', '2026-09-24').undated.length, 1);
  });

  test(`${app}: five core stages, same-date recorded transitions and no milestone stage`, () => {
    assert.deepEqual(plain(view.workflowRows), ['ORDER PLACED', 'SCHEDULED (0%)', 'STARTED (1%–4%)', 'IN PROCESS (5%–99%)', 'COMPLETED (100%)']);
    const model = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-01', '2026-09-30');
    assert.equal(model.firstActual, task.order.createdAt);
    assert.equal(model.series[0].points.at(-1).row, 4);
    const firstProgress = '2026-09-17T12:00:00Z';
    const points = view.journeyDatePoints([
      { key: 'started', row: 2, date: firstProgress },
      { key: 'process', row: 3, date: firstProgress },
    ]);
    assert.equal(points.length, 1);
    assert.equal(points[0].events.length, 2);
    assert.equal(points[0].row, 3);
    const clipped = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-18', '2026-09-20');
    assert.ok(clipped.series[0].path.length);
    assert.ok(clipped.series[0].points.every(point => !point.labels.length));
    assert.equal(view.buildWorkflowGraph(null, 'bad', '2026-09-30').count, 0);
    const taskWithoutDate = { ...task, order: { id: task.order.id } };
    const resolved = view.buildWorkflowGraph({ tasks: [taskWithoutDate], orders: [task.order] }, '2026-09-01', '2026-09-30');
    assert.equal(resolved.series[0].points[0].date, task.order.createdAt);
    assert.equal(taskWithoutDate.order.createdAt, undefined);
  });

  test(`${app}: an unfinished journey advances one calendar day at a time and stops at 100%`, () => {
    const placed = '2026-09-15T09:00:00Z';
    const order = { id: 'order-same', orderId: 'ORD-SAME', createdAt: placed };
    const base = { ...task, id: 'same-day', progress: 0, completedAt: null, approvedAt: null, milestones: [], order };
    const orders = [order];
    const window = ['2026-09-15', '2026-09-24'];
    const days10 = Array.from({ length: 10 }, (_, i) => `2026-09-${15 + i}`);
    const untouched = view.buildWorkflowGraph({ tasks: [base], orders }, ...window).series[0];
    assert.deepEqual(plain([0, 1, 4, 5, 99, 100, null, undefined].map(view.stageRow)), [0, 2, 2, 3, 3, 4, 0, 0]);
    // HORIZONTAL MOVEMENT: one point per active journey per calendar day. The extra
    // days carry no events and no timestamp, so nothing is fabricated.
    assert.deepEqual(plain(untouched.points.map(point => point.day)), days10);
    assert.equal(untouched.points[0].date, placed);
    assert.equal(untouched.points[0].isOrder, true);
    assert.ok(untouched.points.slice(1).every(point => point.daily === true && point.date === null && point.events.length === 0));
    // VERTICAL MOVEMENT: the recorded order date keeps its own stage, and the latest
    // saved progress is the present stage on the reporting date only.
    for (const [progress, row] of [[0, 0], [1, 2], [4, 2], [5, 3], [10, 3], [99, 3], [100, 4]]) {
      const terminal = progress === 100;
      const line = view.buildWorkflowGraph({ tasks: [{ ...base, progress }], orders }, ...window).series[0];
      assert.equal(line.points.length, terminal ? 1 : 10, 'saved 100% is terminal, so no later daily point is drawn');
      const first = line.points[0];
      assert.equal(first.day, '2026-09-15');
      assert.equal(first.date, placed, 'the original Order Placed timestamp is unchanged');
      assert.equal(first.isOrder, true);
      assert.equal(first.x, untouched.points[0].x, 'the journey never shifts horizontally');
      assert.equal(line.task.sequence, 1, 'the chronological journey number is unchanged');
      assert.equal(line.color, untouched.color, 'the journey colour is unchanged');
      assert.deepEqual(plain(first.labels.map(label => [label.kind, label.lines.join(' ')])), [['start', '1']]);
      const last = line.points.at(-1);
      assert.equal(last.row, row, 'the present stage sits on the reporting date');
      assert.equal(last.fromProgress, row > 0 ? true : undefined);
      if (!terminal) {
        assert.equal(first.row, 0, 'undated progress never moves the order date off Order Placed');
        assert.equal(last.day, '2026-09-24');
        assert.deepEqual(plain(last.labels.map(label => [label.kind, label.lines.join(' ')])), [['end', '1']]);
      }
    }
    const html = render(view.default, { timeline: { tasks: [{ ...base, progress: 10 }], orders }, startDate: '2026-09-15', endDate: '2026-09-24' });
    assert.match(html, /data-stage="ORDER PLACED" data-date="2026-09-15"/);
    assert.match(html, /data-daily="true" data-stage="IN PROCESS \(5%–99%\)" data-date="2026-09-24"/);
    assert.match(html, /10%.*In Process/);
    assert.doesNotMatch(html, /data-stage="SUPPORTING ACTIVITY"/);
    // A journey spanning several dates keeps every earlier dot where its recorded
    // evidence put it; only the reporting date carries the present stage.
    const spanning = { ...base, progress: 10, approvedAt: '2026-09-16',
      milestones: [{ name: 'Draft', percentage: 10, reached: true, reachedAt: '2026-09-18' }] };
    const span = view.buildWorkflowGraph({ tasks: [spanning], orders }, ...window).series[0];
    assert.deepEqual(plain(span.points.map(point => [point.day, point.row])), [
      ['2026-09-15', 0], ['2026-09-16', 1], ['2026-09-17', 1], ['2026-09-18', 3], ['2026-09-19', 3],
      ['2026-09-20', 3], ['2026-09-21', 3], ['2026-09-22', 3], ['2026-09-23', 3], ['2026-09-24', 3]]);
    for (let i = 1; i < span.points.length; i++) {
      assert.ok(span.points[i].y <= span.points[i - 1].y, 'dated stages never zig-zag downward');
      assert.ok(span.points[i].x > span.points[i - 1].x);
    }
    assert.equal(span.points.filter(point => point.fromProgress).length, 0, 'a dated 10% record already proves In Process');
    // A recorded completion is never lowered by a smaller saved progress value, and
    // no daily point follows it.
    const done = view.buildWorkflowGraph({ tasks: [{ ...base, progress: 60, completedAt: '2026-09-20' }], orders }, ...window).series[0];
    assert.deepEqual(plain(done.points.map(point => [point.day, point.row])), [
      ['2026-09-15', 0], ['2026-09-16', 0], ['2026-09-17', 0], ['2026-09-18', 0], ['2026-09-19', 0], ['2026-09-20', 4]]);
    assert.equal(done.points.at(-1).fromProgress, undefined);
    // Order-only journeys carry no task progress, so their rows stay as recorded and
    // they continue daily at the last recorded stage.
    const orderOnly = view.buildWorkflowGraph({ tasks: [], orders: [{ ...order, orderStatus: 'APPROVED', approvedAt: '2026-09-16' }] }, ...window);
    assert.deepEqual(plain(orderOnly.series[0].points.map(point => point.row)), [0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    // Calendar bounds come from recorded dates plus the reporting day, so a progress
    // change can never move a range end, and the mobile layout keeps its five bands.
    assert.deepEqual(plain(view.taskJourneyRange({ ...base, progress: 0 })), plain(view.taskJourneyRange({ ...base, progress: 10 })));
    assert.equal(calendar.buildCalendarRanges([{ ...base, progress: 10 }], ...window, orders).tasks[0].visibleEnd, '2026-09-24');
    for (const width of [0, 206, 235, 290]) {
      const mobile = view.buildWorkflowGraph({ tasks: [{ ...base, progress: 10 }], orders }, ...window, width);
      const point = mobile.series[0].points.at(-1);
      assert.equal(mobile.bands.length, 5);
      assert.equal(mobile.rows.length, 5);
      assert.equal(point.row, 3);
      assert.ok(point.y >= mobile.bands[3].top && point.y <= mobile.bands[3].top + mobile.bands[3].height);
      // A multi-day journey draws its own recorded dots, so it needs no origin anchor;
      // the connector still rises onto the present stage and terminates on the dot.
      assert.equal(mobile.series[0].origin, null);
      const lastToken = mobile.series[0].path.match(/[MLHV]-?[\d.]+(?:,-?[\d.]+)?/g).at(-1);
      assert.ok([`V${point.y}`, `H${point.x}`, `L${point.x},${point.y}`].includes(lastToken), 'the connector terminates on its dot');
    }
    assert.deepEqual(plain(base), plain({ ...task, id: 'same-day', progress: 0, completedAt: null, approvedAt: null, milestones: [], order }));
  });

  test(`${app}: the required daily journey model holds on the live reporting day`, () => {
    // Every date is derived from the actual reporting day, so these assertions stay
    // true whenever the suite runs and never hard-code a "today".
    const reporting = view.journeyDay(new Date());
    const shift = offset => new Date(new Date(`${reporting}T00:00:00Z`).getTime() + offset * 86400000).toISOString().slice(0, 10);
    const [d2, d1, d0] = [shift(-2), shift(-1), reporting];
    const window = [d2, d0];
    const rows = line => plain(line.points.map(point => [point.day, point.row]));
    const journey = (id, extra = {}, orderExtra = {}) => ({ ...task, progress: 0, approvedAt: null, milestones: [], completedAt: null,
      ...extra, id, title: `Package ${id}`,
      order: { id: `order-${id}`, orderId: `ORD-${id}`, createdAt: `${d2}T09:00:00Z`, ...orderExtra } });

    // 1. An order placed yesterday that is still unapproved today keeps advancing at
    //    Order Placed, because no approval or progress evidence exists yet.
    const pending = { id: 'order-pending', orderId: 'ORD-PENDING', createdAt: `${d1}T09:00:00Z` };
    const unapproved = view.buildWorkflowGraph({ tasks: [], orders: [pending] }, d1, d0).series[0];
    assert.deepEqual(rows(unapproved), [[d1, 0], [d0, 0]]);
    assert.equal(unapproved.points.at(-1).daily, true, 'the journey continues to the reporting day without a new record');
    assert.deepEqual(plain(view.taskJourneyRange(journey('pending-range', {}, { createdAt: pending.createdAt, id: pending.id, orderId: pending.orderId }))),
      plain({ start: d1, end: d0, completed: false, terminal: false, active: true, latestEvidence: d1,
        endLabel: 'Active today', missingOrder: false }));

    // 2. Approved at 0% yesterday, 10% recorded yesterday, unchanged today: the stage
    //    rises on the recorded date and today continues at that same saved stage.
    const approved = journey('approved', { progress: 10, approvedAt: `${d1}T10:00:00Z`,
      milestones: [{ name: 'Work Started', percentage: 10, reached: true, reachedAt: `${d1}T11:00:00Z` }] },
    { approvedAt: `${d1}T10:00:00Z` });
    const second = view.buildWorkflowGraph({ tasks: [approved] }, ...window).series[0];
    assert.deepEqual(rows(second), [[d2, 0], [d1, 3], [d0, 3]]);
    assert.deepEqual(plain(second.points[1].rises), [1], 'the recorded approval keeps its own marker on its own date');
    assert.deepEqual(plain(second.markers.map(marker => [marker.day, marker.row])), [[d1, 1]]);
    assert.equal(second.points.at(-1).daily, true);
    assert.equal(second.points.at(-1).events.length, 0, 'a continuation day carries no fabricated record');
    assert.deepEqual(plain(view.taskJourneyRange(approved)),
      plain({ start: d2, end: d0, completed: false, terminal: false, active: true, latestEvidence: d1,
        endLabel: 'Active today', missingOrder: false }));

    // 3. Same-day placement and approval, then 4% rising to 5%: both recorded stages
    //    share the placement date and the Started→In Process rise happens on its date.
    const threshold = journey('threshold', { progress: 5, approvedAt: `${d2}T10:00:00Z`,
      milestones: [{ name: 'Almost started', percentage: 4, reached: true, reachedAt: `${d2}T11:00:00Z` },
        { name: 'Work Started', percentage: 5, reached: true, reachedAt: `${d1}T11:00:00Z` }] },
    { approvedAt: `${d2}T10:00:00Z` });
    const third = view.buildWorkflowGraph({ tasks: [threshold] }, ...window).series[0];
    assert.deepEqual(rows(third), [[d2, 2], [d1, 3], [d0, 3]]);
    assert.equal(third.points.length, new Set(third.points.map(point => point.day)).size, 'no second date is invented');
    assert.deepEqual(plain(third.markers.map(marker => [marker.day, marker.row])), [[d2, 0], [d2, 1]]);
    assert.equal(third.anchor.row, 0, 'the connector still starts on the recorded Order Placed row');

    // 4. 99% to 100%: the terminal endpoint sits on the actual completion date.
    const closing = journey('closing', { progress: 100, approvedAt: `${d2}T10:00:00Z`,
      milestones: [{ name: 'Almost ready', percentage: 99, reached: true, reachedAt: `${d1}T11:00:00Z` },
        { name: 'Delivered', percentage: 100, reached: true, reachedAt: `${d0}T09:00:00Z` }] },
    { approvedAt: `${d2}T10:00:00Z` });
    assert.deepEqual(rows(view.buildWorkflowGraph({ tasks: [closing] }, ...window).series[0]), [[d2, 1], [d1, 3], [d0, 4]]);

    // 5. Completed yesterday: nothing at all is drawn today or later.
    const finished = journey('finished', { progress: 100, approvedAt: `${d2}T10:00:00Z`, completedAt: `${d1}T18:00:00Z`,
      milestones: [{ name: 'Delivered', percentage: 100, reached: true, reachedAt: `${d1}T18:00:00Z` }] },
    { createdAt: `${d2}T08:30:00Z`, approvedAt: `${d2}T10:00:00Z` });
    const fifth = view.buildWorkflowGraph({ tasks: [finished] }, ...window).series[0];
    assert.deepEqual(rows(fifth), [[d2, 1], [d1, 4]]);
    assert.ok(!fifth.points.some(point => point.day >= d0), 'no daily point follows the terminal endpoint');
    const finishedRange = view.taskJourneyRange(finished);
    assert.deepEqual(plain([finishedRange.end, finishedRange.completed, finishedRange.terminal, finishedRange.active, finishedRange.endLabel]),
      [d1, true, true, false, 'Completed']);

    // 6. Four concurrent journeys keep separate colours, numbers and daily points.
    const concurrent = [0, 1, 2, 3].map(i => journey(`concurrent-${i}`,
      { progress: 10 + i, approvedAt: `${d1}T10:0${i}:00Z`,
        milestones: [{ name: 'Work Started', percentage: 10 + i, reached: true, reachedAt: `${d1}T11:0${i}:00Z` }] },
      { createdAt: `${d2}T09:0${i}:00Z`, approvedAt: `${d1}T10:0${i}:00Z` }));
    const four = view.buildWorkflowGraph({ tasks: concurrent }, ...window);
    assert.equal(new Set(four.series.map(line => line.color)).size, 4);
    assert.deepEqual(plain(four.numbered.map(line => [line.id, line.sequence])), plain(concurrent.map((item, i) => [item.id, i + 1])));
    for (const line of four.series) {
      assert.deepEqual(rows(line), [[d2, 0], [d1, 3], [d0, 3]]);
      assert.equal(line.points.at(-1).daily, true);
      const last = line.points.at(-1);
      const lastToken = line.path.match(/[MLHV]-?[\d.]+(?:,-?[\d.]+)?/g).at(-1);
      assert.ok([`V${last.y}`, `H${last.x}`, `L${last.x},${last.y}`].includes(lastToken), 'each connector terminates on its own dot');
    }

    // 7. The Calendar reports continuation without inflating the package count, and
    //    agrees with the Timeline on every journey range.
    const calendarTasks = [...concurrent, finished];
    const model = calendar.buildCalendarRanges(calendarTasks, ...window);
    const graph = view.buildWorkflowGraph({ tasks: calendarTasks }, ...window);
    const days = calendar.buildCalendarDays(model, graph.series, d2);
    for (const line of graph.series) {
      const range = model.tasks.find(item => item.task.id === line.task.id);
      assert.deepEqual(plain([range.start, range.end]), plain([line.points[0].day, line.points.at(-1).day]),
        'Timeline and Calendar use the same journey date range');
    }
    assert.deepEqual(plain(days.map(day => [day.day, day.placed.length, day.active.length])), [[d2, 5, 0], [d1, 0, 5], [d0, 0, 4]]);
    assert.deepEqual(plain(days[2].journeys.map(item => item.line.task.id)), plain(concurrent.map(item => item.id)),
      'a completed journey stops appearing after its final date');
    assert.deepEqual(plain(days[1].journeys.filter(item => item.completedHere).map(item => item.line.task.id)), ['finished']);
    assert.ok(days[1].journeys.every(item => item.point), 'every active journey has a recorded point on each active day');
    const html = render(calendar.default, { tasks: calendarTasks, rangeStart: d2, rangeEnd: d0 });
    assert.equal((html.match(/data-calendar-order="/g) || []).length, 5, 'order numbers appear only on the true placement date');
    assert.match(html, new RegExp(`data-calendar-day="${d2}" aria-label="[^"]*5 packages placed, 0 journeys active"`));
    assert.match(html, new RegExp(`data-calendar-day="${d1}" aria-label="[^"]*0 packages placed, 5 journeys active"`));
    assert.match(html, new RegExp(`data-calendar-day="${d0}" aria-label="[^"]*0 packages placed, 4 journeys active"`));
  });

  test(`${app}: same-day connectors rise from the recorded row and end exactly on their dot`, () => {
    const placed = '2026-11-21T09:00:00Z';
    const order = i => ({ id: `order-${i}`, orderId: `ORD-${i}`, createdAt: placed });
    const journey = (i, progress) => ({ ...task, id: `same-${i}`, title: `Package ${i}`, progress,
      completedAt: null, approvedAt: null, milestones: [], order: order(i) });
    const polyline = path => {
      let x = 0, y = 0;
      return (path.match(/[MLHV][^MLHV]*/g) || []).map(token => {
        const nums = (token.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        if (token[0] === 'M' || token[0] === 'L') { x = nums[0]; y = nums[1]; }
        else if (token[0] === 'H') x = nums[0];
        else y = nums[0];
        return { x, y };
      });
    };
    const distance = (dot, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = dx || dy ? Math.max(0, Math.min(1, ((dot.x - a.x) * dx + (dot.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
      return Math.hypot(dot.x - a.x - t * dx, dot.y - a.y - t * dy);
    };
    for (const width of [0, 235, 290]) {
      // Every threshold: 0% keeps a bare dot on Order Placed, saved progress draws a
      // connector that starts on the recorded row and ends exactly on the dot.
      for (const [progress, row] of [[0, 0], [1, 2], [4, 2], [5, 3], [10, 3], [99, 3], [100, 4]]) {
        const graph = view.buildWorkflowGraph({ tasks: [journey(1, progress)], orders: [order(1)] }, '2026-11-15', '2026-11-21', width);
        const line = graph.series[0];
        const point = line.points[0];
        const nodes = polyline(line.path);
        assert.equal(point.row, row);
        assert.equal(point.day, '2026-11-21', 'the connector never moves the journey to another date');
        assert.deepEqual(nodes.at(-1), { x: point.x, y: point.y }, 'the connector terminates on its dot');
        if (progress === 0) {
          assert.equal(line.origin, null);
          assert.equal(nodes.length, 1, 'an unlifted journey keeps a bare point path');
        } else {
          assert.equal(line.origin.row, 0);
          assert.equal(line.origin.x, point.x, 'the vertical movement stays on the order date');
          assert.equal(line.origin.day, point.day, 'the start marker never invents another date');
          assert.deepEqual(nodes[0], { x: point.x, y: line.origin.y });
          assert.ok(line.origin.y >= graph.bands[0].top + 5 && line.origin.y <= graph.bands[0].top + graph.bands[0].height - 5, 'the whole start marker fits its band');
          assert.ok(nodes.length >= 2);
        }
      }
      // Four journeys sharing one date stay separately connected: each connector ends
      // on its own dot and never comes within touch distance of another journey's dot.
      const orders = [1, 2, 3, 4].map(i => order(i));
      const sameDay = orders.map((unused, i) => journey(i + 1, 10));
      const shared = view.buildWorkflowGraph({ tasks: sameDay, orders }, '2026-11-15', '2026-11-21', width);
      assert.equal(shared.series.length, 4);
      for (const line of shared.series) {
        const nodes = polyline(line.path);
        const dot = line.points[0];
        assert.deepEqual(nodes.at(-1), { x: dot.x, y: dot.y });
        assert.deepEqual(plain(dot.labels.map(label => [label.kind, label.lines.join('')])), [['start', String(line.task.sequence)]], 'journey number preserved');
        for (const other of shared.series) {
          if (other === line) continue;
          for (const foreign of [...other.points, other.origin]) for (let i = 1; i < nodes.length; i++) {
            assert.ok(distance(foreign, nodes[i - 1], nodes[i]) >= 10, 'no connector touches an unrelated marker');
          }
        }
      }
      assert.equal(new Set(shared.series.map(line => line.color)).size, 4, 'journey colours stay distinct');
      assert.equal(new Set(shared.series.map(line => line.origin.y)).size, 4, 'start markers never overlap');
      // The mobile graph box is capped, so four same-day lanes must fit inside it;
      // desktop has no cap and simply renders the full height.
      if (width) assert.ok(shared.height <= 560, 'four same-day lanes fit the mobile graph box, so every start marker is visible without scrolling');
      // A multi-day journey keeps its recorded dots and needs no origin anchor.
      const earlier = { ...order(1), createdAt: '2026-11-20T09:00:00Z' };
      const spanning = { ...journey(1, 10), order: earlier, milestones: [{ name: 'Draft', percentage: 10, reached: true, reachedAt: '2026-11-21T08:00:00Z' }] };
      const multi = view.buildWorkflowGraph({ tasks: [spanning], orders: [earlier] }, '2026-11-15', '2026-11-21', width);
      const multiLine = multi.series[0];
      assert.equal(multiLine.origin, null, 'a journey with its own segment needs no origin anchor');
      assert.deepEqual(plain(multiLine.points.map(point => [point.day, point.row])), [['2026-11-20', 0], ['2026-11-21', 3]]);
      assert.deepEqual(polyline(multiLine.path).at(-1), { x: multiLine.points.at(-1).x, y: multiLine.points.at(-1).y });
      if (width === 0) {
        // The recorded start is rendered as a real marker: one per same-day journey,
        // on the connector origin, in the journey colour, and none for multi-day work.
        const desktop = view.buildWorkflowGraph({ tasks: sameDay, orders }, '2026-11-15', '2026-11-21');
        const html = render(view.default, { timeline: { tasks: sameDay, orders }, startDate: '2026-11-15', endDate: '2026-11-21' });
        assert.equal((html.match(/data-origin-marker="true"/g) || []).length, 4);
        assert.equal((html.match(/data-origin-marker="true" data-stage="ORDER PLACED" data-date="2026-11-21"/g) || []).length, 4);
        const circles = [...html.matchAll(/<circle\b[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="5"[^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"[^>]*stroke-width="1.5"/g)];
        assert.equal(circles.length, 8, 'four start markers plus four current-stage dots, all the same size and stroke');
        for (const line of desktop.series) {
          const marker = circles.find(circle => +circle[1] === line.origin.x && +circle[2] === line.origin.y);
          assert.ok(marker, 'the start marker sits exactly on the connector origin');
          assert.equal(marker[3], line.color);
          assert.equal(marker[4], line.color, 'start and end markers share the journey colour');
          assert.ok(circles.some(circle => +circle[1] === line.points[0].x && +circle[2] === line.points[0].y && circle[3] === line.color), 'the current-stage dot is still rendered');
        }
        assert.equal((render(view.default, { timeline: { tasks: [spanning], orders: [earlier] }, startDate: '2026-11-15', endDate: '2026-11-21' }).match(/data-origin-marker="true"/g) || []).length, 0, 'a multi-day journey adds no duplicate marker');
      }
    }
  });
}

test('all views keep identical workflow presentation, evidence, numbering, colors and Calendar bounds', () => {
  const load = (app, name, overrides = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(read(`frontend/${app}/src/components/${name}.jsx`), { loader: 'jsx', format: 'cjs' }).code, { module, exports: module.exports, require: name => overrides[name] || clientRequire(name) });
    return module.exports;
  };
  for (const file of ['WorkflowJourney.jsx', 'WorkflowCalendar.jsx']) assert.equal(read(`frontend/client-app/src/components/${file}`), read(`frontend/admin-panel/src/components/${file}`));
  const client = load('client-app', 'WorkflowJourney'), admin = load('admin-panel', 'WorkflowJourney');
  for (const name of ['taskJourneyEvents', 'taskJourneyRange', 'resolveJourneyOrder', 'isRejectedJourney', 'filterRejectedJourneys', 'numberJourneyOrders', 'numberJourneyTasks', 'buildJourneyColors', 'journeyColor']) assert.equal(client[name].toString(), admin[name].toString(), name);
  assert.equal(load('client-app', 'WorkflowCalendar', { './WorkflowJourney': client }).buildCalendarRanges.toString(), load('admin-panel', 'WorkflowCalendar', { './WorkflowJourney': admin }).buildCalendarRanges.toString());
});

test('endpoint loaders reuse existing authorized task/order routes and never expand task scope', async () => {
  for (const [file, prefix] of [['frontend/client-app/src/components/WorkflowTimeline.jsx', 'client'], ['frontend/admin-panel/src/pages/Dashboard.jsx', 'admin']]) {
    const source = read(file);
    const calls = [];
    const code = source.match(/export const load(?:Client|Admin)JourneyInputs = ([\s\S]*?);\r?\n\r?\n/)[1];
    const loader = vm.runInNewContext(`(${code})`, {
      api: { get: async (url, options) => { calls.push({ url, options }); return { data: { task: { id: 'task' }, order: { id: 'order' } } }; } },
    });
    const signal = new AbortController().signal;
    assert.equal((await loader({ id: 'task/id', order: { id: 'buyer-order' } }, signal)).id, 'task');
    assert.equal(calls[0].url, `/${prefix}/tasks/task%2Fid`);
    assert.equal(calls[0].options.signal, signal);
    assert.equal((await loader({ orderOnly: true, order: { id: 'buyer-order' } }, signal)).id, 'order');
    assert.equal(calls[1].url, `/${prefix}/orders/buyer-order`);
    await assert.rejects(loader({ orderOnly: true, order: { orderId: 'display-code' } }, signal));
    assert.equal(calls.length, 2);
  }
});

function clientHarness(user = { id: 'owner', role: 'CLIENT' }, app = 'client-app') {
  const React = clientRequire('react');
  const slots = [], calls = [];
  let cursor = 0, effects = [];
  const changed = (old, deps) => !old || deps.some((dep, i) => dep !== old[i]);
  const hooks = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useMemo(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const api = { get: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) };
  const modules = { react: hooks, '../services/api': api, '../services/authService': { getCurrentUser: () => user,
    // The admin Dashboard reads stored permissions for the PDF report controls;
    // the harness has no localStorage, so no stored permissions exist.
    getPermissions: () => null },
    'react-router-dom': { useNavigate: () => () => {} }, '../components/Header': () => null,
    '../services/pushService': { initPushNotifications() {}, setupForegroundHandler: () => () => {} }, '../App': { useAuth: () => ({ user }) } };
  const load = (name, extension = 'jsx', folder = 'components') => {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(read(`frontend/${app}/src/${folder}/${name}.${extension}`), { loader: extension, format: 'cjs' }).code, {
      module, exports: module.exports, require: name => modules[name] || clientRequire(name), URL, AbortController,
      document: { body: { classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {} },
    });
    modules[`./${name}`] = modules[`../components/${name}`] = module.exports;
    return module.exports;
  };
  const journey = load('WorkflowJourney'), calendar = load('WorkflowCalendar');
  if (app === 'client-app') load('workflowTimelineTask', 'js');
  const timeline = app === 'client-app' ? load('WorkflowTimeline') : load('Dashboard', 'jsx', 'pages');
  const find = (tree, predicate) => {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; }
    return null;
  };
  const draw = (component = timeline.default, props = {}) => { cursor = 0; const tree = component(props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; };
  const markup = tree => clientRequire('react-dom/server').renderToStaticMarkup(tree);
  return { draw, find, calls, journey, calendar, timeline, markup };
}

const settle = () => new Promise(setImmediate);

test('client: Calendar toggle survives loading, empty, error states without relaxing the client gate', async () => {
  for (const user of [null, { id: 'admin', role: 'ADMIN' }]) {
    const harness = clientHarness(user);
    assert.equal(harness.draw(), null);
    assert.equal(harness.calls.length, 0);
  }
  for (const fail of [false, true]) {
    const h = clientHarness();
    const toggle = tree => h.find(tree, node => node.type === 'button' && node.props.children === 'calendar');
    assert.ok(toggle(h.draw()));
    toggle(h.draw()).props.onClick();
    assert.equal(h.calls.length, 1);
    if (fail) h.calls[0].reject({ response: { status: 403, data: { error: 'Access denied' } } });
    else h.calls[0].resolve({ data: { tasks: [], orders: [] } });
    await settle();
    const tree = h.draw();
    assert.equal(toggle(tree).props['aria-pressed'], true);
    if (!fail) assert.ok(h.find(tree, node => node.type === h.calendar.default));
    else assert.match(h.markup(tree), /Access denied/);
    assert.equal(h.calls.length, 1);
  }
});

test('client: both views share filtered tasks, persisted order dates, inputs loader and applied date range', async () => {
  const h = clientHarness();
  const source = { tasks: [
    { ...task, clientId: 'owner', order: { id: 'order-1' } },
    { ...task, id: 'other', clientId: 'authorized-client', clientName: 'Authorized client' },
  ], orders: [task.order] };
  const before = plain(source);
  const button = text => h.find(h.draw(), node => node.type === 'button' && node.props.children === text);
  h.draw();
  h.calls[0].resolve({ data: source });
  await settle();
  const journey = h.find(h.draw(), node => node.type === h.journey.default);
  assert.equal(journey.props.timeline.tasks[0].order.createdAt, task.order.createdAt);
  const graph = h.journey.buildWorkflowGraph(journey.props.timeline, '2026-09-01', '2026-09-30');
  assert.equal(graph.series[0].points[0].day, task.order.createdAt);
  button('calendar').props.onClick();
  let calendar = h.find(h.draw(), node => node.type === h.calendar.default);
  assert.equal(calendar.props.tasks, journey.props.timeline.tasks);
  assert.equal(calendar.props.orders, journey.props.timeline.orders);
  assert.equal(calendar.props.rangeStart, journey.props.startDate);
  assert.equal(calendar.props.rangeEnd, journey.props.endDate);
  assert.equal(calendar.props.loadInputs, journey.props.loadInputs);
  const ownClient = h.find(h.draw(), node => node.type === 'input' && node.props.type === 'checkbox');
  ownClient.props.onChange();
  calendar = h.find(h.draw(), node => node.type === h.calendar.default);
  assert.deepEqual(plain(calendar.props.tasks.map(task => task.clientId)), ['owner']);
  assert.equal(h.calls.length, 1);
  button('7 Days').props.onClick();
  h.draw();
  assert.equal(h.calls.length, 2);
  const params = h.calls[1].options.params;
  h.calls[1].resolve({ data: source });
  await settle();
  calendar = h.find(h.draw(), node => node.type === h.calendar.default);
  assert.equal(calendar.props.rangeStart, params.startDate);
  assert.equal(calendar.props.rangeEnd, params.endDate);
  button('timeline').props.onClick();
  let next = h.find(h.draw(), node => node.type === h.journey.default);
  assert.equal(next.props.timeline.tasks, calendar.props.tasks);
  assert.equal(next.props.startDate, calendar.props.rangeStart);
  button('Custom').props.onClick();
  h.draw();
  assert.equal(h.calls.length, 2);
  const inputs = [];
  const gather = tree => { if (!tree || typeof tree !== 'object') return; if (tree.type === 'input' && tree.props.type === 'date') inputs.push(tree); clientRequire('react').Children.toArray(tree.props?.children).forEach(gather); };
  gather(h.draw());
  inputs[0].props.onChange({ target: { value: '2026-09-15' } });
  inputs[1].props.onChange({ target: { value: '2026-09-24' } });
  button('Apply').props.onClick();
  h.draw();
  assert.equal(h.calls.length, 3);
  assert.deepEqual(plain(h.calls[2].options.params), { startDate: '2026-09-15', endDate: '2026-09-24' });
  h.calls[2].resolve({ data: source });
  await settle();
  next = h.find(h.draw(), node => node.type === h.journey.default);
  button('calendar').props.onClick();
  calendar = h.find(h.draw(), node => node.type === h.calendar.default);
  assert.equal(calendar.props.tasks, next.props.timeline.tasks);
  assert.equal(calendar.props.rangeStart, next.props.startDate);
  assert.deepEqual(source, before);
  const missing = h.timeline.clientJourneyData({ tasks: [{ ...task, order: null }], orders: [task.order] }, [], 'owner');
  assert.equal(missing.tasks[0].order, null);
  assert.equal(h.journey.taskJourneyRange(missing.tasks[0]).start, null);
  const mismatched = h.timeline.clientJourneyData({ tasks: [{ ...task, order: { id: 'exact', orderId: 'REUSED' } }], orders: [{ id: 'wrong', orderId: 'REUSED', createdAt: '2026-09-01' }] }, [], 'owner');
  assert.equal(mismatched.tasks[0].order.createdAt, undefined);
});

for (const app of ['client-app', 'admin-panel']) test(`${app}: Calendar date activity opens shared detail and exact-task video inputs on demand`, async () => {
  const h = clientHarness(undefined, app);
  const calls = [];
  const props = { tasks: [task], orders: [], rangeStart: '2026-09-15', rangeEnd: '2026-09-24',
    loadInputs: (selected, signal) => new Promise(resolve => calls.push({ selected, signal, resolve })) };
  const draw = () => h.draw(h.calendar.default, props);
  const day = date => h.find(draw(), node => node.props?.['data-calendar-day'] === date);
  const detail = () => h.find(draw(), node => node.type === h.journey.JourneyDetail);
  draw();
  day('2026-09-17').props.onClick();
  h.find(draw(), node => node.props?.['data-calendar-detail'] === task.id).props.onClick();
  let html = h.markup(detail());
  assert.match(html, /Draft/);
  assert.match(html, /Review/);
  assert.match(html, /11:59:59 PM.*UTC/);
  assert.doesNotMatch(html, /Delivery/);
  assert.equal(calls.length, 0);
  const panel = h.journey.JourneyDetail(detail().props);
  h.find(panel, node => node.type === 'details' && node.props.onToggle).props.onToggle({ currentTarget: { open: true } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].selected.id, task.id);
  day('2026-09-19').props.onClick();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve({ clientInputs: [{ link: 'https://example.com/stale' }] });
  await settle();
  assert.equal(detail().props.detail, null);
  day('2026-09-15').props.onClick();
  h.find(draw(), node => node.props?.['data-calendar-detail'] === task.id).props.onClick();
  assert.equal(calls.length, 2);
  calls[1].resolve({ clientInputs: [{ link: 'https://example.com/video', customInput: 'Client contact reference' }], clientContentText: 'Saved instructions' });
  await settle();
  html = h.markup(detail());
  assert.match(html, /href="https:\/\/example.com\/video"/);
  assert.match(html, /Client contact reference/);
  assert.match(html, /Saved instructions/);
  assert.doesNotMatch(html, /example.com\/stale/);
});

test('assigned user: authorized tasks share both views, no buyer order is reconstructed, inputs remain task-scoped', async () => {
  const h = clientHarness({ id: 'assigned-user', role: 'CLIENT' });
  const assigned = { ...task, id: 'assigned-task', clientId: 'buyer', order: null, orderContext: 'unavailable', progress: 3, completedAt: null };
  const data = { tasks: [assigned], orders: [] };
  h.draw();
  assert.equal(h.calls[0].url, '/client/insights/timeline');
  h.calls[0].resolve({ data });
  await settle();
  const findView = type => h.find(h.draw(), node => node.type === type);
  const timeline = findView(h.journey.default);
  assert.deepEqual(plain(timeline.props.timeline.tasks.map(t => t.id)), ['assigned-task']);
  assert.equal(timeline.props.timeline.tasks[0].order, null);
  const point = h.journey.buildWorkflowGraph(timeline.props.timeline, '2026-09-01', '2026-09-30').series[0];
  assert.ok(point.points.every(p => !p.isOrder));
  // The recorded approval date is dated SCHEDULED evidence even without a buyer order.
  assert.equal(point.points[0].stageKnown, true);
  assert.equal(point.points[0].row, 1);
  const mobile = h.journey.buildWorkflowGraph(timeline.props.timeline, '2026-09-15', '2026-09-24', 235);
  assert.equal(mobile.series[0].task.sequence, null);
  assert.ok(mobile.series[0].points.every(point => !point.labels.some(label => label.kind === 'start')));
  // No chronological number is available, so no endpoint label is invented and
  // the package title never appears on the graph.
  assert.ok(mobile.series[0].points.every(point => point.labels.length === 0));
  assert.equal(mobile.series[0].color, point.color);
  assert.ok(mobile.width <= 235 * 1.4);
  h.find(h.draw(), node => node.type === 'button' && node.props.children === 'calendar').props.onClick();
  const calendar = findView(h.calendar.default);
  assert.equal(calendar.props.tasks, timeline.props.timeline.tasks);
  assert.equal(calendar.props.orders.length, 0);
  for (const progress of [0, 1, 2, 3, 4, 5, 50, 99, 100]) {
    const current = { ...calendar.props.tasks[0], progress };
    const expected = progress === 0 ? 'Scheduled' : progress <= 4 ? 'Started' : progress <= 99 ? 'In Process' : 'Completed';
    assert.match(h.markup(h.journey.TaskJourney({ task: current })), new RegExp(`${progress}%.*${expected}`));
    assert.ok(h.journey.taskJourneyEvents(current).filter(event => ['scheduled', 'started', 'process', 'completed'].includes(event.key)).every(event => !event.date));
  }
  const pending = calendar.props.loadInputs(assigned, new AbortController().signal);
  assert.equal(h.calls[1].url, '/client/tasks/assigned-task');
  h.calls[1].reject({ response: { status: 403 } });
  await assert.rejects(pending);
  assert.equal(h.calls.length, 2);
  assert.ok(!h.calls.some(call => call.url.includes('/orders/')));
});

test('admin: Workflow tabs survive independent analytics failures, loading, empty, missing history and timeline errors', async () => {
  for (const state of ['empty', 'unknown', 'error']) {
    const h = clientHarness({ id: 'admin', role: 'ADMIN' }, 'admin-panel');
    h.draw();
    const request = h.calls.find(call => call.url === '/admin/analytics/timeline');
    for (const call of h.calls) {
      if (call === request) continue;
      if (call.url === '/admin/analytics') call.reject(new Error('Analytics unavailable'));
      else call.resolve({ data: {} });
    }
    await settle();
    const button = view => h.find(h.draw(), node => node.type === 'button' && node.props.children === view);
    assert.ok(button('timeline'));
    assert.ok(button('calendar'));
    button('calendar').props.onClick();
    assert.equal(button('calendar').props['aria-pressed'], true);
    if (state === 'error') request.reject({ response: { status: 403 } });
    else request.resolve({ data: { tasks: state === 'empty' ? [] : [{ id: 'undated', title: 'Unknown history', progress: 100 }], orders: [] } });
    await settle();
    assert.ok(button('timeline'));
    assert.ok(button('calendar'));
    const calendar = h.find(h.draw(), node => node.type === h.calendar.default);
    if (state === 'error') {
      assert.equal(calendar, null);
      assert.ok(h.find(h.draw(), node => node.type === 'p' && node.props.children === 'Timeline failed to load.'));
    } else {
      assert.ok(calendar);
      const html = h.markup(h.journey.default ? clientRequire('react').createElement(h.calendar.default, calendar.props) : null);
      assert.match(html, /No recorded ranges/);
      if (state === 'unknown') assert.match(html, /Date unavailable/);
    }
  }
});

test('admin: client/date filters feed both Workflow views and reject stale responses', async () => {
  const h = clientHarness({ id: 'admin', role: 'ADMIN' }, 'admin-panel');
  const original = { tasks: [task], orders: [task.order] };
  const respond = calls => calls.forEach(call => call.resolve({ data: call.url.endsWith('/timeline') ? original : call.url === '/admin/clients' ? { clients: [{ id: 'buyer', identifier: 'Buyer' }, { id: 'other', identifier: 'Other' }] } : {} }));
  h.draw();
  respond(h.calls);
  await settle();
  const find = predicate => h.find(h.draw(), predicate);
  const button = value => find(node => node.type === 'button' && node.props.children === value);
  const timeline = find(node => node.type === h.journey.default);
  button('calendar').props.onClick();
  let calendar = find(node => node.type === h.calendar.default);
  assert.equal(calendar.props.tasks, timeline.props.timeline.tasks);
  assert.equal(calendar.props.orders, timeline.props.timeline.orders);
  assert.equal(calendar.props.loadInputs, timeline.props.loadInputs);
  find(node => node.type === 'button' && node.props.style?.maxWidth === '180px').props.onClick();
  find(node => node.type === 'button' && node.props['aria-pressed'] === false && JSON.stringify(node.props.children).includes('Buyer')).props.onClick();
  find(node => node.type === 'button' && node.props['aria-pressed'] === false && JSON.stringify(node.props.children).includes('Other')).props.onClick();
  find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children[0] === 'Apply ').props.onClick();
  h.draw();
  const filtered = h.calls.filter(call => call.url === '/admin/analytics/client/timeline').at(-1);
  assert.equal(filtered.options.params.clientId, 'buyer,other');
  const priorCount = h.calls.length;
  find(node => node.type === 'select').props.onChange({ target: { value: '7days' } });
  h.draw();
  const latest = h.calls.filter(call => call.url === '/admin/analytics/client/timeline').at(-1);
  assert.notEqual(latest, filtered);
  assert.equal(latest.options.params.clientId, 'buyer,other');
  assert.equal((new Date(latest.options.params.endDate) - new Date(latest.options.params.startDate)) / 86400000, 6);
  const finalData = { tasks: [{ ...task, id: 'filtered-task' }], orders: [task.order] };
  for (const call of h.calls.slice(priorCount)) call.resolve({ data: call === latest ? finalData : {} });
  await settle();
  filtered.resolve({ data: { tasks: [{ ...task, id: 'STALE' }] } });
  await settle();
  calendar = find(node => node.type === h.calendar.default);
  assert.equal(calendar.props.tasks, finalData.tasks);
  assert.equal(calendar.props.rangeStart, latest.options.params.startDate);
  button('timeline').props.onClick();
  const current = find(node => node.type === h.journey.default);
  assert.equal(current.props.timeline.tasks, calendar.props.tasks);
  assert.equal(current.props.startDate, calendar.props.rangeStart);
  find(node => node.type === 'select').props.onChange({ target: { value: 'alltime' } });
  h.draw();
  assert.ok(button('calendar'));
  assert.ok(find(node => node.type === 'p' && JSON.stringify(node.props.children).includes('Select a date range')));
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
