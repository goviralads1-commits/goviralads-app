// ================== ADMIN CLIENT DATA MANAGEMENT (MAIN ADMIN ONLY) ==================
// Destructive, explicitly-invoked client data operations:
//   GET    /admin/client-data/preview                 - read-only counts (fresh-start preview)
//   DELETE /admin/client-data/clients/:userId         - permanent deletion of ONE client + owned records
//   POST   /admin/client-data/fresh-start             - one-time removal of ALL clients captured at execution
//
// SAFETY DESIGN (all enforced server-side, never relying on frontend hiding):
//  - authenticateJWT + requireAdmin on the whole router
//  - every handler re-verifies MAIN ADMIN from the live DB (role === 'ADMIN' && customRole === null)
//  - admin@goviralads.com is resolved by its actual _id and defensively excluded from every deletion set
//  - deletion sets are always derived from role === 'CLIENT' document _ids, never email text or dates
//  - fresh-start captures the CLIENT id set ONCE at the start; signups after that snapshot are never touched
//  - no broad collection-wide deletes: every destructive query is scoped to the captured ids (or derived wallet/task ids)
//  - Notice documents are never deleted or modified; embedded references are only reported
//  - staff/business accounting (CommissionLog, EarningsLedger, EarningsRedeemRequest) is never touched
//  - marketplace Plans (isListedInPlans === true) are never touched

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');
const { mainAdminIdentifier } = require('../config');

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { Order } = require('../models/Order');
const { Task } = require('../models/Task');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const { ReminderLog } = require('../models/ReminderLog');
const UserSubscription = require('../models/UserSubscription');
const { SubscriptionRequest } = require('../models/SubscriptionRequest');
const { RechargeRequest } = require('../models/RechargeRequest');
const { Receipt } = require('../models/Receipt');
const { Invoice } = require('../models/Invoice');
const { ClientEmployeeAssignment } = require('../models/ClientEmployeeAssignment');
const Notice = require('../models/Notice');
const { Employee } = require('../models/Employee');
const { Category } = require('../models/Category');
const CreditPlan = require('../models/CreditPlan');

// Resolved from the same centralized config used by requireMainAdmin — never a local literal
const PROTECTED_IDENTIFIER = mainAdminIdentifier;
const FRESH_START_PHRASE = 'DELETE CLIENT DATA';

router.use(authenticateJWT);
router.use(requireAdmin);

// Resolve the protected main admin from the LIVE database and verify identity by
// role + customRole (not by email text alone). Returns null if verification fails —
// in that case every destructive handler refuses to run.
async function resolveProtectedAdmin() {
  const admin = await User.findOne({ identifier: PROTECTED_IDENTIFIER }).exec();
  if (!admin) return null;
  if (admin.role !== 'ADMIN' || admin.customRole) return null;
  return admin;
}

// MAIN ADMIN gate resolved from the live DB (the route-level requireAdmin only proves ADMIN role).
async function isMainAdminCaller(req) {
  const caller = await User.findById(req.user.id).populate('customRole').exec();
  return !!(caller && caller.role === 'ADMIN' && !caller.customRole);
}

// Read-only scoped counts for a captured client id set.
async function countClientOwned(clientIds, walletIds, session = null) {
  const opts = session ? { session } : undefined;
  const inClients = { $in: clientIds };
  const [
    wallets, walletTransactions, orders, clientTasks, tickets, notifications,
    deviceTokens, reminderLogs, userSubscriptions, subscriptionRequests,
    rechargeRequests, receipts, invoices, assignments,
  ] = await Promise.all([
    Wallet.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    walletIds.length
      ? mongoose.connection.db.collection('wallettransactions').countDocuments({ walletId: { $in: walletIds } }, session ? { session } : {})
      : 0,
    Order.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    Task.countDocuments({ clientId: inClients, isListedInPlans: { $ne: true } }).setOptions(opts || {}),
    Ticket.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    Notification.countDocuments({ recipientId: inClients }).setOptions(opts || {}),
    DeviceToken.countDocuments({ userId: inClients }).setOptions(opts || {}),
    ReminderLog.countDocuments({ recipientId: inClients }).setOptions(opts || {}),
    UserSubscription.countDocuments({ userId: inClients }).setOptions(opts || {}),
    SubscriptionRequest.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    RechargeRequest.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    Receipt.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    Invoice.countDocuments({ clientId: inClients }).setOptions(opts || {}),
    ClientEmployeeAssignment.countDocuments({ clientId: inClients }).setOptions(opts || {}),
  ]);
  return {
    wallets, walletTransactions, orders, clientTasks, tickets, notifications,
    deviceTokens, reminderLogs, userSubscriptions, subscriptionRequests,
    rechargeRequests, receipts, invoices, assignments,
  };
}

