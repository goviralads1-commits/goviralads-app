import React, { useEffect, useMemo, useRef, useState } from 'react';
import { journeyDateAxis, journeyColor, buildJourneyColors, numberJourneyTasks, taskJourneyRange, TaskJourney, buildWorkflowGraph, useJourneyDetail, JourneyDetail } from './WorkflowJourney';

export function buildCalendarRanges(tasks, rangeStart, rangeEnd, orders = []) {
  const axis = journeyDateAxis(rangeStart, rangeEnd);
  const dated = [], undated = [];
  if (!axis.count) return { ...axis, tasks: dated, undated };
  const numbered = numberJourneyTasks(tasks, orders, rangeStart, rangeEnd);
  const colors = buildJourneyColors(tasks, orders);
  for (const task of numbered) {
    const range = taskJourneyRange(task);
    if (!range.start || !range.end || range.end < range.start || range.start > rangeEnd || range.end < rangeStart) {
      undated.push(task);
      continue;
    }
    const visibleStart = range.start < rangeStart ? rangeStart : range.start;
    const visibleEnd = range.end > rangeEnd ? rangeEnd : range.end;
    const left = axis.x(visibleStart) - axis.dayWidth / 2;
    const right = axis.x(visibleEnd) + axis.dayWidth / 2;
    dated.push({ task, ...range, visibleStart, visibleEnd, left, width: right - left, row: dated.length, color: journeyColor(task, colors) });
  }
  return { ...axis, tasks: dated, undated };
}

export function buildCalendarDays(model, series, rangeStart) {
  const ranges = new Map(model.tasks.map(range => [range.task.id, range]));
  const records = new Map(series.map(line => [line.task.id, new Map(line.points.map(point => [point.day, point]))]));
  return Array.from({ length: model.count }, (_, index) => {
    const day = new Date(new Date(rangeStart).getTime() + index * 86400000).toISOString().slice(0, 10);
    const journeys = series.flatMap(line => {
      const range = ranges.get(line.task.id), point = records.get(line.task.id).get(day);
      return point || (range && range.start <= day && range.end >= day) ? [{ line, point, range }] : [];
    });
    return { day, journeys };
  });
}

