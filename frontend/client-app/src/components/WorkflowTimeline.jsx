import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { getCurrentUser } from '../services/authService';

// CLIENT WORKFLOW TIMELINE — the same rising-bar insight graph as the Admin Office
// Business Analytics, scoped strictly to the authenticated client (the server ignores
// any clientId from the frontend and uses req.user.id).
// Event semantics (identical to the admin timelines, no second date system):
//   ORDER = Order.createdAt · START = Task.startDate · END = Task.endDate shown
//   strictly as END DATE (the planned deadline, never a claimed completion).
//   ACTUAL COMPLETION = completedAt provided by the server (the persisted
//   TASK_COMPLETED notification time): plotted as a SOLID green bar on that date.
//   No completedAt => no completion bar — never derived from endDate or updatedAt.
const STAGE_ORDER = ['PENDING', 'SCHEDULED', 'ACTIVE', 'COMPLETED'];
const STAGE_META = {
  PENDING: { color: '#f97316', label: 'Pending', h: 26 },
  SCHEDULED: { color: '#eab308', label: 'Scheduled', h: 56 },
  ACTIVE: { color: '#3b82f6', label: 'Active / In Progress', h: 86 },
  COMPLETED: { color: '#22c55e', label: 'Completed', h: 116 },
};
const STATUS_LANE = { PENDING_APPROVAL: 'PENDING', PENDING: 'SCHEDULED', ACTIVE: 'ACTIVE', IN_PROGRESS: 'ACTIVE', COMPLETED: 'COMPLETED' };
const STATUS_META = {
  COMPLETED: { color: '#22c55e', label: 'Completed' },
  ACTIVE: { color: '#3b82f6', label: 'Active / In Progress' },
  IN_PROGRESS: { color: '#3b82f6', label: 'Active / In Progress' },
  PENDING: { color: '#eab308', label: 'Scheduled' },
  PENDING_APPROVAL: { color: '#f97316', label: 'Pending Approval' },
  CANCELLED: { color: '#94a3b8', label: 'Cancelled' },
};
const ORDER_COLOR = '#8b5cf6';
// UTC day keys — the same convention as the server-side date boundaries.
const utcDayKey = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');
const toISODate = (d) => d.toISOString().slice(0, 10);