// Count embedded client references inside Notice documents (report-only; Notices are never modified here).
async function countNoticeReferences(clientIds) {
  if (!clientIds.length) return { noticesAffected: 0, responses: 0, viewedBy: 0, targetClients: 0 };
  const agg = await Notice.aggregate([
    {
      $project: {
        r: { $size: { $filter: { input: { $ifNull: ['$responses', []] }, as: 'x', cond: { $in: ['$$x.clientId', clientIds] } } } },
        v: { $size: { $filter: { input: { $ifNull: ['$viewedBy', []] }, as: 'x', cond: { $in: ['$$x', clientIds] } } } },
        t: { $size: { $filter: { input: { $ifNull: ['$targetClients', []] }, as: 'x', cond: { $in: ['$$x', clientIds] } } } },
      },
    },
    {
      $group: {
        _id: null,
        noticesAffected: { $sum: { $cond: [{ $or: [{ $gt: ['$r', 0] }, { $gt: ['$v', 0] }, { $gt: ['$t', 0] }] }, 1, 0] } },
        responses: { $sum: '$r' },
        viewedBy: { $sum: '$v' },
        targetClients: { $sum: '$t' },
      },
    },
  ]);
  return agg[0]
    ? { noticesAffected: agg[0].noticesAffected, responses: agg[0].responses, viewedBy: agg[0].viewedBy, targetClients: agg[0].targetClients }
    : { noticesAffected: 0, responses: 0, viewedBy: 0, targetClients: 0 };
}

