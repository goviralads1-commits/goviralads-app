import React, { useEffect, useMemo, useRef, useState } from 'react';

export const journeyDay = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};
const formatDate = value => journeyDay(value)
  ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  : 'Date unavailable';
const formatPointDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? formatDate(value)
  : `${new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'UTC' })} UTC`;
const dayMillis = 86400000;
export const workflowRows = ['ORDER PLACED', 'SCHEDULED (0%)', 'STARTED (1%–4%)', 'IN PROCESS (5%–99%)', 'COMPLETED (100%)'];
const lineColors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4d7c0f', '#1e40af', '#a16207', '#9333ea', '#0f766e', '#c2410c', '#0369a1', '#a21caf', '#15803d', '#e11d48', '#4338ca', '#78716c', '#b45309', '#047857', '#6d28d9', '#9f1239', '#0e7490', '#713f12'];
export const currentStage = progress => !Number.isFinite(progress) ? 'Stage unavailable' : progress === 0 ? 'Scheduled' : progress >= 100 ? 'Completed' : progress >= 5 ? 'In Process' : progress >= 1 ? 'Started' : 'Stage unavailable';

export function taskJourneyEvents(task) {
  const milestones = (task.milestones || []).flatMap((milestone, index) => milestone.reached === true ? [{
    key: `milestone:${index}`, row: null, label: milestone.name || `Milestone ${index + 1}`, date: milestone.reachedAt,
    detail: 'Saved milestone evidence. Configuration can change; this is not a permanent workflow transition.', progress: milestone.percentage,
  }] : []);
  // The authorized payload has no durable zero/first-progress transition timestamps.
  // Mutable milestones and today's progress must never supply those dates.
  const completed = journeyDay(task.completedAt) ? task.completedAt : null;
  return [
    { key: 'order', row: 0, label: 'Order placed', date: task.order?.createdAt, detail: task.order?.orderId || 'Order date unavailable' },
    { key: 'approval', row: null, label: 'Approval', date: task.approvedAt,
      detail: 'Recorded approval date. Progress at approval was not persisted; this is not a dated 0% transition.' },
    { key: 'scheduled', row: 1, label: 'Scheduled (0%)', date: undefined, detail: 'Date unavailable' },
    { key: 'started', row: 2, label: 'Started (1%–4%)', date: undefined, detail: 'First-progress date unavailable' },
    { key: 'process', row: 3, label: 'In Process (5%–99%)', date: undefined, detail: 'First ≥5% date unavailable' },
    ...milestones,
    { key: 'completed', row: 4, label: 'Completed', date: completed,
      detail: completed ? 'Recorded task completion.' : 'Actual completion date unavailable' },
  ];
}

// Both views share the same available dated evidence, never planned start/end dates.
export function taskJourneyRange(task) {
  const events = taskJourneyEvents(task);
  const dates = events.map(event => journeyDay(event.date)).filter(Boolean).sort();
  const orderDate = journeyDay(task.order?.createdAt);
  // Preserve Calendar's existing date bounds, but distinguish mutable range evidence
  // from a recorded workflow completion. It must not become a graph transition.
  const milestoneEnd = events.filter(event => event.key.startsWith('milestone:') && Number.isFinite(event.progress) && event.progress >= 100 && journeyDay(event.date))
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]?.date;
  const endEvidence = [task.completedAt, milestoneEnd].filter(journeyDay).sort((a, b) => new Date(a) - new Date(b))[0];
  const completed = Boolean(journeyDay(task.completedAt) && endEvidence === task.completedAt);
  return {
    start: orderDate,
    end: journeyDay(endEvidence) || dates[dates.length - 1] || null,
    completed,
    endLabel: completed ? 'Completed' : journeyDay(milestoneEnd) ? 'Saved 100% evidence' : 'Latest evidence',
    missingOrder: !orderDate,
  };
}

