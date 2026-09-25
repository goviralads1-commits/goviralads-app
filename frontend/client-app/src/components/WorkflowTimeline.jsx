import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '../services/api';
import { getCurrentUser } from '../services/authService';
import WorkflowCalendar from './WorkflowCalendar';
import WorkflowJourney, { resolveJourneyOrder } from './WorkflowJourney';
import { normalizeWorkflowTask } from './workflowTimelineTask';
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

export const loadClientJourneyInputs = async (task, signal) => {
  const id = task.orderOnly ? task.order?.id : task.id;
  if (!id) throw new Error('Detail ID unavailable');
  const response = await api.get(`/client/${task.orderOnly ? 'orders' : 'tasks'}/${encodeURIComponent(id)}`, { signal });
  return response.data[task.orderOnly ? 'order' : 'task'];
};

export function clientJourneyData(timeline, selectedClients, ownerId) {
  if (!timeline) return null;
  const orders = selectedClients.length && !selectedClients.includes(ownerId) ? [] : timeline.orders || [];
  const tasks = (timeline.tasks || []).filter(task => !selectedClients.length || selectedClients.includes(task.clientId))
    .map(task => normalizeWorkflowTask({ ...task, order: resolveJourneyOrder(task, orders) }));
  return { ...timeline, tasks, orders };
}

const WorkflowTimeline = () => {
  // Session gate mirrors the router's requireClient exactly: only CLIENT-role
  // sessions may render/fetch this component. Non-client sessions (e.g. an admin
  // opening the client app) would be rejected with 403 by every /client route and
  // would otherwise surface a misleading persistent "failed to load" banner.
  const isClientSession = () => getCurrentUser()?.role === 'CLIENT';

  const [rangeType, setRangeType] = useState('month');
  const [view, setView] = useState('timeline');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustomRange, setAppliedCustomRange] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [selectedClients, setSelectedClients] = useState([]);
  const ownerId = getCurrentUser()?.id || getCurrentUser()?._id;
  const clientOptions = useMemo(() => [...new Map((timeline?.tasks || []).filter(task => task.clientId)
    .map(task => [task.clientId, { id: task.clientId, name: task.clientId === ownerId ? 'My tasks' : task.clientName || `Client ${task.clientId.slice(-6)}` }])).values()], [timeline, ownerId]);
  const journeyTimeline = useMemo(() => clientJourneyData(timeline, selectedClients, ownerId), [timeline, selectedClients, ownerId]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  // Sequence protection: a slow response can never overwrite the UI after the
  // range was changed again (same pattern as the admin timeline).
  const reqRef = useRef(0);

  const range = buildRange(rangeType, appliedCustomRange?.startDate, appliedCustomRange?.endDate);
  const hasRange = rangeType !== 'custom' || Boolean(appliedCustomRange);

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
    setError('');
    try {
      const res = await api.get('/client/insights/timeline', { params: { startDate: range.startDate, endDate: range.endDate } });
      if (reqId === reqRef.current) {
        setTimeline(res.data || null);
        setSelectedDate(null);
      }
    } catch (err) {
      if (reqId === reqRef.current) {
        setTimeline(null);
        setError(err.response?.data?.error || 'Timeline failed to load.');
      }
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }, [range.startDate, range.endDate, hasRange]);

  useEffect(() => {
    load();
  }, [load]);

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
              onClick={() => {
                setRangeType(o.value);
                setShowPicker(o.value === 'custom');
                if (o.value === 'custom') setAppliedCustomRange(null);
              }}
              style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '600', cursor: 'pointer', border: rangeType === o.value ? '1px solid #6366f1' : '1px solid #e2e8f0', background: rangeType === o.value ? '#eef2ff' : '#fff', color: rangeType === o.value ? '#6366f1' : '#64748b' }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {showPicker && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
              From
              <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)} style={{ display: 'block', marginTop: '4px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px' }} />
            </label>
            <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>
              To
              <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)} style={{ display: 'block', marginTop: '4px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px' }} />
            </label>
            <button type="button" disabled={!customStart || !customEnd} onClick={() => { setAppliedCustomRange({ startDate: customStart, endDate: customEnd }); setShowPicker(false); }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #6366f1', background: customStart && customEnd ? '#6366f1' : '#e2e8f0', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: customStart && customEnd ? 'pointer' : 'not-allowed' }}>Apply</button>
            <button type="button" onClick={() => { setCustomStart(''); setCustomEnd(''); setAppliedCustomRange(null); setRangeType('month'); setShowPicker(false); }} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Clear</button>
          </div>
        )}

        {(selectedClients.length > 0 || clientOptions.some(client => client.id !== ownerId)) && <details style={{ fontSize: '12px', marginBottom: '12px', color: '#475569' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Clients · {selectedClients.length ? `${selectedClients.length} selected` : 'All authorized tasks'}</summary>
          <p style={{ fontSize: '11px' }}>Filter clients in the loaded date range. Existing result limits apply.</p>
          <button type="button" onClick={() => { setSelectedClients([]); setSelectedDate(null); }} style={{ marginBottom: '6px' }}>All clients</button>
          {clientOptions.map(client => <label key={client.id} style={{ display: 'block', padding: '4px 0', overflowWrap: 'anywhere' }}><input type="checkbox" checked={selectedClients.includes(client.id)} onChange={() => { setSelectedClients(previous => previous.includes(client.id) ? previous.filter(id => id !== client.id) : [...previous, client.id]); setSelectedDate(null); }} /> {client.name}</label>)}
        </details>}
        <div role="group" aria-label="Workflow view" style={{ display: 'flex', gap: '4px', padding: '3px', marginBottom: '12px', borderRadius: '10px', background: '#f1f5f9' }}>
          {['timeline', 'calendar'].map(option => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} style={{ flex: 1, minHeight: '40px', padding: '8px 12px', border: 'none', borderRadius: '8px', background: view === option ? '#fff' : 'transparent', color: view === option ? '#4f46e5' : '#64748b', boxShadow: view === option ? '0 1px 3px rgba(15,23,42,0.12)' : 'none', fontSize: '13px', fontWeight: '700', cursor: 'pointer', textTransform: 'capitalize' }}>{option}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ height: '120px', backgroundColor: '#f1f5f9', borderRadius: '10px', animation: 'gvaClientTlPulse 1.5s infinite' }} />
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p>
            <button onClick={load} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b' }}>↻ Retry</button>
          </div>
        ) : !hasRange ? (
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Pick a start and end date to see your date-wise workflow.</p>
        ) : view === 'calendar' ? (
          <WorkflowCalendar tasks={journeyTimeline?.tasks || []} orders={journeyTimeline?.orders || []} rangeStart={range.startDate} rangeEnd={range.endDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} loadInputs={loadClientJourneyInputs} />
        ) : (
          <WorkflowJourney timeline={journeyTimeline} startDate={range.startDate} endDate={range.endDate} selectedDate={selectedDate} onSelectDate={setSelectedDate} loadInputs={loadClientJourneyInputs} />
        )}
      </div>
    </div>
  );
};

export default WorkflowTimeline;
