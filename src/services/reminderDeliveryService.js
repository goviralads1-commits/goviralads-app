const mongoose = require('mongoose');
const { createHash, randomUUID } = require('crypto');
const ReminderDelivery = require('../models/ReminderDelivery');
const Notification = require('../models/Notification');
const emailService = require('./emailService');

// Resend retains keys for 24 hours. Stop retries an hour early; never extend this deadline.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const BOUNDARY_ID = 'reminder-delivery-cutover-v1';

async function initializeReminderDelivery(scope) {
  const now = new Date();
  let boundary = await ReminderDelivery.findById(BOUNDARY_ID).lean().exec();
  if (!boundary) {
    try {
      boundary = await ReminderDelivery.create({
        _id: BOUNDARY_ID, scope: 'boundary', channel: 'BOUNDARY', state: 'BOUNDARY', cutoverAt: now,
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      boundary = await ReminderDelivery.findById(BOUNDARY_ID).lean().exec();
      if (!boundary) throw err;
    }
  }
  const filter = scope ? { scope } : {};
  await ReminderDelivery.updateMany(
    { ...filter, state: 'SENDING', leaseUntil: { $lte: now } },
    { $set: { state: 'UNKNOWN', reason: 'INTERRUPTED_ATTEMPT' } }
  );
  const held = await ReminderDelivery.updateMany(
    { ...filter, state: 'UNKNOWN', retryUntil: { $lte: now } },
    { $set: { state: 'HELD', reason: 'IDEMPOTENCY_WINDOW_EXPIRED' } }
  );
  if (held.modifiedCount) console.error('[REMINDER DELIVERY] Uncertain attempts held; automatic resend blocked');
  return boundary.cutoverAt;
}

async function prepareDelivery(options, channel, payload) {
  const id = 'reminder-v1-' + createHash('sha256')
    .update(JSON.stringify([options.scope, options.key, channel])).digest('hex');
  const existing = await ReminderDelivery.findById(id).lean().exec();
  if (existing) return existing;
  const cutover = await initializeReminderDelivery(options.scope);
  const existedBefore = !options.entityCreatedAt || new Date(options.entityCreatedAt) <= new Date(cutover);
  const ambiguous = existedBefore && new Date(options.periodStart) < new Date(cutover);
  try {
    const created = await ReminderDelivery.create({
      _id: id, scope: options.scope, recipientId: options.recipientId, subjectId: options.subjectId,
      ownerClientId: options.ownerClientId || options.recipientId,
      channel, payload, state: ambiguous ? 'HELD' : 'PENDING',
      reason: ambiguous ? 'LEGACY_DELIVERY_UNKNOWN_AT_CUTOVER' : undefined,
    });
    if (ambiguous) console.log('[REMINDER DELIVERY] Ambiguous rollout reminder held:', id);
    return created;
  } catch (err) {
    if (err.code !== 11000) throw err;
    const concurrent = await ReminderDelivery.findById(id).lean().exec();
    if (!concurrent) throw err;
    return concurrent;
  }
}

async function recordInApp(entry, eligible) {
  if (entry.state !== 'PENDING') return entry.state === 'RECORDED';
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const current = await ReminderDelivery.findById(entry._id).session(session).lean().exec();
      if (!current || current.state !== 'PENDING') return current?.state === 'RECORDED';
      if (!await eligible(current.recipientId)) {
        await ReminderDelivery.updateOne({ _id: current._id, state: 'PENDING' },
          { $set: { state: 'CANCELLED', reason: 'NO_LONGER_ELIGIBLE' } }, { session });
        return false;
      }
      const [notification] = await Notification.create([current.payload], { session });
      const result = await ReminderDelivery.updateOne({ _id: current._id, state: 'PENDING' },
        { $set: { state: 'RECORDED', notificationId: notification._id } }, { session });
      if (result.modifiedCount !== 1) throw new Error('REMINDER_CLAIM_LOST');
      return true;
    });
  } finally {
    await session.endSession();
  }
}

