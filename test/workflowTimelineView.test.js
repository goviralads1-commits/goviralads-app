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

  test(`${app}: current 0% Scheduled, 1–99% In Process, 100% Completed; no inferred transition dates`, () => {
    const zero = { ...task, progress: 0, milestones: [], completedAt: null };
    const events = view.taskJourneyEvents(zero);
    assert.equal(events.find(e => e.key === 'scheduled').date, undefined);
    assert.equal(events.find(e => e.key === 'approval').date, zero.approvedAt);
    assert.equal(view.taskJourneyEvents({ ...zero, progress: 1 }).find(e => e.key === 'approval').date, zero.approvedAt);
    assert.deepEqual(plain(view.taskJourneyRange(zero)), plain(view.taskJourneyRange({ ...zero, progress: 1 })));
    assert.equal(view.taskJourneyEvents({ ...zero, milestones: [{ name: 'Approved at zero', percentage: 0, reached: true, reachedAt: zero.approvedAt }] }).find(e => e.key === 'scheduled').date, undefined);
    assert.equal(events.find(e => e.key === 'started').date, undefined);
    assert.match(render(view.TaskJourney, { task: zero }), /0%.*Scheduled/);
    for (const progress of [1, 10, 30, 49, 50, 60, 99]) {
      assert.equal(view.currentStage(progress), 'In Process');
      assert.match(render(view.TaskJourney, { task: { ...zero, progress } }), new RegExp(`${progress}%.*In Process`));
      assert.deepEqual(plain(view.taskJourneyEvents({ ...zero, progress })), plain(events));
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
      assert.ok(events.filter(e => e.key.startsWith('milestone:')).every(e => e.row === null));
    }
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
      assert.ok(mobile.height < 600);
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
      assert.equal(circles.length, line.points.length);
      assert.ok(circles.every(match => match[2] === line.color && match[1] === line.color));
      const texts = [...group.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)];
      assert.equal(texts.length, 2);
      for (const text of texts) {
        assert.ok(text[0].includes(`fill="${line.color}"`));
        assert.doesNotMatch(text[1], /Draft|Review|Delivery/);
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
      for (let i = 1; i < points.length; i++) assert.ok(new Date(points[i].date) >= new Date(points[i - 1].date));
      assert.ok(!points.some(point => point.date === dated.deadline));
      assert.equal(points.filter(point => point.labelLines.length).length, 2);
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
    test(`${app}: one date dot retains every saved record and anchors same-day activity at Order`, () => {
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
      assert.equal(one.points[0].row, 0);
      assert.equal(one.points[0].date, sameDay.order.createdAt);
      assert.ok(one.points[0].events.some(event => event.key === 'completed'));
      assert.equal(one.points.filter(point => point.labelLines.length).length, 1);
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
        assert.equal(points.find(point => point.day === '2026-09-19').events[0].row, null);
        assert.ok(points.find(point => point.day === '2026-09-19').supporting);
        assert.ok(points.every(point => point.day !== dated.deadline));
      }
    });

    test(`${app}: 360–430px layouts bound height, date collisions and long endpoint labels`, () => {
      for (const width of [220, 235, 290]) for (const total of [1, 8, 25]) {
        const tasks = Array.from({ length: total }, (_, i) => ({ ...task, id: `dense-${i}`, title: `Package ${i} with a very long client-provided title that must not expand the graph`,
          milestones: Array.from({ length: 60 }, (_, j) => ({ name: `Milestone ${j}`, percentage: j + 1, reached: true, reachedAt: j % 2 ? '2026-09-17' : '2026-09-18' })) }));
        const model = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24', width);
        assert.ok(model.height < 500);
        assert.equal(model.rows.length, 5);
        for (let row = 1; row < 5; row++) assert.ok(model.rows[row] < model.rows[row - 1]);
        const rectangles = [];
        for (const line of model.series) {
          assert.equal(line.points.length, 5);
          assert.equal(line.points.filter(point => point.labelLines.length).length, 2);
          assert.equal((line.path.match(/H/g) || []).length, line.points.length - 1);
          for (const point of line.points) {
            const column = model.columns.find(column => column.day === point.day);
            assert.ok(point.x - 20 >= column.left && point.x + 20 <= column.left + column.width);
            assert.ok(point.labelLines.length <= 2);
            const left = point.labelLines.length ? point.labelX - 4 : point.x - 20;
            const right = point.labelLines.length ? point.labelX + model.labelWidth + 4 : point.x + 20;
            assert.ok(left >= column.left && right <= column.left + column.width);
            rectangles.push({ left, right, top: point.y - 20, bottom: point.labelLines.length ? point.labelY + point.labelLines.length * 14 : point.y + 20 });
          }
        }
        rectangles.forEach((a, i) => rectangles.slice(i + 1).forEach(b => assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)));
      }
      const short = { ...task, approvedAt: null, milestones: [], completedAt: '2026-09-16' };
      for (const end of ['2026-09-15', '2026-09-16']) assert.equal(view.buildWorkflowGraph({ tasks: [short] }, '2026-09-15', end, 235).width, 235);
      const mobile = load('WorkflowJourney', { react: { ...React, useState: initial => React.useState(initial === 0 ? 235 : initial) } });
      const html = render(mobile.default, { timeline: { tasks: [task] }, startDate: '2026-09-15', endDate: '2026-09-24' });
      assert.match(html, /aria-label="Workflow stage axis" width="76"/);
      assert.match(html, /r="20" fill="transparent"/);
      assert.match(html, /Scheduled<tspan[^>]*>\(0%\)/);
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
      assert.equal(days.find(day => day.day === '2026-09-19').journeys.length, 2);
      assert.ok(days.find(day => day.day === '2026-09-19').journeys.every(item => !item.point));
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
    assert.equal(calendar.buildCalendarRanges([notStarted], '2026-09-15', '2026-09-24').tasks[0].end, '2026-09-16');
    assert.equal(calendar.buildCalendarRanges([{ ...notStarted, order: null }], '2026-09-15', '2026-09-24').undated.length, 1);
  });

  test(`${app}: five core stages, shared first-progress evidence and no milestone stage`, () => {
    assert.deepEqual(plain(view.workflowRows), ['ORDER PLACED', 'SCHEDULED (0%)', 'STARTED (≥1%)', 'IN PROCESS (1%–99%)', 'COMPLETED (100%)']);
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
    assert.ok(clipped.series[0].points.every(point => !point.labelLines.length));
    assert.equal(view.buildWorkflowGraph(null, 'bad', '2026-09-30').count, 0);
    const taskWithoutDate = { ...task, order: { id: task.order.id } };
    const resolved = view.buildWorkflowGraph({ tasks: [taskWithoutDate], orders: [task.order] }, '2026-09-01', '2026-09-30');
    assert.equal(resolved.series[0].points[0].date, task.order.createdAt);
    assert.equal(taskWithoutDate.order.createdAt, undefined);
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
  for (const name of ['taskJourneyEvents', 'taskJourneyRange', 'numberJourneyOrders', 'numberJourneyTasks', 'buildJourneyColors', 'journeyColor']) assert.equal(client[name].toString(), admin[name].toString(), name);
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
  const modules = { react: hooks, '../services/api': api, '../services/authService': { getCurrentUser: () => user },
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
  const assigned = { ...task, id: 'assigned-task', clientId: 'buyer', order: null, orderContext: 'unavailable' };
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
  assert.equal(point.points[0].stageKnown, false);
  h.find(h.draw(), node => node.type === 'button' && node.props.children === 'calendar').props.onClick();
  const calendar = findView(h.calendar.default);
  assert.equal(calendar.props.tasks, timeline.props.timeline.tasks);
  assert.equal(calendar.props.orders.length, 0);
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
