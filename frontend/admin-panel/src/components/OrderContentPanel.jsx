import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { formatSize } from './chat/mediaUpload';

// Mounting this panel performs no requests. Only explicit actions load content.
export default function OrderContentPanel({ resourceUrl }) {
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [unavailable, setUnavailable] = useState({});
  const active = useRef(false);
  const mounted = useRef(true);
  const controller = useRef(null);
  const urls = useRef(new Map());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); urls.current.clear(); };
  }, []);

  const load = async () => {
    if (active.current) return;
    active.current = true;
    controller.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      const res = await api.get(resourceUrl, { signal: controller.current.signal });
      if (mounted.current) setFiles(res.data.files || []);
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || 'Unable to load file details');
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const open = async (file, download) => {
    if (active.current || (!download && preview?.key === file.key)) return;
    active.current = true;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    // Native download navigation avoids buffering the body in JavaScript.
    const tab = download ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      if (download && !tab) throw new Error('Allow this download window, then try again');
      const cacheKey = `${file.key}:${download}`;
      let cached = urls.current.get(cacheKey);
      if (!cached || cached.until <= Date.now()) {
        const res = await api.get(resourceUrl, {
          params: { key: file.key, download: download ? '1' : '0' }, signal: controller.current.signal,
        });
        cached = { url: res.data.url, until: Date.now() + Math.max(0, res.data.expiresInSec - 30) * 1000 };
        urls.current.set(cacheKey, cached);
      }
      if (!mounted.current) { tab?.close(); return; }
      if (download) tab.location.replace(cached.url);
      else setPreview({ ...file, url: cached.url });
    } catch (err) {
      tab?.close();
      if (mounted.current) {
        setError(err.response?.data?.error || err.message || 'Unable to open file');
        if ([404, 410].includes(err.response?.status)) setUnavailable(prev => ({ ...prev, [file.key]: true }));
      }
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section style={{ padding: 14, marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 12 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Uploaded order content</h4>
      <p style={{ color: '#64748b', fontSize: 12 }}>Files follow the existing 10-day deletion policy. Opening this section does not download files.</p>
      {files === null && <button type="button" disabled={busy} onClick={load}>{busy ? 'Loading details...' : 'View uploaded files'}</button>}
      {files?.length === 0 && <p>No files were submitted. Review the existing links/instructions above.</p>}
      {files?.map((file, index) => {
        const expired = unavailable[file.key] || new Date(file.expiresAt).getTime() <= Date.now();
        const canPreview = file.kind === 'video' || file.mime.startsWith('image/');
        return (
          <div key={`${file.key}:${index}`} style={{ marginTop: 12, fontSize: 13, overflowWrap: 'anywhere' }}>
            <strong>{file.title} · Item {file.unitIndex + 1}</strong>
            <div>{file.name} · {formatSize(file.size)}</div>
            <div style={{ color: expired ? '#b91c1c' : '#64748b', margin: '4px 0' }}>{expired ? 'File expired or unavailable' : `Expires ${new Date(file.expiresAt).toLocaleString()}`}</div>
            {canPreview && <button type="button" disabled={busy || expired} onClick={() => open(file, false)}>Preview</button>}
            <button type="button" disabled={busy || expired} onClick={() => open(file, true)} style={{ marginLeft: 8 }}>Download</button>
          </div>
        );
      })}
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {preview && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setPreview(null)}>Close preview</button>
          {preview.kind === 'video'
            ? <video key={preview.key} src={preview.url} controls playsInline preload="none" style={{ width: '100%', maxHeight: 360 }} />
            : <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: 360 }} />}
        </div>
      )}
    </section>
  );
}