async function sendJournalEmail(entry, eligible) {
  if (entry.state === 'ACCEPTED') return true;
  if (!['PENDING', 'UNKNOWN'].includes(entry.state)) return false;
  if (!emailService.isConfigured()) return false;
  const now = new Date();
  const retryUntil = entry.retryUntil ? new Date(entry.retryUntil) : new Date(now.getTime() + RETRY_WINDOW_MS);
  if (retryUntil <= now) {
    await ReminderDelivery.updateOne({ _id: entry._id, state: { $in: ['PENDING', 'UNKNOWN'] } },
      { $set: { state: 'HELD', reason: 'IDEMPOTENCY_WINDOW_EXPIRED' } });
    return false;
  }
  const token = randomUUID();
  const claimed = await ReminderDelivery.findOneAndUpdate({
    _id: entry._id, state: { $in: ['PENDING', 'UNKNOWN'] }, attempts: entry.attempts,
  }, {
    $set: { state: 'SENDING', leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS),
      firstAttemptAt: entry.firstAttemptAt || now, retryUntil },
    $inc: { attempts: 1 },
  }, { new: true }).lean().exec();
  if (!claimed) return false;
  const owned = { _id: entry._id, leaseToken: token, state: 'SENDING' };
  try {
    if (!await eligible(claimed.recipientId)) {
      await ReminderDelivery.updateOne(owned, { $set: { state: 'CANCELLED', reason: 'NO_LONGER_ELIGIBLE' } });
      return false;
    }
    // Check the deadline again immediately before dispatch, including a slow eligibility lookup.
    if (new Date() >= new Date(claimed.retryUntil)) {
      await ReminderDelivery.updateOne(owned, { $set: { state: 'HELD', reason: 'IDEMPOTENCY_WINDOW_EXPIRED' } });
      return false;
    }
    const result = await emailService.send(claimed.payload, { idempotencyKey: claimed._id });
    if (!result?.success || !result.messageId) {
      await ReminderDelivery.updateOne(owned, { $set: { state: 'UNKNOWN', reason: 'PROVIDER_ACCEPTANCE_UNCONFIRMED' } });
      console.error('[REMINDER DELIVERY] Provider acceptance unconfirmed:', claimed._id);
      return false;
    }
    const saved = await ReminderDelivery.updateOne(owned, {
      $set: { state: 'ACCEPTED', providerMessageId: result.messageId, acceptedAt: new Date(), reason: null },
    });
    return saved.modifiedCount === 1;
  } catch (_) {
    // The provider may have accepted the request. Never retry with a new key or claim success.
    try {
      await ReminderDelivery.updateOne(owned, { $set: { state: 'UNKNOWN', reason: 'PROVIDER_OR_RECORDING_INTERRUPTED' } });
    } catch (_) {
      // A persisted SENDING lease will become UNKNOWN during recovery.
      console.error('[REMINDER DELIVERY] Attempt state could not be persisted; lease recovery required');
    }
    console.error('[REMINDER DELIVERY] Uncertain attempt retained:', entry._id);
    return false;
  }
}

async function deliverReminder(options) {
  if (!options.key || !options.scope || !options.periodStart
      || !Number.isFinite(new Date(options.periodStart).getTime())
      || typeof options.eligible !== 'function') {
    throw new Error('REMINDER_DELIVERY_CONTEXT_REQUIRED');
  }
  await initializeReminderDelivery(options.scope);
  let complete = true;
  if (options.notification) {
    const entry = await prepareDelivery(options, 'IN_APP', options.notification);
    complete = await recordInApp(entry, options.eligible) && complete;
  }
  if (options.email) {
    const entry = await prepareDelivery(options, 'EMAIL', options.email);
    complete = await sendJournalEmail(entry, options.eligible) && complete;
  }
  return { complete };
}

async function cancelClientDeliveries(clientIds, session) {
  // Keep payload-free tombstones so a stale worker cannot recreate a previously used key.
  await ReminderDelivery.updateMany({
    $or: [{ ownerClientId: { $in: clientIds } }, { recipientId: { $in: clientIds } }],
  }, {
    $set: { state: 'CANCELLED', reason: 'CLIENT_DATA_REMOVED' },
    $unset: { payload: 1, recipientId: 1, ownerClientId: 1, subjectId: 1,
      providerMessageId: 1, notificationId: 1, leaseToken: 1, leaseUntil: 1 },
  }, { session });
}

module.exports = { initializeReminderDelivery, deliverReminder, cancelClientDeliveries, RETRY_WINDOW_MS };
