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

function compactJourneyLayout(series, startDate, endDate, availableWidth) {
  const { count } = journeyDateAxis(startDate, endDate);
  const baseWidth = count > 366 ? Math.max(1, 26000 / count) : 48;
  const labelWidth = Math.min(140, Math.max(70, Math.floor(availableWidth / Math.min(count || 1, 2)) - 24));
  const groups = new Map();
  for (const line of series) for (const point of line.points) {
    const name = `${line.task.sequence ? `${line.task.sequence} · ` : ''}${line.task.title || 'Untitled task'}`.replace(/\s+/g, ' ').trim();
    const visible = point.day >= startDate && point.day <= endDate;
    point.labelLines = point.endpoint && visible ? name.match(new RegExp(`.{1,${Math.floor(labelWidth / 7)}}(?:\\s|$)|.{1,${Math.floor(labelWidth / 7)}}`, 'gu')).map(part => part.trim()) : [];
    const key = `${point.row}:${point.day}`;
    if (!groups.has(key)) groups.set(key, { day: point.day, points: [], width: 0 });
    groups.get(key).points.push(point);
  }
  const dayWidths = new Map();
  // Two rows only: crowded dates gain small horizontal slots, never more vertical lanes.
  for (const group of groups.values()) {
    for (let i = 0; i < group.points.length; i += 2) {
      const pair = group.points.slice(i, i + 2);
      const slotWidth = pair.some(point => point.labelLines.length) ? labelWidth + 8 : 32;
      pair.forEach((point, lane) => { point.mobileLane = lane; point.offsetX = group.width + slotWidth / 2; });
      group.width += slotWidth;
    }
    dayWidths.set(group.day, Math.max(dayWidths.get(group.day) || baseWidth, group.width + 16));
  }
  const columns = Array.from({ length: count }, (_, i) => {
    const day = new Date(new Date(startDate).getTime() + i * dayMillis).toISOString().slice(0, 10);
    return { day, width: dayWidths.get(day) || baseWidth };
  });
  const extra = Math.max(0, availableWidth - columns.reduce((sum, column) => sum + column.width, 0)) / (count || 1);
  let width = 0;
  for (const column of columns) { column.left = width; column.width += extra; width += column.width; }
  const byDay = new Map(columns.map(column => [column.day, column]));
  const x = day => {
    const column = byDay.get(day);
    return column ? column.left + column.width / 2 : day < startDate
      ? (new Date(day) - new Date(startDate)) / dayMillis * baseWidth + baseWidth / 2
      : width + (new Date(day) - new Date(endDate)) / dayMillis * baseWidth - baseWidth / 2;
  };
  for (const group of groups.values()) for (const point of group.points) {
    point.x = byDay.has(point.day) ? x(point.day) - group.width / 2 + point.offsetX : x(point.day);
    point.labelX = point.x - labelWidth / 2;
  }
  const allPoints = series.flatMap(line => line.points);
  const rows = [], bands = [];
  let height = 40;
  for (const row of [5, 4, 3, 2, 1, 0]) {
    const points = allPoints.filter(point => point.row === row);
    const visible = points.filter(point => byDay.has(point.day));
    const laneHeight = Math.max(32, ...visible.map(point => point.labelLines.length ? point.labelLines.length * 14 + 32 : 32));
    const lanes = Math.max(1, ...visible.map(point => point.mobileLane + 1));
    const bandHeight = Math.max(44, lanes * laneHeight + 4);
    for (const point of points) { point.y = height + 16 + (byDay.has(point.day) ? point.mobileLane : 0) * laneHeight; point.labelY = point.y + 20; }
    bands[row] = { top: height, height: bandHeight };
    rows[row] = height + bandHeight / 2;
    height += bandHeight;
  }
  const ticks = columns.filter((column, i) => i % Math.max(1, Math.ceil(44 / baseWidth)) === 0).map(column => column.day);
  const dated = allPoints.filter(point => byDay.has(point.day));
  const firstActual = dated.filter(point => point.row === 0).map(point => point.day).sort()[0] || dated.map(point => point.day).sort()[0] || startDate;
  for (const line of series) line.path = line.points.map((point, i) => i ? `H${point.x} V${point.y}` : `M${point.x},${point.y}`).join(' ');
  return { series, rows, bands, labelWidth, width: Math.max(availableWidth, width), height, ticks, x, firstActual, count,
    dayWidth: baseWidth, columns, dayStart: day => byDay.get(day)?.left || 0 };
}

