import React, { useEffect, useMemo, useRef, useState } from 'react';
import { journeyDateAxis, journeyColor, numberJourneyTasks, taskJourneyRange, TaskJourney } from './WorkflowJourney';

export function buildCalendarRanges(tasks, rangeStart, rangeEnd, orders = []) {
  const axis = journeyDateAxis(rangeStart, rangeEnd);
  const dated = [], undated = [];
  if (!axis.count) return { ...axis, tasks: dated, undated };
  const numbered = numberJourneyTasks(tasks, orders, rangeStart, rangeEnd);
  for (const [index, task] of numbered.entries()) {
    const range = taskJourneyRange(task);
    if (!range.start || !range.end || range.end < range.start || range.start > rangeEnd || range.end < rangeStart) {
      undated.push(task);
      continue;
    }
    const visibleStart = range.start < rangeStart ? rangeStart : range.start;
    const visibleEnd = range.end > rangeEnd ? rangeEnd : range.end;
    const left = axis.x(visibleStart) - axis.dayWidth / 2;
    const right = axis.x(visibleEnd) + axis.dayWidth / 2;
    dated.push({ task, ...range, visibleStart, visibleEnd, left, width: right - left, row: dated.length, color: journeyColor(task, index) });
  }
  return { ...axis, tasks: dated, undated };
}

const shortDate = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const WorkflowCalendar = ({ tasks = [], orders = [], rangeStart, rangeEnd, selectedDate, onSelectDate }) => {
  const model = useMemo(() => buildCalendarRanges(tasks, rangeStart, rangeEnd, orders), [tasks, orders, rangeStart, rangeEnd]);
  const scroller = useRef(null);
  const [focusedTask, setFocusedTask] = useState(null);
  const firstDate = model.tasks.map(range => range.visibleStart).sort()[0] || rangeStart;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, model.x(firstDate) - model.dayWidth / 2);
    setFocusedTask(null);
  }, [model, firstDate]);
  const activeDate = selectedDate && selectedDate >= rangeStart && selectedDate <= rangeEnd ? selectedDate : firstDate;
  const activeTasks = model.tasks.filter(range => range.start <= activeDate && range.end >= activeDate).map(range => range.task);
  const choose = range => { setFocusedTask(range.task.id); onSelectDate?.(range.visibleStart); };
  if (!model.count) return <p>Choose a valid date range.</p>;
  const height = 56 + Math.max(1, model.tasks.length) * 64;
  return <div style={{ minWidth: 0 }}>
    <p style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.6 }}>Order journey ranges · {rangeStart} → {rangeEnd}. Each row starts at its recorded order date and ends at completion, or the latest dated evidence when completion is unavailable. The ≥1% Started event is separate. Swipe dates horizontally.</p>
    <div style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
      <div style={{ display: 'flex', minWidth: 0 }}>
        <div aria-label="Calendar task rows" style={{ flex: '0 0 130px', minWidth: 0, background: '#fff', borderRight: '1px solid #e2e8f0' }}>
          <div style={{ height: '56px', padding: '16px 8px', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>TASK / ORDER</div>
          {model.tasks.map(range => <button key={range.task.id} type="button" onClick={() => choose(range)} title={range.task.title} style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', height: '64px', border: 0, borderBottom: '1px solid #e2e8f0', padding: '6px', background: focusedTask === range.task.id ? '#eef2ff' : '#fff', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flexShrink: 0, padding: '5px', minWidth: '24px', borderRadius: '20px', color: '#fff', background: range.color, fontSize: '11px', textAlign: 'center', fontWeight: 700 }}>{range.task.sequence || '—'}</span>
            <span style={{ minWidth: 0, fontSize: '10px', color: '#0f172a' }}><strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{range.task.title}</strong><span style={{ display: 'block', color: '#64748b', marginTop: '3px', lineHeight: 1.5 }}>{shortDate(range.start)} – {range.completed ? shortDate(range.end) : 'End unknown'}</span></span>
          </button>)}
        </div>
        <div ref={scroller} tabIndex={0} role="region" aria-label="Calendar ranges, scroll dates horizontally" style={{ flex: 1, minWidth: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg width={model.width} height={height} aria-label="Continuous order-to-completion Calendar ranges" style={{ display: 'block' }}>
            <title>One row per task. Solid bars use recorded order-to-completion dates, or end at the latest known event. Unknown completion is not projected to a planned deadline.</title>
            {model.ticks.map(day => <g key={day} role="button" tabIndex={0} aria-label={`Calendar ${day}`} onClick={() => { setFocusedTask(null); onSelectDate?.(day); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocusedTask(null); onSelectDate?.(day); } }} style={{ cursor: 'pointer' }}>
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
    <details style={{ marginTop: '12px', fontSize: '12px', color: '#475569' }} open={Boolean(focusedTask)}>
      <summary style={{ cursor: 'pointer' }}>{activeDate} · {activeTasks.length} tasks · details</summary>
      {activeTasks.filter(task => !focusedTask || task.id === focusedTask).map(task => <TaskJourney key={task.id} task={task} />)}
    </details>
    {model.undated.length > 0 && <details style={{ fontSize: '12px', color: '#64748b', marginTop: '12px' }}><summary>Other returned tasks · actual range unavailable or outside this window ({model.undated.length})</summary>{model.undated.map(task => <TaskJourney key={task.id} task={task} />)}</details>}
  </div>;
};

export default WorkflowCalendar;
