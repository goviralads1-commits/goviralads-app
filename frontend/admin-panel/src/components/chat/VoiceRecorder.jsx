import React, { useEffect, useRef, useState } from 'react';
import { mbToBytes, MEDIA_LIMITS } from './mediaUpload';

// =====================================================================
// VoiceRecorder (Phase 2B admin) — browser-native MediaRecorder, NO
// dependency. Tap-to-record UX: tap mic -> recording (timer + Stop +
// Cancel) -> Stop produces the Blob which the parent uploads via the
// same direct-to-R2 flow as video. Hold-to-record is intentionally
// avoided. Parent renders this ONLY when MediaRecorder is supported.
// =====================================================================

export const isRecordingSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

// MIME preference: webm/opus (Chrome/Android) -> mp4 (iOS Safari) -> browser default
const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
};

const fmt = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const VoiceRecorder = ({ onRecorded, onCancel, onError }) => {
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const stoppedByUserRef = useRef(false);

  const cleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  useEffect(() => () => cleanup(), []); // unmount safety

  // Start recording on mount (this component only exists while recording)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const mime = pickMimeType();
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        mediaRecorderRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'audio/webm' });
          cleanup();
          if (!stoppedByUserRef.current) return; // cancelled — do not deliver
          if (!blob.size) { onError && onError('Recording is empty'); return; }
          if (blob.size > mbToBytes(MEDIA_LIMITS.audioMB)) {
            onError && onError(`Voice note too large (max ${MEDIA_LIMITS.audioMB} MB)`);
            return;
          }
          onRecorded(blob, { mime: blob.type, name: `voice-note-${Date.now()}.${blob.type.includes('mp4') ? 'm4a' : 'webm'}` });
        };
        rec.start();
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      } catch (err) {
        cleanup();
        onError && onError('Microphone access denied');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    stoppedByUserRef.current = true;
    try { mediaRecorderRef.current?.stop(); } catch (_) { cleanup(); }
  };

  const handleCancel = () => {
    stoppedByUserRef.current = false;
    try { mediaRecorderRef.current?.stop(); } catch (_) { /* ignore */ }
    cleanup();
    onCancel && onCancel();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: '14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', minHeight: '44px', boxSizing: 'border-box' }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0, animation: 'gva-admin-rec-pulse 1.2s ease-in-out infinite' }} />
      <style>{'@keyframes gva-admin-rec-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }'}</style>
      <span style={{ fontSize: '14px', fontWeight: '600', color: '#b91c1c', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(seconds)}</span>
      <span style={{ fontSize: '12px', color: '#94a3b8', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Recording…</span>
      <button onClick={handleCancel} title="Cancel" style={{ padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: '#fff', cursor: 'pointer', display: 'flex', flexShrink: 0, minWidth: '40px', minHeight: '40px', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
      </button>
      <button onClick={handleStop} title="Stop & send" style={{ padding: '10px 16px', borderRadius: '14px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, minHeight: '40px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        Stop
      </button>
    </div>
  );
};

export default VoiceRecorder;
