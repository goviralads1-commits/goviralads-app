import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

// ============================================================================
// Client Notifications — Admin Profile dropdown → "Client Notifications"
//
// Compact single place for admins to check a client's push delivery health and
// send an intentional "remind to enable" nudge. Reuses the EXISTING endpoints:
//   GET  /admin/client-push-status                       (server-scoped statuses)
//   POST /admin/clients/:clientId/remind-enable-notifications
// All authorization (admin-only, manager scoping, 7-day cooldown, healthy-check)
// is enforced server-side — this UI only renders what the API allows.
// This page is lazy-loaded: it never runs on admin login or initial render.
// ============================================================================

const STATUS_META = {
  healthy:       { label: 'ON / Healthy',        tone: 'on',      desc: 'Notifications are enabled and delivery should work.' },
  unreported:    { label: 'ON (legacy client)',  tone: 'on',      desc: 'Active device token present; client has not reported browser state yet.' },
  denied:        { label: 'OFF / Denied',        tone: 'off',     desc: 'Client blocked notifications in browser settings. Only the client can re-allow them.' },
  disabled:      { label: 'OFF / Disabled',      tone: 'off',     desc: 'Client turned push notifications off in the app.' },
  unsupported:   { label: 'Unsupported',         tone: 'warn',    desc: 'This device/browser does not support web notifications.' },
  not_requested: { label: 'Not decided',         tone: 'warn',    desc: 'Client has not been asked yet — they can allow notifications from the app.' },
  token_missing: { label: 'Partially set up',    tone: 'warn',    desc: 'Permission granted but no active device token registered yet.' },
  unknown:       { label: 'Unknown',             tone: 'warn',    desc: 'No reported state and no active device token.' },
};

const TONE_COLORS = {
  on:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  off:  { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  warn: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
};

const formatDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return String(d); }
};