// Destructive cascade for a captured client id set, executed inside a MongoDB transaction.
// Order follows the approved dependency order; Users are deleted LAST.
async function executeScopedDeletion(clientIds, session) {
  const s = { session };
  const inClients = { $in: clientIds };
  const summary = {};

  // Derive dependent id sets from the captured client set ONLY
  const wallets = await Wallet.find({ clientId: inClients }, '_id').session(session).lean().exec();
  const walletIds = wallets.map(w => w._id);
  const userSubs = await UserSubscription.find({ userId: inClients }, '_id').session(session).lean().exec();
  const subIds = userSubs.map(u => u._id);

  // 1. Notifications
  summary.notifications = (await Notification.deleteMany({ recipientId: inClients }).session(session).exec()).deletedCount || 0;
  // 2. Device tokens
  summary.deviceTokens = (await DeviceToken.deleteMany({ userId: inClients }).session(session).exec()).deletedCount || 0;
  // 3. Reminder logs (by recipient, and by derived subscription ids)
  const reminderFilter = subIds.length ? { $or: [{ recipientId: inClients }, { subscriptionId: { $in: subIds } }] } : { recipientId: inClients };
  summary.reminderLogs = (await ReminderLog.deleteMany(reminderFilter).session(session).exec()).deletedCount || 0;
  // 4. User subscriptions
  summary.userSubscriptions = (await UserSubscription.deleteMany({ userId: inClients }).session(session).exec()).deletedCount || 0;
  // 5. Subscription requests
  summary.subscriptionRequests = (await SubscriptionRequest.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 6. Recharge requests
  summary.rechargeRequests = (await RechargeRequest.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 7. Receipts
  summary.receipts = (await Receipt.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 8. Invoices
  summary.invoices = (await Invoice.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 9. Orders
  summary.orders = (await Order.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 10. Client tasks — NEVER marketplace Plans (isListedInPlans guard)
  summary.clientTasks = (await Task.deleteMany({ clientId: inClients, isListedInPlans: { $ne: true } }).session(session).exec()).deletedCount || 0;
  // 11. Tickets
  summary.tickets = (await Ticket.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 12. Client-employee assignments (the link records only — Employee documents are untouched)
  summary.assignments = (await ClientEmployeeAssignment.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 13. Wallet transactions (native driver: the schema hooks guard document-level deletes;
  //     deleteMany via the collection is the same controlled method the existing reset-data endpoint uses)
  summary.walletTransactions = walletIds.length
    ? (await mongoose.connection.db.collection('wallettransactions').deleteMany({ walletId: { $in: walletIds } }, s)).deletedCount || 0
    : 0;
  // 14. Wallets
  summary.wallets = (await Wallet.deleteMany({ clientId: inClients }).session(session).exec()).deletedCount || 0;
  // 15. The captured CLIENT User documents themselves — LAST, and only by captured _id
  summary.users = (await User.deleteMany({ _id: { $in: clientIds }, role: 'CLIENT' }).session(session).exec()).deletedCount || 0;

  return summary;
}

// ---------- READ-ONLY PREVIEW (fresh-start confirmation screen data) ----------
router.get('/preview', async (req, res) => {
  try {
    if (!(await isMainAdminCaller(req))) {
      return res.status(403).json({ error: 'MAIN ADMIN only' });
    }
    const protectedAdmin = await resolveProtectedAdmin();
    if (!protectedAdmin) {
      return res.status(500).json({ error: 'Protected admin account could not be verified — operation blocked' });
    }

    const clientUsers = await User.find({ role: 'CLIENT' }, '_id').lean().exec();
    const clientIds = clientUsers.map(u => u._id);

    // Defensive proof: the protected admin id is never inside the CLIENT set
    if (clientIds.some(id => id.equals(protectedAdmin._id))) {
      return res.status(500).json({ error: 'Integrity check failed — protected admin found in client set. Operation blocked.' });
    }

    const wallets = await Wallet.find({ clientId: { $in: clientIds } }, '_id').lean().exec();
    const [before, noticeRefs] = await Promise.all([
      countClientOwned(clientIds, wallets.map(w => w._id)),
      countNoticeReferences(clientIds),
    ]);

    return res.status(200).json({
      clientCount: clientIds.length,
      before,
      noticeReferences: noticeRefs,
      protectedAdminId: protectedAdmin._id.toString(),
      freshStartPhrase: FRESH_START_PHRASE,
    });
  } catch (err) {
    console.error('[CLIENT DATA] preview error:', err.message);
    return res.status(500).json({ error: 'Failed to build preview' });
  }
});

// ---------- PERMANENT DELETION OF ONE CLIENT ----------
router.delete('/clients/:userId', async (req, res) => {
  try {
    if (!(await isMainAdminCaller(req))) {
      return res.status(403).json({ error: 'MAIN ADMIN only' });
    }
    const protectedAdmin = await resolveProtectedAdmin();
    if (!protectedAdmin) {
      return res.status(500).json({ error: 'Protected admin account could not be verified — operation blocked' });
    }

    const { userId } = req.params;
    const { confirmPhrase } = req.body || {};

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const target = await User.findById(userId).exec();
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Hard guards: CLIENT role only, never the protected admin, never the caller
    if (target.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Only CLIENT accounts can be permanently deleted' });
    }
    if (target._id.equals(protectedAdmin._id)) {
      return res.status(403).json({ error: 'Protected admin account cannot be deleted' });
    }
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    const expectedPhrase = `DELETE ${target.identifier}`;
    if (confirmPhrase !== expectedPhrase) {
      return res.status(400).json({ error: `Confirmation phrase must be exactly: ${expectedPhrase}` });
    }

    const session = await mongoose.startSession();
    try {
      let before = {};
      let noticeRefs = {};
      let summary = {};

      await session.withTransaction(async () => {
        const wallets = await Wallet.find({ clientId: target._id }, '_id').session(session).lean().exec();
        before = await countClientOwned([target._id], wallets.map(w => w._id), session);
        summary = await executeScopedDeletion([target._id], session);
      });

      noticeRefs = await countNoticeReferences([target._id]);

      return res.status(200).json({
        message: `Client ${target.identifier} permanently deleted`,
        before,
        deleted: summary,
        noticeReferencesRemaining: noticeRefs,
      });
    } catch (txErr) {
      console.error('[CLIENT DATA] delete transaction error:', txErr.message);
      return res.status(500).json({ error: 'Deletion failed — transaction rolled back. No data was lost.', details: txErr.message });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    console.error('[CLIENT DATA] delete error:', err.message);
    return res.status(500).json({ error: 'Permanent deletion failed' });
  }
});

// ---------- ONE-TIME FRESH START (all clients captured at execution) ----------
router.post('/fresh-start', async (req, res) => {
  try {
    if (!(await isMainAdminCaller(req))) {
      return res.status(403).json({ error: 'MAIN ADMIN only' });
    }
    const protectedAdmin = await resolveProtectedAdmin();
    if (!protectedAdmin) {
      return res.status(500).json({ error: 'Protected admin account could not be verified — operation blocked' });
    }

    const { confirmPhrase } = req.body || {};
    if (confirmPhrase !== FRESH_START_PHRASE) {
      return res.status(400).json({ error: `Confirmation phrase must be exactly: ${FRESH_START_PHRASE}` });
    }

    // ---- SNAPSHOT: capture the complete CLIENT id set ONCE, at the very beginning ----
    // Only these captured ids may ever be deleted. Clients signing up after this point
    // are separate documents and can never match this frozen id list.
    const captured = await User.find({ role: 'CLIENT' }, '_id identifier').lean().exec();
    const clientIds = captured.map(u => u._id);

    if (clientIds.length === 0) {
      return res.status(200).json({ message: 'No CLIENT accounts exist — nothing to delete', deleted: {}, before: {}, after: {} });
    }

    // Defensive exclusions before any destructive work
    if (clientIds.some(id => id.equals(protectedAdmin._id))) {
      return res.status(500).json({ error: 'Integrity check failed — protected admin found in client set. Operation blocked.' });
    }
    if (clientIds.some(id => String(id) === String(req.user.id))) {
      return res.status(500).json({ error: 'Integrity check failed — caller found in client set. Operation blocked.' });
    }

    const session = await mongoose.startSession();
    try {
      let before = {};
      let summary = {};

      await session.withTransaction(async () => {
        const wallets = await Wallet.find({ clientId: { $in: clientIds } }, '_id').session(session).lean().exec();
        before = await countClientOwned(clientIds, wallets.map(w => w._id), session);
        summary = await executeScopedDeletion(clientIds, session);
      });

      // ---- POST-DELETION VERIFICATION (read-only) ----
      const [
        remainingClients, remainingAdmin, adminAfter, employeeCount, planCount,
        categoryCount, creditPlanCount, noticeRefs,
      ] = await Promise.all([
        User.countDocuments({ _id: { $in: clientIds } }),
        User.countDocuments({ role: 'CLIENT' }),
        User.findOne({ identifier: PROTECTED_IDENTIFIER }, '_id role customRole').exec(),
        Employee.countDocuments({}),
        Task.countDocuments({ isListedInPlans: true }),
        Category.countDocuments({}),
        CreditPlan.countDocuments({}),
        countNoticeReferences(clientIds),
      ]);

      const verification = {
        capturedClientsRemaining: remainingClients,
        totalClientsRemaining: remainingAdmin,
        protectedAdminIntact: !!(adminAfter && String(adminAfter._id) === String(protectedAdmin._id) && adminAfter.role === 'ADMIN' && !adminAfter.customRole),
        employeesIntact: employeeCount,
        marketplacePlansIntact: planCount,
        categoriesIntact: categoryCount,
        creditPlansIntact: creditPlanCount,
        noticeReferencesRemaining: noticeRefs,
      };

      if (remainingClients !== 0 || !verification.protectedAdminIntact) {
        console.error('[CLIENT DATA] fresh-start verification anomaly:', verification);
      }

      return res.status(200).json({
        message: `Fresh start complete — ${summary.users} client account(s) permanently removed`,
        capturedClientCount: clientIds.length,
        capturedIdentifiers: captured.map(u => u.identifier),
        before,
        deleted: summary,
        verification,
      });
    } catch (txErr) {
      console.error('[CLIENT DATA] fresh-start transaction error:', txErr.message);
      return res.status(500).json({ error: 'Fresh start failed — transaction rolled back. No data was lost.', details: txErr.message });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    console.error('[CLIENT DATA] fresh-start error:', err.message);
    return res.status(500).json({ error: 'Fresh start failed' });
  }
});

module.exports = router;
