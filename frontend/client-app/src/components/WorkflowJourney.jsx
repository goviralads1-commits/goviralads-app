import React, { useEffect, useMemo, useRef, useState } from 'react';

export const journeyDay = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const formatDate = value => journeyDay(value)
  ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : 'Date unavailable';
const dayMillis = 86400000;
export const workflowRows = ['ORDER', 'SCHEDULED (0%)', 'STARTED (≥1%)', 'IN PROCESS', 'MILESTONE(S)', 'COMPLETED'];
const stageColors = ['#334155', '#60a5fa', '#2563eb', '#f59e0b', '#7c3aed', '#16a34a'];
const lineColors = ['#2563eb', '#059669', '#f43f5e', '#d97706', '#7c3aed', '#0891b2', '#be185d'];
const currentStage = progress => progress === 0 ? 'Scheduled' : progress >= 100 ? 'Completed' : progress >= 50 ? 'In Process' : progress >= 1 ? 'Started' : 'Stage unavailable';

export function taskJourneyEvents(task) {
  const milestones = (task.milestones || []).flatMap((milestone, index) => milestone.reached === true ? [{
    key: `milestone:${index}`, row: 4, label: milestone.name || `Milestone ${index + 1}`, date: milestone.reachedAt,
    detail: `${milestone.percentage ?? '—'}% · saved milestone`, progress: milestone.percentage,
  }] : []);
  const evidence = milestones.filter(event => journeyDay(event.date) && Number.isFinite(event.progress))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const scheduled = evidence.find(event => event.progress === 0);
  const started = evidence.find(event => event.progress >= 1);
  const halfway = evidence.find(event => event.progress >= 50);
  const completionEvidence = evidence.find(event => event.progress >= 100);
  const completed = [task.completedAt, completionEvidence?.date].filter(journeyDay)
    .sort((a, b) => new Date(a) - new Date(b))[0] || null;
  return [
    { key: 'order', row: 0, label: 'Order', date: task.order?.createdAt, detail: task.order?.orderId || 'Order date unavailable' },
    { key: 'approval', row: 1, label: 'Approval', date: task.approvedAt,
      detail: 'Recorded approval date. Progress at approval was not persisted; this is not a dated 0% transition.' },
    { key: 'scheduled', row: 1, label: 'Scheduled', date: scheduled?.date,
      detail: scheduled ? `Saved 0% evidence: ${scheduled.label}.` : 'Historical 0% timestamp unavailable. Current 0% still means Scheduled.' },
    { key: 'started', row: 2, label: 'Started', date: started?.date,
      detail: started ? `First available evidence ≥1%: ${started.label} (${started.progress}%). Not a reconstructed transition.` : 'First ≥1% date unavailable' },
    { key: 'process', row: 3, label: 'In Process', date: halfway?.date,
      detail: halfway ? `First available evidence ≥50%: ${halfway.label} (${halfway.progress}%). Not a reconstructed transition.` : 'First ≥50% date unavailable' },
    ...milestones,
    { key: 'completed', row: 5, label: 'Completed', date: completed,
      detail: completed ? (completed === completionEvidence?.date ? `Saved ≥100% evidence: ${completionEvidence.label}. First-ever transition unavailable.` : 'Recorded completion event; first-ever 100% transition unavailable.') : 'Actual completion date unavailable' },
  ];
}

// Both views share the same available dated evidence, never planned start/end dates.
export function taskJourneyRange(task) {
  const events = taskJourneyEvents(task);
  const dates = events.map(event => journeyDay(event.date)).filter(Boolean).sort();
  const orderDate = journeyDay(task.order?.createdAt);
  return {
    start: orderDate,
    end: journeyDay(events.find(event => event.key === 'completed').date) || dates[dates.length - 1] || null,
    completed: Boolean(journeyDay(events.find(event => event.key === 'completed').date)),
    missingOrder: !orderDate,
  };
}