export function buildWorkflowGraph(timeline, startDate, endDate, mobileWidth = 0) {
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
    points.forEach((point, i) => { point.endpoint = i === 0 || i === points.length - 1; });
    return { task, points, missing: events.filter(event => !journeyDay(event.date)), color: journeyColor(task, index) };
  });
  if (mobileWidth) return { ...compactJourneyLayout(series, startDate, endDate, mobileWidth), numbered };
  const { count, dayWidth, width, x, ticks } = journeyDateAxis(startDate, endDate);
  const labelWidth = Math.min(182, width / 2 - 24);
  const characters = Math.floor(labelWidth / 7);
  for (const line of series) for (const point of line.points) {
    point.x = x(point.day);
    point.labelX = point.x <= width / 2 ? point.x + 20 : point.x - 20 - labelWidth;
    const name = `${line.task.sequence ? `${line.task.sequence} · ` : ''}${line.task.title || 'Untitled task'}`.replace(/\s+/g, ' ').trim();
    point.labelLines = point.endpoint && point.day >= startDate && point.day <= endDate
      ? name.match(new RegExp(`.{1,${characters}}(?:\\s|$)|.{1,${characters}}`, 'gu')).map(part => part.trim()) : [];
    point.left = Math.min(point.x - 14, point.labelLines.length ? point.labelX - 4 : point.x - 14);
    point.right = Math.max(point.x + 14, point.labelLines.length ? point.labelX + labelWidth + 4 : point.x + 14);
  }
  // Pack every task's hit targets and endpoint names together, without shifting dates.
  const allPoints = series.flatMap(line => line.points);
  const bands = [];
  const rows = [];
  let height = 48;
  for (const row of [5, 4, 3, 2, 1, 0]) {
    const points = allPoints.filter(point => point.row === row).sort((a, b) => a.left - b.left);
    const laneEnds = [];
    const laneHeight = Math.max(32, ...points.map(point => point.labelLines.length * 14 + 12));
    for (const point of points) {
      let lane = laneEnds.findIndex(end => end + 8 <= point.left);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = point.right;
      point.y = height + 18 + lane * laneHeight;
    }
    const bandHeight = Math.max(64, laneEnds.length * laneHeight + 8);
    bands[row] = { top: height, height: bandHeight };
    rows[row] = height + bandHeight / 2;
    height += bandHeight;
  }
  const dated = allPoints.filter(point => point.day >= startDate && point.day <= endDate);
  const firstOrder = dated.filter(point => point.row === 0).map(point => point.day).sort()[0];
  const firstActual = firstOrder || dated.map(point => point.day).sort()[0] || startDate;
  for (const line of series) {
    line.path = line.points.map((point, index) => index ? `H${point.x} V${point.y}` : `M${point.x},${point.y}`).join(' ');
  }
  return { series, numbered, rows, bands, labelWidth, width, height, ticks, x, firstActual, count, dayWidth };
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

export const JourneyInputs = ({ data, orderOnly }) => {
  const groups = orderOnly ? (data?.items || []).map(item => ({
    title: item.planTitle, clientInputs: item.inputs, customInputLabel: item.planSnapshot?.customInputLabel,
  })) : [data || {}];
  const entries = groups.flatMap(group => {
    const fields = [];
    const add = (label, value) => {
      if (typeof value === 'string' && value.trim()) fields.push({ label: group.title ? `${group.title} · ${label}` : label, value });
    };
    (group.clientInputs || []).forEach((input, index) => {
      const suffix = group.clientInputs.length > 1 ? ` ${index + 1}` : '';
      add(`Video/content link${suffix}`, input.link);
      add(`${group.customInputLabel || 'Client input / reference'}${suffix}`, input.customInput);
    });
    add('Instructions / content', group.clientContentText);
    (group.clientContentLinks || []).forEach((link, index) => add(`Content link ${index + 1}`, link));
    add('Drive / reference link', group.clientDriveLink);
    add('Upload folder', group.clientUploadFolderLink);
    return fields;
  });
  if (!entries.length) return <p>No saved client inputs or content links are available.</p>;
  return <dl style={{ margin: '8px 0', lineHeight: 1.6 }}>{entries.map(({ label, value }, index) => {
    let href;
    try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch { /* Non-URL references stay readable as text. */ }
    return <div key={index} style={{ marginTop: '8px' }}><dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#4338ca', textDecoration: 'underline' }}>{value}</a> : value}</dd></div>;
  })}</dl>;
};

