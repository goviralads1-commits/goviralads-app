import React, { useEffect, useMemo, useState } from 'react';
import { normalizeWorkflowTask } from './workflowTimelineTask';

const STATUS_COLOR = {
  PENDING_APPROVAL: '#f97316',
  PENDING: '#eab308',
  ACTIVE: '#3b82f6',
  IN_PROGRESS: '#3b82f6',
  COMPLETED: '#22c55e',
  CANCELLED: '#94a3b8',
};

const dayKey = (date) => date.toISOString().slice(0, 10);
const toDate = (value) => value ? new Date(`${new Date(value).toISOString().slice(0, 10)}T00:00:00.000Z`) : null;
const labelDate = (value) => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  : '—';

const WorkflowCalendar = ({ tasks = [], rangeStart, selectedDate, onSelectDate }) => {
  const [compact, setCompact] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { days, byDay, monthLabel } = useMemo(() => {
    const focus = rangeStart ? new Date(`${rangeStart}T00:00:00.000Z`) : new Date();
    const monthStart = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth() + 1, 0));
    const firstWeekday = monthStart.getUTCDay();
    const allDays = Array.from({ length: firstWeekday + monthEnd.getUTCDate() }, (_, index) => {
      if (index < firstWeekday) return null;
      return dayKey(new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), index - firstWeekday + 1)));
    });
    const events = new Map();
    tasks.forEach(rawTask => {
      const task = normalizeWorkflowTask(rawTask);
      const start = toDate(task.calendarStartDate);
      const due = toDate(task.calendarEndDate);
      if (!start || !due) return;
      const first = start <= due ? start : due;
      const last = start <= due ? due : start;
      for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const key = dayKey(cursor);
        if (!events.has(key)) events.set(key, []);
        events.get(key).push(task);
      }
    });
    return {
      days: allDays,
      byDay: events,
      monthLabel: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
  }, [tasks, rangeStart]);

  const activeDate = selectedDate || days.find(Boolean) || null;
  const activeTasks = activeDate ? (byDay.get(activeDate) || []) : [];
  const visibleLimit = compact ? 1 : 3;

  return (
    <div style={{ marginTop: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#334155', margin: 0 }}>{monthLabel}</p>
        <p style={{ fontSize: '10.5px', color: '#94a3b8', margin: 0 }}>Tap a day for its tasks</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: compact ? '3px' : '5px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{ textAlign: 'center', fontSize: compact ? '9px' : '10px', fontWeight: '700', color: '#94a3b8', paddingBottom: '2px' }}>{day}</div>
        ))}
        {days.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} />;
          const dayTasks = byDay.get(date) || [];
          const shown = dayTasks.slice(0, visibleLimit);
          const hidden = dayTasks.length - shown.length;
          const selected = date === activeDate;
          return (
            <button key={date} type="button" onClick={() => onSelectDate(date)} style={{ minHeight: compact ? '62px' : '92px', padding: compact ? '4px' : '6px', textAlign: 'left', overflow: 'hidden', borderRadius: '8px', border: selected ? '1px solid #6366f1' : '1px solid #e2e8f0', background: selected ? '#eef2ff' : '#fff', cursor: 'pointer' }}>
              <span style={{ display: 'block', fontSize: compact ? '10px' : '11px', fontWeight: selected ? '800' : '600', color: selected ? '#4f46e5' : '#64748b', marginBottom: '3px' }}>{Number(date.slice(-2))}</span>
              {shown.map(task => (
                <span key={task.id} title={task.title} style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: '2px', borderRadius: '3px', padding: compact ? '1px 3px' : '2px 4px', fontSize: compact ? '8px' : '9px', lineHeight: 1.25, color: '#fff', background: STATUS_COLOR[task.status] || '#64748b' }}>{task.title}</span>
              ))}
              {hidden > 0 && <span style={{ display: 'block', fontSize: compact ? '8px' : '9px', fontWeight: '700', color: '#4f46e5' }}>+{hidden} more</span>}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: '12px', borderTop: '1px solid #eef2f7', paddingTop: '10px' }}>
        <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{activeDate ? labelDate(activeDate) : 'Selected day'}</p>
        {activeTasks.length === 0 ? (
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>No dated tasks on this day.</p>
        ) : activeTasks.map(task => (
          <div key={task.id} style={{ borderLeft: `3px solid ${STATUS_COLOR[task.status] || '#64748b'}`, padding: '6px 8px', marginBottom: '6px', background: '#f8fafc', borderRadius: '0 7px 7px 0' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{task.title}</p>
            {task.clientName && <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#475569' }}>Client: {task.clientName}</p>}
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>Start: {labelDate(task.startDate)} · End: {labelDate(task.endDate || task.deadline)} · {task.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkflowCalendar;
