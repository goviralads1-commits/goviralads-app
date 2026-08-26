import api from '../../services/api';

// =====================================================================
// CHAT MEDIA (Phase 2A) — client-side media helpers
// Centralized limits: single source of truth for UX validation.
// Can later be replaced by a capabilities endpoint without touching
// the upload flow. Server re-validates everything — this is UX-only.
// =====================================================================
export const MEDIA_LIMITS = {
  videoMB: 500,
  audioMB: 25,
};
export const VIDEO_ACCEPT = 'video/mp4,video/webm';
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];

export const mbToBytes = (mb) => mb * 1024 * 1024;
export const limitFor = (kind) => (kind === 'audio' ? MEDIA_LIMITS.audioMB : MEDIA_LIMITS.videoMB);

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function limitLabel(kind) {
  return `${kind === 'audio' ? 'Voice note' : 'Video'} · max ${limitFor(kind)} MB · kept 10 days`;
}

// ---------------------------------------------------------------------
// Capability probe: is chat media enabled for this task?
// Sends a deliberately invalid request. The flag check runs FIRST in the
// backend route, so: 403 "Chat media is disabled" => feature OFF (exact
// legacy UI), an explicit validation error (400) => feature ON.
// FAIL-CLOSED: any network/transport/unknown error (no HTTP response)
// keeps the media controls hidden. One probe per opened task; never
// retried, never polled.
// ---------------------------------------------------------------------
export async function probeMediaEnabled(taskId) {
  try {
    await api.post(`/client/tasks/${taskId}/media/upload-url`, { kind: 'probe' });
    return true; // unexpected success treated as enabled
  } catch (err) {
    const status = err.response?.status;
    if (status === undefined) return false; // network/transport error — fail closed
    const msg = err.response?.data?.error || '';
    if (status === 403 && /disabled/i.test(msg)) return false;
    if (status === 403) return false; // not authorized — keep legacy UI
    if (status === 404) return false; // no such task — keep legacy UI
    if (status === 400) return true; // explicit validation error means the flag is ON
    return false; // any other/unknown status — fail closed
  }
}

// ---------------------------------------------------------------------
// Direct-to-R2 PUT via browser-native XHR.
// The shared axios instance has a 30s timeout, so large uploads bypass
// it entirely. No artificial timeout; supports progress + abort.
// Media bytes NEVER pass through the Node backend.
// ---------------------------------------------------------------------
export function putToR2(uploadUrl, blob, { onProgress, signal, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('cancelled'));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

// ---------------------------------------------------------------------
// Lazy signed view URLs. Nothing is fetched until the user taps play.
// In-memory cache with a 5-minute expiry margin; 410 (expired) is cached
// negatively so we never hammer R2 for dead media.
// ---------------------------------------------------------------------
const mediaUrlCache = new Map();

export async function fetchMediaUrl(taskId, key) {
  const cached = mediaUrlCache.get(key);
  if (cached) {
    if (cached.expired) {
      const e = new Error('Media expired');
      e.expired = true;
      throw e;
    }
    if (cached.validUntil > Date.now()) return cached.url;
    mediaUrlCache.delete(key);
  }
  try {
    const res = await api.get(`/client/tasks/${taskId}/media-url`, { params: { key } });
    const { url, expiresInSec } = res.data || {};
    if (!url) throw new Error('No media URL returned');
    const marginMs = Math.min(300, Math.max(30, Math.floor((expiresInSec || 3600) / 10))) * 1000;
    mediaUrlCache.set(key, { url, validUntil: Date.now() + (expiresInSec || 3600) * 1000 - marginMs });
    return url;
  } catch (err) {
    if (err.response?.status === 410) {
      mediaUrlCache.set(key, { expired: true });
      const e = new Error('Media expired');
      e.expired = true;
      throw e;
    }
    throw err;
  }
}

// Best-effort local expiry check from server-stamped metadata (no requests)
export const isLocallyExpired = (att) => !!(att && att.expiresAt && new Date(att.expiresAt).getTime() <= Date.now());

// ---------------------------------------------------------------------
// Delete ONE media attachment. All authorization is server-side (task /
// message / attachment ownership); the server removes the R2 object and
// leaves a deleted marker on the message. Idempotent on the server.
// ---------------------------------------------------------------------
export async function deleteMedia(taskId, messageId, key) {
  await api.delete(`/client/tasks/${taskId}/media`, { data: { messageId, key } });
}