const buildRange = (type, customStart, customEnd) => {
  const today = new Date();
  const end = toISODate(today);
  if (type === 'today') return { startDate: end, endDate: end };
  if (type === '7d' || type === '15d' || type === '30d') {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - (type === '7d' ? 6 : type === '15d' ? 14 : 29));
    return { startDate: toISODate(start), endDate: end };
  }
  if (type === 'custom' && customStart && customEnd) return { startDate: customStart, endDate: customEnd };
  // month (default): current calendar month
  return { startDate: toISODate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), endDate: end };
};

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 Days' },
  { value: '15d', label: '15 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

const WorkflowTimeline = () => {
  // Session gate mirrors the router's requireClient exactly: only CLIENT-role
  // sessions may render/fetch this component. Non-client sessions (e.g. an admin
  // opening the client app) would be rejected with 403 by every /client route and
  // would otherwise surface a misleading persistent "failed to load" banner.
  const isClientSession = () => getCurrentUser()?.role === 'CLIENT';

  const [rangeType, setRangeType] = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  // Sequence protection: a slow response can never overwrite the UI after the
  // range was changed again (same pattern as the admin timeline).
  const reqRef = useRef(0);

  const range = buildRange(rangeType, customStart, customEnd);
  const hasRange = rangeType !== 'custom' || (customStart && customEnd);

  const load = useCallback(async () => {
    const reqId = ++reqRef.current;
    // Gate on an actual CLIENT user session, not just a token key: a stale/expired
    // token during the login handshake would otherwise fire a request that 401s and
    // renders a misleading "failed to load" state (and triggers the api interceptor's
    // logout redirect mid-render). Same contract as the dashboard's other scoped calls.
    if (!isClientSession() || !hasRange) {
      setTimeline(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await api.get('/client/insights/timeline', { params: { startDate: range.startDate, endDate: range.endDate } });
      if (reqId === reqRef.current) {
        setTimeline(res.data || null);
        setSelectedDate(null);
      }
    } catch (err) {
      if (reqId === reqRef.current) {
        setTimeline(null);
        setError(true);
      }
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [range.startDate, range.endDate, hasRange]);

  useEffect(() => {
    load();
  }, [load]);

  // Derive per-day event bars from the fetched data (pure, render-safe).
  let timelineDays = [];
  const timelineEvents = {};
  const timelineGraph = {};
  const summary = { orders: 0, starts: 0, ends: 0, completed: 0 };
  if (timeline && hasRange) {
    // Each event is independent by ITS OWN DATE: a start/end/completed event is
    // plotted/counted only when that specific date falls inside the selected
    // range. A task included via its completion date can never contribute an
    // out-of-range START or END DATE bar/count (dates stay available as detail
    // context only).
    const inRange = (day) => day >= range.startDate && day <= range.endDate;
    (timeline.orders || []).forEach((o) => {
      const day = utcDayKey(o.createdAt);
      if (!day) return;
      (timelineEvents[day] = timelineEvents[day] || []).push({ kind: 'order', order: o });
      (timelineGraph[day] = timelineGraph[day] || []).push({ kind: 'order' });
      summary.orders += 1;
    });
    (timeline.tasks || []).forEach((t) => {
      const startDay = utcDayKey(t.startDate);
      const endDay = utcDayKey(t.endDate);
      const lane = STATUS_LANE[t.status]; // CANCELLED tasks plot no bar
      if (startDay && inRange(startDay)) {
        (timelineEvents[startDay] = timelineEvents[startDay] || []).push({ kind: 'start', task: t });
        if (lane) (timelineGraph[startDay] = timelineGraph[startDay] || []).push({ kind: 'start', lane });
        summary.starts += 1;
      }
      if (endDay && inRange(endDay)) {
        (timelineEvents[endDay] = timelineEvents[endDay] || []).push({ kind: 'end', task: t });
        if (lane) (timelineGraph[endDay] = timelineGraph[endDay] || []).push({ kind: 'end', lane });
        summary.ends += 1;
      }
      // ACTUAL COMPLETION — plotted only when the server returned a real completedAt
      // (TASK_COMPLETED notification time). Never falls back to endDate/updatedAt:
      // no completedAt => no completion event.
      const completedDay = utcDayKey(t.completedAt);
      if (completedDay && inRange(completedDay)) {
        (timelineEvents[completedDay] = timelineEvents[completedDay] || []).push({ kind: 'completed', task: t });
        (timelineGraph[completedDay] = timelineGraph[completedDay] || []).push({ kind: 'completed' });
        summary.completed += 1;
      }
    });
    const rangeStart = new Date(range.startDate + 'T00:00:00.000Z');
    const rangeEnd = new Date(range.endDate + 'T00:00:00.000Z');
    for (let d = new Date(rangeStart); d <= rangeEnd && timelineDays.length < 366; d.setUTCDate(d.getUTCDate() + 1)) {
      timelineDays.push(d.toISOString().slice(0, 10));
    }
  }
  const firstEventDay = Object.keys(timelineEvents).sort()[0] || null;
  const activeDay = selectedDate || firstEventDay;

  // No CLIENT session (guest, mid-login, or non-client role): render nothing
  // instead of a request that can only 401/403.
  if (!isClientSession()) return null;

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '14px' }}>📈</span>
        </div>
        <h3 style={{ fontSize: '17px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Workflow Timeline</h3>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #eef2f7' }}>
        <style>{`@keyframes gvaClientTlPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>

        {/* Range chips — same bounded-range behavior as the admin date filters */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => { setRangeType(o.value); setShowPicker(o.value === 'custom'); }}
              style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', border: rangeType === o.value ? '1px solid #6366f1' : '1px solid #e2e8f0', background: rangeType === o.value ? '#eef2ff' : '#fff', color: rangeType === o.value ? '#6366f1' : '#64748b' }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {showPicker && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px' }} />
            <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>→</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px' }} />
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px 10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          {[{ color: '#f97316', label: 'Pending' }, { color: '#eab308', label: 'Scheduled' }, { color: '#3b82f6', label: 'Active' }, { color: '#22c55e', label: 'Completed' }].map(l => (
            <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
              <span style={{ width: '7px', height: '10px', borderRadius: '3px', background: l.color }} />{l.label}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
            <span style={{ width: '7px', height: '10px', borderRadius: '3px', border: '1.5px solid #64748b', boxSizing: 'border-box' }} />End date
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: '600', color: '#94a3b8' }}>
            <span style={{ width: '7px', height: '10px', borderRadius: '3px 3px 0 0', background: ORDER_COLOR }} />Order
          </span>
        </div>

        {loading ? (
          <div style={{ height: '120px', backgroundColor: '#f1f5f9', borderRadius: '10px', animation: 'gvaClientTlPulse 1.5s infinite' }} />
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>Timeline failed to load.</p>
            <button onClick={load} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>↻ Retry</button>
          </div>
        ) : !hasRange ? (
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Pick a start and end date to see your date-wise workflow.</p>
        ) : (
          <>
            <p style={{ fontSize: '11px', fontWeight: '500', color: '#94a3b8', margin: '0 0 12px 0' }}>
              {summary.orders} order{summary.orders === 1 ? '' : 's'} placed · {summary.starts} task start{summary.starts === 1 ? '' : 's'} · {summary.completed} completed · {summary.ends} task end{summary.ends === 1 ? '' : 's'}
            </p>
            {timelineDays.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Invalid date range.</p>
            ) : (
              <>
                {/* GRAPH — identical visual language to the admin workflow graph:
                    fixed stage lanes (bottom->top Pending/Scheduled/Active/Completed),
                    one rising bar per event, hollow END DATE bars, SOLID green bars
                    for ACTUAL completions (completedAt), purple order bars,
                    horizontally scrollable date axis, no numeric Y labels. */}
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* Stage-label gutter — compact so the plot gets more usable width
                      on narrow phones; labels are right-aligned to the plot edge so
                      nothing collides. */}
                  <div style={{ width: '76px', flexShrink: 0 }}>
                    {['COMPLETED', 'ACTIVE / IN PROGRESS', 'SCHEDULED', 'PENDING'].map(l => (
                      <div key={l} style={{ height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '6px', fontSize: '8px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.4, textAlign: 'right' }}>{l}</div>
                    ))}
                    <div style={{ height: '26px' }} />
                  </div>
                  <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    <div style={{ position: 'relative', minWidth: timelineDays.reduce((w, d) => w + Math.max(26, (timelineGraph[d] || []).length * 6 + 8), 0), height: '146px' }}>
                      {[0, 30, 60, 90].map(y => (
                        <div key={y} style={{ position: 'absolute', left: 0, right: 0, top: y, borderTop: '1px dashed #e2e8f0' }} />
                      ))}
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, borderTop: '1px solid #cbd5e1' }} />
                      <div style={{ display: 'flex', position: 'absolute', left: 0, top: 0, bottom: 0 }}>
                        {timelineDays.map(day => {
                          const bars = timelineGraph[day] || [];
                          const shown = bars.slice(0, 40);
                          const bw = shown.length <= 4 ? 5 : 3;
                          const bgap = shown.length <= 4 ? 2 : 1;
                          const colW = Math.max(26, bars.length * (bw + bgap) + 8);
                          const isSelected = day === activeDay;
                          const dObj = new Date(day + 'T00:00:00.000Z');
                          return (
                            <button
                              key={day}
                              onClick={() => setSelectedDate(day)}
                              title={`${dObj.getUTCDate()}: ${bars.filter(b => b.kind === 'order').length} orders · ${bars.filter(b => b.kind === 'start').length} starts · ${bars.filter(b => b.kind === 'completed').length} completed · ${bars.filter(b => b.kind === 'end').length} ends`}
                              style={{ width: `${colW}px`, flexShrink: 0, position: 'relative', border: 'none', background: isSelected ? '#eef2ff' : 'transparent', cursor: 'pointer', padding: 0 }}
                            >
                              {bars.length > 0 && (
                                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '120px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: `${bgap}px` }}>
                                  {shown.map((b, i) => b.kind === 'order' ? (
                                    <div key={i} style={{ width: `${Math.max(bw - 1, 2)}px`, height: '18px', background: ORDER_COLOR, borderRadius: '2px 2px 0 0' }} />
                                  ) : b.kind === 'start' ? (
                                    <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META[b.lane].h}px`, background: STAGE_META[b.lane].color, borderRadius: '3px 3px 0 0' }} />
                                  ) : b.kind === 'completed' ? (
                                    <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META.COMPLETED.h}px`, background: STAGE_META.COMPLETED.color, borderRadius: '3px 3px 0 0' }} />
                                  ) : (
                                    <div key={i} style={{ width: `${bw}px`, height: `${STAGE_META[b.lane].h}px`, border: `1.5px solid ${STAGE_META[b.lane].color}`, borderRadius: '3px 3px 0 0', boxSizing: 'border-box', background: 'transparent' }} />
                                  ))}
                                </div>
                              )}
                              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: isSelected ? '700' : '500', color: isSelected ? '#6366f1' : '#94a3b8' }}>{dObj.getUTCDate()}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Day detail panel */}
                <div style={{ marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {!activeDay ? (
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No workflow events in this period yet. Your orders, task starts and end dates will appear here.</p>
                  ) : (timelineEvents[activeDay] || []).length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No events on {fmtDate(activeDay)}.</p>
                  ) : (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{fmtDate(activeDay)}</p>
                      {(timelineEvents[activeDay] || []).map((ev, i) => ev.kind === 'order' ? (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ORDER_COLOR, marginTop: '5px', flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Order {ev.order.orderId || ''} placed</p>
                            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>{(ev.order.services || []).join(', ') || '—'} · ₹{(ev.order.totalAmount || 0).toLocaleString('en-IN')}</p>
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Status: {ev.order.orderStatus}</p>
                          </div>
                        </div>
                      ) : (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_META[ev.task.status]?.color || '#94a3b8', marginTop: '5px', flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{ev.task.title}</p>
                            {/* "End date" is reported honestly — never a claimed completion date.
                                "Completed" is the actual completion time recorded by the server. */}
                            <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
                              {ev.kind === 'start' ? 'Started' : ev.kind === 'completed' ? `Completed ${fmtDate(ev.task.completedAt)}` : 'End date'} · Status: {STATUS_META[ev.task.status]?.label || ev.task.status} · {(ev.task.creditCost || 0).toLocaleString('en-IN')} credits
                            </p>
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Start: {fmtDate(ev.task.startDate)} → End: {fmtDate(ev.task.endDate)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WorkflowTimeline;