const ClientNotifications = () => {
  const [clients, setClients] = useState([]);
  const [statusMap, setStatusMap] = useState({}); // { [clientId]: status object }
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showList, setShowList] = useState(false);
  const [selected, setSelected] = useState(null); // { id, name, identifier }
  const [reminding, setReminding] = useState(false);
  const [lastReminderAt, setLastReminderAt] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => setToast({ type, message });

  // Load client list + push statuses once, non-blocking and independent —
  // failures here never block the page. Status API is server-scoped:
  // managers only ever see clients assigned to them.
  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, statusRes] = await Promise.allSettled([
          api.get('/admin/users?role=CLIENT&limit=100'),
          api.get('/admin/client-push-status'),
        ]);
        if (usersRes.status === 'fulfilled') {
          setClients(usersRes.value.data.users || []);
        }
        if (statusRes.status === 'fulfilled') {
          const map = {};
          (statusRes.value.data.statuses || []).forEach((s) => { map[s.clientId] = s; });
          setStatusMap(map);
        }
      } catch (err) {
        // Non-fatal — UI shows empty state
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = search.trim()
    ? clients.filter((c) =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.identifier || '').toLowerCase().includes(search.toLowerCase()))
    : clients;

  const selectClient = (client) => {
    setSelected({ id: client.id, name: client.name, identifier: client.identifier });
    setLastReminderAt(statusMap[client.id]?.lastReminderAt || null);
    setSearch('');
    setShowList(false);
  };

  const selectedStatus = selected ? statusMap[selected.id] : null;
  const meta = selectedStatus ? (STATUS_META[selectedStatus.status] || STATUS_META.unknown) : null;
  const tone = meta ? TONE_COLORS[meta.tone] : TONE_COLORS.warn;

  // Intentional reminder — reuses the existing endpoint. The server enforces
  // admin auth, manager scope, healthy-client rejection and the 7-day cooldown.
  const handleRemind = async () => {
    if (!selected || reminding) return;
    try {
      setReminding(true);
      await api.post(`/admin/clients/${selected.id}/remind-enable-notifications`);
      const now = new Date().toISOString();
      setLastReminderAt(now);
      setStatusMap((prev) => ({
        ...prev,
        [selected.id]: { ...(prev[selected.id] || {}), lastReminderAt: now },
      }));
      showToast('Reminder sent — the client will get it in-app and by email');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to send reminder', 'error');
    } finally {
      setReminding(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0' }}>🔔 Client Notifications</h1>
          <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
            Check a client's notification delivery status and send a one-time reminder to re-enable.
            Browser permission can only be granted by the client themselves — reminders never force it.
          </p>
        </div>

        {/* Search / select client */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0', marginBottom: '20px', position: 'relative' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
            Search client by name or email
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowList(true); }}
            onFocus={() => setShowList(true)}
            onBlur={() => setTimeout(() => setShowList(false), 150)}
            placeholder={loading ? 'Loading clients…' : 'Type a name or email…'}
            disabled={loading}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: '10px',
              border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {showList && filtered.length > 0 && (
            <div style={{
              position: 'absolute', left: '20px', right: '20px', top: '76px', zIndex: 30,
              backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto',
            }}>
              {filtered.slice(0, 20).map((c) => (
                <div
                  key={c.id}
                  onMouseDown={() => selectClient(c)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                >
                  <div style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a' }}>{c.name || c.identifier}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{c.identifier}</div>
                </div>
              ))}
            </div>
          )}
          {showList && search.trim() && filtered.length === 0 && (
            <div style={{
              position: 'absolute', left: '20px', right: '20px', top: '76px', zIndex: 30,
              backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)', padding: '14px', fontSize: '13px', color: '#94a3b8',
            }}>
              No clients match “{search}”
            </div>
          )}
        </div>

        {/* Selected client status card */}
        {selected && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px 0' }}>{selected.name || selected.identifier}</h3>
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>{selected.identifier}</p>
              </div>
              <span style={{
                padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700',
                backgroundColor: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, whiteSpace: 'nowrap',
              }}>
                {meta.label}
              </span>
            </div>

            <div style={{ backgroundColor: tone.bg, border: `1px solid ${tone.border}`, borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: tone.text, margin: 0, lineHeight: 1.55 }}>{meta.desc}</p>
              {selectedStatus?.reportedAt && (
                <p style={{ fontSize: '11.5px', color: tone.text, opacity: 0.75, margin: '8px 0 0 0' }}>
                  Reported by client app: {formatDate(selectedStatus.reportedAt)}
                </p>
              )}
            </div>

            {/* Reminder area — only when delivery actually needs attention.
                Healthy/legacy clients never see this (server also rejects it). */}
            {selectedStatus?.needsAttention && (
              lastReminderAt ? (
                <div style={{ backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', margin: '0 0 4px 0' }}>🔔 Reminder already sent</p>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                    Sent {formatDate(lastReminderAt)} — to avoid spamming, the next reminder is available after a 7-day cooldown.
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleRemind}
                  disabled={reminding}
                  style={{
                    width: '100%', padding: '12px', borderRadius: '12px',
                    border: 'none', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff', fontSize: '14px', fontWeight: '700',
                    cursor: reminding ? 'wait' : 'pointer', opacity: reminding ? 0.7 : 1,
                    boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                  }}
                >
                  {reminding ? 'Sending…' : '🔔 Remind to Enable Notifications'}
                </button>
              )
            )}
            {selectedStatus?.needsAttention && (
              <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '12px 0 0 0', lineHeight: 1.5 }}>
                The reminder is delivered in-app and by email with a “Turn On Notifications” action.
                It never changes browser permission — only the client can allow notifications in their browser.
              </p>
            )}

            {!selectedStatus && (
              <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: 0 }}>
                No delivery data for this client yet — status appears after their next visit.
              </p>
            )}
          </div>
        )}

        {!selected && !loading && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '40px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔔</div>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px 0' }}>Select a client above</p>
            <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Their notification status and reminder options will appear here.</p>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '12px 24px', borderRadius: '12px',
          fontSize: '14px', fontWeight: '600', zIndex: 10000,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default ClientNotifications;