export function numberJourneyOrders(tasks, orders = [], startDate, endDate) {
  const available = [...orders, ...tasks.map(task => task.order).filter(Boolean)]
    .filter(order => {
      const day = journeyDay(order.createdAt);
      return day && (order.id || order.orderId) && (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  const unique = [...new Map(available.map(order => [order.id || order.orderId, order])).values()]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id || a.orderId).localeCompare(String(b.id || b.orderId)));
  return new Map(unique.map((order, index) => [order.id || order.orderId, index + 1]));
}

export function numberJourneyTasks(tasks, orders = [], startDate, endDate) {
  const unique = [...new Map(tasks.map(task => [task.id, task])).values()];
  const numbers = numberJourneyOrders(unique, orders, startDate, endDate);
  return unique.map(task => ({ ...task, sequence: numbers.get(task.order?.id || task.order?.orderId) || null,
    sequenceNote: journeyDay(task.order?.createdAt) ? 'Order outside selected range · unnumbered' : 'Order date unavailable · unnumbered' }))
    .sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity) || String(a.id).localeCompare(String(b.id)));
}

export const journeyColor = (task, index) => lineColors[((task.sequence || index + 1) - 1) % lineColors.length];

export function journeyDateAxis(startDate, endDate) {
  const count = journeyDay(startDate) && journeyDay(endDate) ? Math.max(0, Math.floor((new Date(endDate) - new Date(startDate)) / dayMillis) + 1) : 0;
  const baseDayWidth = count > 366 ? Math.max(1, 26000 / count) : 80;
  const dayWidth = count ? Math.max(baseDayWidth, 320 / count) : baseDayWidth;
  const width = Math.max(320, count * dayWidth);
  const x = day => dayWidth / 2 + (new Date(day) - new Date(startDate)) / dayMillis * dayWidth;
  const ticks = [];
  const step = Math.max(1, Math.ceil(70 / dayWidth));
  for (let i = 0; i < count; i += step) ticks.push(new Date(new Date(startDate).getTime() + i * dayMillis).toISOString().slice(0, 10));
  if (count > 0 && ticks[ticks.length - 1] !== endDate) ticks.push(endDate);
  return { count, dayWidth, width, x, ticks };
}

export function buildWorkflowGraph(timeline, startDate, endDate) {
  const numbered = numberJourneyTasks(timeline?.tasks || [], timeline?.orders || [], startDate, endDate);
  const numbers = numberJourneyOrders(numbered, timeline?.orders || [], startDate, endDate);
  const linked = new Set(numbered.map(task => task.order?.id || task.order?.orderId).filter(Boolean));
  const orderOnly = [...new Map((timeline?.orders || []).map(order => [order.id || order.orderId, order])).values()]
    .filter(order => !linked.has(order.id || order.orderId)).map(order => ({
      id: `order:${order.id || order.orderId}`, title: `Order ${order.orderId || ''}`, orderOnly: true,
      order, sequence: numbers.get(order.id || order.orderId), status: order.orderStatus,
    }));
  const series = [...numbered, ...orderOnly].map((task, index) => {
    const events = task.orderOnly ? [
      { key: 'order', row: 0, label: 'Order', date: task.order.createdAt, detail: task.order.orderId },
      { key: 'approval', row: 1, label: 'Approval', date: task.order.approvedAt, detail: 'Recorded approval; progress at approval unavailable' },
      { key: 'completed', row: 5, label: 'Completed', date: task.order.completedAt, detail: 'Recorded order completion' },
    ] : taskJourneyEvents(task);
    const points = events.filter(event => journeyDay(event.date)).map(event => ({ ...event, day: journeyDay(event.date) }))
      .sort((a, b) => new Date(a.date) - new Date(b.date) || a.row - b.row);
    const perDay = new Map();
    for (const point of points.filter(point => point.row === 4)) {
      const sameDay = perDay.get(point.day) || [];
      sameDay.push(point);
      perDay.set(point.day, sameDay);
    }
    // Multiple milestones on one date stay at that date, in separate lanes inside the milestone band.
    for (const sameDay of perDay.values()) sameDay.forEach((point, i) => { point.offset = (i - (sameDay.length - 1) / 2) * 16; });
    return { task, points, missing: events.filter(event => !journeyDay(event.date)),
      color: journeyColor(task, index), lane: (index % 5 - 2) * 4,
      milestoneCount: Math.max(1, ...[...perDay.values()].map(points => points.length)) };
  });
  const milestoneHeight = Math.max(64, Math.max(1, ...series.map(line => line.milestoneCount)) * 16 + 32);
  const rows = [0, 1, 2, 3, 4, 5].map(row => row === 5 ? 78 : row === 4 ? 110 + milestoneHeight / 2 : 110 + milestoneHeight + (3 - row) * 64 + 32);
  const height = rows[0] + 38;
  const { count, dayWidth, width, x, ticks } = journeyDateAxis(startDate, endDate);
  const dated = series.flatMap(line => line.points).filter(point => point.day >= startDate && point.day <= endDate);
  const firstOrder = dated.filter(point => point.row === 0).map(point => point.day).sort()[0];
  const firstActual = firstOrder || dated.map(point => point.day).sort()[0] || startDate;
  for (const line of series) {
    for (const point of line.points) { point.x = x(point.day); point.y = rows[point.row] + line.lane + (point.offset || 0); }
    line.path = line.points.map((point, index) => index ? `H${point.x} V${point.y}` : `M${point.x},${point.y}`).join(' ');
  }
  return { series, numbered, rows, milestoneHeight, width, height, ticks, x, firstActual, count, dayWidth };
}