const shortDate = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const WorkflowCalendar = ({ tasks = [], orders = [], rangeStart, rangeEnd, selectedDate, onSelectDate, loadInputs }) => {
  const model = useMemo(() => buildCalendarRanges(tasks, rangeStart, rangeEnd, orders), [tasks, orders, rangeStart, rangeEnd]);
  const graph = useMemo(() => buildWorkflowGraph({ tasks, orders }, rangeStart, rangeEnd), [tasks, orders, rangeStart, rangeEnd]);
  const days = useMemo(() => buildCalendarDays(model, graph.series, rangeStart), [model, graph, rangeStart]);
  const selection = useJourneyDetail(graph, onSelectDate, loadInputs);
  const scroller = useRef(null);
  const [focusedTask, setFocusedTask] = useState(null);
  const [chosenDate, setChosenDate] = useState(null);
  const firstDate = model.tasks.map(range => range.visibleStart).sort()[0] || rangeStart;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, model.x(firstDate) - model.dayWidth / 2);
    setFocusedTask(null);
    setChosenDate(null);
  }, [model, firstDate]);
  const activeDate = selectedDate && selectedDate >= rangeStart && selectedDate <= rangeEnd ? selectedDate : chosenDate || firstDate;
  const activeJourneys = days.find(item => item.day === activeDate)?.journeys || [];
  const chooseDay = day => { setChosenDate(day); setFocusedTask(null); selection.closeDetail(); onSelectDate?.(day); };
  const choose = range => { chooseDay(range.visibleStart); setFocusedTask(range.task.id); };
  if (!model.count) return <p>Choose a valid date range.</p>;
  const height = 56 + Math.max(1, model.tasks.length) * 64;
  return <div className="client-workflow-calendar" style={{ minWidth: 0 }}>
    <style>{`.client-workflow-calendar .calendar-days { display: none; } @media (max-width: 640px) { .client-workflow-calendar .calendar-ranges { display: none; } .client-workflow-calendar .calendar-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; max-height: 340px; overflow-y: auto; } }`}</style>
    <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{shortDate(rangeStart)} – {shortDate(rangeEnd)} · Tap a date to explore its packages.</p>
    <JourneyDetail key={selection.detail ? `${selection.detail.task.id}:${selection.detail.point.day}` : 'closed'} {...selection} />
    <div className="calendar-days" aria-label="Calendar dates">
      {days.map(({ day, journeys }) => <button key={day} type="button" data-calendar-day={day} aria-label={`${shortDate(day)}, ${journeys.length} journeys`} aria-pressed={day === activeDate} onClick={() => chooseDay(day)} style={{ minWidth: 0, minHeight: '62px', padding: '4px 0', border: `1px solid ${day === activeDate ? '#a5b4fc' : '#e2e8f0'}`, borderRadius: '8px', background: day === activeDate ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer' }}>
        <span style={{ display: 'block', fontSize: '11px' }}>{new Date(day).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
        <strong style={{ display: 'block', fontSize: '14px' }}>{Number(day.slice(-2))}</strong>
        <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>{journeys.length ? `${journeys.length} pkg` : '—'}</span>
      </button>)}
    </div>
    <div className="calendar-ranges" style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
      <div style={{ display: 'flex', minWidth: 0 }}>
        <div aria-label="Calendar task rows" style={{ flex: '0 0 130px', minWidth: 0, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ height: '56px', padding: '16px 8px', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>TASK / ORDER</div>
          {model.tasks.map(range => <button key={range.task.id} type="button" onClick={() => choose(range)} title={range.task.title} style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', height: '64px', border: 0, borderBottom: '1px solid #e2e8f0', padding: '6px', background: focusedTask === range.task.id ? '#eef2ff' : '#fff', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flexShrink: 0, padding: '5px', minWidth: '24px', borderRadius: '20px', color: '#fff', background: range.color, fontSize: '11px', textAlign: 'center', fontWeight: 700 }}>{range.task.sequence || '—'}</span>
            <span style={{ minWidth: 0, fontSize: '12px', color: '#0f172a' }}><strong style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{range.task.title}</strong><span style={{ display: 'block', color: '#64748b', marginTop: '3px', fontSize: '10px' }}>{range.completed ? 'Completed' : 'Latest evidence'}</span></span>
          </button>)}
        </div>
        <div ref={scroller} tabIndex={0} role="region" aria-label="Calendar ranges, scroll dates horizontally" style={{ flex: 1, minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg width={model.width} height={height} aria-label="Continuous order-to-completion Calendar ranges" style={{ display: 'block' }}>
            <title>One row per task. Solid bars use recorded order-to-completion dates, or end at the latest known event. Unknown completion is not projected to a planned deadline.</title>
            {model.ticks.map(day => <g key={day} role="button" tabIndex={0} aria-label={`Calendar ${day}`} onClick={() => chooseDay(day)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseDay(day); } }} style={{ cursor: 'pointer' }}>
              <rect x={model.x(day) - model.dayWidth / 2} y="0" width={model.dayWidth} height={height} fill={day === activeDate ? '#eef2ff' : 'transparent'} />
              <line x1={model.x(day) - model.dayWidth / 2} x2={model.x(day) - model.dayWidth / 2} y1="0" y2={height} stroke="#e2e8f0" />
              <text x={model.x(day)} y="22" textAnchor="middle" fontSize="11" fill="#0f172a">{shortDate(day)}</text>
              <text x={model.x(day)} y="39" textAnchor="middle" fontSize="10" fill="#64748b">{new Date(day).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</text>
            </g>)}
            {model.tasks.map(range => <g key={range.task.id} data-range-task={range.task.id} data-range-start={range.start} data-range-end={range.end} data-calendar-row={range.row} role="button" tabIndex={0} aria-label={`${range.task.title}: ${range.start} to ${range.end}${range.completed ? '' : ', completion unavailable'}`} onClick={() => choose(range)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(range); } }} style={{ cursor: 'pointer' }}>
              <title>{`${range.task.title} · ${range.start} → ${range.end}${range.completed ? ' · Recorded completion' : ' · Latest dated evidence; completion unavailable'}`}</title>
              <line x1="0" x2={model.width} y1={56 + range.row * 64} y2={56 + range.row * 64} stroke="#e2e8f0" />
              <rect x={range.left + 1} y={72 + range.row * 64} width={Math.max(2, range.width - 2)} height="30" rx="15" fill={range.color} opacity={focusedTask && focusedTask !== range.task.id ? 0.45 : 0.88} />
              <text x={range.left + 10} y={92 + range.row * 64} fontSize="10" fontWeight="700" fill="#fff">{range.start < rangeStart ? '← ' : ''}{shortDate(range.visibleStart)}</text>
              <text x={range.left + range.width - 7} y={115 + range.row * 64} textAnchor="end" fontSize="10" fill={range.color}>{range.end > rangeEnd ? 'Continues →' : `${range.completed ? 'Completed' : 'Latest evidence'} ${shortDate(range.end)}`}</text>
            </g>)}
          </svg>
        </div>
      </div>
    </div>
    {!model.tasks.length && <p style={{ fontSize: '12px', color: '#64748b' }}>No recorded ranges in this window.</p>}
    <details key={`${activeDate}:${focusedTask || ''}`} style={{ marginTop: '12px', fontSize: '13px', color: '#475569' }} open={Boolean(focusedTask || chosenDate)}>
      <summary style={{ cursor: 'pointer', padding: '10px 0' }}>{activeDate} · {activeJourneys.length} tasks</summary>
      {!activeJourneys.length && <p>No recorded journeys on this date.</p>}
      {activeJourneys.filter(({ line }) => !focusedTask || line.task.id === focusedTask).map(({ line, point, range }) => <article key={line.task.id} style={{ padding: '12px', marginTop: '8px', border: '1px solid #e2e8f0', borderLeft: `3px solid ${line.color}`, borderRadius: '10px', overflowWrap: 'anywhere' }}>
        <strong>{line.task.sequence ? `${line.task.sequence} · ` : ''}{line.task.title}</strong>
        <p style={{ margin: '6px 0', color: '#64748b' }}>{range ? `${shortDate(range.start)} → ${shortDate(range.end)} · ${range.completed ? 'Completed' : 'Latest evidence'}` : 'Order range unavailable'}</p>
        <button type="button" data-calendar-detail={line.task.id} onClick={() => selection.choosePoint(line, point || { day: activeDate, events: [], endpoint: false })} style={{ minHeight: '40px', border: 0, padding: '6px 0', background: 'transparent', color: line.color, cursor: 'pointer', fontWeight: 600 }}>{point ? `${point.events.length} records · View activity & inputs` : 'No activity recorded today · View inputs'}</button>
      </article>)}
    </details>
    <details style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}><summary style={{ cursor: 'pointer', padding: '8px 0' }}>About journey ranges</summary><p>Ranges begin at the recorded order date and end at completion or the latest dated evidence. A package on a date indicates its range, not a recorded activity every day. Planned dates are not plotted; missing history stays unavailable.</p></details>
    {model.undated.length > 0 && <details style={{ fontSize: '12px', color: '#64748b', marginTop: '12px' }}><summary>Other returned tasks · actual range unavailable or outside this window ({model.undated.length})</summary>{model.undated.map(task => <TaskJourney key={task.id} task={task} />)}</details>}
  </div>;
};

export default WorkflowCalendar;
