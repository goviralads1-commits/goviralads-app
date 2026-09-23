import React, { useEffect, useMemo, useState } from 'react';

const colors = { PENDING_APPROVAL: '#f97316', PENDING: '#eab308', ACTIVE: '#3b82f6', IN_PROGRESS: '#3b82f6', COMPLETED: '#22c55e', CANCELLED: '#94a3b8' };
const key = date => date.toISOString().slice(0, 10);
const safeDate = value => value ? new Date(`${new Date(value).toISOString().slice(0, 10)}T00:00:00.000Z`) : null;
const label = value => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';

const WorkflowCalendar = ({ tasks = [], rangeStart, selectedDate, onSelectDate }) => {
  const [compact, setCompact] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth < 640);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const { days, events, labelMonth } = useMemo(() => {
    const focus = rangeStart ? new Date(`${rangeStart}T00:00:00.000Z`) : new Date();
    const first = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), 1));
    const last = new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth() + 1, 0));
    const daysInGrid = Array.from({ length: first.getUTCDay() + last.getUTCDate() }, (_, i) => i < first.getUTCDay() ? null : key(new Date(Date.UTC(focus.getUTCFullYear(), focus.getUTCMonth(), i - first.getUTCDay() + 1))));
    const indexed = new Map();
    tasks.forEach(task => {
      const start = safeDate(task.startDate || task.endDate || task.deadline);
      const end = safeDate(task.endDate || task.deadline || task.startDate);
      if (!start || !end) return;
      const firstDay = start <= end ? start : end;
      const lastDay = start <= end ? end : start;
      for (let cursor = new Date(firstDay); cursor <= lastDay; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const day = key(cursor);
        if (!indexed.has(day)) indexed.set(day, []);
        indexed.get(day).push(task);
      }
    });
    return { days: daysInGrid, events: indexed, labelMonth: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }, [tasks, rangeStart]);
  const activeDate = selectedDate || days.find(Boolean) || null;
  const activeTasks = activeDate ? (events.get(activeDate) || []) : [];
  const limit = compact ? 1 : 3;
  return <div style={{ marginTop: '4px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}><strong style={{ fontSize: '13px', color: '#334155' }}>{labelMonth}</strong><span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Tap a day for tasks</span></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: compact ? '3px' : '5px' }}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div key={day} style={{ textAlign: 'center', fontSize: compact ? '9px' : '10px', fontWeight: '700', color: '#94a3b8' }}>{day}</div>)}
      {days.map((day, i) => {
        if (!day) return <div key={`blank-${i}`} />;
        const dayTasks = events.get(day) || []; const hidden = dayTasks.length - limit; const selected = day === activeDate;
        return <button key={day} type="button" onClick={() => onSelectDate(day)} style={{ minHeight: compact ? '62px' : '92px', padding: compact ? '4px' : '6px', textAlign: 'left', overflow: 'hidden', borderRadius: '8px', border: selected ? '1px solid #6366f1' : '1px solid #e2e8f0', background: selected ? '#eef2ff' : '#fff', cursor: 'pointer' }}>
          <span style={{ display: 'block', fontSize: compact ? '10px' : '11px', fontWeight: selected ? '800' : '600', color: selected ? '#4f46e5' : '#64748b' }}>{Number(day.slice(-2))}</span>
          {dayTasks.slice(0, limit).map(task => <span key={task.id} title={task.title} style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: '2px', borderRadius: '3px', padding: compact ? '1px 3px' : '2px 4px', fontSize: compact ? '8px' : '9px', color: '#fff', background: colors[task.status] || '#64748b' }}>{task.title}</span>)}
          {hidden > 0 && <span style={{ display: 'block', marginTop: '2px', fontSize: compact ? '8px' : '9px', fontWeight: '700', color: '#4f46e5' }}>+{hidden} more</span>}
        </button>;
      })}
    </div>
    <div style={{ marginTop: '12px', borderTop: '1px solid #eef2f7', paddingTop: '10px' }}>
      <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>{activeDate ? label(activeDate) : 'Selected day'}</p>
      {activeTasks.length === 0 ? <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>No dated tasks on this day.</p> : activeTasks.map(task => <div key={task.id} style={{ borderLeft: `3px solid ${colors[task.status] || '#64748b'}`, padding: '6px 8px', marginBottom: '6px', background: '#f8fafc', borderRadius: '0 7px 7px 0' }}><strong style={{ fontSize: '12px', color: '#0f172a' }}>{task.title}</strong><p style={{ margin: '2px 0 0', fontSize: '11px', color: '#475569' }}>{task.clientName && `Client: ${task.clientName} · `}Start: {label(task.startDate)} · End: {label(task.endDate || task.deadline)} · {task.status}</p></div>)}
    </div>
  </div>;
};

export default WorkflowCalendar;