export const TaskJourney = ({ task }) => {
  const events = taskJourneyEvents(task);
  return <article aria-label={`Workflow journey for ${task.title}`} style={{ minWidth: 0, padding: '12px 0', borderTop: '1px solid #e2e8f0', fontSize: '12px', overflowWrap: 'anywhere' }}>
    <strong>{task.sequence ? `Order ${task.sequence} · ` : ''}{task.title}</strong>
    {!task.sequence && <p style={{ color: '#64748b' }}>{task.sequenceNote || 'Order date unavailable · unnumbered'}</p>}
    {task.clientName && <p>Client: {task.clientName}</p>}
    <p>Current progress: {typeof task.progress === 'number' ? `${task.progress}%` : 'Unavailable'} · {currentStage(task.progress)} · snapshot, not a dated event.</p>
    <p style={{ color: '#64748b' }}>Task status: {task.status || 'Unavailable'} · {(task.creditCost || 0).toLocaleString('en-IN')} credits</p>
    <dl style={{ lineHeight: 1.6 }}>
      {events.map(event => <div key={event.key} style={{ marginTop: '6px' }}>
        <dt style={{ fontWeight: 600 }}>{event.label} · {formatDate(event.date)}</dt><dd style={{ margin: 0, color: '#64748b' }}>{event.detail}</dd>
      </div>)}
    </dl>
    <p style={{ color: '#64748b' }}><strong>Scheduled start:</strong> {formatDate(task.startDate)} · <strong>Planned end:</strong> {formatDate(task.endDate || task.deadline)}. Planned dates are not plotted.</p>
    <details><summary>Milestone configuration · {(task.milestones || []).filter(m => m.reached).length} / {(task.milestones || []).length} reached</summary>
      <p>Separate milestone start dates and complete progress history are unavailable.</p>
      {(task.milestones || []).map((milestone, index) => <p key={index}>{milestone.name} · {milestone.percentage}% · {milestone.reached ? 'Reached' : 'Not reached'} · {formatDate(milestone.reached ? milestone.reachedAt : null)}</p>)}
    </details>
  </article>;
};

