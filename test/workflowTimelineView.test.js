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
      assert.equal(mobile.bands[4].height, 68);
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
      const circles = [...group.matchAll(/<circle\b[^>]*r="6"[^>]*fill="([^"]+)"[^>]*stroke="([^"]+)"/g)];
      assert.equal(circles.length, line.points.length);
      assert.ok(circles.every(match => match[2] === line.color && (match[1] === line.color || match[1] === '#fff')));
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

  test(`${app}: shared collision lanes keep names and hit targets apart, even on nearby dates`, () => {
    const busy = Array.from({ length: 12 }, (_, i) => ({ ...task, id: `busy-${i}`, title: `Package ${i} with a long client-provided name`,
      milestones: task.milestones.map(m => ({ ...m, reachedAt: i % 2 ? '2026-09-18' : m.reachedAt })) }));
    for (const [start, end] of [['2026-09-01', '2026-09-30'], ['2026-09-17', '2026-09-17'], ['2020-01-01', '2030-01-01']]) {
      const model = view.buildWorkflowGraph({ tasks: busy }, start, end);
      const points = model.series.flatMap(line => line.points);
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const bottom = a.y + Math.max(14, a.labelLines.length * 14 - 6);
        for (const b of points.slice(i + 1)) {
          const otherBottom = b.y + Math.max(14, b.labelLines.length * 14 - 6);
          assert.ok(a.right <= b.left || b.right <= a.left || bottom <= b.y - 14 || otherBottom <= a.y - 14, 'point/label rectangles do not overlap');
        }
        if (a.labelLines.length) {
          assert.ok(a.endpoint);
          assert.ok(a.labelX >= 0 && a.labelX + model.labelWidth <= model.width);
        }
      }
    }
    const props = { timeline: { tasks: [task] }, startDate: '2026-09-01', endDate: '2026-09-30' };
    const html = render(view.default, props);
    const texts = [...html.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(match => match[1].replace(/<[^>]*>/g, ''));
    assert.equal(texts.filter(text => text.includes('Campaign launch')).length, 2);
    assert.ok(!texts.some(text => /Draft|Review|Delivery|Completed ·|Started ·|In Process ·/.test(text)));
    const single = { ...task, approvedAt: null, completedAt: null, milestones: [] };
    assert.equal((render(view.default, { ...props, timeline: { tasks: [single] } }).match(/data-endpoint-label=/g) || []).length, 1);
    const clipped = view.buildWorkflowGraph(props.timeline, '2026-09-18', '2026-09-20');
    assert.ok(clipped.series[0].points.every(point => !point.labelLines.length));
  });

  test(`${app}: 375px mobile geometry bounds milestone height and preserves readable endpoints`, () => {
    const graphWidth = 235; // 375px viewport, existing card spacing and the 76px stage column.
    for (const total of [6, 24, 60]) {
      const dense = { ...task, milestones: Array.from({ length: total }, (_, i) => ({ name: `Milestone ${i}`, percentage: 1 + i, reached: true, reachedAt: i % 2 ? '2026-09-17' : '2026-09-18' })) };
      const tasks = Array.from({ length: total === 24 ? 8 : 1 }, (_, i) => ({ ...dense, id: `dense-${i}` }));
      const model = view.buildWorkflowGraph({ tasks }, '2026-09-15', '2026-09-24', graphWidth);
      const points = model.series.flatMap(line => line.points);
      assert.equal(model.bands[4].height, 68);
      for (let row = 1; row < 6; row++) assert.ok(model.rows[row - 1] > model.rows[row], 'stages progress bottom to top');
      assert.ok(model.height <= (tasks.length > 1 ? 560 : 400));
      assert.equal(points.filter(point => point.row === 4).length, total * tasks.length);
      for (const point of points) {
        const column = model.columns.find(column => column.day === point.day);
        assert.ok(point.x - 14 >= column.left && point.x + 14 <= column.left + column.width);
        if (point.labelLines.length) {
          assert.ok(point.endpoint);
          assert.ok(point.labelX - 4 >= column.left && point.labelX + model.labelWidth + 4 <= column.left + column.width);
        }
      }
      const rectangles = points.map(point => ({
        left: point.labelLines.length ? point.labelX - 4 : point.x - 14,
        right: point.labelLines.length ? point.labelX + model.labelWidth + 4 : point.x + 14,
        top: point.y - 14, bottom: point.labelLines.length ? point.labelY + point.labelLines.length * 14 - 6 : point.y + 14,
      }));
      rectangles.forEach((a, i) => rectangles.slice(i + 1).forEach(b => {
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      }));
      assert.deepEqual(plain(model.numbered.map(t => t.sequence)), plain(view.numberJourneyTasks(tasks, [], '2026-09-15', '2026-09-24').map(t => t.sequence)));
      for (const line of model.series) assert.equal((line.path.match(/H/g) || []).length, line.points.length - 1);
    }
    const short = { ...task, approvedAt: null, milestones: [], completedAt: '2026-09-16' };
    for (const end of ['2026-09-15', '2026-09-16']) {
      assert.equal(view.buildWorkflowGraph({ tasks: [short] }, '2026-09-15', end, graphWidth).width, graphWidth);
    }
    const desktop = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-01', '2026-09-30');
    assert.equal(desktop.width, 2400);
    assert.equal(desktop.height, 440);
    for (let row = 1; row < 6; row++) assert.ok(desktop.rows[row - 1] > desktop.rows[row]);
    const mobileView = load('WorkflowJourney', { react: { ...React, useState: initial => React.useState(initial === 0 ? graphWidth : initial) } });
    const html = render(mobileView.default, { timeline: { tasks: [task] }, startDate: '2026-09-15', endDate: '2026-09-24' });
    assert.match(html, /aria-label="Workflow stage axis" width="76"/);
    assert.match(html, /bottom: calc\(84px \+ env\(safe-area-inset-bottom/);
    assert.equal((html.match(/data-endpoint-label=/g) || []).length, 2);
    assert.match(html, /Scheduled<tspan[^>]*>\(0%\)<\/tspan>/);
    assert.match(html, /Started<tspan[^>]*>\(≥1%\)<\/tspan>/);
  });

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
    const component = load('WorkflowJourney', { react: hooks }).default;
    const calls = [];
    let props = { timeline: { tasks: [task] }, startDate: '2026-09-01', endDate: '2026-09-30',
      loadInputs: (selected, signal) => new Promise((resolve, reject) => calls.push({ selected, signal, resolve, reject })) };
    const draw = () => { cursor = 0; const tree = component(props); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; };
    const find = (tree, predicate) => {
      if (!tree || typeof tree !== 'object') return null;
      if (predicate(tree)) return tree;
      for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; }
      return null;
    };
    const event = key => find(draw(), node => node.props?.['data-event'] === key);
    const detail = () => find(draw(), node => node.props?.['aria-label'] === 'Journey point details');
    draw();
    assert.equal(calls.length, 0);
    await event('milestone:0').props.onClick();
    assert.match(renderToStaticMarkup(detail()), /Draft/);
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

  test(`${app}: fixed stage coordinates, proportional dates, one path per task, same-day milestones`, () => {
    const model = view.buildWorkflowGraph({ tasks: [task] }, '2026-09-01', '2026-09-30');
    const line = model.series[0];
    assert.equal(model.firstActual, '2026-09-15');
    assert.equal(model.x('2026-09-17') - model.x('2026-09-15'), 160);
    assert.equal(model.rows.length, 6);
    assert.ok(model.rows[0] > model.rows[5]);
    for (const point of line.points) {
      const band = model.bands[point.row];
      assert.ok(point.y >= band.top + 14 && point.y + 14 <= band.top + band.height);
      assert.equal(point.x, model.x(point.day));
    }
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

test('identical shared journey and Calendar models in independently built apps', () => {
  for (const name of ['WorkflowJourney', 'WorkflowCalendar']) assert.equal(read(`frontend/client-app/src/components/${name}.jsx`), read(`frontend/admin-panel/src/components/${name}.jsx`));
});

test('endpoint loaders reuse existing authorized task/order routes and never expand task scope', async () => {
  for (const [file, prefix] of [['frontend/client-app/src/components/WorkflowTimeline.jsx', 'client'], ['frontend/admin-panel/src/pages/Dashboard.jsx', 'admin']]) {
    const source = read(file);
    const calls = [];
    const loader = vm.runInNewContext(`(${source.match(/loadInputs=\{(async [\s\S]*?)\}\} \/>/)[1]}})`, {
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
