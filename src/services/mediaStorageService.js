/**
 * MEDIA STORAGE SERVICE (Chat Media Phase 1 — R2 foundation)
 * ===========================================================
 * Isolated Cloudflare R2 (S3-compatible) foundation for future chat
 * video/audio attachments. Design invariants:
 *
 * - Media BYTES never pass through Node: browsers PUT directly to R2
 *   using short-lived presigned URLs issued here.
 * - This service only ever issues URLs and reads object metadata (HEAD).
 * - Deletion of individual media is explicit and server-guarded
 *   (deleteMediaObject); everything else is swept by an R2 lifecycle
 *   rule (objects older than MEDIA_RETENTION_DAYS). No cron, no workers.
 * - Feature flag: CHAT_MEDIA_ENABLED must be literally 'true' to enable.
 * - If R2 env vars are missing the app still boots; media stays disabled.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

// ============== CONFIG (env-driven, resolved lazily per call) ==============

const UPLOAD_TTL_SEC = 1800;  // presigned PUT lifetime: 30 minutes
const VIEW_TTL_SEC = 3600;    // presigned GET lifetime: 60 minutes

const MEDIA_LIMITS = {
  video: { mime: 'video/mp4', ext: 'mp4' },
  audio: { mime: 'audio/mp4', ext: 'm4a' },
};

// Allowed kind -> MIME -> server-derived extension. NEVER derived from the
// user-supplied filename. Do not broaden this whitelist without review.
const MIME_WHITELIST = {
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/webm': { kind: 'video', ext: 'webm' },
  'audio/webm': { kind: 'audio', ext: 'webm' },
  'audio/mp4': { kind: 'audio', ext: 'm4a' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
};

// Fixed key shape: chat-media/{taskId}/{32-hex-random}.{server-derived-ext}
// No user-controlled string ever appears in the key.
const KEY_REGEX = /^chat-media\/[0-9a-f]{24}\/[0-9a-f]{32}\.(mp4|webm|m4a|mp3)$/;

class MediaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const getConfig = () => ({
  enabled: process.env.CHAT_MEDIA_ENABLED === 'true',
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET_NAME || '',
  retentionDays: (() => {
    const d = parseInt(process.env.MEDIA_RETENTION_DAYS, 10);
    return Number.isFinite(d) && d > 0 ? d : 10;
  })(),
  maxVideoMB: (() => {
    const v = parseInt(process.env.MEDIA_MAX_VIDEO_MB, 10);
    return Number.isFinite(v) && v > 0 ? v : 500;
  })(),
  maxAudioMB: (() => {
    const v = parseInt(process.env.MEDIA_MAX_AUDIO_MB, 10);
    return Number.isFinite(v) && v > 0 ? v : 25;
  })(),
});

const isConfigured = () => {
  const c = getConfig();
  return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
};

// Lazy S3 client — constructed on first use only, so missing env vars never
// affect application boot.
let s3Client = null;
const getS3Client = () => {
  if (s3Client) return s3Client;
  if (!isConfigured()) {
    throw new MediaError(503, 'Media storage is not configured');
  }
  // Required lazily so the AWS SDK is only loaded when the feature is used.
  const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const cfg = getConfig();
  s3Client = {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    }),
    HeadObjectCommand,
    getSignedUrl,
    bucket: cfg.bucket,
  };
  return s3Client;
};

// ============== HELPERS ==============

const isValidTaskId = (taskId) =>
  typeof taskId === 'string' && mongoose.isValidObjectId(taskId);

/**
 * Sanitize a user-supplied filename for DISPLAY ONLY. The result is stored
 * as attachment metadata and is NEVER used to construct the R2 key.
 */
const sanitizeFilename = (filename) => {
  if (typeof filename !== 'string' || !filename.trim()) return '';
  let base = filename.replace(/\\/g, '/').split('/').pop() || '';
  // Remove control characters, keep a conservative printable set
  base = base.replace(/[^\w.\- ()[\]]+/g, '').trim();
  if (base.length > 120) base = base.slice(0, 120);
  return base;
};