const WorkflowJourney = ({ timeline, startDate, endDate, selectedDate, onSelectDate }) => {
  const model = useMemo(() => buildWorkflowGraph(timeline, startDate, endDate), [timeline, startDate, endDate]);
  const scroller = useRef(null);
  const [highlight, setHighlight] = useState('');
  const [activePoint, setActivePoint] = useState(null);
  // Selection/scroll changes do not rebuild the model or reset the user's viewport.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, model.x(model.firstActual) - model.dayWidth / 2);
    setHighlight('');
    setActivePoint(null);
  }, [model]);
  const choosePoint = (line, point) => {
    setHighlight(line.task.id);
    setActivePoint(`${line.task.sequence ? `Order ${line.task.sequence} · ` : ''}${line.task.title} · ${point.label} · ${formatDate(point.date)} · ${point.detail || ''}`);
    onSelectDate?.(point.day);
  };
  if (model.count <= 0) return <p>Choose a valid date range.</p>;
  const badges = new Set();
  const lines = [...model.series].sort((a, b) => Number(a.task.id === highlight) - Number(b.task.id === highlight));
  return <div style={{ minWidth: 0 }}>
    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px' }}>Each line connects actual dated evidence. Swipe or scroll horizontally; tap a point or journey key to inspect it.</p>
    <div style={{ display: 'flex', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <svg aria-label="Workflow stage axis" width="110" height={model.height} style={{ flex: '0 0 110px', background: '#fff', borderRight: '1px solid #e2e8f0' }}>
        <text x="10" y="27" fontSize="10" fill="#64748b">STAGE / DATE</text>
        {workflowRows.map((label, row) => <g key={label}>
          <rect x="4" y={model.rows[row] - 24} width="102" height="48" rx="8" fill={`${stageColors[row]}0d`} />
          <text x="10" y={model.rows[row] + 4} fill={stageColors[row]} fontSize="10" fontWeight="700">{label}</text>
        </g>)}
      </svg>
      <div ref={scroller} tabIndex={0} role="region" aria-label="Workflow graph, scroll dates horizontally" style={{ minWidth: 0, flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <svg aria-label="Task journeys by actual date and workflow stage" width={model.width} height={model.height} style={{ display: 'block', overflow: 'hidden' }}>
          <title>One step-line per task or order. Points use saved evidence, not invented dates. Connectors do not imply daily progress history.</title>
          {model.rows.map((y, row) => <g key={row}>
            <rect x="0" y={row === 4 ? 110 : y - 32} width={model.width} height={row === 4 ? model.milestoneHeight : 64} fill={row % 2 ? '#fff' : '#f8fafc'} />
            <line x1="0" x2={model.width} y1={y + (row === 4 ? model.milestoneHeight / 2 : 32)} y2={y + (row === 4 ? model.milestoneHeight / 2 : 32)} stroke="#e2e8f0" />
          </g>)}
          {model.ticks.map(day => <g key={day}>
            <line x1={model.x(day) - model.dayWidth / 2} x2={model.x(day) - model.dayWidth / 2} y1="0" y2={model.height} stroke="#e2e8f0" />
            <text x={model.x(day)} y="20" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>
            <text x={model.x(day)} y="36" textAnchor="middle" fontSize="10" fill="#64748b">{new Date(day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</text>
          </g>)}
          {selectedDate && selectedDate >= startDate && selectedDate <= endDate && <line x1={model.x(selectedDate)} x2={model.x(selectedDate)} y1="44" y2={model.height} stroke="#a5b4fc" strokeDasharray="4 4" />}
          {lines.map(line => {
            const visible = !highlight || highlight === line.task.id;
            const orderKey = line.task.order?.id || line.task.order?.orderId;
            const badge = line.task.sequence && !badges.has(orderKey) && visible;
            if (badge) badges.add(orderKey);
            const last = line.points[line.points.length - 1];
            return <g key={line.task.id} data-journey-task={line.task.id} opacity={visible ? 1 : 0.15}>
              <path data-workflow-path="true" d={line.path} fill="none" stroke={line.color} strokeWidth={highlight === line.task.id ? 3 : 2} strokeLinejoin="round" />
              {line.points.filter(point => point.day >= startDate && point.day <= endDate).map(point => <g key={point.key} data-event={point.key} data-stage={workflowRows[point.row]} data-date={point.day} role="button" tabIndex={visible ? 0 : -1} aria-label={`${line.task.title}: ${point.label}, ${formatDate(point.date)}`} onClick={() => choosePoint(line, point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choosePoint(line, point); } }} style={{ cursor: 'pointer' }}>
                <title>{`${line.task.title} · ${point.label} · ${formatDate(point.date)} · ${point.detail || ''}`}</title>
                <circle cx={point.x} cy={point.y} r="14" fill="transparent" />
                <circle cx={point.x} cy={point.y} r="6" fill={point.key === 'approval' ? '#fff' : stageColors[point.row]} stroke={point.key === 'approval' ? '#60a5fa' : '#fff'} strokeWidth="1.5" />
                {point.row === 0 && badge && <g data-order-number={line.task.sequence}>
                  <circle cx={point.x} cy={point.y - 20} r="13" fill={line.color} />
                  <text x={point.x} y={point.y - 16} textAnchor="middle" fill="#fff" fontWeight="700" fontSize="12">{line.task.sequence}</text>
                </g>}
                {visible && (highlight === line.task.id || model.series.length <= 4 || point === last) && <text x={point.x > model.width - 160 ? point.x - 11 : point.x + 11} y={point.y + 4} textAnchor={point.x > model.width - 160 ? 'end' : 'start'} fill={stageColors[point.row]} fontSize="10" fontWeight="600">{point.label.length > 18 ? `${point.label.slice(0, 18)}…` : point.label} · {new Date(point.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>}
              </g>)}
            </g>;
          })}
        </svg>
      </div>
    </div>
    {activePoint && <p role="status" style={{ fontSize: '12px', padding: '10px', background: '#eef2ff', borderRadius: '8px', overflowWrap: 'anywhere' }}>{activePoint}</p>}
    {!model.series.length && <p style={{ fontSize: '12px', color: '#64748b' }}>No tasks or orders in this range.</p>}
    <div aria-label="Journey key" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', maxHeight: '160px', overflowY: 'auto' }}>
      {model.series.map(line => <button key={line.task.id} type="button" aria-pressed={highlight === line.task.id} onClick={() => { setHighlight(previous => previous === line.task.id ? '' : line.task.id); setActivePoint(null); }} style={{ display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left', minWidth: 0, maxWidth: '100%', border: `1px solid ${highlight === line.task.id ? line.color : '#e2e8f0'}`, borderRadius: '8px', padding: '8px', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>
        <span style={{ flexShrink: 0, minWidth: '24px', padding: '5px', borderRadius: '20px', background: line.color, color: '#fff', textAlign: 'center', fontWeight: 700 }}>{line.task.sequence || '—'}</span>
        <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}><strong>{line.task.title}</strong><span style={{ display: 'block', color: '#64748b', marginTop: '3px' }}>Order: {formatDate(line.task.order?.createdAt)} · {line.task.orderOnly ? line.task.status : `${currentStage(line.task.progress)}${typeof line.task.progress === 'number' ? ` (${line.task.progress}%)` : ''}`}</span></span>
      </button>)}
    </div>
    <p style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.6 }}>Numbers belong to orders created within {startDate} → {endDate}, starting at 1. Earlier overlapping orders and unavailable order dates stay unnumbered. Colors identify journeys; hollow approval points do not assert historical 0% progress. Milestone points use the current saved configuration. Dates unavailable are not plotted; current progress is not a historical timestamp.</p>
    <details style={{ fontSize: '12px', color: '#475569' }}><summary style={{ cursor: 'pointer' }}>Task details and unavailable dates ({model.numbered.length})</summary>
      {model.numbered.filter(task => !highlight || task.id === highlight).map(task => <TaskJourney key={task.id} task={task} />)}
    </details>
  </div>;
};

export default WorkflowJourney;