export function resolveJourneyOrder(task, orders = []) {
  const linked = task.order;
  if (!linked) return linked;
  // An internal ID is authoritative; a display code must never override it.
  const matches = orders.filter(order => linked.id ? order.id === linked.id : linked.orderId && order.orderId === linked.orderId);
  const unique = new Map(matches.map(order => [order.id || order.orderId, order]));
  if (unique.size !== 1) return linked;
  const recorded = [...unique.values()][0];
  return { ...linked, id: linked.id || recorded.id,
    createdAt: journeyDay(linked.createdAt) ? linked.createdAt : recorded.createdAt };
}

export function numberJourneyOrders(tasks, orders = [], startDate, endDate) {
  const available = [...orders, ...tasks.map(task => resolveJourneyOrder(task, orders)).filter(Boolean)]
    .filter(order => {
      const day = journeyDay(order.createdAt);
      return day && (order.id || order.orderId) && (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  const unique = [...new Map(available.map(order => [order.id || order.orderId, order])).values()]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a.id || a.orderId).localeCompare(String(b.id || b.orderId)));
  return new Map(unique.map((order, index) => [order.id || order.orderId, index + 1]));
}

export function numberJourneyTasks(tasks, orders = [], startDate, endDate) {
  const unique = [...new Map(tasks.map(task => [task.id, task])).values()]
    .map(task => ({ ...task, order: resolveJourneyOrder(task, orders) }));
  const numbers = numberJourneyOrders(unique, orders, startDate, endDate);
  return unique.map(task => ({ ...task, sequence: numbers.get(task.order?.id || task.order?.orderId) || null,
    sequenceNote: journeyDay(task.order?.createdAt) ? 'Order outside selected range · unnumbered' : 'Order date unavailable · unnumbered' }))
    .sort((a, b) => (a.sequence || Infinity) - (b.sequence || Infinity) || String(a.id).localeCompare(String(b.id)));
}

const journeyIdentity = task => task.order?.id || task.order?.orderId
  ? `order:${task.order.id || task.order.orderId}` : `task:${task.id}`;
const colorSeed = key => [...key].reduce((hash, character) => (Math.imul(hash, 31) + character.codePointAt(0)) >>> 0, 0);

export function buildJourneyColors(tasks, orders = []) {
  const keys = [...new Set([
    ...tasks.map(task => journeyIdentity({ ...task, order: resolveJourneyOrder(task, orders) })),
    ...orders.filter(order => order.id || order.orderId).map(order => `order:${order.id || order.orderId}`),
  ])].sort();
  const colors = new Map(), used = new Set();
  for (const key of keys) {
    if (used.size === lineColors.length) used.clear();
    let slot = colorSeed(key) % lineColors.length;
    while (used.has(slot)) slot = (slot + 1) % lineColors.length;
    used.add(slot);
    colors.set(key, lineColors[slot]);
  }
  return colors;
}

export const journeyColor = (task, colors) => colors?.get(journeyIdentity(task))
  || lineColors[colorSeed(journeyIdentity(task)) % lineColors.length];

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

export function journeyDatePoints(events) {
  const byDay = new Map();
  for (const event of events.filter(event => journeyDay(event.date)).sort((a, b) => new Date(a.date) - new Date(b.date) || a.row - b.row)) {
    const day = journeyDay(event.date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(event);
  }
  let furthestStage = null;
  return [...byDay].map(([day, records], index, days) => {
    const order = records.find(event => event.key === 'order');
    const transitions = records.filter(event => Number.isInteger(event.row));
    const representative = order || [...(transitions.length ? transitions : records)].sort((a, b) => b.row - a.row)[0];
    for (const event of transitions) furthestStage = Math.max(furthestStage ?? 0, event.row);
    return { ...representative, day, events: records, row: order ? 0 : furthestStage ?? 0,
      stageKnown: furthestStage !== null, supporting: !transitions.length,
      endpoint: Boolean(order) || index === days.length - 1, isOrder: Boolean(order) };
  });
}

function compactJourneyLayout(series, startDate, endDate, availableWidth) {
  const { count } = journeyDateAxis(startDate, endDate);
  const baseWidth = availableWidth ? Math.max(24, Math.min(36, availableWidth / 8)) : 80;
  const dayWidth = Math.max(baseWidth, (availableWidth || 320) / (count || 1));
  const width = Math.max(availableWidth, count * dayWidth);
  const labelWidth = availableWidth ? Math.min(126, availableWidth - 8) : 156;
  const columns = Array.from({ length: count }, (_, i) => ({
    day: new Date(new Date(startDate).getTime() + i * dayMillis).toISOString().slice(0, 10),
    left: i * dayWidth, width: dayWidth,
  }));
  const byDay = new Map(columns.map(column => [column.day, column]));
  const x = day => dayWidth / 2 + (new Date(day) - new Date(startDate)) / dayMillis * dayWidth;
  const labelStep = availableWidth ? 18 : 32;
  for (const line of series) {
    const occupied = new Map();
    line.labelLevels = 0;
    for (const point of line.points) {
      point.x = x(point.day);
      point.labels = [];
      if (!byDay.has(point.day)) continue;
      const addLabel = (kind, text) => {
        const limit = Math.floor(labelWidth / 7);
        let lines = text.match(new RegExp(`.{1,${limit}}(?:\\s|$)|.{1,${limit}}`, 'gu'))?.map(part => part.trim()) || [];
        if (availableWidth) lines = [text];
        else if (lines.length > 2) lines = [lines[0], `${lines[1].slice(0, -1)}…`];
        const size = kind === 'start' ? Math.max(10, text.length * 7) : labelWidth;
        const left = Math.max(4, Math.min(width - size - 4, point.x - size / 2));
        const levels = occupied.get(point.row) || [];
        let level = levels.findIndex(items => items.every(item => left >= item.right + 8 || left + size + 8 <= item.left));
        if (level < 0) { level = levels.length; levels.push([]); }
        levels[level].push({ left, right: left + size });
        occupied.set(point.row, levels);
        line.labelLevels = Math.max(line.labelLevels, level + 1);
        point.labels.push({ kind, lines, x: left, width: size, offsetY: 24 + level * labelStep });
      };
      if (point.isOrder && line.task.sequence) addLabel('start', String(line.task.sequence));
      // A single Order record has no separate end yet. Same-day later records
      // can expose an end title at that same dot without inventing a second point.
      if (point === line.points.at(-1) && (!point.isOrder || point.events.some(event => event.key !== 'order'))) {
        addLabel('end', `${line.task.sequence ? `${line.task.sequence} · ` : ''}${line.task.title || 'Untitled task'}`.replace(/\s+/g, ' ').trim());
      }
    }
    const bounds = line.points.flatMap(point => [point.x - 12, point.x + 12, ...point.labels.flatMap(label => [label.x - 4, label.x + label.width + 4])]);
    line.left = Math.min(...bounds);
    line.right = Math.max(...bounds);
    line.inRange = line.left <= width && line.right >= 0;
    line.trackHeight = Math.max(28, 22 + line.labelLevels * labelStep);
  }
  // Labels never widen dates. Reuse vertical tracks only for disjoint journeys;
  // concurrent journeys keep distinct dot/connector lanes, including siblings.
  const tracks = [];
  for (const line of [...series].filter(line => line.inRange).sort((a, b) => a.left - b.left || String(a.task.id).localeCompare(String(b.task.id)))) {
    let track = tracks.find(track => track.right + 8 < line.left && track.height >= line.trackHeight);
    if (!track) { track = { right: line.right, height: line.trackHeight }; tracks.push(track); }
    track.right = line.right;
    line.track = track;
  }
  let offset = 0;
  for (const track of tracks) { track.offset = offset; offset += track.height; }
  const allPoints = series.flatMap(line => line.points);
  const rows = [], bands = [];
  let height = 48;
  for (const row of [4, 3, 2, 1, 0]) {
    let bandHeight = 48;
    for (const line of series) for (const point of line.points.filter(point => point.row === row)) {
      point.y = height + 14 + (line.track?.offset || 0);
      for (const label of point.labels) label.y = point.y + label.offsetY;
      if (line.inRange) bandHeight = Math.max(bandHeight, point.y - height + 16,
        ...point.labels.map(label => label.y - height + label.lines.length * 14 - 6));
    }
    bands[row] = { top: height, height: bandHeight };
    rows[row] = height + bandHeight / 2;
    height += bandHeight;
  }
  const ticks = columns.map(column => column.day);
  const dated = allPoints.filter(point => byDay.has(point.day));
  const firstActual = dated.filter(point => point.isOrder).map(point => point.day).sort()[0] || dated.map(point => point.day).sort()[0] || startDate;
  for (const [lineIndex, line] of series.entries()) line.path = line.points.map((point, i) => {
    if (!i) return `M${point.x},${point.y}`;
    const previous = line.points[i - 1];
    if (previous.y === point.y) return `H${point.x}`;
    const dx = point.x - previous.x, dy = point.y - previous.y;
    const obstructed = series.some(other => other !== line && other.points.some(dot => {
      const t = Math.max(0, Math.min(1, ((dot.x - previous.x) * dx + (dot.y - previous.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(dot.x - previous.x - t * dx, dot.y - previous.y - t * dy) < 10;
    }));
    if (!obstructed) return `L${point.x},${point.y}`;
    // Detour between date centers if a diagonal would touch another task's dot.
    // Separate turn positions also avoid merging same-date vertical connectors.
    const gap = dayWidth - 20;
    const turnX = point.x - dayWidth / 2 - gap / 2 + (lineIndex + 0.5) * gap / series.length;
    return `H${turnX} V${point.y} H${point.x}`;
  }).join(' ');
  return { series, rows, bands, labelWidth, width, height, ticks, x, firstActual, count,
    dayWidth, columns, dayStart: day => byDay.get(day)?.left || 0 };
}

export function buildWorkflowGraph(timeline, startDate, endDate, mobileWidth = 0) {
  const colors = buildJourneyColors(timeline?.tasks || [], timeline?.orders || []);
  const numbered = numberJourneyTasks(timeline?.tasks || [], timeline?.orders || [], startDate, endDate);
  const numbers = numberJourneyOrders(numbered, timeline?.orders || [], startDate, endDate);
  const linked = new Set(numbered.map(task => task.order?.id || task.order?.orderId).filter(Boolean));
  const orderOnly = [...new Map((timeline?.orders || []).map(order => [order.id || order.orderId, order])).values()]
    .filter(order => !linked.has(order.id || order.orderId)).map(order => ({
      id: `order:${order.id || order.orderId}`, title: `Order ${order.orderId || ''}`, orderOnly: true,
      order, sequence: numbers.get(order.id || order.orderId), status: order.orderStatus,
    }));
  const series = [...numbered, ...orderOnly].map(task => {
    const events = task.orderOnly ? [
      { key: 'order', row: 0, label: 'Order placed', date: task.order.createdAt, detail: task.order.orderId },
      { key: 'approval', row: null, label: 'Approval', date: task.order.approvedAt, detail: 'Recorded approval; progress at approval unavailable' },
      { key: 'completed', row: 4, label: 'Completed', date: task.order.completedAt, detail: 'Recorded order completion' },
    ] : taskJourneyEvents(task);
    const points = journeyDatePoints(events);
    return { task, points, missing: events.filter(event => !journeyDay(event.date)), color: journeyColor(task, colors) };
  });
  return { ...compactJourneyLayout(series, startDate, endDate, mobileWidth), numbered };
}

export const TaskJourney = ({ task }) => {
  const events = taskJourneyEvents(task);
  const unavailable = events.filter(event => !journeyDay(event.date));
  return <article aria-label={`Workflow journey for ${task.title}`} style={{ minWidth: 0, marginTop: '8px', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '13px', overflowWrap: 'anywhere' }}>
    <strong>{task.sequence ? `Order ${task.sequence} · ` : ''}{task.title}</strong>
    <p style={{ margin: '6px 0', color: '#475569' }}>Order: {formatDate(task.order?.createdAt)}</p>
    <p style={{ margin: '6px 0' }}>{typeof task.progress === 'number' ? `${task.progress}% · ` : ''}{currentStage(task.progress)} <span style={{ color: '#64748b' }}>· current</span></p>
    <details><summary style={{ cursor: 'pointer', padding: '8px 0' }}>Package information</summary>
      {!task.sequence && <p>{task.sequenceNote || 'Order date unavailable · unnumbered'}</p>}
      {task.clientName && <p>Client: {task.clientName}</p>}
      <p>Status: {task.status || 'Unavailable'} · {(task.creditCost || 0).toLocaleString('en-IN')} credits</p>
      <p><strong>Scheduled start:</strong> {formatDate(task.startDate)} · <strong>Planned end:</strong> {formatDate(task.endDate || task.deadline)}. Planned dates are not plotted.</p>
      <details><summary>Recorded dates</summary>{journeyDatePoints(events).map(point => <details key={point.day} style={{ padding: '6px 0' }}><summary>{formatDate(point.day)} · {point.events.length} records</summary><JourneyDateEvents point={point} /></details>)}</details>
      {unavailable.length > 0 && <details><summary>Dates unavailable ({unavailable.length})</summary><p>Missing history is not inferred from current progress or plans.</p>{unavailable.map(event => <div key={event.key} style={{ padding: '4px 0' }}>{event.label} · Date unavailable</div>)}</details>}
      <details><summary>Milestone configuration · {(task.milestones || []).filter(m => m.reached).length} / {(task.milestones || []).length} reached</summary>
        <p>Separate milestone start dates and complete progress history are unavailable.</p>
        {(task.milestones || []).map((milestone, index) => <p key={index}>{milestone.name} · {milestone.percentage}% · {milestone.reached ? 'Reached' : 'Not reached'} · {formatDate(milestone.reached ? milestone.reachedAt : null)}</p>)}
      </details>
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

export const JourneyDateEvents = ({ point }) => <div style={{ marginTop: '8px' }}>
  {point.events.map(event => <details key={event.key} style={{ borderTop: '1px solid #eef2f7', padding: '8px 0' }}>
    <summary style={{ cursor: 'pointer', lineHeight: 1.5 }}><strong>{event.label}</strong>{Number.isFinite(event.progress) ? ` · ${event.progress}%` : ''}<time dateTime={event.date} style={{ display: 'block', color: '#64748b', fontSize: '12px' }}>{formatPointDate(event.date)}</time></summary>
    <p style={{ margin: '4px 0', color: '#64748b' }}>{event.detail}</p>
  </details>)}
</div>;

export function useJourneyDetail(model, onSelectDate, loadInputs) {
  const [activePoint, setActivePoint] = useState(null);
  const request = useRef(null);
  const closeDetail = () => { request.current?.abort(); setActivePoint(null); };
  useEffect(() => { setActivePoint(null); return () => request.current?.abort(); }, [model]);
  const loadSelection = async selection => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setActivePoint(selection);
    try {
      if (!loadInputs) throw new Error('Task inputs are unavailable.');
      const data = await loadInputs(selection.task, controller.signal);
      if (!data) throw new Error('Task inputs are unavailable.');
      if (!controller.signal.aborted) setActivePoint(current => current === selection ? { ...selection, loading: false, data } : current);
    } catch (error) {
      if (!controller.signal.aborted) setActivePoint(current => current === selection ? { ...selection, loading: false,
        error: error.response?.status === 403 ? 'You do not have access to these inputs.' : 'Unable to load saved inputs. Please try again.' } : current);
    }
  };
  const choosePoint = (line, point) => {
    request.current?.abort();
    const selection = { model, task: line.task, point, loading: point.endpoint };
    setActivePoint(selection);
    onSelectDate?.(point.day);
    if (point.endpoint) return loadSelection(selection);
  };
  const detail = activePoint?.model === model ? activePoint : null;
  const showInputs = () => detail && loadSelection({ ...detail, loading: true, error: null });
  return { detail, choosePoint, closeDetail, showInputs };
}

export const JourneyDetail = ({ detail, closeDetail, showInputs }) => !detail ? null : <section className="journey-detail" aria-label="Journey point details" aria-live="polite" onKeyDown={event => { if (event.key === 'Escape') closeDetail(); }} style={{ position: 'fixed', bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: '440px', boxSizing: 'border-box', zIndex: 100, boxShadow: '0 8px 32px #0f172a33', fontSize: '13px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflowWrap: 'anywhere', maxHeight: 'min(360px, calc(100dvh - 180px))', overflowY: 'auto' }}>
  <button type="button" onClick={closeDetail} style={{ float: 'right', minHeight: '40px', padding: '0 8px', cursor: 'pointer' }}>Close</button>
  <strong style={{ display: 'block', fontSize: '15px' }}>{formatDate(detail.point.day)}</strong>
  <p style={{ margin: '6px 0' }}>{detail.task.sequence ? `Order ${detail.task.sequence} · ` : ''}{detail.task.title}</p>
  {!detail.task.orderOnly && <p style={{ margin: '6px 0' }}>{currentStage(detail.task.progress)}{Number.isFinite(detail.task.progress) ? ` · ${detail.task.progress}%` : ''} · current</p>}
  <span style={{ color: '#64748b' }}>{detail.point.events.length} records on this date</span>
  {detail.point.supporting && <p style={{ margin: '6px 0', color: '#64748b' }}>Supporting activity · no workflow transition recorded on this date.</p>}
  <JourneyDateEvents point={detail.point} />
  <details style={{ marginTop: '8px', borderTop: '1px solid #e2e8f0' }} onToggle={event => { if (event.currentTarget.open && !detail.loading && !detail.data && !detail.error) showInputs(); }}>
    <summary style={{ cursor: 'pointer', padding: '12px 0', fontWeight: 600 }}>View task inputs &amp; content</summary>
    {detail.loading ? <p role="status">Loading saved client inputs…</p> : detail.error ? <div role="alert"><p>{detail.error}</p><button type="button" onClick={showInputs}>Retry inputs</button></div> : detail.data ? <JourneyInputs data={detail.data} orderOnly={detail.task.orderOnly} /> : <button type="button" onClick={showInputs}>Load saved inputs</button>}
  </details>
  {!detail.task.orderOnly && <a href={`/tasks/${encodeURIComponent(detail.task.id)}`} style={{ display: 'inline-block', padding: '10px 0', color: '#4338ca', textDecoration: 'underline' }}>Open task details</a>}
</section>;

const WorkflowJourney = ({ timeline, startDate, endDate, selectedDate, onSelectDate, loadInputs }) => {
  const container = useRef(null);
  const [mobileWidth, setMobileWidth] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 640px)');
    const measure = () => setMobileWidth(media.matches ? Math.max(160, (container.current?.clientWidth || window.innerWidth) - 74) : 0);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    measure();
    media.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); media.removeEventListener('change', measure); window.removeEventListener('resize', measure); };
  }, []);
  const model = useMemo(() => buildWorkflowGraph(timeline, startDate, endDate, mobileWidth), [timeline, startDate, endDate, mobileWidth]);
  const stageWidth = mobileWidth ? 72 : 110;
  const scroller = useRef(null);
  const [highlight, setHighlight] = useState('');
  const selection = useJourneyDetail(model, onSelectDate, loadInputs);
  const { closeDetail } = selection;
  // Selection/scroll changes do not rebuild the model or reset the user's viewport.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = model.dayStart ? model.dayStart(model.firstActual) : Math.max(0, model.x(model.firstActual) - model.dayWidth / 2);
    setHighlight('');
  }, [model]);
  const choosePoint = (line, point) => { setHighlight(line.task.id); return selection.choosePoint(line, point); };
  if (model.count <= 0) return <p>Choose a valid date range.</p>;
  const lines = [...model.series].sort((a, b) => Number(a.task.id === highlight) - Number(b.task.id === highlight));
  return <div ref={container} className="workflow-journey" style={{ minWidth: 0 }}>
    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>Bottom → top · one dot per journey/date. Tap for activity and inputs. Supporting activity stays at the last recorded stage; missing stage dates stay unavailable.</p>
    <JourneyDetail key={selection.detail ? `${selection.detail.task.id}:${selection.detail.point.day}` : 'closed'} {...selection} />
    <div style={{ display: 'flex', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'hidden', overflowY: 'auto', maxHeight: mobileWidth ? '480px' : undefined, background: '#fff' }}>
      <svg aria-label="Workflow stage axis" width={stageWidth} height={model.height} style={{ flex: `0 0 ${stageWidth}px`, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
        <text x={mobileWidth ? 6 : 10} y="27" fontSize="10" fill="#64748b">{mobileWidth ? 'STAGE' : 'STAGE / DATE'}</text>
        {workflowRows.map((label, row) => <g key={label}>
          <rect x="4" y={model.rows[row] - 20} width={stageWidth - 8} height="40" rx="8" fill="#f1f5f9" />
          <text x={mobileWidth ? 6 : 10} y={model.rows[row] - 3} fill="#475569" fontSize="11" fontWeight="600">{['Order', 'Scheduled', 'Started', 'In Process', 'Completed'][row]}<tspan x={mobileWidth ? 6 : 10} dy="14" fontSize="11">{['Placed', '(0%)', '(1%–4%)', '(5%–99%)', '(100%)'][row]}</tspan></text>
        </g>)}
      </svg>
      <div ref={scroller} tabIndex={0} role="region" aria-label="Workflow graph, scroll dates horizontally" style={{ minWidth: 0, flex: 1, height: model.height, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        <svg aria-label="Task journeys by actual date and workflow stage" width={model.width} height={model.height} style={{ display: 'block', overflow: 'hidden' }}>
          <title>One step-line per task or order. Points use saved evidence, not invented dates. Connectors do not imply daily progress history.</title>
          {model.bands.map((band, row) => <g key={row}>
            <rect x="0" y={band.top} width={model.width} height={band.height} fill={row % 2 ? '#fff' : '#f8fafc'} />
            <line x1="0" x2={model.width} y1={band.top + band.height} y2={band.top + band.height} stroke="#e2e8f0" />
          </g>)}
          {model.ticks.map(day => <g key={day}>
            <line x1={model.dayStart ? model.dayStart(day) : model.x(day) - model.dayWidth / 2} x2={model.dayStart ? model.dayStart(day) : model.x(day) - model.dayWidth / 2} y1="0" y2={model.height} stroke="#e2e8f0" />
            {mobileWidth && <text x={model.x(day)} y="12" textAnchor="middle" fontSize="10" fill="#64748b">{new Date(day).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</text>}
            <text x={model.x(day)} y={mobileWidth ? 27 : 20} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f172a">{mobileWidth ? Number(day.slice(-2)) : new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</text>
            <text x={model.x(day)} y="41" textAnchor="middle" fontSize="10" fill="#64748b">{new Date(day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).slice(0, mobileWidth ? 2 : 3)}</text>
          </g>)}
          {selectedDate && selectedDate >= startDate && selectedDate <= endDate && <line x1={model.x(selectedDate)} x2={model.x(selectedDate)} y1="44" y2={model.height} stroke="#a5b4fc" strokeDasharray="4 4" />}
          {lines.map(line => <g key={line.task.id} opacity={!highlight || highlight === line.task.id ? 1 : 0.15} pointerEvents="none">
            <path d={line.path} fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
            <path data-workflow-path="true" data-path-task={line.task.id} d={line.path} fill="none" stroke={line.color} strokeWidth={highlight === line.task.id ? 3 : 2} strokeLinejoin="round" />
          </g>)}
          {lines.map(line => {
            const visible = !highlight || highlight === line.task.id;
            return <g key={line.task.id} data-journey-task={line.task.id} opacity={visible ? 1 : 0.15}>
              {line.points.filter(point => point.day >= startDate && point.day <= endDate).map(point => <g key={point.day} data-event={point.key} data-stage={point.supporting ? 'SUPPORTING ACTIVITY' : workflowRows[point.row]} data-date={point.day} data-event-count={point.events.length} data-timestamp={point.date} role="button" tabIndex={visible ? 0 : -1} aria-label={`${line.task.sequence ? `${line.task.sequence} · ` : ''}${line.task.title}: ${formatDate(point.day)}, ${point.events.length} records${point.isOrder ? ', Order placed' : ''}, show activities and client inputs`} onClick={() => choosePoint(line, point)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choosePoint(line, point); } }} style={{ cursor: 'pointer' }}>
                <title>{`${line.task.title} · ${formatDate(point.day)} · ${point.events.length} records${point.isOrder ? ' · Order placed' : ''}`}</title>
                <rect data-point-target="true" x={point.x - 12} y={point.y - 12} width="24" height="24" fill="transparent" />
                <circle cx={point.x} cy={point.y} r="5" fill={line.color} stroke={line.color} strokeWidth="1.5" />
                {point.labels.map(label => <g key={label.kind} data-endpoint-label={label.kind} data-order-number={line.task.sequence || undefined}>
                  <rect x={label.x - 4} y={label.y - 12} width={label.width + 8} height={label.lines.length * 14 + 2} rx="4" fill="#fff" />
                  <foreignObject x={label.x} y={label.y - 12} width={label.width} height={label.lines.length * 14}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: line.color, fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: '14px', pointerEvents: 'none' }}>
                      {label.lines.map((text, index) => <div key={index} style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{text}</div>)}
                    </div>
                  </foreignObject>
                </g>)}
              </g>)}
            </g>;
          })}
        </svg>
      </div>
    </div>
    {!model.series.length && <p style={{ fontSize: '12px', color: '#64748b' }}>No tasks or orders in this range.</p>}
    <details style={{ marginTop: '12px', fontSize: '13px' }}><summary style={{ cursor: 'pointer', padding: '8px 0' }}>Packages · {model.series.length}</summary>
    <div aria-label="Journey key" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
      {model.series.map(line => <button key={line.task.id} type="button" aria-pressed={highlight === line.task.id} onClick={() => { setHighlight(previous => previous === line.task.id ? '' : line.task.id); closeDetail(); }} style={{ display: 'flex', gap: '8px', alignItems: 'center', textAlign: 'left', minWidth: 0, maxWidth: '100%', border: `1px solid ${highlight === line.task.id ? line.color : '#e2e8f0'}`, borderRadius: '8px', padding: '8px', background: '#fff', cursor: 'pointer', fontSize: '11px' }}>
        <span style={{ flexShrink: 0, minWidth: '24px', padding: '5px', borderRadius: '20px', background: line.color, color: '#fff', textAlign: 'center', fontWeight: 700 }}>{line.task.sequence || '—'}</span>
        <span style={{ overflowWrap: 'anywhere', minWidth: 0 }}><strong>{line.task.title}</strong><span style={{ display: 'block', color: '#64748b', marginTop: '3px' }}>Order: {formatDate(line.task.order?.createdAt)} · {line.task.orderOnly ? line.task.status : `${currentStage(line.task.progress)}${typeof line.task.progress === 'number' ? ` (${line.task.progress}%)` : ''}`}</span></span>
      </button>)}
    </div>
      {model.numbered.filter(task => !highlight || task.id === highlight).map(task => <TaskJourney key={task.id} task={task} />)}
    </details>
    <details style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}><summary style={{ cursor: 'pointer', padding: '8px 0' }}>About dates &amp; numbering</summary><p>Order dates are the journey start when available; dates outside this filter are clipped. Missing order dates remain unavailable, not replaced by Started. Only recorded workflow transitions move a journey upward. Supporting records stay at the last known stage, or at the base when stage history is unavailable; their position does not assert an Order or Scheduled event. The last point may be latest activity, not completion. Current progress and planned dates are not historical events.</p><p>Numbers belong to orders created within {startDate} → {endDate}, starting at 1. Earlier orders and unavailable order dates stay unnumbered. Milestones use the current saved configuration. Approval does not assert historical 0% progress.</p></details>
  </div>;
};

export default WorkflowJourney;