const WorkflowJourney = ({ timeline, startDate, endDate, selectedDate, onSelectDate, loadInputs }) => {
  const container = useRef(null);
  const [mobileWidth, setMobileWidth] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 640px)');
    const measure = () => setMobileWidth(media.matches ? Math.max(160, (container.current?.clientWidth || window.innerWidth) - 78) : 0);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    measure();
    media.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); media.removeEventListener('change', measure); window.removeEventListener('resize', measure); };
  }, []);
  const model = useMemo(() => buildWorkflowGraph(timeline, startDate, endDate, mobileWidth), [timeline, startDate, endDate, mobileWidth]);
  const stageWidth = mobileWidth ? 76 : 110;
  const scroller = useRef(null);
  const [highlight, setHighlight] = useState('');
  const [activePoint, setActivePoint] = useState(null);
  const request = useRef(null);
  const closeDetail = () => { request.current?.abort(); setActivePoint(null); };
  // Selection/scroll changes do not rebuild the model or reset the user's viewport.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = model.dayStart ? model.dayStart(model.firstActual) : Math.max(0, model.x(model.firstActual) - model.dayWidth / 2);
    setHighlight('');
    setActivePoint(null);
    return () => request.current?.abort();
  }, [model]);
  const choosePoint = async (line, point) => {
    request.current?.abort();
    const selection = { model, task: line.task, point, loading: point.endpoint };
    setHighlight(line.task.id);
    setActivePoint(selection);
    onSelectDate?.(point.day);
    if (!point.endpoint) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      if (!loadInputs) throw new Error('Task inputs are unavailable.');
      const data = await loadInputs(line.task, controller.signal);
      if (!data) throw new Error('Task inputs are unavailable.');
      if (!controller.signal.aborted) setActivePoint(current => current === selection ? { ...selection, loading: false, data } : current);
    } catch (error) {
      if (!controller.signal.aborted) setActivePoint(current => current === selection ? { ...selection, loading: false,
        error: error.response?.status === 403 ? 'You do not have access to these inputs.' : 'Unable to load saved inputs. Close and tap the endpoint to try again.' } : current);
    }
  };
  const detail = activePoint?.model === model ? activePoint : null;
  if (model.count <= 0) return <p>Choose a valid date range.</p>;
  const lines = [...model.series].sort((a, b) => Number(a.task.id === highlight) - Number(b.task.id === highlight));
  return <div ref={container} className="workflow-journey" style={{ minWidth: 0 }}>
    <style>{`@media (max-width: 640px) { .workflow-journey { margin-inline: -6px; } .workflow-journey .journey-detail { bottom: calc(84px + env(safe-area-inset-bottom, 0px)) !important; max-height: min(280px, calc(100dvh - 180px)) !important; } }`}</style>
    <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 12px' }}>Each line connects actual dated evidence. Tap a named endpoint for client inputs or a dot for milestone details. The last point is the latest recorded evidence, not necessarily completion.</p>
    {detail && <section className="journey-detail" aria-label="Journey point details" aria-live="polite" onKeyDown={event => { if (event.key === 'Escape') closeDetail(); }} style={{ position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 32px)', maxWidth: '440px', boxSizing: 'border-box', zIndex: 100, boxShadow: '0 8px 32px #0f172a33', fontSize: '12px', padding: '12px', background: '#eef2ff', borderRadius: '8px', overflowWrap: 'anywhere', maxHeight: '280px', overflowY: 'auto' }}>
      <button type="button" onClick={closeDetail} style={{ float: 'right', marginLeft: '8px', cursor: 'pointer' }}>Close</button>
      <strong>{detail.task.sequence ? `${detail.task.sequence} · ` : ''}{detail.task.title}</strong>
      <p>{detail.point.label} · {formatDate(detail.point.date)}</p><p>{detail.point.detail}</p>
      {detail.point.endpoint && <>
        {detail.loading ? <p role="status">Loading saved client inputs…</p> : detail.error ? <p role="alert">{detail.error}</p> : <JourneyInputs data={detail.data} orderOnly={detail.task.orderOnly} />}
        {!detail.task.orderOnly && <a href={`/tasks/${encodeURIComponent(detail.task.id)}`} style={{ color: '#4338ca', textDecoration: 'underline' }}>Open task details</a>}
      </>}
    </section>}
    <div style={{ display: 'flex', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <svg aria-label="Workflow stage axis" width={stageWidth} height={model.height} style={{ flex: `0 0 ${stageWidth}px`, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
        <text x={mobileWidth ? 6 : 10} y="27" fontSize="10" fill="#64748b">{mobileWidth ? 'STAGE' : 'STAGE / DATE'}</text>
        {workflowRows.map((label, row) => <g key={label}>
          <rect x="4" y={model.rows[row] - (mobileWidth ? 20 : 24)} width={stageWidth - 8} height={mobileWidth ? 40 : 48} rx="8" fill={`${stageColors[row]}0d`} />
          <text x={mobileWidth ? 6 : 10} y={model.rows[row] + (mobileWidth && (row === 1 || row === 2) ? -3 : 4)} fill={stageColors[row]} fontSize="10" fontWeight="700">{mobileWidth ? ['Order', 'Scheduled', 'Started', 'In Process', 'Milestones', 'Completed'][row] : label}{mobileWidth && (row === 1 || row === 2) && <tspan x="6" dy="13" fontSize="9">{row === 1 ? '(0%)' : '(≥1%)'}</tspan>}</text>
        </g>)}
      </svg>
      <div ref={scroller} tabIndex={0} role="region" aria-label="Workflow graph, scroll dates horizontally" style={{ minWidth: 0, flex: 1, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <svg aria-label="Task journeys by actual date and workflow stage" width={model.width} height={model.height} style={{ display: 'block', overflow: 'hidden' }}>
          <title>One step-line per task or order. Points use saved evidence, not invented dates. Connectors do not imply daily progress history.</title>
          {model.bands.map((band, row) => <g key={row}>
            <rect x="0" y={band.top} width={model.width} height={band.height} fill={row % 2 ? '#fff' : '#f8fafc'} />
            <line x1="0" x2={model.width} y1={band.top + band.height} y2={band.top + band.height} stroke="#e2e8f0" />
          </g>)}
          {model.ticks.map(day => <g key={day}>
            <line x1={model.dayStart ? model.dayStart(day) : model.x(day) - model.dayWidth / 2} x2={model.dayStart ? model.dayStart(day) : model.x(day) - model.dayWidth / 2} y1="0" y2={model.height} stroke="#e2e8f0" />
            <text x={model.x(day)} y="20" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>
            {!mobileWidth && <text x={model.x(day)} y="36" textAnchor="middle" fontSize="10" fill="#64748b">{new Date(day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</text>}
          </g>)}
          {selectedDate && selectedDate >= startDate && selectedDate <= endDate && <line x1={model.x(selectedDate)} x2={model.x(selectedDate)} y1="44" y2={model.height} stroke="#a5b4fc" strokeDasharray="4 4" />}
          {lines.map(line => <path key={line.task.id} data-workflow-path="true" d={line.path} fill="none" stroke={line.color} strokeWidth={highlight === line.task.id ? 3 : 2} strokeLinejoin="round" opacity={!highlight || highlight === line.task.id ? 1 : 0.15} pointerEvents="none" />)}
          {lines.map(line => {
            const visible = !highlight || highlight === line.task.id;
            return <g key={line.task.id} data-journey-task={line.task.id} opacity={visible ? 1 : 0.15}>
              {line.points.filter(point => point.day >= startDate && point.day <= endDate).map(point => <g key={point.key} data-event={point.key} data-stage={workflowRows[point.row]} data-date={point.day} role="button" tabIndex={visible ? 0 : -1} aria-label={`${line.task.sequence ? `${line.task.sequence} · ` : ''}${line.task.title}: ${point.label}, ${formatDate(point.date)}${point.endpoint ? ', show client inputs' : ''}`} onClick={() => choosePoint(line, point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choosePoint(line, point); } }} style={{ cursor: 'pointer' }}>
                <title>{`${line.task.title} · ${point.label} · ${formatDate(point.date)} · ${point.detail || ''}`}</title>
                <circle cx={point.x} cy={point.y} r="14" fill="transparent" />
                <circle cx={point.x} cy={point.y} r="6" fill={point.key === 'approval' ? '#fff' : stageColors[point.row]} stroke={point.key === 'approval' ? '#60a5fa' : '#fff'} strokeWidth="1.5" />
                {point.labelLines.length > 0 && <g data-endpoint-label="true" data-order-number={line.task.sequence || undefined}>
                  <rect x={point.labelX - 4} y={(point.labelY ?? point.y) - 12} width={model.labelWidth + 8} height={point.labelLines.length * 14 + 6} rx="4" fill="#fff" />
                  <text fill={line.color} fontFamily="monospace" fontSize="11" fontWeight="600">{point.labelLines.map((text, index) => <tspan key={index} x={point.labelX} y={(point.labelY ?? point.y) + 4 + index * 14} textLength={Math.min(model.labelWidth, text.length * 7)} lengthAdjust="spacingAndGlyphs">{text}</tspan>)}</text>
                </g>}
              </g>)}
            </g>;
          })}
        </svg>
      </div>
    </div>
    {!model.series.length && <p style={{ fontSize: '12px', color: '#64748b' }}>No tasks or orders in this range.</p>}
    <div aria-label="Journey key" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', maxHeight: '160px', overflowY: 'auto' }}>
      {model.series.map(line => <button key={line.task.id} type="button" aria-pressed={highlight === line.task.id} onClick={() => { setHighlight(previous => previous === line.task.id ? '' : line.task.id); closeDetail(); }} style={{ display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left', minWidth: 0, maxWidth: '100%', border: `1px solid ${highlight === line.task.id ? line.color : '#e2e8f0'}`, borderRadius: '8px', padding: '8px', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>
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
