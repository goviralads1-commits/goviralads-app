// ================== ADMIN CLIENT PUSH NOTIFICATION STATUS & REMINDERS ==================
// Read-only visibility + intentional reminder action for client push delivery health.
//
// SAFETY DESIGN (all enforced server-side, never relying on frontend hiding):
//  - authenticateJWT + requireAdmin on the whole router
//  - managers (customRole admins) only see/remind clients assigned to them via tasks
//  - a client is only reported "healthy" when BOTH the client-reported state is
//    'healthy' AND an active DeviceToken exists — a DB flag alone never means ON
//  - reminders never touch browser permission; they reuse the existing in-app
//    Notification + email infrastructure
//  - strict 7-day server-side cooldown prevents duplicate/spam reminders
//  - no FCM tokens or secrets are ever exposed in responses

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

const User = require('../models/User');
const { Task } = require('../models/Task');
const DeviceToken = require('../models/DeviceToken');
const Notification = require('../models/Notification');
const { createNotification, NOTIFICATION_TYPES } = require('../services/notificationService');

router.use(authenticateJWT);
router.use(requireAdmin);

const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// A client-reported 'healthy' state is only trusted for this window. Clients
// re-report at most every 24h while visiting, so a healthy report older than
// this means we have NOT recently verified actual browser permission + token,
// and the client may have disabled notifications in browser settings since.
const HEALTHY_FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Derive a safe delivery-health status for a client.
// reported   = client-reported browser state (may be null if never reported)
// hasToken   = at least one active DeviceToken exists
// reportedAt = when the client last reported its state (may be null)
//
// SOURCE OF TRUTH: "healthy" requires ALL THREE of (1) a RECENT client report,
// (2) that report being 'healthy' (real browser permission granted at report
// time), and (3) an active device token. A stale 'healthy' flag or a token
// alone NEVER counts as ON — that combination is reported as 'unverified'.
function derivePushStatus(reported, hasToken, reportedAt) {
  if (reported === 'healthy') {
    const age = reportedAt ? Date.now() - new Date(reportedAt).getTime() : Infinity;
    const fresh = Number.isFinite(age) && age >= 0 && age < HEALTHY_FRESHNESS_MS;
    if (fresh && hasToken) return 'healthy';
    // Stale report, or report without an active token — never claim ON
    return 'unverified';
  }
  if (reported === 'denied') return 'denied';
  if (reported === 'disabled') return 'disabled';
  if (reported === 'unsupported') return 'unsupported';
  if (reported === 'not_requested') return 'not_requested';
  if (reported === 'token_missing') return 'token_missing';
  // Never reported: an active token means delivery most likely works (legacy clients)
  if (hasToken) return 'unreported';
  return 'unknown';
}

// GET /admin/client-push-status
// Returns delivery-health status for every client visible to the caller.
router.get('/client-push-status', async (req, res) => {
  try {
    const caller = await User.findById(req.user.id).populate('customRole');
    if (!caller) return res.status(403).json({ error: 'Forbidden' });
    const isMainAdmin = caller.role === 'ADMIN' && !caller.customRole;

    const clientFilter = { role: 'CLIENT', isDeleted: { $ne: true } };
    if (!isMainAdmin) {
      // Manager: only clients assigned to them via tasks (same scope as /admin/clients)
      const assignedClientIds = await Task.distinct('clientId', { assignedTo: caller._id });
      clientFilter._id = { $in: assignedClientIds };
    }

    const clients = await User.find(clientFilter)
      .select('_id identifier preferences.pushState preferences.pushStateUpdatedAt')
      .lean();

    const clientIds = clients.map((c) => c._id);
    if (clientIds.length === 0) {
      return res.json({ statuses: [] });
    }

    const activeTokens = await DeviceToken.find({ userId: { $in: clientIds }, isActive: true })
      .select('userId')
      .lean();
    const tokenSet = new Set(activeTokens.map((t) => String(t.userId)));

    // Recent reminders (for cooldown display)
    const cooldownStart = new Date(Date.now() - REMINDER_COOLDOWN_MS);
    const recentReminders = await Notification.find({
      recipientId: { $in: clientIds },
      type: NOTIFICATION_TYPES.ENABLE_NOTIFICATIONS_REMINDER,
      createdAt: { $gte: cooldownStart },
    }).select('recipientId createdAt').lean();
    const reminderMap = {};
    recentReminders.forEach((r) => { reminderMap[String(r.recipientId)] = r.createdAt; });

    const statuses = clients.map((c) => {
      const reported = c.preferences?.pushState || null;
      const hasActiveToken = tokenSet.has(String(c._id));
      const status = derivePushStatus(reported, hasActiveToken, c.preferences?.pushStateUpdatedAt);
      // Reminders are only meaningful for clients whose delivery is KNOWN-bad or
      // missing entirely. 'unverified' / 'unreported' are honest "not sure" states —
      // we never nag a client we cannot confidently say is offline.
      const needsAttention = status !== 'healthy' && status !== 'unreported' && status !== 'unverified';
      return {
        clientId: String(c._id),
        identifier: c.identifier,
        status,
        hasActiveToken,
        needsAttention,
        reportedAt: c.preferences?.pushStateUpdatedAt || null,
        lastReminderAt: reminderMap[String(c._id)] || null,
      };
    });

    return res.json({ statuses });
  } catch (err) {
    console.error('[PUSH STATUS] Error:', err.message);
    return res.status(500).json({ error: 'Failed to load client push status' });
  }
});