const buildKey = (taskId, ext) =>
  `chat-media/${taskId}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

const maxBytesForKind = (kind) => {
  const c = getConfig();
  return (kind === 'video' ? c.maxVideoMB : c.maxAudioMB) * 1024 * 1024;
};

// ============== PUBLIC API ==============

const isEnabled = () => getConfig().enabled;

/**
 * Safe capability summary for GET /health/media.
 * Never includes credentials, account ID, or bucket name.
 */
const getCapabilities = () => {
  const c = getConfig();
  return {
    enabled: c.enabled,
    configured: isConfigured(),
    retentionDays: c.retentionDays,
    limits: { videoMB: c.maxVideoMB, audioMB: c.maxAudioMB },
    signedUrlTTL: { uploadSec: UPLOAD_TTL_SEC, viewSec: VIEW_TTL_SEC },
  };
};

/**
 * Issue a presigned direct-to-R2 PUT URL. No bytes touch the server.
 * @returns {{ uploadUrl, method, key, expiresInSec, attachment }}
 */
const issueUpload = async ({ taskId, kind, filename, size, mime }) => {
  if (!isEnabled()) throw new MediaError(403, 'Chat media is disabled');
  if (!isValidTaskId(taskId)) throw new MediaError(400, 'Invalid task id');
  if (kind !== 'video' && kind !== 'audio') {
    throw new MediaError(400, 'Invalid media kind');
  }
  const entry = MIME_WHITELIST[mime];
  if (!entry || entry.kind !== kind) {
    throw new MediaError(400, 'MIME type not allowed for this media kind');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new MediaError(400, 'Invalid size');
  }
  const maxBytes = maxBytesForKind(kind);
  if (size > maxBytes) {
    throw new MediaError(413, `File exceeds the ${kind} size limit`);
  }

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = getS3Client();
  const key = buildKey(taskId, entry.ext);
  const uploadUrl = await s3.getSignedUrl(
    s3.client,
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: mime,
    }),
    { expiresIn: UPLOAD_TTL_SEC }
  );

  const cfg = getConfig();
  const expiresAt = new Date(Date.now() + cfg.retentionDays * 24 * 60 * 60 * 1000);
  const name = sanitizeFilename(filename) || `${kind}.${entry.ext}`;

  return {
    uploadUrl,
    method: 'PUT',
    key,
    expiresInSec: UPLOAD_TTL_SEC,
    attachment: { kind, key, name, size, mime, expiresAt },
  };
};

/**
 * Validate an object attachment at message-send time. Confirms:
 * shape, kind, MIME, size, key format, key<->task relationship, R2 object
 * existence, and ContentLength === declared size. Returns the normalized
 * server-controlled metadata that gets stored (never client-supplied as-is).
 */
const validateStoredAttachment = async (taskId, att) => {
  if (!isEnabled()) throw new MediaError(403, 'Chat media is disabled');
  if (!isValidTaskId(taskId)) throw new MediaError(400, 'Invalid task id');
  if (!att || typeof att !== 'object' || Array.isArray(att)) {
    throw new MediaError(400, 'Invalid attachment');
  }
  const { kind, key, name, size, mime } = att;
  if (kind !== 'video' && kind !== 'audio') {
    throw new MediaError(400, 'Invalid media kind');
  }
  if (typeof mime !== 'string' || !MIME_WHITELIST[mime] || MIME_WHITELIST[mime].kind !== kind) {
    throw new MediaError(400, 'MIME type not allowed for this media kind');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new MediaError(400, 'Invalid attachment size');
  }
  if (size > maxBytesForKind(kind)) {
    throw new MediaError(413, 'Attachment exceeds the size limit');
  }
  if (typeof key !== 'string' || !KEY_REGEX.test(key) || !key.startsWith(`chat-media/${taskId}/`)) {
    throw new MediaError(400, 'Invalid media key');
  }

  // HEAD the R2 object: proves existence and that the actual byte size
  // matches the declared size.
  const s3 = getS3Client();
  let head;
  try {
    head = await s3.client.send(
      new s3.HeadObjectCommand({ Bucket: s3.bucket, Key: key })
    );
  } catch (headErr) {
    const notFound =
      headErr?.name === 'NotFound' || headErr?.$metadata?.httpStatusCode === 404;
    if (notFound) throw new MediaError(404, 'Media object not found');
    console.error('[MEDIA] R2 HEAD failed:', headErr.message);
    throw new MediaError(502, 'Media storage check failed');
  }
  if (head.ContentLength !== size) {
    throw new MediaError(400, 'Media size mismatch');
  }

  const cfg = getConfig();
  return {
    kind,
    key,
    name: sanitizeFilename(name) || `${kind}.${MIME_WHITELIST[mime].ext}`,
    size,
    mime,
    expiresAt: new Date(Date.now() + cfg.retentionDays * 24 * 60 * 60 * 1000),
  };
};

/**
 * Issue a short-lived presigned GET for media stored in THIS task's messages.
 * The key must already exist in task.messages attachments — arbitrary or
 * cross-task keys are rejected. Expired attachments return 410.
 */
const issueViewUrl = async (task, key) => {
  if (!isEnabled()) throw new MediaError(403, 'Chat media is disabled');
  const taskId = task?._id?.toString();
  if (!isValidTaskId(taskId)) throw new MediaError(400, 'Invalid task id');
  if (typeof key !== 'string' || !KEY_REGEX.test(key) || !key.startsWith(`chat-media/${taskId}/`)) {
    throw new MediaError(400, 'Invalid media key');
  }

  // Key must belong to a stored message attachment of this exact task.
  let found = null;
  for (const m of task.messages || []) {
    for (const att of m.attachments || []) {
      if (att && typeof att === 'object' && att.key === key) {
        found = att;
        break;
      }
    }
    if (found) break;
  }
  if (!found) throw new MediaError(404, 'Media not found for this task');
  if (found.deleted) throw new MediaError(410, 'Media has been deleted');
  if (found.expiresAt && new Date(found.expiresAt).getTime() <= Date.now()) {
    throw new MediaError(410, 'Media has expired');
  }

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = getS3Client();
  const url = await s3.getSignedUrl(
    s3.client,
    new GetObjectCommand({ Bucket: s3.bucket, Key: key }),
    { expiresIn: VIEW_TTL_SEC }
  );
  return { url, expiresInSec: VIEW_TTL_SEC };
};

/**
 * Delete a media object from R2. Same strict guards as issueViewUrl:
 * the key must match the fixed key shape AND already exist in THIS task's
 * stored message attachments — arbitrary or cross-task keys are rejected.
 * R2 DeleteObject is idempotent (a missing object still succeeds), which
 * keeps repeated deletion safe. The caller marks the Mongo attachment
 * ONLY after this resolves — a failed R2 delete never destroys the
 * reference.
 */
const deleteMediaObject = async (task, key) => {
  if (!isEnabled()) throw new MediaError(403, 'Chat media is disabled');
  const taskId = task?._id?.toString();
  if (!isValidTaskId(taskId)) throw new MediaError(400, 'Invalid task id');
  if (typeof key !== 'string' || !KEY_REGEX.test(key) || !key.startsWith(`chat-media/${taskId}/`)) {
    throw new MediaError(400, 'Invalid media key');
  }

  // Key must belong to a stored message attachment of this exact task.
  let found = null;
  for (const m of task.messages || []) {
    for (const att of m.attachments || []) {
      if (att && typeof att === 'object' && att.key === key) {
        found = att;
        break;
      }
    }
    if (found) break;
  }
  if (!found) throw new MediaError(404, 'Media not found for this task');

  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = getS3Client();
  try {
    await s3.client.send(
      new DeleteObjectCommand({ Bucket: s3.bucket, Key: key })
    );
  } catch (delErr) {
    console.error('[MEDIA] R2 DELETE failed:', delErr.message);
    throw new MediaError(502, 'Media storage deletion failed');
  }
  return { key };
};

module.exports = {
  MediaError,
  isEnabled,
  getCapabilities,
  issueUpload,
  validateStoredAttachment,
  issueViewUrl,
  deleteMediaObject,
};
