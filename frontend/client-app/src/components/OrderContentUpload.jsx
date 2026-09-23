import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { putToR2, formatSize, mbToBytes, MEDIA_LIMITS } from './chat/mediaUpload';

const TYPES = {
  mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf', txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

export default function OrderContentUpload({ onChange, disabled }) {
  const entryRef = useRef(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      entryRef.current?.controller?.abort();
      entryRef.current = null;
    };
  }, []);

  const clear = () => {
    const entry = entryRef.current;
    entryRef.current = null;
    entry?.controller?.abort();
    setStatus('idle');
    setSummary(null);
    setError('');
    setProgress(0);
    onChange(null, 'idle');
  };

  const run = async entry => {
    if (!entry || entry.running || entryRef.current !== entry) return;
    entry.running = true;
    entry.controller = new AbortController();
    const signal = entry.controller.signal;
    const current = () => mounted.current && entryRef.current === entry && !signal.aborted;
    const update = next => {
      if (!current()) return;
      setStatus(next);
      onChange(null, next);
    };
    const verify = async () => {
      const res = await api.post('/client/order-content/validate', { attachment: entry.attachment }, { signal });
      if (!current()) return;
      entry.attachment = res.data.attachment;
      entry.file = null;
      setSummary(entry.attachment);
      setProgress(100);
      setStatus('ready');
      onChange(entry.attachment, 'ready');
    };

    setError('');
    try {
      // A lost PUT/finalization response must not force a duplicate upload.
      if (entry.attachment) {
        update('verifying');
        try {
          await verify();
          return;
        } catch (err) {
          if (!current()) return;
          if (err.response?.status !== 404) throw err;
        }
      }
      if (!current()) return;
      if (!entry.file) throw new Error('Select the file again to upload it');
      if (!entry.uploadUrl || entry.urlExpiresAt <= Date.now() + 5000) {
        update('starting');
        const res = await api.post('/client/order-content/upload-url', {
          filename: entry.file.name, size: entry.file.size, mime: entry.mime,
        }, { signal });
        if (!current()) return;
        entry.uploadUrl = res.data.uploadUrl;
        entry.attachment = res.data.attachment;
        entry.urlExpiresAt = Date.now() + res.data.expiresInSec * 1000;
      }
      update('uploading');
      setProgress(0);
      await putToR2(entry.uploadUrl, entry.file, {
        signal, contentType: entry.mime,
        onProgress: value => { if (current()) setProgress(value); },
      });
      if (!current()) return;
      update('verifying');
      await verify();
    } catch (err) {
      if (!current()) return;
      setStatus('failed');
      setError(err.response?.data?.error || err.message || 'Upload failed');
      onChange(null, 'failed');
    } finally {
      entry.running = false;
    }
  };

  const choose = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    clear();
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mime = (!file.type || file.type === 'application/octet-stream') ? TYPES[extension] : file.type;
    if (!Object.values(TYPES).includes(mime) || !file.size || file.size > mbToBytes(MEDIA_LIMITS.videoMB)) {
      setError(`Choose MP4, WebM, PDF, TXT, JPG, PNG, or WebP up to ${MEDIA_LIMITS.videoMB} MB`);
      setStatus('failed');
      onChange(null, 'failed');
      return;
    }
    const entry = { file, mime };
    entryRef.current = entry;
    setSummary({ name: file.name, size: file.size });
    run(entry);
  };

  const busy = ['starting', 'uploading', 'verifying'].includes(status);
  return (
    <div style={{ marginTop: 10, fontSize: 12 }}>
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Video or file (optional)</label>
      <input type="file" accept=".mp4,.webm,.pdf,.txt,.jpg,.jpeg,.png,.webp" disabled={disabled || busy || status === 'ready'} onChange={choose} style={{ maxWidth: '100%' }} />
      <p style={{ color: '#64748b', margin: '6px 0' }}>Up to 500 MB. Files are automatically deleted after 10 days, even while an order is pending.</p>
      {summary && <div style={{ overflowWrap: 'anywhere' }}>{summary.name} · {formatSize(summary.size)}</div>}
      {busy && <div role="status"><progress value={progress} max="100" style={{ width: '100%' }} />{status === 'uploading' ? `Uploading ${progress}%` : 'Verifying upload...'}</div>}
      {status === 'ready' && <div role="status" style={{ color: '#15803b' }}>Ready · Expires {new Date(summary.expiresAt).toLocaleString()}</div>}
      {error && <div role="alert" style={{ color: '#dc2626', marginTop: 6 }}>{error}</div>}
      {status === 'failed' && entryRef.current && <button type="button" disabled={disabled} onClick={() => run(entryRef.current)}>Retry</button>}
      {status !== 'idle' && <button type="button" disabled={disabled} onClick={clear} style={{ margin: '8px 0 0 8px' }}>{busy ? 'Cancel upload' : 'Remove file'}</button>}
    </div>
  );
}
