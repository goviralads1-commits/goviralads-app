import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

// ============================================================================
// MILESTONE QUICK PANEL — milestone-driven progress control (ONE component,
// used both on the Tasks list cards and inside TaskDetail).
//
// SEMANTICS (existing architecture, preserved exactly):
//  - milestone.percentage is an ABSOLUTE PROGRESS THRESHOLD — never a weight,
//    never cumulative. Checking the 50% milestone means progress = 50.
//  - The SERVER is the single source of truth for `reached`/`reachedAt`:
//    this panel sends ONLY { name, percentage, color } per milestone plus the
//    resulting `progress` — NEVER `reached` or `reachedAt`.
//  - Every action is ONE PATCH /admin/tasks/:taskId that ALWAYS includes
//    `progress` (the backend re-derives milestone reached state and status
//    sync only when a progress-related field is part of the update).
//  - AUTO-mode tasks switch to progressMode MANUAL in the same PATCH when the
//    admin takes control via this panel (otherwise client reads would
//    recalculate AUTO progress from dates and overwrite it).
//  - After a successful save the SERVER RESPONSE replaces local state — no
//    optimistic fabrication.
// ============================================================================

const DEFAULT_COLOR = '#6366f1';

const cleanMilestones = (milestones) =>
  (milestones || []).map(m => ({
    name: m.name,
    percentage: Number(m.percentage),
    color: m.color || DEFAULT_COLOR,
    // `reached` / `reachedAt` are intentionally never sent — server derives them.
  }));

