import React, { useEffect, useRef, useState } from 'react';
import { fetchMediaUrl, isLocallyExpired, formatSize } from './mediaUpload';

// =====================================================================
// MediaBubble (Phase 2B admin) — renders ONE attachment slot:
//  - optimistic upload state (progress / failed with Retry / Discard)
//  - confirmed video tile (lazy signed URL, inline <video> on tap)
//  - confirmed audio player (lazy signed URL, play/pause + progress)
//  - "Media expired" / "Media deleted" inert chips (no requests)
// Legacy string attachments never reach this component.
// =====================================================================

const tileStyle = {
  width: '200px',
  maxWidth: '100%',
  borderRadius: '10px',
  backgroundColor: '#1e293b',
  color: '#f1f5f9',
  padding: '8px',
  boxSizing: 'border-box',
};

const nameStyle = {
  fontSize: '12px',
  fontWeight: '600',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const metaStyle = { fontSize: '10px', color: '#94a3b8', marginTop: '2px' };

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  fontStyle: 'italic',
  opacity: 0.85,
  padding: '6px 10px',
  borderRadius: '10px',
  backgroundColor: 'rgba(0,0,0,0.12)',
};

const fmtDur = (sec) => {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

// ---------------- Optimistic upload bubble ----------------
const UploadBubble = ({ meta, onRetry, onDiscard }) => {
  const failed = meta._upload === 'error';
  const sending = meta._upload === 'sending';
  const pct = meta._progress || 0;
  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ flexShrink: 0, display: 'flex' }}>
          {meta.kind === 'audio'
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="M16 10l6-3v10l-6-3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
        <span style={{ ...nameStyle, flex: 1 }}>{meta.name || (meta.kind === 'audio' ? 'Voice note' : 'Video')}</span>
        <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{formatSize(meta.size)}</span>
      </div>
      {!failed && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ height: '4px', borderRadius: '2px', backgroundColor: '#334155', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: sending ? '100%' : `${pct}%`, backgroundColor: '#6366f1', borderRadius: '2px', transition: 'width 0.2s' }} />
          </div>
          <div style={{ ...metaStyle, marginTop: '4px' }}>{sending ? 'Finalizing…' : `Uploading… ${pct}%`}</div>
        </div>
      )}
      {failed && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: '#fca5a5' }}>Upload failed{meta._error ? ` — ${meta._error}` : ''}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button onClick={() => onRetry && onRetry(meta._tempId)} style={{ flex: 1, padding: '6px 0', borderRadius: '8px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Retry</button>
            <button onClick={() => onDiscard && onDiscard(meta._tempId)} style={{ flex: 1, padding: '6px 0', borderRadius: '8px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#e2e8f0', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------- Confirmed video tile ----------------
const VideoTile = ({ att, taskId }) => {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [url, setUrl] = useState(null);
  const [expired, setExpired] = useState(false);

  if (expired || att.deleted || isLocallyExpired(att)) {
    return <span style={chipStyle}>{att.deleted ? 'Media deleted' : 'Media expired'}</span>;
  }

  const open = async () => {
    if (status === 'loading' || status === 'ready') return;
    setStatus('loading');
    try {
      const signed = await fetchMediaUrl(taskId, att.key);
      setUrl(signed);
      setStatus('ready');
    } catch (err) {
      if (err.expired) { setExpired(true); return; }
      setStatus('error');
    }
  };

  if (status === 'ready' && url) {
    return (
      <div style={tileStyle}>
        <video src={url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: '8px', display: 'block', backgroundColor: '#000' }} />
        <div style={{ ...metaStyle, marginTop: '4px' }}>{att.name}</div>
      </div>
    );
  }

  return (
    <div style={{ ...tileStyle, cursor: status === 'error' ? 'default' : 'pointer' }} onClick={open}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {status === 'loading'
            ? <span style={{ fontSize: '11px' }}>…</span>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="#f1f5f9"><path d="M8 5v14l11-7z" /></svg>}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={nameStyle}>{att.name || 'Video'}</span>
          <span style={{ display: 'block', ...metaStyle }}>{formatSize(att.size)}{status === 'error' ? ' · tap failed, try again' : ''}</span>
        </span>
      </div>
    </div>
  );
};

// ---------------- Confirmed audio player ----------------
const AudioTile = ({ att, taskId }) => {
  const audioRef = useRef(null);
  const [expired, setExpired] = useState(att.deleted || isLocallyExpired(att));
  const [status, setStatus] = useState(expired ? 'expired' : 'idle'); // idle | loading | ready | error | expired
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  }, []);

  if (expired || status === 'expired') {
    return <span style={chipStyle}>{att.deleted ? 'Media deleted' : 'Media expired'}</span>;
  }

  const ensureAudio = async () => {
    if (audioRef.current || status === 'loading') return true;
    setStatus('loading');
    try {
      const signed = await fetchMediaUrl(taskId, att.key);
      const el = new Audio(signed);
      el.preload = 'metadata'; // created only after an explicit play tap; never preload content eagerly
      el.addEventListener('timeupdate', () => {
        if (el.duration) setProgress(el.currentTime / el.duration);
      });
      el.addEventListener('ended', () => { setPlaying(false); setProgress(0); });
      el.addEventListener('loadedmetadata', () => setDuration(el.duration));
      audioRef.current = el;
      setStatus('ready');
      return true;
    } catch (err) {
      if (err.expired) { setExpired(true); setStatus('expired'); return false; }
      setStatus('error');
      return false;
    }
  };

  const toggle = async () => {
    if (!(await ensureAudio())) return;
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { await el.play(); setPlaying(true); }
  };

  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={toggle} style={{ width: '34px', height: '34px', borderRadius: '50%', border: 'none', backgroundColor: '#334155', color: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          {status === 'loading' ? <span style={{ fontSize: '11px' }}>…</span>
            : playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="#f1f5f9"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="#f1f5f9"><path d="M8 5v14l11-7z" /></svg>}
        </button>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', height: '4px', borderRadius: '2px', backgroundColor: '#334155', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: '#6366f1' }} />
          </span>
          <span style={{ display: 'block', ...metaStyle }}>
            {att.name || 'Voice note'}{duration ? ` · ${fmtDur(duration)}` : ''}{status === 'error' ? ' · load failed, tap again' : ''}
          </span>
        </span>
      </div>
    </div>
  );
};

// ---------------- Entry point ----------------
const MediaBubble = ({ att, taskId, onRetry, onDiscard }) => {
  // Optimistic upload in flight (or failed) — metadata carried on the message
  if (att && att._upload) {
    return <UploadBubble meta={att} onRetry={onRetry} onDiscard={onDiscard} />;
  }
  if (!att || !att.kind) return null;
  if (att.deleted || isLocallyExpired(att)) {
    return <span style={chipStyle}>{att.deleted ? 'Media deleted' : 'Media expired'}</span>;
  }
  if (att.kind === 'video') return <VideoTile att={att} taskId={taskId} />;
  if (att.kind === 'audio') return <AudioTile att={att} taskId={taskId} />;
  return null;
};

export default MediaBubble;