// POST /admin/clients/:clientId/remind-enable-notifications
// Sends an in-app (+email) reminder asking the client to re-enable notifications.
// Never attempts to force browser permission — only the client/browser can grant it.
router.post('/clients/:clientId/remind-enable-notifications', async (req, res) => {
  try {
    const caller = await User.findById(req.user.id).populate('customRole');
    if (!caller) return res.status(403).json({ error: 'Forbidden' });
    const isMainAdmin = caller.role === 'ADMIN' && !caller.customRole;

    const { clientId } = req.params;
    if (!mongoose.isValidObjectId(clientId)) {
      return res.status(400).json({ error: 'Invalid client id' });
    }

    const client = await User.findOne({ _id: clientId, role: 'CLIENT', isDeleted: { $ne: true } });
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Manager scope check: only clients assigned to this manager via tasks
    if (!isMainAdmin) {
      const assigned = await Task.findOne({ clientId: client._id, assignedTo: caller._id })
        .select('_id')
        .exec();
      if (!assigned) {
        return res.status(403).json({ error: 'This client is not assigned to you' });
      }
    }

    // Never remind clients whose notifications are verified healthy right now
    const activeTokenCount = await DeviceToken.countDocuments({ userId: client._id, isActive: true });
    const reported = client.preferences?.pushState || null;
    if (derivePushStatus(reported, activeTokenCount > 0, client.preferences?.pushStateUpdatedAt) === 'healthy') {
      return res.status(400).json({ error: 'Notifications are already enabled for this client' });
    }

    // Server-side cooldown: max one reminder per 7 days per client
    const cooldownStart = new Date(Date.now() - REMINDER_COOLDOWN_MS);
    const recentReminder = await Notification.findOne({
      recipientId: client._id,
      type: NOTIFICATION_TYPES.ENABLE_NOTIFICATIONS_REMINDER,
      createdAt: { $gte: cooldownStart },
    }).sort({ createdAt: -1 }).exec();
    if (recentReminder) {
      return res.status(429).json({ error: 'A reminder was already sent within the last 7 days' });
    }

    // Server-side reminder: this Notification record IS the pending reminder.
    // It survives logout/login and is surfaced in-app the next time the client
    // signs in (GET /client/enable-notifications-reminder) — it NEVER relies on
    // push delivery (a client who is OFF cannot receive push by definition).
    // Email is sent because that channel is actually available; push is not
    // attempted and no push delivery is ever claimed.
    await createNotification({
      recipientId: client._id,
      type: NOTIFICATION_TYPES.ENABLE_NOTIFICATIONS_REMINDER,
      title: 'Turn On Notifications',
      message: 'You may be missing important updates (orders, tasks, payments, reminders). Enable notifications anytime from Profile → Settings → Push Notifications.',
      notifyByEmail: true,
    });

    console.log(`[PUSH STATUS] Reminder created for client ${client._id} by ${caller._id}`);
    return res.json({ success: true, message: 'Reminder created — the client will see it the next time they sign in' });
  } catch (err) {
    console.error('[PUSH STATUS] Remind error:', err.message);
    return res.status(500).json({ error: 'Failed to send reminder' });
  }
});

module.exports = router;