const MilestoneQuickPanel = ({ task, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastPayload, setLastPayload] = useState(null); // for Retry
  const [pendingConfirm, setPendingConfirm] = useState(null); // reopen-completed guard
  const [drafts, setDrafts] = useState({}); // percentage -> { name, percentage }
  const [addRow, setAddRow] = useState(null); // { name, percentage }
  const rootRef = useRef(null);

  const progress = Number(task?.progress) || 0;
  const milestones = task?.milestones || [];
  const sorted = [...milestones].sort((a, b) => Number(a.percentage) - Number(b.percentage));
  const reachedCount = sorted.filter(m => Number(m.percentage) <= progress).length;
  const isAuto = task?.progressMode === 'AUTO';

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setPendingConfirm(null);
        setError('');
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  // Reset transient state whenever the underlying task data changes
  useEffect(() => {
    setDrafts({});
    setAddRow(null);
    setPendingConfirm(null);
    setError('');
  }, [task?.id, task?.updatedAt]);

  // ---- validation (mirrors the existing TaskDetail rule: unique percentages) --
  const validateSet = (list) => {
    const pcts = list.map(m => Number(m.percentage));
    if (pcts.some(p => Number.isNaN(p) || p < 0)) return 'Percentage must be a number ≥ 0';
    if (new Set(pcts).size !== pcts.length) return 'Milestone percentages must be unique';
    if (list.some(m => !m.name || !String(m.name).trim())) return 'Milestone name is required';
    return '';
  };

  // ---- single save request — ALWAYS includes progress ----------------------
  const save = useCallback(async (nextMilestones, nextProgress) => {
    if (saving) return;
    const invalid = validateSet(nextMilestones);
    if (invalid) { setError(invalid); return; }
    const payload = { milestones: cleanMilestones(nextMilestones), progress: nextProgress };
    if (isAuto) payload.progressMode = 'MANUAL';
    setSaving(true);
    setError('');
    setLastPayload(payload);
    try {
      const res = await api.patch(`/admin/tasks/${task.id || task._id}`, payload);
      const updated = res.data?.task || res.data;
      setPendingConfirm(null);
      setDrafts({});
      setAddRow(null);
      if (updated && onSaved) onSaved(updated);
    } catch (err) {
      // Keep previous server state — never leave fabricated local state behind.
      setError(err?.response?.data?.error || 'Failed to save milestones');
    } finally {
      setSaving(false);
    }
  }, [saving, isAuto, task?.id, task?._id, onSaved]);

  const retry = () => {
    if (!lastPayload) return;
    setSaving(true);
    setError('');
    api.patch(`/admin/tasks/${task.id || task._id}`, lastPayload)
      .then((res) => {
        const updated = res.data?.task || res.data;
        setPendingConfirm(null);
        if (updated && onSaved) onSaved(updated);
      })
      .catch((err) => setError(err?.response?.data?.error || 'Failed to save milestones'))
      .finally(() => setSaving(false));
  };

  // Reopen guard: lowering progress below 100 on a COMPLETED task reopens it
  // (existing backend downward-sync). Confirm before doing that.
  const guardThenSave = (nextMilestones, nextProgress) => {
    if (task?.status === 'COMPLETED' && nextProgress < 100) {
      setPendingConfirm({ nextMilestones, nextProgress });
      return;
    }
    save(nextMilestones, nextProgress);
  };

  // ---- toggle: THRESHOLD math, never cumulative -----------------------------
  const handleToggle = (m) => {
    const pct = Number(m.percentage);
    const isChecked = pct <= progress;
    let nextProgress;
    if (!isChecked) {
      // Reaching a milestone raises progress to at least its threshold.
      nextProgress = Math.max(progress, pct);
    } else {
      // Unchecking: progress falls to the highest REMAINING reached threshold.
      const remainingReached = sorted
        .filter(x => Number(x.percentage) !== pct && Number(x.percentage) <= progress)
        .map(x => Number(x.percentage));
      nextProgress = remainingReached.length ? Math.max(...remainingReached) : 0;
    }
    guardThenSave(sorted, nextProgress);
  };

  // ---- definition edits preserve current progress ---------------------------
  const currentDefinitions = () =>
    sorted.map(m => {
      const key = String(m.percentage);
      return drafts[key] ? { ...m, name: drafts[key].name, percentage: Number(drafts[key].percentage) } : m;
    });

  const applyDraft = (key) => {
    const next = currentDefinitions();
    guardThenSave(next, progress);
  };

  const removeMilestone = (pct) => {
    // Removing a milestone never changes progress by itself.
    const next = currentDefinitions().filter(m => Number(m.percentage) !== Number(pct));
    guardThenSave(next, progress);
  };

  const commitAdd = () => {
    if (!addRow) return;
    const next = [...currentDefinitions(), {
      name: String(addRow.name || '').trim(),
      percentage: Number(addRow.percentage),
      color: DEFAULT_COLOR,
    }];
    guardThenSave(next, progress);
  };

  const triggerStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
    border: '1px solid #e2e8f0', background: '#fff',
    fontSize: '11.5px', fontWeight: '600', color: '#475569', width: '100%',
    justifyContent: 'space-between',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={triggerStyle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px' }}>🎯</span>
          {sorted.length > 0 ? `Milestones ${reachedCount}/${sorted.length}` : 'No milestones'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#6366f1', fontWeight: '700' }}>{Math.round(progress * 10) / 10}%</span>
          <span style={{ color: '#94a3b8', fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 40,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '10px',
        }}>
          {isAuto && (
            <p style={{ fontSize: '10.5px', color: '#7c3aed', background: '#f3e8ff', borderRadius: '6px', padding: '5px 8px', margin: '0 0 8px 0', fontWeight: '600' }}>
              Milestone control uses manual progress — this task will switch from AUTO.
            </p>
          )}

          {sorted.length === 0 && !addRow && (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 2px 8px 2px' }}>
              No milestones configured for this task.
            </p>
          )}

          {sorted.map((m) => {
            const pct = Number(m.percentage);
            const isChecked = pct <= progress;
            const key = String(m.percentage);
            const draft = drafts[key] || { name: m.name, percentage: m.percentage };
            return (
              <div key={`${m.name}-${m.percentage}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 2px', borderBottom: '1px solid #f8fafc', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleToggle(m)}
                  disabled={saving}
                  title={isChecked ? 'Uncheck — lower progress' : 'Check — raise progress to this threshold'}
                  style={{
                    width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0, cursor: saving ? 'default' : 'pointer',
                    border: isChecked ? 'none' : '1.5px solid #cbd5e1',
                    background: isChecked ? (m.color || DEFAULT_COLOR) : '#fff',
                    color: '#fff', fontSize: '11px', lineHeight: '16px', padding: 0,
                  }}
                >
                  {isChecked ? '✓' : ''}
                </button>
                <input
                  value={draft.name}
                  onChange={(e) => setDrafts(d => ({ ...d, [key]: { ...draft, name: e.target.value } }))}
                  placeholder="Milestone name"
                  style={{ flex: 1, minWidth: '90px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', color: '#0f172a', outline: 'none' }}
                />
                <input
                  value={draft.percentage}
                  onChange={(e) => setDrafts(d => ({ ...d, [key]: { ...draft, percentage: e.target.value } }))}
                  inputMode="numeric"
                  style={{ width: '52px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 6px', fontSize: '12px', color: '#0f172a', textAlign: 'center', outline: 'none' }}
                />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>%</span>
                <input
                  type="color"
                  value={m.color || DEFAULT_COLOR}
                  readOnly
                  title={m.color || DEFAULT_COLOR}
                  style={{ width: '22px', height: '22px', padding: 0, border: 'none', background: 'transparent', cursor: 'default' }}
                />
                <button type="button" onClick={() => applyDraft(key)} disabled={saving} title="Save changes"
                  style={{ border: 'none', background: '#eef2ff', color: '#6366f1', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer' }}>
                  ✓
                </button>
                <button type="button" onClick={() => removeMilestone(pct)} disabled={saving} title="Remove milestone"
                  style={{ border: 'none', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer' }}>
                  ✕
                </button>
              </div>
            );
          })}

          {addRow ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 2px', flexWrap: 'wrap' }}>
              <input
                value={addRow.name}
                onChange={(e) => setAddRow(r => ({ ...r, name: e.target.value }))}
                placeholder="New milestone name"
                autoFocus
                style={{ flex: 1, minWidth: '90px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', outline: 'none' }}
              />
              <input
                value={addRow.percentage}
                onChange={(e) => setAddRow(r => ({ ...r, percentage: e.target.value }))}
                inputMode="numeric"
                placeholder="%"
                style={{ width: '52px', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 6px', fontSize: '12px', textAlign: 'center', outline: 'none' }}
              />
              <button type="button" onClick={commitAdd} disabled={saving}
                style={{ border: 'none', background: '#eef2ff', color: '#6366f1', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer' }}>
                ✓
              </button>
              <button type="button" onClick={() => setAddRow(null)} disabled={saving}
                style={{ border: 'none', background: '#f1f5f9', color: '#64748b', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: '700', cursor: saving ? 'default' : 'pointer' }}>
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddRow({ name: '', percentage: '' })}
              disabled={saving}
              style={{ marginTop: '6px', width: '100%', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#64748b', borderRadius: '8px', padding: '6px', fontSize: '11.5px', fontWeight: '600', cursor: saving ? 'default' : 'pointer' }}
            >
              + Add milestone
            </button>
          )}

          {pendingConfirm && (
            <div style={{ marginTop: '8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px' }}>
              <p style={{ fontSize: '11.5px', color: '#b91c1c', margin: '0 0 6px 0', fontWeight: '600' }}>
                This will reduce progress below 100% and reopen the completed task. Continue?
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" disabled={saving} onClick={() => save(pendingConfirm.nextMilestones, pendingConfirm.nextProgress)}
                  style={{ border: 'none', background: '#ef4444', color: '#fff', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  Yes, reopen
                </button>
                <button type="button" onClick={() => setPendingConfirm(null)}
                  style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {saving && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 2px 0 2px' }}>Saving…</p>
          )}
          {error && !saving && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '8px' }}>
              <p style={{ fontSize: '11px', color: '#ef4444', margin: 0, fontWeight: '600' }}>{error}</p>
              {lastPayload && (
                <button type="button" onClick={retry}
                  style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                  ↻ Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MilestoneQuickPanel;
