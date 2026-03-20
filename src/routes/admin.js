const express = require('express');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task, TASK_STATUS } = require('../models/Task');
const { Category } = require('../models/Category');
const TaskTemplate = require('../models/TaskTemplate');
const Role = require('../models/Role');
const { assignTaskToClient, updateTaskProgressAutomatically } = require('../services/taskService');
const progressService = require('../services/progressService');
const { getSystemOverview, getCreditFlowByPeriod, getTopSpenders, getTaskAnalyticsByTemplate, getTaskAnalyticsByStatus, getClientWalletSummary, getClientTaskSummary, getClientRecentActivity } = require('../services/reportingService');
const { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsRead, createNotification, getUnreadCount, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
const emailService = require('../services/emailService');
const User = require('../models/User');
const Notice = require('../models/Notice');
const LegalPage = require('../models/LegalPage');
const OfficeConfig = require('../models/OfficeConfig');
const Settings = require('../models/Settings');
const { ROLES } = require('../config');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Invoice, INVOICE_STATUS } = require('../models/Invoice');
const { Receipt, RECEIPT_STATUS } = require('../models/Receipt');
const BillingConfig = require('../models/BillingConfig');
const CreditPlan = require('../models/CreditPlan');
const Coupon = require('../models/Coupon');
const { SubscriptionRequest, SUBSCRIPTION_REQUEST_STATUS } = require('../models/SubscriptionRequest');
const UserSubscription = require('../models/Subscription');
const billingService = require('../services/billingService');
const CommissionLog = require('../models/CommissionLog');
const pdfService = require('../services/pdfService');
const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission, ALL_PERMISSIONS } = require('../middleware/permissions');
const { stripHtmlTags } = require('../utils/validators');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireAdmin);

router.get('/wallets', async (req, res) => {
  try {
    const wallets = await Wallet.find()
      .populate('clientId', 'identifier')
      .exec();

    return res.status(200).json({
      wallets: wallets.map((w) => ({
        clientId: w.clientId._id.toString(),
        clientIdentifier: w.clientId.identifier,
        balance: w.balance,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve wallets' });
  }
});

router.get('/wallets/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await User.findById(clientId).exec();

    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    // Check if subscription is expired
    const now = new Date();
    const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
    const activeSubCredits = subNotExpired ? (wallet.subscriptionCredits || 0) : 0;
    const walletCreditsValue = (wallet.walletCredits || 0) + (wallet.balance || 0);
    const totalCredits = activeSubCredits + walletCreditsValue;

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      clientId: client._id.toString(),
      clientIdentifier: client.identifier,
      balance: totalCredits,
      subscriptionCredits: activeSubCredits,
      walletCredits: walletCreditsValue,
      totalCredits: totalCredits,
      subscriptionExpiresAt: subNotExpired ? wallet.subscriptionExpiresAt : null,
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        description: t.description,
        referenceId: t.referenceId ? t.referenceId.toString() : null,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve wallet details' });
  }
});

router.post('/wallets/:clientId/adjust', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { amount, description } = req.body || {};

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.status(400).json({ error: 'amount must be a non-zero number' });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'description is required and must be a non-empty string' });
    }

    const client = await User.findById(clientId).exec();

    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    const newBalance = wallet.balance + amount;

    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient balance for this adjustment' });
    }

    wallet.balance = newBalance;
    await wallet.save();

    const transaction = await WalletTransaction.create({
      walletId: wallet._id,
      type: TRANSACTION_TYPES.ADMIN_ADJUSTMENT,
      amount,
      description: description.trim(),
      referenceId: null,
    });

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: clientId,
        type: NOTIFICATION_TYPES.WALLET_ADJUSTED,
        title: 'Wallet Balance Adjusted',
        message: `Your wallet balance was adjusted by ${amount > 0 ? '+' : ''}${amount} credits. Reason: ${description.trim()}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.WALLET,
          entityId: wallet._id,
        },
      });
    } catch (err) {
      console.error('Failed to notify client of wallet adjustment:', err.message);
    }
    // ------------------------------------

    return res.status(200).json({
      clientId: client._id.toString(),
      clientIdentifier: client.identifier,
      balance: wallet.balance,
      adjustment: {
        id: transaction._id.toString(),
        amount: transaction.amount,
        description: transaction.description,
        createdAt: transaction.createdAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to adjust wallet balance' });
  }
});

router.get('/recharge-requests', async (req, res) => {
  try {
    const { status } = req.query;

    let filter = {};
    if (status) {
      if (!Object.values(RECHARGE_STATUS).includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      filter.status = status;
    }

    const requests = await RechargeRequest.find(filter)
      .populate('clientId', 'identifier')
      .populate('reviewedBy', 'identifier')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        clientId: r.clientId._id.toString(),
        clientIdentifier: r.clientId.identifier,
        amount: r.amount,
        paymentReference: r.paymentReference,
        status: r.status,
        reviewedBy: r.reviewedBy ? r.reviewedBy._id.toString() : null,
        reviewedByIdentifier: r.reviewedBy ? r.reviewedBy.identifier : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve recharge requests' });
  }
});

router.post('/recharge-requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    console.log('=== APPROVE START ===' );
    console.log('Request ID:', id);
    console.log('Admin ID:', adminId);

    const request = await RechargeRequest.findById(id).exec();
    console.log('Step 1: Found request:', request ? request._id.toString() : 'NOT FOUND');

    if (!request) {
      return res.status(404).json({ error: 'Recharge request not found' });
    }

    if (request.status !== RECHARGE_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be approved' });
    }
    console.log('Step 2: Request status is PENDING');

    const wallet = await Wallet.findOne({ clientId: request.clientId }).exec();
    console.log('Step 3: Found wallet:', wallet ? wallet._id.toString() : 'NOT FOUND');

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    wallet.walletCredits = (wallet.walletCredits || 0) + request.amount;
    wallet.balance = (wallet.balance || 0) + request.amount; // Keep legacy balance in sync
    await wallet.save();
    console.log('Step 4: Wallet saved, walletCredits:', wallet.walletCredits, 'balance:', wallet.balance);

    const transaction = await WalletTransaction.create({
      walletId: wallet._id,
      type: TRANSACTION_TYPES.RECHARGE_APPROVED,
      amount: request.amount,
      description: request.paymentReference ? `Recharge approved (Ref: ${request.paymentReference})` : 'Recharge approved',
      referenceId: request._id,
    });
    console.log('Step 5: Transaction created:', transaction._id.toString());

    // Use findByIdAndUpdate to avoid full document validation
    const updatedRequest = await RechargeRequest.findByIdAndUpdate(
      id,
      { status: RECHARGE_STATUS.APPROVED, reviewedBy: adminId },
      { new: true }
    );
    console.log('Step 6: Request status updated to APPROVED');

    // --- Billing Hook - Create Invoice for Recharge ---
    let invoice = null;
    try {
      invoice = await billingService.createInvoiceForRecharge(request, transaction, adminId);
      if (invoice) {
        console.log('[BILLING] Invoice created:', invoice.invoiceNumber);
      }
    } catch (billingErr) {
      console.error('[BILLING] Failed to create invoice (non-blocking):', billingErr.message);
    }
    console.log('=== APPROVE COMPLETE ===');

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: updatedRequest.clientId,
        type: NOTIFICATION_TYPES.RECHARGE_APPROVED,
        title: 'Recharge Approved',
        message: `Your recharge request for ${updatedRequest.amount} credits has been approved.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.RECHARGE_REQUEST,
          entityId: updatedRequest._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
    } catch (err) {
      console.error('Failed to notify client of recharge approval:', err.message);
    }

    // --- Email Hook (HIGH PRIORITY FIX) ---
    console.log('[EMAIL TRIGGER] Recharge approved - attempting to send email to client');
    try {
      const clientUser = await User.findById(updatedRequest.clientId).exec();
      console.log('[EMAIL TRIGGER] Client found:', clientUser ? 'YES' : 'NO');
      console.log('[EMAIL TRIGGER] Client identifier:', clientUser?.identifier);
      
      const recipientEmail = clientUser?.identifier;
      
      if (!recipientEmail) {
        console.error('[EMAIL TRIGGER] ❌ Cannot send email: No identifier found for client');
      } else if (!emailService.isValidEmail(recipientEmail)) {
        console.error('[EMAIL TRIGGER] ❌ Cannot send email: identifier is not a valid email:', recipientEmail);
        console.error('[EMAIL TRIGGER]   Tip: User.identifier must be an email address for email delivery');
      } else {
        const emailResult = await emailService.sendWalletUpdate(recipientEmail, {
          amount: updatedRequest.amount,
          description: `Recharge approved${request.paymentReference ? ` (Ref: ${request.paymentReference})` : ''}`,
          newBalance: wallet.balance
        });
        
        if (emailResult.success) {
          console.log('[EMAIL TRIGGER] ✅ Wallet update email sent successfully to:', recipientEmail);
          console.log('[EMAIL TRIGGER]   Message ID:', emailResult.messageId);
        } else {
          console.error('[EMAIL TRIGGER] ❌ Email failed:', emailResult.reason || emailResult.error);
        }
      }
    } catch (emailErr) {
      console.error('[EMAIL TRIGGER] ❌ Exception during email send:', emailErr.message);
    }
    // ------------------------------------

    return res.status(200).json({
      id: updatedRequest._id.toString(),
      clientId: updatedRequest.clientId.toString(),
      amount: updatedRequest.amount,
      paymentReference: updatedRequest.paymentReference || '',
      status: updatedRequest.status,
      reviewedBy: adminId,
      walletBalance: wallet.balance,
      transactionId: transaction._id.toString(),
      invoiceId: invoice?._id?.toString() || null,
      invoiceNumber: invoice?.invoiceNumber || null,
    });
  } catch (err) {
    console.error('=== APPROVE ERROR ===' );
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    return res.status(500).json({ error: 'Failed to approve recharge request' });
  }
});

router.post('/recharge-requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    console.log('=== REJECT START ===' );
    console.log('Request ID:', id);

    const request = await RechargeRequest.findById(id).exec();
    console.log('Step 1: Found request:', request ? request._id.toString() : 'NOT FOUND');

    if (!request) {
      return res.status(404).json({ error: 'Recharge request not found' });
    }

    if (request.status !== RECHARGE_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be rejected' });
    }
    console.log('Step 2: Request status is PENDING');

    // Use findByIdAndUpdate to avoid full document validation
    const updatedRequest = await RechargeRequest.findByIdAndUpdate(
      id,
      { status: RECHARGE_STATUS.REJECTED, reviewedBy: adminId },
      { new: true }
    );
    console.log('Step 3: Request status updated to REJECTED');
    console.log('=== REJECT COMPLETE ===');

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: updatedRequest.clientId,
        type: NOTIFICATION_TYPES.RECHARGE_REJECTED,
        title: 'Recharge Rejected',
        message: `Your recharge request for ${updatedRequest.amount} credits has been rejected.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.RECHARGE_REQUEST,
          entityId: updatedRequest._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
    } catch (err) {
      console.error('Failed to notify client of recharge rejection:', err.message);
    }
    // ------------------------------------

    return res.status(200).json({
      id: updatedRequest._id.toString(),
      clientId: updatedRequest.clientId.toString(),
      amount: updatedRequest.amount,
      paymentReference: updatedRequest.paymentReference || '',
      status: updatedRequest.status,
      reviewedBy: adminId,
    });
  } catch (err) {
    console.error('=== REJECT ERROR ===' );
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    return res.status(500).json({ error: 'Failed to reject recharge request' });
  }
});

// ================== SUBSCRIPTION REQUESTS ==================

// GET /admin/subscription-requests - List all subscription requests
router.get('/subscription-requests', async (req, res) => {
  try {
    const { status } = req.query;

    let filter = {};
    if (status) {
      if (!Object.values(SUBSCRIPTION_REQUEST_STATUS).includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      filter.status = status;
    }

    const requests = await SubscriptionRequest.find(filter)
      .populate('clientId', 'identifier')
      .populate('reviewedBy', 'identifier')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        clientId: r.clientId?._id?.toString() || null,
        clientIdentifier: r.clientId?.identifier || 'Unknown',
        planId: r.planId?.toString() || null,
        planName: r.planName,
        planPrice: r.planPrice,
        finalPrice: r.finalPrice,
        totalCredits: r.totalCredits,
        couponCode: r.couponCode,
        couponDiscount: r.couponDiscount,
        status: r.status,
        reviewedBy: r.reviewedBy ? r.reviewedBy._id.toString() : null,
        reviewedByIdentifier: r.reviewedBy ? r.reviewedBy.identifier : null,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[SUB_REQ] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve subscription requests' });
  }
});

// POST /admin/subscription-requests/:id/approve - Approve subscription request
router.post('/subscription-requests/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    console.log('=== SUBSCRIPTION APPROVE START ===');
    console.log('Request ID:', id);

    const request = await SubscriptionRequest.findById(id).exec();
    if (!request) {
      return res.status(404).json({ error: 'Subscription request not found' });
    }
    if (request.status !== SUBSCRIPTION_REQUEST_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be approved' });
    }

    // 1. Get wallet
    const wallet = await Wallet.findOne({ clientId: request.clientId }).exec();
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    // 2. Check balance
    const availableBalance = (wallet.walletCredits || 0) + (wallet.balance || 0);
    if (availableBalance < request.finalPrice) {
      return res.status(400).json({ error: `Insufficient balance. Client has ${availableBalance} credits but needs ${request.finalPrice}` });
    }

    // 3. Deduct from walletCredits first, then balance
    let remaining = request.finalPrice;
    if (wallet.walletCredits >= remaining) {
      wallet.walletCredits -= remaining;
    } else {
      remaining -= (wallet.walletCredits || 0);
      wallet.walletCredits = 0;
      wallet.balance = Math.max(0, (wallet.balance || 0) - remaining);
    }

    // 4. Add subscription credits + set expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (request.planValidityDays || 30));
    wallet.subscriptionCredits = (wallet.subscriptionCredits || 0) + request.totalCredits;
    wallet.subscriptionExpiresAt = expiresAt;
    await wallet.save();

    // 5. Record wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: 'SUBSCRIPTION_PURCHASE',
      amount: -request.finalPrice,
      description: `Subscription Plan: ${request.planName} (+${request.totalCredits} subscription credits)`,
      referenceId: request._id,
    });

    // 6. Expire any existing active UserSubscription (legacy support)
    await UserSubscription.updateMany(
      { userId: request.clientId, isActive: true },
      { $set: { isActive: false } }
    );

    // 7. Create new UserSubscription for legacy compatibility
    await UserSubscription.create({
      userId: request.clientId,
      planId: request.planId,
      planName: request.planName,
      creditsRemaining: request.totalCredits,
      expiresAt,
      isActive: true,
    });

    // 8. Update request status
    const updatedRequest = await SubscriptionRequest.findByIdAndUpdate(
      id,
      { status: SUBSCRIPTION_REQUEST_STATUS.APPROVED, reviewedBy: adminId, reviewedAt: new Date() },
      { new: true }
    );

    console.log(`[SUB_REQ] Approved: ${request.planName}, Credits: ${request.totalCredits}, Expires: ${expiresAt}`);
    console.log('=== SUBSCRIPTION APPROVE COMPLETE ===');

    // 9. Notify client
    try {
      await createNotification({
        recipientId: request.clientId,
        type: 'SUBSCRIPTION_REQUEST_APPROVED',
        title: 'Subscription Approved',
        message: `Your subscription request for ${request.planName} has been approved. ${request.totalCredits} credits added!`,
        relatedEntity: { entityType: 'SUBSCRIPTION_REQUEST', entityId: request._id },
        notifyByEmail: true,
      });
    } catch (notifErr) {
      console.error('[SUB_REQ] Notification error:', notifErr.message);
    }

    return res.status(200).json({
      id: updatedRequest._id.toString(),
      clientId: updatedRequest.clientId.toString(),
      planName: updatedRequest.planName,
      totalCredits: updatedRequest.totalCredits,
      status: updatedRequest.status,
      walletBalance: wallet.walletCredits + (wallet.balance || 0),
      subscriptionCredits: wallet.subscriptionCredits,
      expiresAt: wallet.subscriptionExpiresAt,
    });
  } catch (err) {
    console.error('[SUB_REQ] Approve error:', err.message);
    return res.status(500).json({ error: 'Failed to approve subscription request' });
  }
});

// POST /admin/subscription-requests/:id/reject - Reject subscription request
router.post('/subscription-requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const adminId = req.user.id;
    console.log('=== SUBSCRIPTION REJECT START ===');

    const request = await SubscriptionRequest.findById(id).exec();
    if (!request) {
      return res.status(404).json({ error: 'Subscription request not found' });
    }
    if (request.status !== SUBSCRIPTION_REQUEST_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be rejected' });
    }

    const updatedRequest = await SubscriptionRequest.findByIdAndUpdate(
      id,
      { status: SUBSCRIPTION_REQUEST_STATUS.REJECTED, reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: reason || null },
      { new: true }
    );

    console.log('=== SUBSCRIPTION REJECT COMPLETE ===');

    // Notify client
    try {
      await createNotification({
        recipientId: request.clientId,
        type: 'SUBSCRIPTION_REQUEST_REJECTED',
        title: 'Subscription Rejected',
        message: `Your subscription request for ${request.planName} has been rejected.${reason ? ` Reason: ${reason}` : ''}`,
        relatedEntity: { entityType: 'SUBSCRIPTION_REQUEST', entityId: request._id },
        notifyByEmail: true,
      });
    } catch (notifErr) {
      console.error('[SUB_REQ] Notification error:', notifErr.message);
    }

    return res.status(200).json({
      id: updatedRequest._id.toString(),
      clientId: updatedRequest.clientId.toString(),
      planName: updatedRequest.planName,
      status: updatedRequest.status,
      rejectionReason: updatedRequest.rejectionReason,
    });
  } catch (err) {
    console.error('[SUB_REQ] Reject error:', err.message);
    return res.status(500).json({ error: 'Failed to reject subscription request' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const { clientId, status } = req.query;

    // HARD FILTER: Tasks ONLY - NEVER include Plans
    let filter = {
      isListedInPlans: { $ne: true }  // Exclude Plans from Task list
    };
    
    if (clientId) {
      filter.clientId = clientId;
    }
    
    if (status) {
      filter.status = status;
    }

    // TASK VISIBILITY: sub-admins without canViewAllTasks only see tasks they created OR assigned to them
    const adminUser = await User.findById(req.user.id).populate('customRole');
    const isMainAdmin = adminUser && adminUser.role === 'ADMIN' && !adminUser.customRole;
    const canViewAll = isMainAdmin || adminUser?.customRole?.permissions?.canViewAllTasks === true;
    if (!canViewAll) {
      // Filter: tasks created by user OR tasks assigned to user
      filter.$or = [
        { assignedBy: adminUser._id },
        { assignedTo: adminUser._id }
      ];
    }

    const tasks = await Task.find(filter)
      .populate('clientId', 'identifier')
      .populate('assignedBy', 'identifier')
      .populate('assignedTo', 'identifier')
      .sort({ createdAt: -1 })
      .exec();

    console.log('Tasks returned:', tasks.length);

    return res.status(200).json({
      tasks: tasks.map((t) => ({
        id: t._id.toString(),
        clientId: t.clientId ? t.clientId._id.toString() : null,
        clientIdentifier: t.clientId ? t.clientId.identifier : 'Marketplace/N/A',
        title: t.title,
        description: t.description,
        creditCost: t.creditCost,
        creditsUsed: t.creditsUsed || 0,
        priority: t.priority,
        startDate: t.startDate,
        endDate: t.endDate,
        publicNotes: t.publicNotes,
        internalNotes: t.internalNotes,
        progressMode: t.progressMode,
        progress: t.progress,
        status: t.status,
        deadline: t.deadline || t.endDate,
        assignedBy: t.assignedBy ? t.assignedBy._id.toString() : null,
        assignedByIdentifier: t.assignedBy ? t.assignedBy.identifier : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        // PLAN SYSTEM EXTENSIONS
        icon: t.icon,
        planId: t.planId ? t.planId.toString() : null,
        quantity: t.quantity,
        showQuantityToClient: t.showQuantityToClient,
        showCreditsToClient: t.showCreditsToClient,
        isListedInPlans: t.isListedInPlans,
        targetClients: t.targetClients,
        featureImage: t.featureImage,
        offerPrice: t.offerPrice,
        originalPrice: t.originalPrice,
        countdownEndDate: t.countdownEndDate,
        milestones: t.milestones,
        autoCompletionCap: t.autoCompletionCap,
        progressTarget: t.progressTarget,
        // TASK ASSIGNMENT SYSTEM
        assignedTo: t.assignedTo ? t.assignedTo._id.toString() : null,
        assignedToIdentifier: t.assignedTo ? t.assignedTo.identifier : null,
        commissionType: t.commissionType,
        commissionValue: t.commissionValue,
        commissionEarned: t.commissionEarned,
      })),
    });
  } catch (err) {
    console.error('[FORENSIC] Tasks Retrieve Error:', err);
    return res.status(500).json({ error: `LIST FETCH ERROR: ${err.message}` });
  }
});

// GET /admin/tasks/:taskId - Fetch single task detail
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findById(taskId)
      .populate('clientId', 'identifier')
      .populate('assignedBy', 'identifier')
      .populate('assignedTo', 'identifier')
      .exec();

    if (!task) {
      return res.status(404).json({ error: 'TASK NOT FOUND: The requested ID does not exist in the database.' });
    }

    return res.status(200).json({
      task: {
        id: task._id.toString(),
        clientId: task.clientId ? task.clientId._id.toString() : null,
        clientIdentifier: task.clientId ? task.clientId.identifier : 'Marketplace',
        title: task.title,
        description: task.description,
        creditCost: task.creditCost,
        creditsUsed: task.creditsUsed || 0,
        priority: task.priority,
        startDate: task.startDate,
        endDate: task.endDate,
        publicNotes: task.publicNotes,
        internalNotes: task.internalNotes,
        progressMode: task.progressMode,
        progress: task.progress,
        status: task.status,
        deadline: task.deadline || task.endDate,
        assignedBy: task.assignedBy ? task.assignedBy._id.toString() : null,
        assignedByIdentifier: task.assignedBy ? task.assignedBy.identifier : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        // PLAN SYSTEM EXTENSIONS
        icon: task.icon,
        milestones: task.milestones || [],
        autoCompletionCap: task.autoCompletionCap,
        quantity: task.quantity,
        showQuantityToClient: task.showQuantityToClient,
        showCreditsToClient: task.showCreditsToClient,
        isListedInPlans: task.isListedInPlans,
        isActivePlan: task.isActivePlan,
        targetClients: task.targetClients,
        featureImage: task.featureImage,
        planMedia: task.planMedia || [],
        offerPrice: task.offerPrice,
        originalPrice: task.originalPrice,
        countdownEndDate: task.countdownEndDate,
        progressTarget: task.progressTarget,
        progressAchieved: task.progressAchieved,
        isFeatured: task.isFeatured,
        isPopular: task.isPopular,
        isNew: task.isNew,
        visibility: task.visibility,
        allowedClients: task.allowedClients,
        // CLIENT CONTENT (Phase 2)
        clientContentText: task.clientContentText || '',
        clientContentLinks: task.clientContentLinks || [],
        clientDriveLink: task.clientDriveLink || '',
        clientContentSubmittedAt: task.clientContentSubmittedAt || null,
        clientContentSubmitted: task.clientContentSubmitted || false,
        // FINAL DELIVERY (Phase 3)
        finalDeliveryLink: task.finalDeliveryLink || '',
        finalDeliveryText: task.finalDeliveryText || '',
        finalDeliveredAt: task.finalDeliveredAt || null,
        // TASK DISCUSSION (Phase 6)
        messages: (task.messages || []).map(m => ({
          sender: m.sender,
          text: m.text,
          createdAt: m.createdAt,
        })),
        // TASK ASSIGNMENT SYSTEM
        assignedTo: task.assignedTo ? task.assignedTo._id.toString() : null,
        assignedToIdentifier: task.assignedTo ? task.assignedTo.identifier : null,
        commissionType: task.commissionType,
        commissionValue: task.commissionValue,
        commissionEarned: task.commissionEarned,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: `FETCH ERROR: ${err.message}` });
  }
});

// PATCH /admin/tasks/:taskId - Update general task fields
router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body || {};
    
    // Safety: Remove sensitive or immutable fields
    delete updates._id;
    delete updates.clientId; // Client is fixed once assigned
    delete updates.assignedBy;
    
    const task = await Task.findById(taskId).exec();
    
    if (!task) {
      return res.status(404).json({ error: 'TASK NOT FOUND: Cannot update a non-existent task.' });
    }

    // Track old values for completion notification
    const oldProgress = task.progress || 0;
    const oldStatus = task.status;
    const oldDeliveryLink = task.finalDeliveryLink || '';

    // Track if progress-related fields are being updated
    const progressFieldsUpdated = (
      updates.progress !== undefined ||
      updates.progressAchieved !== undefined ||
      updates.progressTarget !== undefined ||
      updates.progressMode !== undefined ||
      updates.startDate !== undefined ||
      updates.endDate !== undefined
    );

    // Apply all updates
    Object.keys(updates).forEach(key => {
      task[key] = updates[key];
    });

    // FIX #3: If progress-related fields changed, evaluate milestones and auto-sync status
    if (progressFieldsUpdated) {
      const now = new Date();
      let currentProgress = task.progress;

      // Only recalculate progress for MANUAL mode when progressAchieved/progressTarget changed
      // NOT when admin directly sets progress field
      const shouldRecalculateProgress = (
        task.progressMode === 'MANUAL' && 
        task.progressTarget > 0 &&
        (updates.progressAchieved !== undefined || updates.progressTarget !== undefined) &&
        updates.progress === undefined  // Admin didn't directly set progress
      );

      if (shouldRecalculateProgress) {
        currentProgress = Math.round(((task.progressAchieved || 0) / task.progressTarget) * 1000) / 10;
        task.progress = currentProgress;
      }

      // Evaluate milestones
      if (task.milestones && task.milestones.length > 0) {
        task.milestones = task.milestones.map(m => {
          const shouldBeReached = currentProgress >= m.percentage;
          if (shouldBeReached && !m.reached) {
            return { ...m.toObject ? m.toObject() : m, reached: true, reachedAt: now };
          } else if (!shouldBeReached && m.reached) {
            return { ...m.toObject ? m.toObject() : m, reached: false, reachedAt: null };
          }
          return m.toObject ? m.toObject() : m;
        });
      }

      // Auto-sync status based on progress (don't override CANCELLED or PENDING_APPROVAL)
      if (task.status !== 'CANCELLED' && task.status !== 'PENDING_APPROVAL' && task.status !== 'LISTED') {
        if (currentProgress >= 100 && task.status !== 'COMPLETED') {
          task.status = 'COMPLETED';
          // COMMISSION CALCULATION: When auto-completed via progress
          if (task.commissionValue > 0 && !task.commissionEarned && task.assignedTo) {
            const taskValue = task.creditCost || 0;
            if (task.commissionType === 'percentage') {
              task.commissionEarned = Math.round((taskValue * task.commissionValue) / 100);
            } else {
              task.commissionEarned = task.commissionValue;
            }
            console.log(`[COMMISSION] Auto-completion earned: ₹${task.commissionEarned}`);
                      
            // Create CommissionLog entry
            try {
              await CommissionLog.create({
                userId: task.assignedTo,
                taskId: task._id,
                taskTitle: task.title,
                amount: task.commissionEarned,
                commissionType: task.commissionType,
                commissionValue: task.commissionValue,
              });
              console.log(`[COMMISSION] Log created for auto-completion`);
            } catch (logErr) {
              console.error(`[COMMISSION] Failed to create log:`, logErr.message);
            }
          }
        } else if (currentProgress > 0 && task.status === 'PENDING') {
          task.status = 'ACTIVE';
        }
      }
    }

    await task.save();

    // --- Final Delivery Notification ---
    if (updates.finalDeliveryLink && task.clientId) {
      const newDeliveryLink = updates.finalDeliveryLink?.trim() || '';
      const wasEmpty = !oldDeliveryLink || oldDeliveryLink.trim() === '';
      const nowHasLink = newDeliveryLink !== '';
      
      if (wasEmpty && nowHasLink) {
        console.log(`[DELIVERY] Task ${taskId} delivery link added - notifying client`);
        try {
          const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://goviralads.com';
          const taskUrl = `${clientUrl}/tasks/${task._id}?scrollToChat=true`;
          
          await createNotification({
            recipientId: task.clientId,
            type: NOTIFICATION_TYPES.FINAL_DELIVERY_READY,
            title: 'Delivery Ready!',
            message: `Your task "${task.title}" has a delivery ready for download.`,
            relatedEntity: {
              entityType: ENTITY_TYPES.TASK,
              entityId: task._id,
            },
            taskUrl: taskUrl,
            notifyByEmail: true,
          });
        } catch (notifErr) {
          console.error('[DELIVERY] Failed to notify client:', notifErr.message);
        }
      }
    }

    // --- Task Completion Notification ---
    const newProgress = task.progress || 0;
    const newStatus = task.status;
    const crossedCompletion = (oldProgress < 100 && newProgress >= 100) || (oldStatus !== 'COMPLETED' && newStatus === 'COMPLETED');
    
    if (crossedCompletion && task.clientId) {
      console.log(`[TASK_COMPLETE] Task ${taskId} completed - notifying client and admin`);
      
      // Notify Client
      try {
        await createNotification({
          recipientId: task.clientId,
          type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
          title: 'Task Completed',
          message: `Your task "${task.title}" has been completed!`,
          relatedEntity: {
            entityType: ENTITY_TYPES.TASK,
            entityId: task._id,
          },
          notifyByEmail: true,
        });
      } catch (notifErr) {
        console.error('[TASK_COMPLETE] Failed to notify client:', notifErr.message);
      }
      
      // Notify Admin
      try {
        const { mainAdminIdentifier } = require('../config');
        const adminUser = await User.findOne({ identifier: mainAdminIdentifier }).exec();
        if (adminUser) {
          await createNotification({
            recipientId: adminUser._id,
            type: 'TASK_COMPLETED',
            title: 'Task Completed',
            message: `Task "${task.title}" has been completed.`,
            relatedEntity: {
              entityType: ENTITY_TYPES.TASK,
              entityId: task._id,
            },
          });
        }
      } catch (notifErr) {
        console.error('[TASK_COMPLETE] Failed to notify admin:', notifErr.message);
      }
    }

    // --- Milestone Reached Notification (Client only) ---
    if (task.clientId && task.milestones && task.milestones.length > 0) {
      const newProgress = task.progress || 0;
      for (const milestone of task.milestones) {
        const crossed = oldProgress < milestone.percentage && newProgress >= milestone.percentage;
        if (crossed && milestone.name) {
          console.log(`[MILESTONE] Task ${taskId} reached milestone "${milestone.name}" at ${milestone.percentage}%`);
          try {
            await createNotification({
              recipientId: task.clientId,
              type: 'MILESTONE_REACHED',
              title: 'Milestone Reached',
              message: `Your task "${task.title}" reached milestone: ${milestone.name} (${milestone.percentage}%)`,
              relatedEntity: {
                entityType: ENTITY_TYPES.TASK,
                entityId: task._id,
              },
              notifyByEmail: false,
            });
          } catch (notifErr) {
            console.error('[MILESTONE] Failed to notify client:', notifErr.message);
          }
        }
      }
    }

    return res.status(200).json({ success: true, task });
  } catch (err) {
    return res.status(500).json({ error: `UPDATE ERROR: ${err.message}` });
  }
});

// ======================================================================
// TASK DISCUSSION SYSTEM (Phase 6)
// Admin can send messages within task context
// ======================================================================
router.post('/tasks/:taskId/message', async (req, res) => {
  try {
    const { taskId } = req.params;
    const adminId = req.user.id;
    const { text } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Add message
    const newMessage = {
      sender: 'ADMIN',
      senderId: adminId,
      text: text.trim(),
      createdAt: new Date(),
    };

    task.messages = task.messages || [];
    task.messages.push(newMessage);
    await task.save();
    console.log('[DISCUSSION] Message saved to task:', taskId);

    // Notify client with email
    if (task.clientId) {
      console.log('[DISCUSSION] Notifying client:', task.clientId);
      try {
        const clientUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://goviralads.com';
        const taskUrl = `${clientUrl}/tasks/${task._id}?scrollToChat=true`;
        
        // Get last 3 messages for email preview
        const recentMessages = (task.messages || []).slice(-3).map(m => ({
          sender: m.sender,
          text: m.text.substring(0, 100) + (m.text.length > 100 ? '...' : ''),
          createdAt: m.createdAt
        }));
        
        await createNotification({
          recipientId: task.clientId,
          type: NOTIFICATION_TYPES.TASK_MESSAGE,
          title: `New message on: ${task.title}`,
          message: text.trim().substring(0, 200) + (text.length > 200 ? '...' : ''),
          relatedEntity: { entityType: ENTITY_TYPES.TASK, entityId: task._id },
          taskUrl: taskUrl,
          recentMessages: recentMessages,
          notifyByEmail: true,
        });
        console.log('[DISCUSSION] Notification created + email triggered for client:', task.clientId);
      } catch (notifErr) {
        console.error('[DISCUSSION] Notification/email error:', notifErr.message);
      }
    } else {
      console.warn('[DISCUSSION] No clientId on task, skipping notification');
    }

    console.log(`[DISCUSSION] Admin ${adminId} sent message on task ${taskId}`);

    return res.status(200).json({
      success: true,
      message: newMessage,
    });
  } catch (err) {
    console.error('[DISCUSSION ERROR]', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// PATCH /admin/tasks/:taskId/status - Update task status explicitly
router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, progress } = req.body || {};

    if (!status) {
      return res.status(400).json({ error: 'STATUS REQUIRED: A valid status string must be provided.' });
    }

    const task = await Task.findById(taskId).exec();
    if (!task) {
      return res.status(404).json({ error: 'TASK NOT FOUND' });
    }

    // Track old values for completion notification
    const oldProgress = task.progress || 0;
    const oldStatus = task.status;

    task.status = status;
    if (progress !== undefined) {
      task.progress = progress;
    }

    // FIX: Evaluate milestones when status/progress changes
    const currentProgress = task.progress;
    if (task.milestones && task.milestones.length > 0) {
      const now = new Date();
      task.milestones = task.milestones.map(m => {
        const shouldBeReached = currentProgress >= m.percentage;
        if (shouldBeReached && !m.reached) {
          return { ...m.toObject ? m.toObject() : m, reached: true, reachedAt: now };
        } else if (!shouldBeReached && m.reached) {
          return { ...m.toObject ? m.toObject() : m, reached: false, reachedAt: null };
        }
        return m.toObject ? m.toObject() : m;
      });
    }

    await task.save();

    // --- Task Completion Notification (Status Route) ---
    const newProgress = task.progress || 0;
    const newStatus = task.status;
    const crossedCompletion = (oldProgress < 100 && newProgress >= 100) || (oldStatus !== 'COMPLETED' && newStatus === 'COMPLETED');
    
    // COMMISSION CALCULATION: When task is completed, calculate commission
    if (crossedCompletion && task.commissionValue > 0 && !task.commissionEarned && task.assignedTo) {
      console.log(`[COMMISSION] Calculating commission for task ${taskId}`);
      const taskValue = task.creditCost || 0;
      if (task.commissionType === 'percentage') {
        task.commissionEarned = Math.round((taskValue * task.commissionValue) / 100);
      } else {
        task.commissionEarned = task.commissionValue;
      }
      console.log(`[COMMISSION] Earned: ₹${task.commissionEarned} (${task.commissionType}: ${task.commissionValue})`);
      await task.save();
          
      // Create CommissionLog entry
      try {
        await CommissionLog.create({
          userId: task.assignedTo,
          taskId: task._id,
          taskTitle: task.title,
          amount: task.commissionEarned,
          commissionType: task.commissionType,
          commissionValue: task.commissionValue,
        });
        console.log(`[COMMISSION] Log created for task completion`);
      } catch (logErr) {
        console.error(`[COMMISSION] Failed to create log:`, logErr.message);
      }
    }
    
    if (crossedCompletion && task.clientId) {
      console.log(`[TASK_COMPLETE] Task ${taskId} completed via status change - notifying client and admin`);
      
      // Notify Client
      try {
        await createNotification({
          recipientId: task.clientId,
          type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
          title: 'Task Completed',
          message: `Your task "${task.title}" has been completed!`,
          relatedEntity: {
            entityType: ENTITY_TYPES.TASK,
            entityId: task._id,
          },
          notifyByEmail: true,
        });
      } catch (notifErr) {
        console.error('[TASK_COMPLETE] Failed to notify client:', notifErr.message);
      }
      
      // Notify Admin
      try {
        const { mainAdminIdentifier } = require('../config');
        const adminUser = await User.findOne({ identifier: mainAdminIdentifier }).exec();
        if (adminUser) {
          await createNotification({
            recipientId: adminUser._id,
            type: 'TASK_COMPLETED',
            title: 'Task Completed',
            message: `Task "${task.title}" has been completed.`,
            relatedEntity: {
              entityType: ENTITY_TYPES.TASK,
              entityId: task._id,
            },
          });
        }
      } catch (notifErr) {
        console.error('[TASK_COMPLETE] Failed to notify admin:', notifErr.message);
      }
    }

    // --- Milestone Reached Notification (Status Route - Client only) ---
    if (task.clientId && task.milestones && task.milestones.length > 0) {
      const newProgress = task.progress || 0;
      for (const milestone of task.milestones) {
        const crossed = oldProgress < milestone.percentage && newProgress >= milestone.percentage;
        if (crossed && milestone.name) {
          console.log(`[MILESTONE] Task ${taskId} reached milestone "${milestone.name}" at ${milestone.percentage}%`);
          try {
            await createNotification({
              recipientId: task.clientId,
              type: 'MILESTONE_REACHED',
              title: 'Milestone Reached',
              message: `Your task "${task.title}" reached milestone: ${milestone.name} (${milestone.percentage}%)`,
              relatedEntity: {
                entityType: ENTITY_TYPES.TASK,
                entityId: task._id,
              },
              notifyByEmail: false,
            });
          } catch (notifErr) {
            console.error('[MILESTONE] Failed to notify client:', notifErr.message);
          }
        }
      }
    }

    return res.status(200).json({ success: true, status: task.status, progress: task.progress, milestones: task.milestones });
  } catch (err) {
    return res.status(500).json({ error: `STATUS UPDATE ERROR: ${err.message}` });
  }
});

router.post('/tasks/assign', async (req, res) => {
  try {
    const adminId = req.user.id;
    const payload = req.body || {};
    
    console.log('[FORENSIC] ========== TASK/PLAN CREATION START ==========');
    console.log('[FORENSIC] MODE:', payload.isListedInPlans ? 'PLAN' : 'TASK');
    console.log('[FORENSIC] PAYLOAD:', JSON.stringify(payload, null, 2));

    const { 
      clientId, 
      title, 
      description, 
      creditCost, 
      priority, 
      startDate, 
      endDate, 
      publicNotes, 
      internalNotes, 
      progressMode, 
      quantity, 
      showQuantityToClient, 
      showCreditsToClient, 
      isListedInPlans, 
      isActivePlan,
      targetClients, 
      featureImage, 
      offerPrice, 
      originalPrice, 
      countdownEndDate,
      planMedia,
      progressTarget,
      milestones,
      autoCompletionCap,
      categoryId,
      // TASK ASSIGNMENT SYSTEM
      assignedTo,
      commissionType,
      commissionValue
    } = payload;

    // --- HARD BRANCH: PLAN (PRODUCT LISTING) ---
    if (isListedInPlans === true) {
      console.log('--- VALIDATING PLAN ---');
      
      // 1. Plan Required Fields
      if (!title || title.trim().length === 0) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Title is required for marketplace listings.' });
      if (creditCost === undefined || creditCost === null) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Base Credit Cost is required for marketplace listings.' });
      if (!progressTarget || progressTarget <= 0) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Progress Target Goal is required for marketplace listings.' });

      // 2. Plan Forbidden Fields
      if (clientId) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Product listings cannot have a clientId. Use TASK mode for client assignments.' });
      if (startDate) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Product listings cannot have a startDate. They are evergreen products.' });
      if (endDate) return res.status(400).json({ error: 'PLAN VALIDATION FAILED: Product listings cannot have an endDate. They are evergreen products.' });

      // 3. Create Plan
      const plan = await Task.create({
        clientId: null,
        title: title.trim(),
        description: description || '',
        creditCost: Number(creditCost) || 0,
        creditsUsed: 0, 
        priority: priority || 'Medium',
        startDate: null, 
        endDate: null,   
        publicNotes: publicNotes || '',
        internalNotes: internalNotes || '',
        progressMode: progressMode || 'AUTO',
        progress: 0,
        progressAchieved: 0,
        status: 'LISTED',
        assignedBy: adminId,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        showQuantityToClient: showQuantityToClient !== undefined ? showQuantityToClient : true,
        showCreditsToClient: showCreditsToClient !== undefined ? showCreditsToClient : true,
        isListedInPlans: true,
        isActivePlan: isActivePlan !== undefined ? isActivePlan : true,
        targetClients: (Array.isArray(targetClients) && targetClients.length > 0) ? targetClients : null,
        featureImage: featureImage || undefined,
        planMedia: planMedia || undefined,
        offerPrice: offerPrice !== undefined && offerPrice !== '' ? Number(offerPrice) : undefined,
        originalPrice: originalPrice !== undefined && originalPrice !== '' ? Number(originalPrice) : undefined,
        countdownEndDate: countdownEndDate ? new Date(countdownEndDate) : undefined,
        progressTarget: Number(progressTarget) || 100,
        milestones: milestones || [],
        autoCompletionCap: Number(autoCompletionCap) || 100,
        categoryId: categoryId || null
      });

      console.log('[FORENSIC] ========== PLAN CREATED ==========');
      console.log('[FORENSIC] PLAN ID:', plan._id.toString());
      console.log('[FORENSIC] PLAN TITLE:', plan.title);
      return res.status(201).json({
        success: true,
        mode: "PLAN",
        plan: plan.toObject()
      });
    }

    // --- HARD BRANCH: TASK (EXECUTION INSTANCE) ---
    console.log('--- VALIDATING TASK ---');
    
    // 1. Task Required Fields
    if (!clientId) return res.status(400).json({ error: 'TASK VALIDATION FAILED: Client ID is required for execution instances.' });
    if (!title || title.trim().length === 0) return res.status(400).json({ error: 'TASK VALIDATION FAILED: Title is required.' });
    if (!startDate) return res.status(400).json({ error: 'TASK VALIDATION FAILED: Start Date is required for execution.' });
    if (creditCost === undefined || creditCost === null) return res.status(400).json({ error: 'TASK VALIDATION FAILED: Credit Cost is required.' });

    // 2. Task Forbidden Fields
    if (isActivePlan === true) return res.status(400).json({ error: 'TASK VALIDATION FAILED: Execution instances cannot be marked as Active Plans.' });
    // planMedia is allowed on tasks if cloned from a plan

    // 2. Client & Wallet Validation
    const client = await User.findById(clientId).exec();
    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'TASK VALIDATION FAILED: The specified Client does not exist or is not a Client user.' });
    }

    const taskDetails = {
      title: title.trim(),
      description: description || '',
      creditCost: Number(creditCost) || 0,
      priority: priority || 'Medium',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      publicNotes: publicNotes || '',
      internalNotes: internalNotes || '',
      progressMode: progressMode || 'AUTO',
      progressTarget: Number(progressTarget) || 100,
      milestones: milestones || [],
      autoCompletionCap: Number(autoCompletionCap) || 100,
      quantity: quantity !== undefined ? Number(quantity) : undefined,
      showQuantityToClient: showQuantityToClient !== undefined ? showQuantityToClient : true,
      showCreditsToClient: showCreditsToClient !== undefined ? showCreditsToClient : true,
      isListedInPlans: false,
      featureImage: featureImage || undefined,
      offerPrice: offerPrice !== undefined && offerPrice !== '' ? Number(offerPrice) : undefined,
      originalPrice: originalPrice !== undefined && originalPrice !== '' ? Number(originalPrice) : undefined,
      countdownEndDate: countdownEndDate ? new Date(countdownEndDate) : undefined,
      // TASK ASSIGNMENT SYSTEM
      assignedTo: assignedTo || null,
      commissionType: commissionType || 'percentage',
      commissionValue: Number(commissionValue) || 0,
    };

    // 3. Deduct & Assign (Service Level)
    const result = await assignTaskToClient(adminId, clientId, taskDetails);
    
    if (result.task.progressMode === 'AUTO') {
      await updateTaskProgressAutomatically(result.task._id);
    }

    // 4. Notification
    console.log('[NOTIFICATION DEBUG] Creating notification for clientId:', clientId);
    try {
      const notifResult = await createNotification({
        recipientId: clientId,
        type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
        title: 'New Task Assigned',
        message: `A new task has been assigned to you: ${title}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.TASK,
          entityId: result.task._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
      console.log('[NOTIFICATION DEBUG] Notification created successfully:', notifResult._id, 'for recipient:', clientId);
    } catch (err) {
      console.error('[FORENSIC] Notification Error (Non-Fatal):', err.message);
    }

    // 5. Email Notification (HIGH PRIORITY FIX)
    console.log('[EMAIL TRIGGER] Task created - attempting to send email to client');
    try {
      const clientUser = await User.findById(clientId).exec();
      console.log('[EMAIL TRIGGER] Client found:', clientUser ? 'YES' : 'NO');
      console.log('[EMAIL TRIGGER] Client identifier:', clientUser?.identifier);
      
      const recipientEmail = clientUser?.identifier;
      
      if (!recipientEmail) {
        console.error('[EMAIL TRIGGER] ❌ Cannot send email: No identifier found for client');
      } else if (!emailService.isValidEmail(recipientEmail)) {
        console.error('[EMAIL TRIGGER] ❌ Cannot send email: identifier is not a valid email:', recipientEmail);
        console.error('[EMAIL TRIGGER]   Tip: User.identifier must be an email address for email delivery');
      } else {
        const emailResult = await emailService.sendNewTask(recipientEmail, {
          taskTitle: title,
          description: description || '',
          status: 'Assigned',
          deadline: endDate ? new Date(endDate).toLocaleDateString() : null,
          taskUrl: `${process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://goviralads.com'}/tasks/${result.task._id}`
        });
        
        if (emailResult.success) {
          console.log('[EMAIL TRIGGER] ✅ New task email sent successfully to:', recipientEmail);
          console.log('[EMAIL TRIGGER]   Message ID:', emailResult.messageId);
        } else {
          console.error('[EMAIL TRIGGER] ❌ Email failed:', emailResult.reason || emailResult.error);
        }
      }
    } catch (emailErr) {
      console.error('[EMAIL TRIGGER] ❌ Exception during email send:', emailErr.message);
    }

    console.log('[FORENSIC] ========== TASK CREATED ==========');
    console.log('[FORENSIC] TASK ID:', result.task._id.toString());
    console.log('[FORENSIC] TASK TITLE:', result.task.title);
    return res.status(201).json({
      success: true,
      mode: "TASK",
      task: {
        id: result.task._id.toString(),
        clientId: result.task.clientId.toString(),
        title: result.task.title,
        status: result.task.status
      },
      walletBalance: result.walletBalance,
      transactionId: result.transactionId,
    });

  } catch (err) {
    console.error('[FORENSIC] ========== CREATION FAILED ==========');
    console.error('[FORENSIC] ERROR MESSAGE:', err.message);
    console.error('[FORENSIC] ERROR STACK:', err.stack);
    return res.status(500).json({ 
      error: `SERVER CRASH: ${err.message}`,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Route to reopen a completed task
router.patch('/tasks/:taskId/reopen', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only allow reopening if task is completed or cancelled
    if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') {
      return res.status(400).json({ error: 'Only completed or cancelled tasks can be reopened' });
    }

    // Reopen the task by setting status back to IN_PROGRESS or PENDING
    task.status = 'IN_PROGRESS';
    
    // If progress was 100%, reset it to 99% to indicate it's not completed anymore
    if (task.progress >= 100) {
      task.progress = 99;
    }
    
    // If progress mode was manual, keep it manual, otherwise reset to auto
    if (task.progressMode === 'MANUAL') {
      // Keep manual mode but allow admin to change progress
    }
    
    await task.save();

    return res.status(200).json({
      id: task._id.toString(),
      clientId: task.clientId.toString(),
      title: task.title,
      status: task.status,
      progress: task.progress,
      progressMode: task.progressMode,
      updatedAt: task.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reopen task' });
  }
});

// PATCH /admin/tasks/:taskId/progress - Update task progress (SMART PROGRESS SYSTEM)
router.patch('/tasks/:taskId/progress', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { 
      progressMode, 
      progressTarget, 
      progressAchieved, 
      showProgressDetails, 
      milestones 
    } = req.body || {};

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update progress mode
    if (progressMode && ['AUTO', 'MANUAL', 'SIMPLE'].includes(progressMode)) {
      task.progressMode = progressMode;
    }

    // Update manual progress values
    if (progressMode === 'MANUAL') {
      if (progressTarget !== undefined) {
        task.progressTarget = Math.max(0, progressTarget);
      }
      if (progressAchieved !== undefined) {
        task.progressAchieved = Math.max(0, progressAchieved);
      }
    }

    // Update visibility setting
    if (showProgressDetails !== undefined) {
      task.showProgressDetails = Boolean(showProgressDetails);
    }

    // Update custom milestones
    if (milestones && Array.isArray(milestones)) {
      task.milestones = milestones.map(m => ({
        name: m.name || 'Milestone',
        percentage: Math.max(0, m.percentage || 0),
        color: m.color || '#6366f1',
        reached: false,
        reachedAt: null,
      }));
    }

    // Recalculate progress and update milestones
    await progressService.updateTaskProgress(task);

    // Get formatted progress view
    const progressView = progressService.getClientProgressView(task);

    return res.status(200).json({
      id: task._id.toString(),
      clientId: task.clientId.toString(),
      title: task.title,
      progressMode: task.progressMode,
      progress: task.progress,
      progressTarget: task.progressTarget,
      progressAchieved: task.progressAchieved,
      showProgressDetails: task.showProgressDetails,
      milestones: task.milestones,
      progressView,
      updatedAt: task.updatedAt,
    });
  } catch (err) {
    console.error('Failed to update task progress:', err.message);
    return res.status(500).json({ error: 'Failed to update task progress' });
  }
});

// PATCH /admin/tasks/:taskId/approve - Approve and start a booked task
router.patch('/tasks/:taskId/approve', async (req, res) => {
  try {
    const { taskId } = req.params;
    const {
      title,
      description,
      startDate,
      endDate,
      priority,
      internalNotes,
      publicNotes,
      specialInstructions
    } = req.body || {};

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== TASK_STATUS.PENDING_APPROVAL) {
      return res.status(400).json({ error: 'Only tasks pending approval can be approved' });
    }

    // Update with admin setup fields
    if (title) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (startDate) task.startDate = new Date(startDate);
    if (endDate) task.endDate = new Date(endDate);
    if (priority) task.priority = priority;
    if (internalNotes !== undefined) task.internalNotes = internalNotes.trim();
    if (publicNotes !== undefined) task.publicNotes = publicNotes.trim();
    if (specialInstructions !== undefined) task.specialInstructions = specialInstructions.trim();

    // Transition to ACTIVE
    task.status = TASK_STATUS.ACTIVE;

    // Reset progress to start fresh based on NEW dates
    task.progress = 0;
    task.progressAchieved = 0;

    // Start progress if AUTO
    if (task.progressMode === 'AUTO') {
      // Immediate calculation based on new start date
      const progressService = require('../services/progressService');
      task.progress = progressService.calculateAutoProgress(task.startDate, task.endDate, task.autoCompletionCap);
    }

    await task.save();

    // Recalculate milestones after saving new status and dates
    const progressService = require('../services/progressService');
    await progressService.updateTaskProgress(task);

    // Notify Client
    try {
      await createNotification({
        recipientId: task.clientId,
        type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
        title: 'Task Approved',
        message: 'Your task has been approved and is now active.',
        relatedEntity: {
          entityType: ENTITY_TYPES.TASK,
          entityId: task._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
    } catch (err) {
      console.error('Failed to notify client of task approval:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Task approved and started successfully',
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
        startDate: task.startDate,
        endDate: task.endDate,
      },
    });
  } catch (err) {
    console.error('Failed to approve task:', err.message);
    return res.status(500).json({ error: 'Failed to approve task' });
  }
});

// POST /admin/tasks/:taskId/reject - Reject a booked task and refund wallet
router.post('/tasks/:taskId/reject', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { reason } = req.body || {};

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.status !== TASK_STATUS.PENDING_APPROVAL) {
      return res.status(400).json({ error: 'Only tasks pending approval can be rejected' });
    }

    // Calculate refund amount (what client paid)
    const refundAmount = task.creditsUsed || task.creditCost || 0;

    // Refund wallet if any amount was charged
    if (refundAmount > 0 && task.clientId) {
      const Wallet = require('../models/Wallet');
      const WalletTransaction = require('../models/WalletTransaction');
      
      const wallet = await Wallet.findOne({ clientId: task.clientId }).exec();
      if (wallet) {
        // Credit refund
        wallet.balance += refundAmount;
        await wallet.save();

        // Log transaction (using only valid schema fields)
        await WalletTransaction.create({
          walletId: wallet._id,
          type: 'REFUND',
          amount: refundAmount,
          description: `Refund for rejected task: ${task.title}`,
          referenceId: task._id,
        });
      }
    }

    // Update task status
    task.status = TASK_STATUS.CANCELLED;
    task.rejectionReason = reason || 'Task rejected by admin';
    await task.save();

    // Notify Client
    try {
      await createNotification({
        recipientId: task.clientId,
        type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
        title: 'Task Rejected',
        message: `Your task "${task.title}" has been rejected. ${refundAmount > 0 ? `₹${refundAmount} has been refunded to your wallet.` : ''} ${reason ? `Reason: ${reason}` : ''}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.TASK,
          entityId: task._id,
        },
        notifyByEmail: true,
      });
    } catch (err) {
      console.error('Failed to notify client of task rejection:', err.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Task rejected and wallet refunded',
      refundAmount,
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
      },
    });
  } catch (err) {
    console.error('Failed to reject task:', err.message);
    return res.status(500).json({ error: 'Failed to reject task' });
  }
});

// DELETE /admin/plans/:planId - Safe delete a plan
router.delete('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;

    const plan = await Task.findById(planId).exec();

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Must be a Plan (isListedInPlans: true)
    if (!plan.isListedInPlans) {
      return res.status(400).json({ error: 'This is not a plan. Only plans can be deleted from here.' });
    }

    // Count tasks that reference this plan (purchased tasks)
    const referencingTasksCount = await Task.countDocuments({
      planId: planId,
      isListedInPlans: false
    }).exec();

    if (referencingTasksCount > 0) {
      // Soft delete: Archive the plan
      plan.visibility = 'HIDDEN';
      plan.isActivePlan = false;
      await plan.save();

      return res.status(200).json({
        success: true,
        action: 'archived',
        message: `Plan archived due to ${referencingTasksCount} existing task(s). Clients can no longer see or purchase this plan.`,
        plan: {
          id: plan._id.toString(),
          title: plan.title,
          visibility: plan.visibility,
          isActivePlan: plan.isActivePlan
        }
      });
    }

    // Hard delete: No tasks reference this plan
    await Task.findByIdAndDelete(planId).exec();

    return res.status(200).json({
      success: true,
      action: 'deleted',
      message: 'Plan permanently deleted.',
      plan: {
        id: planId,
        title: plan.title
      }
    });
  } catch (err) {
    console.error('Failed to delete plan:', err.message);
    return res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// GET /admin/plans - Return all Product Listings (isListedInPlans: true)
router.get('/plans', async (req, res) => {
  console.log('[FORENSIC] ===== GET /admin/plans CALLED =====');
  try {
    const { categoryId } = req.query;
    
    let filter = { isListedInPlans: true };
    if (categoryId) {
      filter.categoryId = categoryId;
    }
    console.log('[FORENSIC] Filter:', JSON.stringify(filter));
    
    const plans = await Task.find(filter)
      .populate('assignedBy', 'identifier')
      .populate('categoryId', 'name icon color')
      .populate('allowedClients', 'identifier profile.name')
      .sort({ createdAt: -1 })
      .exec();

    console.log('[FORENSIC] Plans found:', plans.length);
    plans.forEach(p => console.log('[FORENSIC] - Plan:', p.title, '| Status:', p.status, '| Active:', p.isActivePlan));

    return res.status(200).json({
      plans: plans.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        creditCost: p.creditCost,
        isActivePlan: p.isActivePlan,
        originalPrice: p.originalPrice,
        offerPrice: p.offerPrice,
        visibility: p.visibility || 'PUBLIC',
        allowedClients: (p.allowedClients || []).map(c => ({
          id: c._id.toString(),
          identifier: c.identifier,
          name: c.profile?.name || ''
        })),
        targetClients: p.targetClients,
        categoryId: p.categoryId ? p.categoryId._id.toString() : null,
        categoryName: p.categoryId ? p.categoryId.name : null,
        categoryIcon: p.categoryId ? p.categoryId.icon : null,
        categoryColor: p.categoryId ? p.categoryId.color : null,
        planMedia: p.planMedia,
        featureImage: p.featureImage,
        quantity: p.quantity,
        showQuantityToClient: p.showQuantityToClient,
        showCreditsToClient: p.showCreditsToClient,
        publicNotes: p.publicNotes,
        progressTarget: p.progressTarget,
        status: p.status,
        assignedBy: p.assignedBy ? p.assignedBy._id.toString() : null,
        assignedByIdentifier: p.assignedBy ? p.assignedBy.identifier : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Failed to retrieve plans:', err);
    return res.status(500).json({ error: 'Failed to retrieve plans' });
  }
});

// GET /admin/plans/:planId/preview - Get plan preview (client view)
router.get('/plans/:planId/preview', async (req, res) => {
  try {
    const { planId } = req.params;
    
    const plan = await Task.findById(planId)
      .populate('categoryId', 'name icon color')
      .populate('allowedClients', 'identifier profile.name')
      .exec();

    if (!plan || !plan.isListedInPlans) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    return res.status(200).json({
      plan: {
        id: plan._id.toString(),
        title: plan.title,
        description: plan.description,
        creditCost: plan.creditCost,
        featureImage: plan.featureImage,
        offerPrice: plan.offerPrice,
        originalPrice: plan.originalPrice,
        countdownEndDate: plan.countdownEndDate,
        planMedia: plan.planMedia || [],
        quantity: plan.quantity,
        showQuantityToClient: plan.showQuantityToClient,
        showCreditsToClient: plan.showCreditsToClient,
        publicNotes: plan.publicNotes,
        isActivePlan: plan.isActivePlan,
        categoryName: plan.categoryId?.name || 'Uncategorized',
        categoryIcon: plan.categoryId?.icon || '',
        categoryColor: plan.categoryId?.color || '#6366f1',
        visibility: plan.visibility || 'PUBLIC',
        allowedClients: (plan.allowedClients || []).map(c => ({
          id: c._id.toString(),
          identifier: c.identifier,
          name: c.profile?.name || ''
        })),
        createdAt: plan.createdAt,
      },
    });
  } catch (err) {
    console.error('Failed to retrieve plan preview:', err);
    return res.status(500).json({ error: 'Failed to retrieve plan preview' });
  }
});

// =============================================
// CATEGORY ROUTES (Product Categories)
// =============================================

// GET /admin/categories - List all categories
router.get('/categories', async (req, res) => {
  try {
    console.log('[CATEGORY LIST] Fetching all categories for admin');
    const categories = await Category.find()
      .sort({ order: 1, name: 1 })
      .exec();
    
    console.log('[CATEGORY LIST] Found', categories.length, 'categories');

    return res.status(200).json({
      categories: categories.map(c => ({
        id: c._id.toString(),
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        image: c.image,
        color: c.color,
        description: c.description,
        order: c.order,
        isActive: c.isActive,
        planCount: c.planCount,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Failed to retrieve categories:', err);
    return res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// POST /admin/categories - Create new category
router.post('/categories', async (req, res) => {
  try {
    console.log('[CATEGORY CREATE] Received request body:', req.body);
    const { name, icon, image, color, description, order, isActive } = req.body || {};

    if (!name || name.trim().length === 0) {
      console.log('[CATEGORY CREATE] Error: Name is required');
      return res.status(400).json({ error: 'Category name is required' });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    console.log('[CATEGORY CREATE] Generated slug:', slug);
    
    // Check for duplicate slug
    const existing = await Category.findOne({ slug }).exec();
    if (existing) {
      console.log('[CATEGORY CREATE] Error: Duplicate slug found');
      return res.status(400).json({ error: 'Category with this name already exists' });
    }

    const categoryData = {
      name: name.trim(),
      slug,
      icon: icon || '📦',
      image: image || null,
      color: color || '#6366f1',
      description: description?.trim() || '',
      order: order !== undefined ? Number(order) : 0,
      isActive: isActive !== false, // Default to true if not specified
    };
    console.log('[CATEGORY CREATE] Creating category with data:', categoryData);
    
    const category = await Category.create(categoryData);
    console.log('[CATEGORY CREATE] Success! Category created with ID:', category._id.toString());

    return res.status(201).json({
      success: true,
      category: {
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        image: category.image,
        color: category.color,
        description: category.description,
        order: category.order,
        isActive: category.isActive,
        createdAt: category.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }
    console.error('Failed to create category:', err);
    return res.status(500).json({ error: 'Failed to create category' });
  }
});

// PATCH /admin/categories/:id - Update category
router.patch('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, image, color, description, order, isActive } = req.body || {};

    const category = await Category.findById(id).exec();
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (name !== undefined) {
      if (name.trim().length === 0) {
        return res.status(400).json({ error: 'Category name cannot be empty' });
      }
      category.name = name.trim();
      category.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (icon !== undefined) category.icon = icon;
    if (image !== undefined) category.image = image;
    if (color !== undefined) category.color = color;
    if (description !== undefined) category.description = description.trim();
    if (order !== undefined) category.order = Number(order);
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    await category.save();

    return res.status(200).json({
      success: true,
      category: {
        id: category._id.toString(),
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        image: category.image,
        color: category.color,
        description: category.description,
        order: category.order,
        isActive: category.isActive,
        updatedAt: category.updatedAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }
    console.error('Failed to update category:', err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /admin/categories/:id - Soft delete category
router.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id).exec();
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Soft delete - just disable
    category.isActive = false;
    await category.save();

    return res.status(200).json({
      success: true,
      message: 'Category disabled',
      id: category._id.toString(),
    });
  } catch (err) {
    console.error('Failed to delete category:', err);
    return res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Legacy route for backward compatibility
router.get('/task-templates', async (req, res) => {
  try {
    const templates = await TaskTemplate.find()
      .populate('createdBy', 'identifier')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      templates: templates.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        description: t.description,
        creditCost: t.creditCost,
        isActive: t.isActive,
        createdBy: t.createdBy._id.toString(),
        createdByIdentifier: t.createdBy.identifier,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task templates' });
  }
});

router.post('/task-templates', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { name, description, creditCost } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Valid name is required' });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Valid description is required' });
    }

    if (creditCost === undefined || creditCost === null) {
      return res.status(400).json({ error: 'creditCost is required' });
    }

    if (typeof creditCost !== 'number' || creditCost < 0) {
      return res.status(400).json({ error: 'creditCost must be a non-negative number' });
    }

    const existingTemplate = await TaskTemplate.findOne({ name: name.trim() }).exec();

    if (existingTemplate) {
      return res.status(400).json({ error: 'Template with this name already exists' });
    }

    const template = await TaskTemplate.create({
      name: name.trim(),
      description: description.trim(),
      creditCost,
      isActive: true,
      createdBy: adminId,
    });

    return res.status(201).json({
      id: template._id.toString(),
      name: template.name,
      description: template.description,
      creditCost: template.creditCost,
      isActive: template.isActive,
      createdBy: template.createdBy.toString(),
      createdAt: template.createdAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Template with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to create task template' });
  }
});

router.patch('/task-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, creditCost, isActive } = req.body || {};

    const template = await TaskTemplate.findById(id).exec();

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Valid name is required' });
      }

      if (name.trim() !== template.name) {
        const existingTemplate = await TaskTemplate.findOne({ name: name.trim() }).exec();
        if (existingTemplate) {
          return res.status(400).json({ error: 'Template with this name already exists' });
        }
      }

      template.name = name.trim();
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        return res.status(400).json({ error: 'Valid description is required' });
      }
      template.description = description.trim();
    }

    if (creditCost !== undefined) {
      if (typeof creditCost !== 'number' || creditCost < 0) {
        return res.status(400).json({ error: 'creditCost must be a non-negative number' });
      }
      template.creditCost = creditCost;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' });
      }
      template.isActive = isActive;
    }

    await template.save();

    return res.status(200).json({
      id: template._id.toString(),
      name: template.name,
      description: template.description,
      creditCost: template.creditCost,
      isActive: template.isActive,
      updatedAt: template.updatedAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Template with this name already exists' });
    }
    return res.status(500).json({ error: 'Failed to update task template' });
  }
});

router.delete('/task-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const template = await TaskTemplate.findById(id).exec();

    if (!template) {
      return res.status(404).json({ error: 'Task template not found' });
    }

    template.isActive = false;
    await template.save();

    return res.status(200).json({
      id: template._id.toString(),
      name: template.name,
      isActive: template.isActive,
      message: 'Template disabled successfully',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to disable task template' });
  }
});

router.get('/reports/overview', async (req, res) => {
  try {
    // Get counts directly for reliability
    const totalClients = await User.countDocuments({ role: ROLES.CLIENT, isDeleted: { $ne: true } }).exec();
    const activeTasks = await Task.countDocuments({ status: { $in: ['ACTIVE', 'IN_PROGRESS'] }, isListedInPlans: { $ne: true } }).exec();
    const pendingRecharges = await RechargeRequest.countDocuments({ status: 'PENDING' }).exec();
    const totalCredits = await Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    
    // Additional meaningful stats
    const pendingApprovals = await Task.countDocuments({ status: 'PENDING_APPROVAL', isListedInPlans: { $ne: true } }).exec();
    const totalNotices = await Notice.countDocuments({ isActive: true }).exec();
    const unreadResponses = await Notice.aggregate([
      { $match: { isActive: true, responseRequired: true } },
      { $project: { responsesCount: { $size: { $ifNull: ['$responses', []] } } } },
      { $group: { _id: null, total: { $sum: '$responsesCount' } } }
    ]);

    return res.status(200).json({
      totalClients,
      activeTasks,
      pendingRecharges,
      totalCredits: totalCredits[0]?.total || 0,
      pendingApprovals,
      totalNotices,
      unreadResponses: unreadResponses[0]?.total || 0,
    });
  } catch (err) {
    console.error('Overview error:', err);
    return res.status(500).json({ error: 'Failed to retrieve system overview' });
  }
});

router.get('/reports/credit-flow', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    const creditFlow = await getCreditFlowByPeriod(period || 'weekly', startDate, endDate);
    const topSpenders = await getTopSpenders(10);

    return res.status(200).json({
      period: creditFlow.period,
      creditsAdded: creditFlow.creditsAdded,
      creditsSpent: creditFlow.creditsSpent,
      netFlow: creditFlow.netFlow,
      topSpenders,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve credit flow' });
  }
});

router.get('/reports/tasks', async (req, res) => {
  try {
    const tasksByStatus = await getTaskAnalyticsByStatus();
    const tasksByTemplate = await getTaskAnalyticsByTemplate();

    return res.status(200).json({
      statusDistribution: tasksByStatus.statusDistribution,
      totalTasks: tasksByStatus.totalTasks,
      completionRate: tasksByStatus.completionRate,
      tasksByTemplate: tasksByTemplate.slice(0, 10),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task reports' });
  }
});

router.get('/reports/clients', async (req, res) => {
  try {
    const wallets = await Wallet.find()
      .populate('clientId', 'identifier')
      .sort({ balance: -1 })
      .exec();

    const clientSummaries = await Promise.all(
      wallets.map(async (wallet) => {
        const taskCount = await Task.countDocuments({ clientId: wallet.clientId._id }).exec();

        const recentTask = await Task.findOne({ clientId: wallet.clientId._id })
          .sort({ createdAt: -1 })
          .exec();

        return {
          clientId: wallet.clientId._id.toString(),
          clientIdentifier: wallet.clientId.identifier,
          balance: wallet.balance,
          taskCount,
          lastActivity: recentTask ? recentTask.createdAt : wallet.updatedAt,
        };
      })
    );

    return res.status(200).json({
      clients: clientSummaries,
      totalClients: clientSummaries.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve client overview' });
  }
});

router.get('/reports/clients/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await User.findById(clientId).exec();

    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const walletSummary = await getClientWalletSummary(clientId);

    if (!walletSummary) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const taskSummary = await getClientTaskSummary(clientId);
    const recentActivity = await getClientRecentActivity(clientId, 30);

    const wallet = await Wallet.findOne({ clientId }).exec();
    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    const tasks = await Task.find({ clientId })
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();

    return res.status(200).json({
      clientInfo: {
        clientId: client._id.toString(),
        identifier: client.identifier,
        role: client.role,
      },
      walletSummary: {
        currentBalance: walletSummary.currentBalance,
        lifetimeSpending: walletSummary.lifetimeSpending,
        lifetimeAdded: walletSummary.lifetimeAdded,
      },
      taskSummary: {
        totalTasks: taskSummary.totalTasks,
        tasksByStatus: taskSummary.tasksByStatus,
        completionRate: taskSummary.completionRate,
      },
      recentActivity: {
        last30Days: {
          spending: recentActivity.spending,
          tasksCreated: recentActivity.tasksCreated,
        },
      },
      recentTransactions: transactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt,
      })),
      recentTasks: tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        creditCost: t.creditCost,
        status: t.status,
        templateName: t.templateId ? t.templateId.name : 'Custom/Assigned',
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve client details' });
  }
});

// --- Order Management Routes ---

// GET /admin/orders - Fetch all orders with optional status filter
router.get('/orders', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    
    if (status && ORDER_STATUS[status]) {
      query.orderStatus = status;
    }
    
    const orders = await Order.find(query)
      .populate('clientId', 'identifier email')
      .sort({ createdAt: -1 })
      .lean();
    
    return res.status(200).json({
      orders: orders.map(order => ({
        id: order._id.toString(),
        orderId: order.orderId,
        clientId: order.clientId?._id?.toString(),
        clientEmail: order.clientId?.identifier || order.clientId?.email,
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        adminNotes: order.adminNotes,
        rejectionReason: order.rejectionReason,
        taskIds: order.taskIds,
        createdAt: order.createdAt,
        approvedAt: order.approvedAt,
        rejectedAt: order.rejectedAt,
        completedAt: order.completedAt,
      })),
    });
  } catch (err) {
    console.error('[ADMIN/ORDERS] Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /admin/orders/:orderId - Fetch single order details
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('clientId', 'identifier email')
      .populate('taskIds')
      .lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    return res.status(200).json({ order });
  } catch (err) {
    console.error('[ADMIN/ORDERS] Fetch single error:', err);
    return res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /admin/orders/:orderId/approve - Approve order and create tasks
router.post('/orders/:orderId/approve', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId } = req.params;
    const adminId = req.user.id;
    
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.orderStatus !== ORDER_STATUS.PENDING_APPROVAL) {
      await session.abortTransaction();
      return res.status(400).json({ error: `Cannot approve order with status: ${order.orderStatus}` });
    }
    
    // Create tasks for each item in the order
    const createdTaskIds = [];
    
    for (const item of order.items) {
      // Create task(s) for this item based on quantity
      for (let i = 0; i < item.quantity; i++) {
        const taskData = {
          clientId: order.clientId,
          templateId: item.planId,
          title: item.planTitle + (item.quantity > 1 ? ` (${i + 1}/${item.quantity})` : ''),
          description: stripHtmlTags(item.planSnapshot?.description || ''),
          creditCost: item.unitPrice,
          status: TASK_STATUS.IN_PROGRESS,
          progressMode: item.planSnapshot?.progressMode || 'AUTO',
          progressTarget: item.planSnapshot?.progressTarget || 100,
          milestones: item.planSnapshot?.milestones || [],
          autoCompletionCap: item.planSnapshot?.autoCompletionCap || 100,
          isPurchased: true,
          orderId: order._id,
          categoryId: item.categoryId,
        };
        
        const task = await Task.create([taskData], { session });
        createdTaskIds.push(task[0]._id);
      }
    }
    
    // Update order status
    order.orderStatus = ORDER_STATUS.APPROVED;
    order.approvedBy = adminId;
    order.approvedAt = new Date();
    order.taskIds = createdTaskIds;
    await order.save({ session });
    
    await session.commitTransaction();
    
    // Create invoice for order (outside transaction)
    let orderInvoice = null;
    try {
      orderInvoice = await billingService.createInvoiceForOrder(order, adminId);
      if (orderInvoice) {
        console.log('[BILLING] Order invoice created:', orderInvoice.invoiceNumber);
      }
    } catch (billingErr) {
      console.error('[BILLING] Failed to create order invoice (non-blocking):', billingErr.message);
    }
    
    // Notify client (outside transaction)
    try {
      await createNotification({
        recipientId: order.clientId,
        type: NOTIFICATION_TYPES.ORDER_APPROVED || 'ORDER_APPROVED',
        title: 'Order Approved!',
        message: `Your order ${order.orderId} has been approved. Tasks are now in progress.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.ORDER || 'ORDER',
          entityId: order._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
    } catch (notifErr) {
      console.error('[ADMIN/ORDERS] Notification error:', notifErr);
    }
    
    return res.status(200).json({
      success: true,
      message: `Order approved! ${createdTaskIds.length} task(s) created.`,
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        taskCount: createdTaskIds.length,
        invoiceNumber: orderInvoice?.invoiceNumber || null,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('[ADMIN/ORDERS] Approve error:', err);
    return res.status(500).json({ error: 'Failed to approve order' });
  } finally {
    session.endSession();
  }
});

// POST /admin/orders/:orderId/reject - Reject order and refund
router.post('/orders/:orderId/reject', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const adminId = req.user.id;
    
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.orderStatus !== ORDER_STATUS.PENDING_APPROVAL) {
      await session.abortTransaction();
      return res.status(400).json({ error: `Cannot reject order with status: ${order.orderStatus}` });
    }
    
    // Find client's wallet and refund
    const wallet = await Wallet.findOne({ clientId: order.clientId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Client wallet not found' });
    }
    
    // Create refund transaction
    const refundTx = await WalletTransaction.create([{
      walletId: wallet._id,
      type: TRANSACTION_TYPES.ORDER_REFUND || 'ORDER_REFUND',
      amount: order.totalAmount,
      description: `Refund for rejected order ${order.orderId}${reason ? ': ' + reason : ''}`,
      referenceId: order._id,
      referenceModel: 'Order',
    }], { session });
    
    // Update wallet balance
    wallet.balance += order.totalAmount;
    await wallet.save({ session });
    
    // Update order status
    order.orderStatus = ORDER_STATUS.REJECTED;
    order.paymentStatus = PAYMENT_STATUS.REFUNDED;
    order.rejectedBy = adminId;
    order.rejectedAt = new Date();
    order.rejectionReason = reason || 'Order rejected by admin';
    order.refundedAt = new Date();
    order.refundTransactionId = refundTx[0]._id;
    await order.save({ session });
    
    await session.commitTransaction();
    
    // Notify client (outside transaction)
    try {
      await createNotification({
        recipientId: order.clientId,
        type: NOTIFICATION_TYPES.ORDER_REJECTED || 'ORDER_REJECTED',
        title: 'Order Rejected',
        message: `Your order ${order.orderId} was rejected. ₹${order.totalAmount} has been refunded to your wallet.${reason ? ' Reason: ' + reason : ''}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.ORDER || 'ORDER',
          entityId: order._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
    } catch (notifErr) {
      console.error('[ADMIN/ORDERS] Notification error:', notifErr);
    }
    
    return res.status(200).json({
      success: true,
      message: `Order rejected and ₹${order.totalAmount} refunded.`,
      order: {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        refundAmount: order.totalAmount,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('[ADMIN/ORDERS] Reject error:', err);
    return res.status(500).json({ error: 'Failed to reject order' });
  } finally {
    session.endSession();
  }
});

// --- Notification Routes (Phase 5) ---

router.get('/notifications', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { unreadOnly } = req.query;

    const notifications = await getNotificationsForUser(adminId, {
      unreadOnly: unreadOnly === 'true',
    });

    const unreadCount = await getUnreadCount(adminId);

    return res.status(200).json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
        readAt: n.readAt,
      })),
      unreadCount,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id: notificationId } = req.params;

    const notification = await markNotificationAsRead(notificationId, adminId);

    return res.status(200).json({
      notification: {
        id: notification._id.toString(),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        isRead: notification.isRead,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      },
    });
  } catch (err) {
    if (err.message === 'Notification not found') {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (err.message === 'Unauthorized to modify this notification') {
      return res.status(403).json({ error: 'Access denied' });
    }
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    const adminId = req.user.id;

    const count = await markAllNotificationsAsRead(adminId);

    return res.status(200).json({
      message: `${count} notifications marked as read`,
      count,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// =============================================
// NOTICE/ANNOUNCEMENT ROUTES (Office System)
// =============================================

// GET /admin/notices - List all notices
router.get('/notices', async (req, res) => {
  try {
    const { type, isActive } = req.query;
    let filter = {};
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const notices = await Notice.find(filter)
      .populate('targetClients', 'identifier')
      .sort({ isPinned: -1, createdAt: -1 })
      .exec();

    return res.status(200).json({
      notices: notices.map(n => ({
        id: n._id.toString(),
        title: n.title,
        content: n.content,
        type: n.type,
        priority: n.priority,
        targetType: n.targetType,
        targetClients: n.targetClients?.map(c => ({ id: c._id.toString(), identifier: c.identifier })) || [],
        responseRequired: n.responseRequired,
        responseType: n.responseType,
        responsesCount: n.responses?.length || 0,
        isActive: n.isActive,
        isPinned: n.isPinned,
        imageUrl: n.imageUrl,
        linkUrl: n.linkUrl,
        linkText: n.linkText,
        expiresAt: n.expiresAt,
        viewCount: n.viewCount,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Failed to retrieve notices:', err);
    return res.status(500).json({ error: 'Failed to retrieve notices' });
  }
});

// GET /admin/notices/:noticeId - Get notice details with responses
router.get('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await Notice.findById(noticeId)
      .populate('targetClients', 'identifier')
      .populate('responses.clientId', 'identifier')
      .exec();

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    return res.status(200).json({
      notice: {
        id: notice._id.toString(),
        title: notice.title,
        content: notice.content,
        type: notice.type,
        priority: notice.priority,
        targetType: notice.targetType,
        targetClients: notice.targetClients?.map(c => ({ id: c._id.toString(), identifier: c.identifier })) || [],
        responseRequired: notice.responseRequired,
        responseType: notice.responseType,
        responses: notice.responses?.map(r => ({
          clientId: r.clientId?._id?.toString(),
          clientIdentifier: r.clientId?.identifier,
          responseType: r.responseType,
          value: r.value,
          fileUrl: r.fileUrl,
          respondedAt: r.respondedAt,
        })) || [],
        isActive: notice.isActive,
        isPinned: notice.isPinned,
        imageUrl: notice.imageUrl,
        linkUrl: notice.linkUrl,
        linkText: notice.linkText,
        expiresAt: notice.expiresAt,
        viewCount: notice.viewCount,
        viewedBy: notice.viewedBy?.length || 0,
        createdAt: notice.createdAt,
        updatedAt: notice.updatedAt,
      },
    });
  } catch (err) {
    console.error('Failed to retrieve notice:', err);
    return res.status(500).json({ error: 'Failed to retrieve notice' });
  }
});

// POST /admin/notices - Create new notice
router.post('/notices', async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      priority,
      targetType,
      targetClients,
      responseRequired,
      responseType,
      isActive,
      isPinned,
      imageUrl,
      linkUrl,
      linkText,
      expiresAt,
    } = req.body || {};

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: 'Notice title is required' });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Notice content is required' });
    }

    // Convert targetClients strings to ObjectIds with validation
    let processedTargetClients = [];
    if (targetType === 'SELECTED' && Array.isArray(targetClients) && targetClients.length > 0) {
      for (const id of targetClients) {
        if (mongoose.Types.ObjectId.isValid(id)) {
          processedTargetClients.push(new mongoose.Types.ObjectId(id));
        } else {
          console.warn(`[NOTICE] Invalid client ID skipped: ${id}`);
        }
      }
      
      if (processedTargetClients.length === 0) {
        return res.status(400).json({ error: 'No valid client IDs provided for SELECTED target type' });
      }
    }

    const notice = await Notice.create({
      title: title.trim(),
      content: content.trim(),
      type: type || 'NOTICE',
      priority: priority || 'NORMAL',
      targetType: targetType || 'ALL',
      targetClients: processedTargetClients,
      responseRequired: responseRequired || false,
      responseType: responseType || 'NONE',
      isActive: isActive !== false,
      isPinned: isPinned || false,
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      linkText: linkText || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // --- Notification Hook: Notify clients about new notice ---
    try {
      let clientsToNotify = [];
      
      if ((targetType || 'ALL') === 'ALL') {
        // Get all active clients
        const allClients = await User.find({ role: 'CLIENT', status: 'ACTIVE' }).select('_id').exec();
        clientsToNotify = allClients.map(c => c._id);
      } else if (targetType === 'SELECTED' && processedTargetClients.length > 0) {
        clientsToNotify = processedTargetClients;
      }
      
      console.log(`[NEW_NOTICE] Creating notifications for ${clientsToNotify.length} client(s)`);
      
      for (const clientId of clientsToNotify) {
        // Determine notification type and title based on notice type
        let notificationType = NOTIFICATION_TYPES.NEW_NOTICE;
        let notificationTitle = 'New Announcement';
        
        switch (notice.type) {
          case 'UPDATE':
            notificationType = NOTIFICATION_TYPES.NEW_UPDATE;
            notificationTitle = 'New Update';
            break;
          case 'REQUIREMENT':
            notificationType = NOTIFICATION_TYPES.NEW_REQUIREMENT;
            notificationTitle = 'New Requirement';
            break;
          case 'PROMOTION':
            notificationType = NOTIFICATION_TYPES.NEW_PROMOTION;
            notificationTitle = 'New Promotion';
            break;
          default:
            notificationType = NOTIFICATION_TYPES.NEW_NOTICE;
            notificationTitle = 'New Announcement';
        }
        
        await createNotification({
          recipientId: clientId,
          type: notificationType,
          title: notificationTitle,
          message: `${title.trim().substring(0, 100)}${title.length > 100 ? '...' : ''}`,
          relatedEntity: {
            entityType: ENTITY_TYPES.NOTICE,
            entityId: notice._id,
          },
          notifyByEmail: true, // Email trigger for important event
        });
      }
      
      console.log(`[NEW_NOTICE] Notifications created successfully`);
    } catch (notifErr) {
      console.error('[NEW_NOTICE] Notification error (non-fatal):', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      notice: {
        id: notice._id.toString(),
        title: notice.title,
        type: notice.type,
        isActive: notice.isActive,
        createdAt: notice.createdAt,
      },
    });
  } catch (err) {
    console.error('[NOTICE CREATION ERROR]', err.message);
    console.error('[NOTICE CREATION STACK]', err.stack);
    return res.status(500).json({ error: `Failed to create notice: ${err.message}` });
  }
});

// PATCH /admin/notices/:noticeId - Update notice
router.patch('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const updates = req.body || {};

    delete updates._id;
    delete updates.responses;
    delete updates.viewCount;
    delete updates.viewedBy;

    const notice = await Notice.findByIdAndUpdate(noticeId, updates, { new: true }).exec();

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    return res.status(200).json({
      success: true,
      notice: {
        id: notice._id.toString(),
        title: notice.title,
        isActive: notice.isActive,
        updatedAt: notice.updatedAt,
      },
    });
  } catch (err) {
    console.error('Failed to update notice:', err);
    return res.status(500).json({ error: 'Failed to update notice' });
  }
});

// DELETE /admin/notices/:noticeId - Delete notice
router.delete('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const notice = await Notice.findByIdAndDelete(noticeId).exec();

    if (!notice) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    return res.status(200).json({ success: true, message: 'Notice deleted' });
  } catch (err) {
    console.error('Failed to delete notice:', err);
    return res.status(500).json({ error: 'Failed to delete notice' });
  }
});

// GET /admin/clients - Get list of clients for targeting
router.get('/clients', async (req, res) => {
  try {
    const clients = await User.find({ role: ROLES.CLIENT, status: 'ACTIVE' })
      .select('identifier createdAt')
      .sort({ identifier: 1 })
      .exec();

    return res.status(200).json({
      clients: clients.map(c => ({
        id: c._id.toString(),
        identifier: c.identifier,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    console.error('Failed to retrieve clients:', err);
    return res.status(500).json({ error: 'Failed to retrieve clients' });
  }
});

// =============================================
// USER MANAGEMENT ROUTES (Profile Tab)
// =============================================

const { hashPassword } = require('../services/passwordService');

// GET /admin/users - List all users with pagination
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, sort = 'createdAt', order = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = { isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { identifier: { $regex: search, $options: 'i' } },
        { 'profile.name': { $regex: search, $options: 'i' } },
        { 'profile.company': { $regex: search, $options: 'i' } },
      ];
    }

    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const users = await User.find(filter)
      .select('-passwordHash')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const total = await User.countDocuments(filter).exec();

    // Get wallet and task data for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const wallet = await Wallet.findOne({ clientId: user._id }).exec();
      const activeTasks = await Task.countDocuments({ clientId: user._id, status: { $in: ['ACTIVE', 'IN_PROGRESS'] }, isListedInPlans: { $ne: true } }).exec();
      const totalTasks = await Task.countDocuments({ clientId: user._id, isListedInPlans: { $ne: true } }).exec();

      return {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        name: user.profile?.name || '',
        phone: user.profile?.phone || '',
        photoUrl: user.profile?.photoUrl || null,
        company: user.profile?.company || '',
        walletBalance: wallet?.balance || 0,
        activeTasks,
        totalTasks,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        lastActivityAt: user.lastActivityAt,
      };
    }));

    return res.status(200).json({
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Failed to retrieve users:', err);
    return res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// POST /admin/users - Create new user
router.post('/users', async (req, res) => {
  try {
    const { identifier, password, role, status, name, phone, company } = req.body;

    // Validation
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Email/Identifier is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!role || ![ROLES.CLIENT, ROLES.ADMIN].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required (CLIENT or ADMIN)' });
    }
    
    // Validate status if provided
    const userStatus = status && ['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(status) ? status : 'ACTIVE';

    // Check if user already exists (exclude soft-deleted users)
    const existingUser = await User.findOne({ 
      identifier: identifier.trim().toLowerCase(),
      isDeleted: { $ne: true }  // Ignore deleted users
    }).exec();
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email/identifier already exists' });
    }

    // Also check if there's a soft-deleted user with same identifier and fix them
    // This handles users deleted before the email-release fix was deployed
    const deletedUserWithSameEmail = await User.findOne({
      identifier: identifier.trim().toLowerCase(),
      isDeleted: true
    }).exec();
    if (deletedUserWithSameEmail) {
      // Release the email from the deleted user
      deletedUserWithSameEmail.originalIdentifier = deletedUserWithSameEmail.identifier;
      deletedUserWithSameEmail.identifier = `deleted_${Date.now()}_${deletedUserWithSameEmail.identifier}`;
      await deletedUserWithSameEmail.save();
      console.log(`[USER CREATE] Released email from deleted user: ${deletedUserWithSameEmail.originalIdentifier}`);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await User.create({
      identifier: identifier.trim().toLowerCase(),
      passwordHash,
      role,
      status: userStatus,
      profile: {
        name: name?.trim() || '',
        phone: phone?.trim() || '',
        company: company?.trim() || '',
      },
    });

    // Create wallet for client
    if (role === ROLES.CLIENT) {
      await Wallet.create({
        clientId: user._id,
        balance: 0,
      });
    }

    return res.status(201).json({
      success: true,
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        name: user.profile?.name || '',
      },
    });
  } catch (err) {
    console.error('Failed to create user:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /admin/users/:userId - Get user detail
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-passwordHash').exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ clientId: userId }).exec();

    // Get task stats
    const activeTasks = await Task.countDocuments({ clientId: userId, status: { $in: ['ACTIVE', 'IN_PROGRESS'] }, isListedInPlans: { $ne: true } }).exec();
    const completedTasks = await Task.countDocuments({ clientId: userId, status: 'COMPLETED', isListedInPlans: { $ne: true } }).exec();
    const pendingTasks = await Task.countDocuments({ clientId: userId, status: 'PENDING_APPROVAL', isListedInPlans: { $ne: true } }).exec();
    const totalTasks = await Task.countDocuments({ clientId: userId, isListedInPlans: { $ne: true } }).exec();

    // Get purchased plans count
    const purchasedPlans = await Task.countDocuments({ clientId: userId, planId: { $ne: null }, isListedInPlans: { $ne: true } }).exec();

    // Get responses count
    const responses = await Notice.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.clientId': user._id } },
      { $count: 'total' }
    ]);

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        profile: {
          name: user.profile?.name || '',
          phone: user.profile?.phone || '',
          photoUrl: user.profile?.photoUrl || null,
          company: user.profile?.company || '',
          timezone: user.profile?.timezone || 'UTC',
          language: user.profile?.language || 'en',
        },
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        lastActivityAt: user.lastActivityAt,
      },
      stats: {
        walletBalance: wallet?.balance || 0,
        activeTasks,
        completedTasks,
        pendingTasks,
        totalTasks,
        purchasedPlans,
        responseCount: responses[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error('Failed to get user detail:', err);
    return res.status(500).json({ error: 'Failed to get user detail' });
  }
});

// PATCH /admin/users/:userId - Update user
router.patch('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { identifier, status, name, phone, photoUrl, company, timezone, language, preferences } = req.body || {};

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields
    if (identifier !== undefined) user.identifier = identifier.trim();
    if (status !== undefined && ['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(status)) {
      user.status = status;
    }
    if (name !== undefined) user.profile.name = name.trim();
    if (phone !== undefined) user.profile.phone = phone.trim();
    if (photoUrl !== undefined) user.profile.photoUrl = photoUrl || null;
    if (company !== undefined) user.profile.company = company.trim();
    if (timezone !== undefined) user.profile.timezone = timezone;
    if (language !== undefined) user.profile.language = language;

    if (preferences) {
      if (preferences.emailNotifications !== undefined) user.preferences.emailNotifications = preferences.emailNotifications;
      if (preferences.inAppNotifications !== undefined) user.preferences.inAppNotifications = preferences.inAppNotifications;
      if (preferences.marketingEmails !== undefined) user.preferences.marketingEmails = preferences.marketingEmails;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        profile: user.profile,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error('Failed to update user:', err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /admin/users/:userId/suspend - Suspend user
router.post('/users/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === ROLES.ADMIN) {
      return res.status(403).json({ error: 'Cannot suspend admin users' });
    }

    user.status = 'SUSPENDED';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User suspended successfully',
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Failed to suspend user:', err);
    return res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// POST /admin/users/:userId/activate - Activate user
router.post('/users/:userId/activate', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.status = 'ACTIVE';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User activated successfully',
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Failed to activate user:', err);
    return res.status(500).json({ error: 'Failed to activate user' });
  }
});

// POST /admin/users/:userId/reset-password - Reset user password
router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only block main admin (role=ADMIN without customRole)
    // Allow reset for managers (role=ADMIN with customRole)
    if (user.role === ROLES.ADMIN && !user.customRole) {
      return res.status(403).json({ error: 'Cannot reset main admin password' });
    }

    // Hash the new password using password service
    const { hashPassword } = require('../services/passwordService');
    const passwordHash = await hashPassword(newPassword);
    user.passwordHash = passwordHash;
    
    // Update last password change timestamp
    user.lastPasswordChangeAt = new Date();
    
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (err) {
    console.error('Failed to reset user password:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /admin/users/:userId - Soft delete user with email re-use capability
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only block main admin deletion (role=ADMIN without customRole)
    // Allow delete for managers (role=ADMIN with customRole)
    if (user.role === ROLES.ADMIN && !user.customRole) {
      return res.status(403).json({ error: 'Cannot delete main admin user' });
    }

    // Soft delete with email re-use capability
    // Store original identifier for potential recovery, and change identifier to prevent conflicts
    user.originalIdentifier = user.identifier;  // Keep for reference
    user.identifier = `deleted_${Date.now()}_${user.identifier}`; // Change to allow re-registration
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.status = 'DISABLED';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (err) {
    console.error('Failed to delete user:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /admin/users/:userId/tasks - Get user's tasks
router.get('/users/:userId/tasks', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = { clientId: userId, isListedInPlans: { $ne: true } };
    if (status) filter.status = status;

    const tasks = await Task.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const total = await Task.countDocuments(filter).exec();

    return res.status(200).json({
      tasks: tasks.map(t => ({
        id: t._id.toString(),
        title: t.title,
        status: t.status,
        progress: t.progress,
        creditCost: t.creditCost,
        createdAt: t.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Failed to get user tasks:', err);
    return res.status(500).json({ error: 'Failed to get user tasks' });
  }
});

// GET /admin/users/:userId/wallet - Get user's wallet history
router.get('/users/:userId/wallet', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const wallet = await Wallet.findOne({ clientId: userId }).exec();
    if (!wallet) {
      return res.status(200).json({
        balance: 0,
        transactions: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    }

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const total = await WalletTransaction.countDocuments({ walletId: wallet._id }).exec();

    return res.status(200).json({
      balance: wallet.balance,
      transactions: transactions.map(t => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Failed to get user wallet:', err);
    return res.status(500).json({ error: 'Failed to get user wallet' });
  }
});

// POST /admin/users/:userId/wallet - Add/deduct wallet
router.post('/users/:userId/wallet', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, description, type } = req.body || {};

    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'Amount is required and must be a number' });
    }

    if (!type || !['ADD', 'DEDUCT'].includes(type)) {
      return res.status(400).json({ error: 'Type must be ADD or DEDUCT' });
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    let wallet = await Wallet.findOne({ clientId: userId }).exec();
    if (!wallet) {
      wallet = await Wallet.create({ clientId: userId, balance: 0 });
    }

    const actualAmount = type === 'DEDUCT' ? -Math.abs(amount) : Math.abs(amount);
    
    if (type === 'DEDUCT' && wallet.balance < Math.abs(amount)) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    wallet.balance += actualAmount;
    await wallet.save();

    // Create transaction record
    await WalletTransaction.create({
      walletId: wallet._id,
      type: type === 'ADD' ? TRANSACTION_TYPES.MANUAL_CREDIT : TRANSACTION_TYPES.MANUAL_DEBIT,
      amount: actualAmount,
      description: description || `Admin ${type.toLowerCase()} credits`,
    });

    return res.status(200).json({
      success: true,
      message: `Credits ${type.toLowerCase()}ed successfully`,
      newBalance: wallet.balance,
    });
  } catch (err) {
    console.error('Failed to modify wallet:', err);
    return res.status(500).json({ error: 'Failed to modify wallet' });
  }
});

// GET /admin/users/:userId/responses - Get user's notice responses
router.get('/users/:userId/responses', async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');

    const responses = await Notice.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.clientId': new mongoose.Types.ObjectId(userId) } },
      { $sort: { 'responses.respondedAt': -1 } },
      { $limit: 50 },
      { $project: { title: 1, type: 1, responses: 1, createdAt: 1 } }
    ]);

    return res.status(200).json({
      responses: responses.map(r => ({
        noticeId: r._id.toString(),
        noticeTitle: r.title,
        noticeType: r.type,
        responseType: r.responses.responseType,
        value: r.responses.value,
        respondedAt: r.responses.respondedAt,
      })),
    });
  } catch (err) {
    console.error('Failed to get user responses:', err);
    return res.status(500).json({ error: 'Failed to get user responses' });
  }
});

// GET /admin/users/:userId/purchases - Get user's purchased plans
router.get('/users/:userId/purchases', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const purchases = await Task.find({ clientId: userId, planId: { $ne: null }, isListedInPlans: { $ne: true } })
      .populate('planId', 'title featureImage offerPrice originalPrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const total = await Task.countDocuments({ clientId: userId, planId: { $ne: null }, isListedInPlans: { $ne: true } }).exec();

    return res.status(200).json({
      purchases: purchases.map(p => ({
        taskId: p._id.toString(),
        planId: p.planId?._id?.toString(),
        planTitle: p.planId?.title || p.title,
        planImage: p.planId?.featureImage,
        status: p.status,
        purchasePrice: p.creditCost,
        purchasedAt: p.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Failed to get user purchases:', err);
    return res.status(500).json({ error: 'Failed to get user purchases' });
  }
});

// POST /admin/users/:userId/notice - Send notice to specific user
router.post('/users/:userId/notice', async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, content, type, priority, responseRequired, responseType } = req.body || {};

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const notice = await Notice.create({
      title: title.trim(),
      content: content.trim(),
      type: type || 'NOTICE',
      priority: priority || 'NORMAL',
      targetType: 'SELECTED',
      targetClients: [userId],
      responseRequired: responseRequired || false,
      responseType: responseType || 'NONE',
      isActive: true,
    });

    // --- Notification Hook: Notify client about new notice ---
    try {
      await createNotification({
        recipientId: userId,
        type: NOTIFICATION_TYPES.NEW_NOTICE,
        title: 'New Announcement',
        message: `${title.trim().substring(0, 100)}${title.length > 100 ? '...' : ''}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.NOTICE,
          entityId: notice._id,
        },
        notifyByEmail: true, // Email trigger for important event
      });
      console.log(`[NEW_NOTICE] Notification sent to client ${userId}`);
    } catch (notifErr) {
      console.error('[NEW_NOTICE] Notification error (non-fatal):', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      notice: {
        id: notice._id.toString(),
        title: notice.title,
        type: notice.type,
        createdAt: notice.createdAt,
      },
    });
  } catch (err) {
    console.error('Failed to send notice:', err);
    return res.status(500).json({ error: 'Failed to send notice' });
  }
});

// POST /admin/users/:userId/assign-plan - Assign plan to user
router.post('/users/:userId/assign-plan', async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, creditCost } = req.body || {};

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const plan = await Task.findById(planId).exec();
    if (!plan || !plan.isListedInPlans) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Create task from plan without deducting wallet (admin assigned)
    const task = await Task.create({
      title: plan.title,
      description: stripHtmlTags(plan.description),
      clientId: userId,
      creditCost: creditCost || plan.creditCost,
      status: TASK_STATUS.ACTIVE,
      priority: plan.priority,
      progressMode: plan.progressMode,
      progress: 0,
      planId: plan._id,
      isListedInPlans: false,
      featureImage: plan.featureImage,
      planMedia: plan.planMedia,
    });

    return res.status(201).json({
      success: true,
      message: 'Plan assigned successfully',
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
      },
    });
  } catch (err) {
    console.error('Failed to assign plan:', err);
    return res.status(500).json({ error: 'Failed to assign plan' });
  }
});

// POST /admin/users/:userId/create-task - Create task for user
router.post('/users/:userId/create-task', async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, description, creditCost, priority, startDate, endDate, progressMode } = req.body || {};

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const task = await Task.create({
      title: title.trim(),
      description: description || '',
      clientId: userId,
      creditCost: creditCost || 0,
      status: TASK_STATUS.ACTIVE,
      priority: priority || 'NORMAL',
      progressMode: progressMode || 'PERCENTAGE',
      progress: 0,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      isListedInPlans: false,
    });

    return res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: {
        id: task._id.toString(),
        title: task.title,
        status: task.status,
      },
    });
  } catch (err) {
    console.error('Failed to create task:', err);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// GET /admin/users - Get all users with pagination and filters
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, sort = 'createdAt', order = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { role: ROLES.CLIENT, isDeleted: { $ne: true } };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { identifier: { $regex: search, $options: 'i' } },
        { 'profile.name': { $regex: search, $options: 'i' } },
      ];
    }

    const sortObj = {};
    sortObj[sort] = order === 'asc' ? 1 : -1;

    const users = await User.find(filter)
      .select('identifier profile status createdAt lastActivityAt')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    const total = await User.countDocuments(filter).exec();

    // Get wallet balances and task counts
    const userIds = users.map(u => u._id);
    const wallets = await Wallet.find({ clientId: { $in: userIds } }).exec();
    const walletMap = {};
    wallets.forEach(w => { walletMap[w.clientId.toString()] = w.balance; });

    const taskCounts = await Task.aggregate([
      { $match: { clientId: { $in: userIds }, isListedInPlans: { $ne: true } } },
      { $group: {
        _id: '$clientId',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.ACTIVE] }, 1, 0] } },
      }},
    ]);
    const taskMap = {};
    taskCounts.forEach(t => { taskMap[t._id.toString()] = { total: t.total, active: t.active }; });

    return res.status(200).json({
      users: users.map(u => ({
        id: u._id.toString(),
        identifier: u.identifier,
        name: u.profile?.name || '',
        avatarUrl: u.profile?.avatarUrl || null,
        status: u.status,
        walletBalance: walletMap[u._id.toString()] || 0,
        activeTasks: taskMap[u._id.toString()]?.active || 0,
        totalTasks: taskMap[u._id.toString()]?.total || 0,
        createdAt: u.createdAt,
        lastActivityAt: u.lastActivityAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('Failed to get users:', err);
    return res.status(500).json({ error: 'Failed to get users' });
  }
});

// POST /admin/users/:userId/suspend - Suspend user
router.post('/users/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    user.status = 'SUSPENDED';
    user.lastActivityAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User suspended successfully',
      user: {
        id: user._id.toString(),
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Failed to suspend user:', err);
    return res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// POST /admin/users/:userId/activate - Activate user
router.post('/users/:userId/activate', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    user.status = 'ACTIVE';
    user.lastActivityAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User activated successfully',
      user: {
        id: user._id.toString(),
        status: user.status,
      },
    });
  } catch (err) {
    console.error('Failed to activate user:', err);
    return res.status(500).json({ error: 'Failed to activate user' });
  }
});

// NOTE: DELETE /admin/users/:userId is defined earlier (line ~2712) with email re-use capability
// Duplicate route removed to prevent confusion

// POST /admin/users/:userId/wallet - Modify wallet balance
router.post('/users/:userId/wallet', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, amount, description } = req.body || {};

    if (!type || !['ADD', 'DEDUCT'].includes(type)) {
      return res.status(400).json({ error: 'Valid type (ADD or DEDUCT) is required' });
    }

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const user = await User.findById(userId).exec();
    if (!user || user.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    let wallet = await Wallet.findOne({ clientId: userId }).exec();
    if (!wallet) {
      wallet = await Wallet.create({ clientId: userId, balance: 0 });
    }

    const adjustmentAmount = type === 'ADD' ? parseFloat(amount) : -parseFloat(amount);
    const newBalance = wallet.balance + adjustmentAmount;

    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    wallet.balance = newBalance;
    await wallet.save();

    await WalletTransaction.create({
      walletId: wallet._id,
      type: TRANSACTION_TYPES.ADMIN_ADJUSTMENT,
      amount: adjustmentAmount,
      description: description || `Admin ${type.toLowerCase()} credits`,
      referenceId: null,
    });

    return res.status(200).json({
      success: true,
      message: 'Wallet updated successfully',
      balance: wallet.balance,
    });
  } catch (err) {
    console.error('Failed to update wallet:', err);
    return res.status(500).json({ error: 'Failed to update wallet' });
  }
});

// GET /admin/profile - Get admin's own profile
router.get('/profile', async (req, res) => {
  try {
    const adminId = req.user.id;

    const user = await User.findById(adminId).select('-passwordHash').exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get stats
    const totalUsers = await User.countDocuments({ role: ROLES.CLIENT, isDeleted: { $ne: true } }).exec();
    const activeUsers = await User.countDocuments({ role: ROLES.CLIENT, status: 'ACTIVE', isDeleted: { $ne: true } }).exec();
    const totalTasks = await Task.countDocuments({ isListedInPlans: { $ne: true } }).exec();
    const totalPlans = await Task.countDocuments({ isListedInPlans: true }).exec();

    return res.status(200).json({
      profile: {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        name: user.profile?.name || '',
        phone: user.profile?.phone || '',
        photoUrl: user.profile?.photoUrl || null,
        avatarUrl: user.profile?.avatarUrl || null,
        company: user.profile?.company || '',
        designation: user.profile?.designation || '',
        timezone: user.profile?.timezone || 'UTC',
        language: user.profile?.language || 'en',
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        // Branding
        appName: user.branding?.appName || 'Go Viral Ads',
        logoUrl: user.branding?.logoUrl || '',
        tagline: user.branding?.tagline || '',
        accentColor: user.branding?.accentColor || '#6366f1',
        secondaryColor: user.branding?.secondaryColor || '#22c55e',
      },
      stats: {
        totalUsers,
        activeUsers,
        totalTasks,
        totalPlans,
      },
    });
  } catch (err) {
    console.error('Failed to get admin profile:', err);
    return res.status(500).json({ error: 'Failed to get admin profile' });
  }
});

// PATCH /admin/profile - Update admin's own profile
router.patch('/profile', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { 
      name, phone, photoUrl, avatarUrl, company, designation, timezone, language,
      appName, logoUrl, tagline, accentColor, secondaryColor
    } = req.body || {};

    const user = await User.findById(adminId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Profile fields
    if (name !== undefined) user.profile.name = name.trim();
    if (phone !== undefined) user.profile.phone = phone.trim();
    if (photoUrl !== undefined) user.profile.photoUrl = photoUrl || null;
    if (avatarUrl !== undefined) user.profile.avatarUrl = avatarUrl || null;
    if (company !== undefined) user.profile.company = company.trim();
    if (designation !== undefined) user.profile.designation = designation.trim();
    if (timezone !== undefined) user.profile.timezone = timezone;
    if (language !== undefined) user.profile.language = language;

    // Branding fields (admin only)
    if (!user.branding) user.branding = {};
    if (appName !== undefined) user.branding.appName = appName.trim();
    if (logoUrl !== undefined) user.branding.logoUrl = logoUrl || '';
    if (tagline !== undefined) user.branding.tagline = tagline.trim();
    if (accentColor !== undefined) user.branding.accentColor = accentColor;
    if (secondaryColor !== undefined) user.branding.secondaryColor = secondaryColor;

    user.lastActivityAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      profile: {
        id: user._id.toString(),
        identifier: user.identifier,
        name: user.profile?.name || '',
        phone: user.profile?.phone || '',
        photoUrl: user.profile?.photoUrl || null,
        avatarUrl: user.profile?.avatarUrl || null,
        company: user.profile?.company || '',
        designation: user.profile?.designation || '',
        timezone: user.profile?.timezone || 'UTC',
        language: user.profile?.language || 'en',
        appName: user.branding?.appName || 'Go Viral Ads',
        logoUrl: user.branding?.logoUrl || '',
        tagline: user.branding?.tagline || '',
        accentColor: user.branding?.accentColor || '#6366f1',
        secondaryColor: user.branding?.secondaryColor || '#22c55e',
      },
    });
  } catch (err) {
    console.error('Failed to update admin profile:', err);
    return res.status(500).json({ error: 'Failed to update admin profile' });
  }
});

// POST /admin/profile/change-password - Change admin password
router.post('/profile/change-password', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(adminId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and update new password
    user.passwordHash = await hashPassword(newPassword);
    user.lastActivityAt = new Date();
    await user.save();

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Failed to change password:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

// ========== LEGAL PAGES MANAGEMENT ==========

// Get all legal pages
router.get('/legal-pages', async (req, res) => {
  try {
    const pages = await LegalPage.find().sort({ slug: 1 });
    return res.status(200).json({
      pages: pages.map(p => ({
        id: p._id.toString(),
        slug: p.slug,
        title: p.title,
        content: p.content,
        isPublished: p.isPublished,
        lastUpdated: p.lastUpdated,
        metaDescription: p.metaDescription,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch legal pages' });
  }
});

// Get single legal page
router.get('/legal-pages/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const page = await LegalPage.findOne({ slug });
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    return res.status(200).json({
      id: page._id.toString(),
      slug: page.slug,
      title: page.title,
      content: page.content,
      isPublished: page.isPublished,
      lastUpdated: page.lastUpdated,
      metaDescription: page.metaDescription,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch legal page' });
  }
});

// ===============================
// SUPPORT TICKETS (ADMIN)
// ===============================
const Ticket = require('../models/Ticket');

// Get all tickets
router.get('/tickets', async (req, res) => {
  try {
    const { status, priority, category } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    const tickets = await Ticket.find(filter)
      .populate('clientId', 'identifier profile.name')
      .sort({ updatedAt: -1 })
      .select('-messages')
      .exec();

    return res.status(200).json({
      tickets: tickets.map(t => ({
        id: t._id.toString(),
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        client: {
          id: t.clientId._id.toString(),
          identifier: t.clientId.identifier,
          name: t.clientId.profile?.name || t.clientId.identifier,
        },
        lastReplyAt: t.lastReplyAt,
        lastReplyBy: t.lastReplyBy,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get tickets' });
  }
});

// Get single ticket with messages
router.get('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findById(ticketId)
      .populate('clientId', 'identifier profile.name')
      .populate('relatedTaskId', 'title')
      .populate('assignedTo', 'identifier')
      .exec();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.status(200).json({
      ticket: {
        id: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        client: {
          id: ticket.clientId._id.toString(),
          identifier: ticket.clientId.identifier,
          name: ticket.clientId.profile?.name || ticket.clientId.identifier,
        },
        relatedTask: ticket.relatedTaskId ? {
          id: ticket.relatedTaskId._id.toString(),
          title: ticket.relatedTaskId.title,
        } : null,
        assignedTo: ticket.assignedTo ? {
          id: ticket.assignedTo._id.toString(),
          identifier: ticket.assignedTo.identifier,
        } : null,
        messages: ticket.messages.map(m => ({
          id: m._id.toString(),
          senderRole: m.senderRole,
          message: m.message,
          createdAt: m.createdAt,
        })),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get ticket' });
  }
});

// Admin reply to ticket
router.post('/tickets/:ticketId/reply', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    ticket.messages.push({
      senderId: adminId,
      senderRole: 'ADMIN',
      message: message.trim(),
    });
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = 'ADMIN';
    if (ticket.status === 'OPEN') {
      ticket.status = 'IN_PROGRESS';
    }

    await ticket.save();

    // Create notification for client
    try {
      await createNotification({
        recipientId: ticket.clientId,
        type: NOTIFICATION_TYPES.TICKET_REPLIED,
        title: 'Support Ticket Reply',
        message: `Admin replied to your ticket: ${ticket.subject}`,
        relatedEntity: {
          entityType: 'TICKET',
          entityId: ticket._id,
        },
      });
    } catch (err) {
      // Silent fail for notification
    }

    // Send email to client
    try {
      const reminderScheduler = require('../services/reminderScheduler');
      await reminderScheduler.sendTicketReplyEmail(ticket, message.trim(), 'CLIENT');
    } catch (err) {
      // Silent fail for email
    }

    return res.status(200).json({
      success: true,
      message: 'Reply added successfully',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add reply' });
  }
});

// Update ticket status
router.patch('/tickets/:ticketId/status', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, priority } = req.body;

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED'];
    const validPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' });
    }

    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (status === 'RESOLVED') ticket.resolvedAt = new Date();
    if (status === 'CLOSED') ticket.closedAt = new Date();

    await ticket.save();

    // --- Notification Hook (HIGH PRIORITY FIX) ---
    if (status) {
      try {
        await createNotification({
          recipientId: ticket.clientId,
          type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
          title: 'Ticket Status Updated',
          message: `Your ticket #${ticket.ticketNumber} status changed to: ${status}`,
          relatedEntity: {
            entityType: 'TICKET',
            entityId: ticket._id,
          },
        });
        console.log('[NOTIFICATION] Ticket status change notification sent to client');
      } catch (notifErr) {
        console.error('[NOTIFICATION] Failed to notify client of ticket status change:', notifErr.message);
      }
    }
    // ------------------------------------

    return res.status(200).json({
      success: true,
      ticket: {
        id: ticket._id.toString(),
        status: ticket.status,
        priority: ticket.priority,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Get ticket stats
router.get('/tickets-stats', async (req, res) => {
  try {
    const stats = await Ticket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {
      total: 0,
      open: 0,
      inProgress: 0,
      awaitingClient: 0,
      resolved: 0,
      closed: 0,
    };

    stats.forEach(s => {
      result.total += s.count;
      switch (s._id) {
        case 'OPEN': result.open = s.count; break;
        case 'IN_PROGRESS': result.inProgress = s.count; break;
        case 'AWAITING_CLIENT': result.awaitingClient = s.count; break;
        case 'RESOLVED': result.resolved = s.count; break;
        case 'CLOSED': result.closed = s.count; break;
      }
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get ticket stats' });
  }
});

// Update legal page
router.put('/legal-pages/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, isPublished, metaDescription } = req.body;
    const adminId = req.user.id;
    
    const page = await LegalPage.findOne({ slug });
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    if (title !== undefined) page.title = title;
    if (content !== undefined) page.content = content;
    if (isPublished !== undefined) page.isPublished = isPublished;
    if (metaDescription !== undefined) page.metaDescription = metaDescription;
    page.lastUpdated = new Date();
    page.updatedBy = adminId;
    
    await page.save();
    
    return res.status(200).json({
      success: true,
      page: {
        id: page._id.toString(),
        slug: page.slug,
        title: page.title,
        content: page.content,
        isPublished: page.isPublished,
        lastUpdated: page.lastUpdated,
        metaDescription: page.metaDescription,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update legal page' });
  }
});

// ===============================
// EMAIL REMINDER SETTINGS
// ===============================
const reminderScheduler = require('../services/reminderScheduler');

// Get email reminder settings
router.get('/email-reminder-settings', async (req, res) => {
  try {
    const settings = reminderScheduler.getSettings();
    return res.status(200).json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update email reminder settings
router.patch('/email-reminder-settings', async (req, res) => {
  try {
    const { taskDeadline, taskOverdue, planExpiry } = req.body;
    
    const updates = {};
    if (taskDeadline) updates.taskDeadline = taskDeadline;
    if (taskOverdue) updates.taskOverdue = taskOverdue;
    if (planExpiry) updates.planExpiry = planExpiry;
    
    reminderScheduler.updateSettings(updates);
    
    return res.status(200).json({
      success: true,
      settings: reminderScheduler.getSettings()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Manual trigger email reminders
router.post('/email-reminder-settings/trigger', async (req, res) => {
  try {
    const { type } = req.body; // 'deadline', 'overdue', 'expiry'
    
    if (!['deadline', 'overdue', 'expiry'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use: deadline, overdue, expiry' });
    }
    
    await reminderScheduler.triggerNow(type);
    
    return res.status(200).json({
      success: true,
      message: `${type} reminder check completed`
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to trigger reminder' });
  }
});

// ===============================
// OLD REMINDER SETTINGS (KEEP FOR COMPATIBILITY)
// ===============================
const { getReminderSettings, DEFAULT_SETTINGS, runReminderCheck } = require('../services/reminderService');

// Get reminder settings
router.get('/reminder-settings', async (req, res) => {
  try {
    const settings = await getReminderSettings();
    return res.status(200).json(settings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get reminder settings' });
  }
});

// Update reminder settings
router.patch('/reminder-settings', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { reminderDays, maxRemindersPerDay, customMessage, enabled } = req.body;

    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (!admin.settings) admin.settings = {};
    if (!admin.settings.reminders) admin.settings.reminders = { ...DEFAULT_SETTINGS };

    if (reminderDays !== undefined) admin.settings.reminders.reminderDays = reminderDays;
    if (maxRemindersPerDay !== undefined) admin.settings.reminders.maxRemindersPerDay = maxRemindersPerDay;
    if (customMessage !== undefined) admin.settings.reminders.customMessage = customMessage;
    if (enabled !== undefined) admin.settings.reminders.enabled = enabled;

    admin.markModified('settings');
    await admin.save();

    return res.status(200).json({
      success: true,
      settings: admin.settings.reminders
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update reminder settings' });
  }
});

// Manual trigger reminder check
router.post('/reminder-settings/run', async (req, res) => {
  try {
    const results = await runReminderCheck();
    return res.status(200).json({
      success: true,
      message: 'Reminder check completed',
      results: results?.length || 0
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to run reminder check' });
  }
});

// GET /admin/admin-users — list all admin users with their custom role (for role assignment UI)
router.get('/admin-users', async (req, res) => {
  try {
    const users = await User.find({ role: 'ADMIN', isDeleted: { $ne: true } })
      .select('identifier customRole status profile createdAt')
      .populate('customRole', 'id displayName')
      .sort({ createdAt: 1 })
      .exec();

    return res.status(200).json({
      users: users.map(u => ({
        id: u._id.toString(),
        identifier: u.identifier,
        name: u.profile?.name || '',
        status: u.status,
        customRole: u.customRole ? u.customRole._id.toString() : null,
        customRoleName: u.customRole?.displayName || null,
        createdAt: u.createdAt,
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get admin users' });
  }
});

// PATCH /admin/users/:userId/role — Update user's custom role
router.patch('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { customRole } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // SAFETY: Prevent main admin from losing access
    if (user.identifier === 'admin') {
      return res.status(400).json({ error: 'Cannot change role of main admin' });
    }
    
    if (customRole) {
      const role = await Role.findById(customRole);
      if (!role || !role.isActive) {
        return res.status(404).json({ error: 'Role not found or inactive' });
      }
      user.customRole = customRole;
    } else {
      user.customRole = null; // Remove role = full access
    }
    
    await user.save();
    
    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        customRole: user.customRole?.toString() || null,
      }
    });
  } catch (err) {
    console.error('[USER] Role update error:', err);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// ===============================
// CURRENT USER PERMISSIONS
// ===============================

// GET /admin/me/permissions — returns resolved permission set for the calling user
router.get('/me/permissions', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('customRole');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Main admin: no customRole — all permissions granted
    if (user.role === 'ADMIN' && !user.customRole) {
      return res.status(200).json({
        isMainAdmin: true,
        roleName: 'Main Admin',
        permissions: ALL_PERMISSIONS,
      });
    }

    // Sub-admin with a custom role
    return res.status(200).json({
      isMainAdmin: false,
      roleName: user.customRole?.displayName || null,
      permissions: user.customRole?.permissions || {},
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get permissions' });
  }
});

// ===============================
// ROLE & PERMISSION MANAGEMENT
// ===============================

// Create custom role
router.post('/roles', async (req, res) => {
  try {
    const { name, displayName, permissions } = req.body;
    
    if (!name || !displayName) {
      return res.status(400).json({ error: 'name and displayName are required' });
    }
    
    const existing = await Role.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: 'Role with this name already exists' });
    }
    
    const role = await Role.create({
      name: name.trim(),
      displayName: displayName.trim(),
      permissions: permissions || {},
      createdBy: req.user.id
    });
    
    return res.status(201).json({
      success: true,
      role: {
        id: role._id.toString(),
        name: role.name,
        displayName: role.displayName,
        permissions: role.permissions,
        isActive: role.isActive
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create role' });
  }
});

// Get all roles
router.get('/roles', async (req, res) => {
  try {
    const roles = await Role.find({ isActive: true }).sort({ createdAt: -1 });
    
    return res.status(200).json({
      roles: roles.map(r => ({
        id: r._id.toString(),
        name: r.name,
        displayName: r.displayName,
        permissions: r.permissions,
        isActive: r.isActive,
        createdAt: r.createdAt
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get roles' });
  }
});

// Update role
router.patch('/roles/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const { displayName, permissions, isActive } = req.body;
    
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    if (displayName !== undefined) role.displayName = displayName;
    if (permissions !== undefined) role.permissions = permissions;
    if (isActive !== undefined) role.isActive = isActive;
    
    await role.save();
    
    return res.status(200).json({
      success: true,
      role: {
        id: role._id.toString(),
        name: role.name,
        displayName: role.displayName,
        permissions: role.permissions,
        isActive: role.isActive
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
router.delete('/roles/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    role.isActive = false;
    await role.save();
    
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Assign role to user
router.post('/users/:userId/assign-role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { roleId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role || !role.isActive) {
        return res.status(404).json({ error: 'Role not found' });
      }
      user.customRole = roleId;
    } else {
      user.customRole = null;
    }
    
    await user.save();
    
    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        identifier: user.identifier,
        customRole: user.customRole ? user.customRole.toString() : null
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign role' });
  }
});

// ===============================
// CLIENT-MANAGER ASSIGNMENT
// ===============================

// Assign managers to client
router.post('/clients/:clientId/assign-managers', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { managerIds } = req.body; // Array of user IDs
    
    const client = await User.findById(clientId);
    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    if (!Array.isArray(managerIds)) {
      return res.status(400).json({ error: 'managerIds must be an array' });
    }
    
    // Verify all managers exist
    const managers = await User.find({ _id: { $in: managerIds }, isDeleted: false });
    if (managers.length !== managerIds.length) {
      return res.status(400).json({ error: 'One or more managers not found' });
    }
    
    client.assignedManagers = managerIds;
    await client.save();
    
    return res.status(200).json({
      success: true,
      client: {
        id: client._id.toString(),
        identifier: client.identifier,
        assignedManagers: client.assignedManagers.map(m => m.toString())
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign managers' });
  }
});

// Get client with managers
router.get('/clients/:clientId/managers', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const client = await User.findById(clientId).populate('assignedManagers', 'identifier profile.name');
    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    return res.status(200).json({
      client: {
        id: client._id.toString(),
        identifier: client.identifier,
        managers: client.assignedManagers.map(m => ({
          id: m._id.toString(),
          identifier: m.identifier,
          name: m.profile?.name || ''
        }))
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get managers' });
  }
});

// ===============================
// COMMISSION SETTINGS
// ===============================

// Update client commission settings
router.patch('/clients/:clientId/commission', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { enabled, percentage, recipients } = req.body;
    
    const client = await User.findById(clientId);
    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    if (!client.commissionSettings) {
      client.commissionSettings = { enabled: false, percentage: 0, recipients: [] };
    }
    
    if (enabled !== undefined) client.commissionSettings.enabled = enabled;
    if (percentage !== undefined) {
      if (percentage < 0 || percentage > 100) {
        return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
      }
      client.commissionSettings.percentage = percentage;
    }
    if (recipients !== undefined) client.commissionSettings.recipients = recipients;
    
    client.markModified('commissionSettings');
    await client.save();
    
    return res.status(200).json({
      success: true,
      commission: client.commissionSettings
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update commission settings' });
  }
});

// Update task commission settings
router.patch('/tasks/:taskId/commission', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { enabled, percentage, recipients } = req.body;
    
    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (!task.commissionSettings) {
      task.commissionSettings = { enabled: false, percentage: 0, recipients: [] };
    }
    
    if (enabled !== undefined) task.commissionSettings.enabled = enabled;
    if (percentage !== undefined) {
      if (percentage < 0 || percentage > 100) {
        return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
      }
      task.commissionSettings.percentage = percentage;
    }
    if (recipients !== undefined) task.commissionSettings.recipients = recipients;
    
    task.markModified('commissionSettings');
    await task.save();
    
    return res.status(200).json({
      success: true,
      commission: task.commissionSettings
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update task commission' });
  }
});

// =============================================
// OFFICE CMS CONFIG ENDPOINTS
// =============================================

// GET Office Config
router.get('/office-config', async (req, res) => {
  try {
    const config = await OfficeConfig.getConfig();
    return res.status(200).json({ config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch office config' });
  }
});

// UPDATE Office Config (full or partial)
router.patch('/office-config', async (req, res) => {
  try {
    const updates = req.body;
    let config = await OfficeConfig.getConfig();
    
    // Update allowed fields
    const allowedFields = [
      'banners', 'bannerAutoRotate', 'bannerRotateInterval',
      'sections', 'featuredPlansConfig', 'seeMoreButtonConfig',
      'updatesSectionConfig', 'requirementsSectionConfig', 'pageTitle'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        config[field] = updates[field];
      }
    });
    
    config.lastUpdatedBy = req.user._id;
    config.updatedAt = new Date();
    await config.save();
    
    return res.status(200).json({ config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update office config' });
  }
});

// ADD Banner
router.post('/office-config/banners', async (req, res) => {
  try {
    const { title, subtitle, gradient, imageUrl, ctaText, ctaLink, ctaLinkType } = req.body;
    
    // Title is now optional - no validation required
    
    const config = await OfficeConfig.getConfig();
    const newBanner = {
      id: `banner_${Date.now()}`,
      title: title || '',
      subtitle: subtitle || '',
      gradient: gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      imageUrl: imageUrl || '',
      ctaText: ctaText || '',
      ctaLink: ctaLink || '',
      ctaLinkType: ctaLinkType || 'internal',
      isActive: true,
      order: config.banners.length
    };
    
    config.banners.push(newBanner);
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(201).json({ banner: newBanner, config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add banner' });
  }
});

// UPDATE Banner
router.patch('/office-config/banners/:bannerId', async (req, res) => {
  try {
    const { bannerId } = req.params;
    const updates = req.body;
    
    const config = await OfficeConfig.getConfig();
    const bannerIndex = config.banners.findIndex(b => b.id === bannerId);
    
    if (bannerIndex === -1) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    
    const allowedBannerFields = ['title', 'subtitle', 'gradient', 'imageUrl', 'ctaText', 'ctaLink', 'ctaLinkType', 'isActive', 'order'];
    allowedBannerFields.forEach(field => {
      if (updates[field] !== undefined) {
        config.banners[bannerIndex][field] = updates[field];
      }
    });
    
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(200).json({ banner: config.banners[bannerIndex], config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update banner' });
  }
});

// DELETE Banner
router.delete('/office-config/banners/:bannerId', async (req, res) => {
  try {
    const { bannerId } = req.params;
    const config = await OfficeConfig.getConfig();
    
    const bannerIndex = config.banners.findIndex(b => b.id === bannerId);
    if (bannerIndex === -1) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    
    if (config.banners.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last banner. At least one banner is required.' });
    }
    
    config.banners.splice(bannerIndex, 1);
    // Reorder
    config.banners.forEach((b, i) => b.order = i);
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(200).json({ success: true, config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// REORDER Banners
router.post('/office-config/banners/reorder', async (req, res) => {
  try {
    const { bannerIds } = req.body; // Array of banner IDs in new order
    
    if (!Array.isArray(bannerIds)) {
      return res.status(400).json({ error: 'bannerIds must be an array' });
    }
    
    const config = await OfficeConfig.getConfig();
    const reorderedBanners = [];
    
    bannerIds.forEach((id, index) => {
      const banner = config.banners.find(b => b.id === id);
      if (banner) {
        banner.order = index;
        reorderedBanners.push(banner);
      }
    });
    
    config.banners = reorderedBanners;
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(200).json({ config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reorder banners' });
  }
});

// UPDATE Sections Order/Visibility
router.patch('/office-config/sections', async (req, res) => {
  try {
    const { sections } = req.body;
    
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }
    
    const config = await OfficeConfig.getConfig();
    
    sections.forEach(update => {
      const section = config.sections.find(s => s.id === update.id);
      if (section) {
        if (update.title !== undefined) section.title = update.title;
        if (update.icon !== undefined) section.icon = update.icon;
        if (update.isEnabled !== undefined) section.isEnabled = update.isEnabled;
        if (update.order !== undefined) section.order = update.order;
      }
    });
    
    // Sort by order
    config.sections.sort((a, b) => a.order - b.order);
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(200).json({ config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update sections' });
  }
});

// UPDATE Featured Plans Config
router.patch('/office-config/featured-plans', async (req, res) => {
  try {
    const { displayCount, selectionMode, manualPlanIds, showSeeAllButton, seeAllButtonText } = req.body;
    
    const config = await OfficeConfig.getConfig();
    
    if (displayCount !== undefined) {
      if (displayCount < 2 || displayCount > 12) {
        return res.status(400).json({ error: 'displayCount must be between 2 and 12' });
      }
      config.featuredPlansConfig.displayCount = displayCount;
    }
    if (selectionMode !== undefined) {
      if (!['auto', 'manual'].includes(selectionMode)) {
        return res.status(400).json({ error: 'selectionMode must be auto or manual' });
      }
      config.featuredPlansConfig.selectionMode = selectionMode;
    }
    if (manualPlanIds !== undefined) config.featuredPlansConfig.manualPlanIds = manualPlanIds;
    if (showSeeAllButton !== undefined) config.featuredPlansConfig.showSeeAllButton = showSeeAllButton;
    if (seeAllButtonText !== undefined) config.featuredPlansConfig.seeAllButtonText = seeAllButtonText;
    
    config.lastUpdatedBy = req.user._id;
    await config.save();
    
    return res.status(200).json({ config });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update featured plans config' });
  }
});

// =============================================
// BILLING ROUTES
// =============================================

// GET /admin/billing/config - Fetch billing configuration
router.get('/billing/config', async (req, res) => {
  try {
    const config = await BillingConfig.getConfig();
    return res.status(200).json({
      config: {
        id: config._id.toString(),
        companyName: config.companyName,
        companyAddress: config.companyAddress,
        companyGST: config.companyGST,
        companyPAN: config.companyPAN,
        companyEmail: config.companyEmail,
        companyPhone: config.companyPhone,
        companyLogo: config.companyLogo,
        invoicePrefix: config.invoicePrefix,
        receiptPrefix: config.receiptPrefix,
        currencySymbol: config.currencySymbol,
        currencyCode: config.currencyCode,
        defaultClientInvoiceDownload: config.defaultClientInvoiceDownload,
        defaultClientReceiptDownload: config.defaultClientReceiptDownload,
        updatedAt: config.updatedAt,
      }
    });
  } catch (err) {
    console.error('[BILLING] Config fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch billing config' });
  }
});

// PATCH /admin/billing/config - Update billing configuration
router.patch('/billing/config', async (req, res) => {
  try {
    const updates = req.body;
    // Only allow specific fields to be updated
    const allowedFields = [
      'companyName', 'companyAddress', 'companyGST', 'companyPAN',
      'companyEmail', 'companyPhone', 'companyLogo',
      'invoicePrefix', 'receiptPrefix', 'currencySymbol', 'currencyCode',
      'defaultClientInvoiceDownload', 'defaultClientReceiptDownload'
    ];
    const safeUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }
    const config = await billingService.updateBillingConfig(safeUpdates);
    return res.status(200).json({
      config: {
        id: config._id.toString(),
        companyName: config.companyName,
        companyAddress: config.companyAddress,
        companyGST: config.companyGST,
        companyPAN: config.companyPAN,
        companyEmail: config.companyEmail,
        companyPhone: config.companyPhone,
        companyLogo: config.companyLogo,
        invoicePrefix: config.invoicePrefix,
        receiptPrefix: config.receiptPrefix,
        currencySymbol: config.currencySymbol,
        currencyCode: config.currencyCode,
        defaultClientInvoiceDownload: config.defaultClientInvoiceDownload,
        defaultClientReceiptDownload: config.defaultClientReceiptDownload,
        updatedAt: config.updatedAt,
      }
    });
  } catch (err) {
    console.error('[BILLING] Config update error:', err.message);
    return res.status(500).json({ error: 'Failed to update billing config' });
  }
});

// GET /admin/billing/invoices - List all invoices with filters
router.get('/billing/invoices', async (req, res) => {
  try {
    const { clientId, status, dateFrom, dateTo } = req.query;
    const invoices = await billingService.getInvoices({ clientId, status, dateFrom, dateTo });
    return res.status(200).json({
      invoices: invoices.map(inv => ({
        id: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId?._id?.toString() || '',
        clientIdentifier: inv.clientId?.identifier || '',
        clientName: inv.clientId?.profile?.name || inv.clientId?.identifier || '',
        rechargeRequestId: inv.rechargeRequestId?.toString() || '',
        amount: inv.amount,
        paymentMethod: inv.paymentMethod,
        paymentReference: inv.paymentReference,
        status: inv.status,
        isDownloadableByClient: inv.isDownloadableByClient,
        generatedBy: inv.generatedBy?.identifier || '',
        notes: inv.notes,
        createdAt: inv.createdAt,
      }))
    });
  } catch (err) {
    console.error('[BILLING] Invoices fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /admin/billing/receipts - List all receipts with filters
router.get('/billing/receipts', async (req, res) => {
  try {
    const { clientId, status, taskId, dateFrom, dateTo } = req.query;
    const receipts = await billingService.getReceipts({ clientId, status, taskId, dateFrom, dateTo });
    return res.status(200).json({
      receipts: receipts.map(rcp => ({
        id: rcp._id.toString(),
        receiptNumber: rcp.receiptNumber,
        clientId: rcp.clientId?._id?.toString() || '',
        clientIdentifier: rcp.clientId?.identifier || '',
        clientName: rcp.clientId?.profile?.name || rcp.clientId?.identifier || '',
        taskId: rcp.taskId?._id?.toString() || '',
        taskTitle: rcp.taskTitle || rcp.taskId?.title || '',
        creditsUsed: rcp.creditsUsed,
        status: rcp.status,
        isDownloadableByClient: rcp.isDownloadableByClient,
        createdAt: rcp.createdAt,
      }))
    });
  } catch (err) {
    console.error('[BILLING] Receipts fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch receipts' });
  }
});

// PATCH /admin/billing/invoices/:id/download-toggle - Toggle invoice download permission
router.patch('/billing/invoices/:id/download-toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isDownloadableByClient } = req.body;
    const invoice = await billingService.toggleInvoiceDownload(id, isDownloadableByClient);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return res.status(200).json({ success: true, isDownloadableByClient: invoice.isDownloadableByClient });
  } catch (err) {
    console.error('[BILLING] Invoice toggle error:', err.message);
    return res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// PATCH /admin/billing/receipts/:id/download-toggle - Toggle receipt download permission
router.patch('/billing/receipts/:id/download-toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isDownloadableByClient } = req.body;
    const receipt = await billingService.toggleReceiptDownload(id, isDownloadableByClient);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    return res.status(200).json({ success: true, isDownloadableByClient: receipt.isDownloadableByClient });
  } catch (err) {
    console.error('[BILLING] Receipt toggle error:', err.message);
    return res.status(500).json({ error: 'Failed to update receipt' });
  }
});

// GET /admin/billing/invoices/:id/pdf - Download invoice PDF
router.get('/billing/invoices/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const invoice = await billingService.getInvoiceById(id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const pdfBuffer = await pdfService.generateInvoicePDF(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[BILLING] Invoice PDF error:', err.message);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /admin/billing/receipts/:id/pdf - Download receipt PDF
router.get('/billing/receipts/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const receipt = await billingService.getReceiptById(id);
    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }
    const pdfBuffer = await pdfService.generateReceiptPDF(receipt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${receipt.receiptNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[BILLING] Receipt PDF error:', err.message);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// ======================================================================
// CREDIT PLANS CRUD (Admin manages credit plans for wallet upgrade)
// NOTE: This does NOT modify wallet logic - only plan definitions
// ======================================================================

// GET /admin/credit-plans - List all credit plans
router.get('/credit-plans', async (req, res) => {
  try {
    const plans = await CreditPlan.find()
      .sort({ type: 1, displayOrder: 1, price: 1 })
      .exec();
    
    return res.status(200).json({
      plans: plans.map(p => ({
        id: p._id.toString(),
        name: p.name,
        price: p.price,
        credits: p.credits,
        bonusCredits: p.bonusCredits,
        totalCredits: p.totalCredits,
        type: p.type,
        description: p.description,
        displayOrder: p.displayOrder,
        validityDays: p.validityDays,
        visibility: p.visibility || 'public',
        visibleToUsers: (p.visibleToUsers || []).map(id => id.toString()),
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }))
    });
  } catch (err) {
    console.error('[CREDIT_PLANS] List error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve credit plans' });
  }
});

// POST /admin/credit-plans - Create a new credit plan
router.post('/credit-plans', async (req, res) => {
  try {
    const { name, price, credits, bonusCredits, type, description, displayOrder, isActive } = req.body || {};
    
    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Plan name is required' });
    }
    if (price === undefined || typeof price !== 'number' || price < 1) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }
    if (credits === undefined || typeof credits !== 'number' || credits < 0) {
      return res.status(400).json({ error: 'Credits must be a non-negative number' });
    }
    
    const { validityDays, visibility, visibleToUsers } = req.body || {};
    const plan = await CreditPlan.create({
      name: name.trim(),
      price,
      credits,
      bonusCredits: bonusCredits || 0,
      type: type === 'PACK' ? 'PACK' : 'PLAN',
      description: description ? description.trim() : '',
      displayOrder: displayOrder || 0,
      validityDays: (validityDays && validityDays > 0) ? validityDays : 30,
      visibility: ['public', 'private', 'selected'].includes(visibility) ? visibility : 'public',
      visibleToUsers: Array.isArray(visibleToUsers) ? visibleToUsers : [],
      isActive: isActive !== false
    });
    
    console.log(`[CREDIT_PLANS] Created: ${plan.name} (${plan.type}) - ₹${plan.price}`);
    
    return res.status(201).json({
      id: plan._id.toString(),
      name: plan.name,
      price: plan.price,
      credits: plan.credits,
      bonusCredits: plan.bonusCredits,
      totalCredits: plan.totalCredits,
      type: plan.type,
      description: plan.description,
      displayOrder: plan.displayOrder,
      validityDays: plan.validityDays,
      visibility: plan.visibility,
      visibleToUsers: (plan.visibleToUsers || []).map(id => id.toString()),
      isActive: plan.isActive
    });
  } catch (err) {
    console.error('[CREDIT_PLANS] Create error:', err.message);
    return res.status(500).json({ error: 'Failed to create credit plan' });
  }
});

// PATCH /admin/credit-plans/:id - Update a credit plan
router.patch('/credit-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, credits, bonusCredits, type, description, displayOrder, isActive, validityDays, visibility, visibleToUsers } = req.body || {};
    
    const plan = await CreditPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ error: 'Credit plan not found' });
    }
    
    // Update only provided fields
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Plan name cannot be empty' });
      }
      plan.name = name.trim();
    }
    if (price !== undefined) {
      if (typeof price !== 'number' || price < 1) {
        return res.status(400).json({ error: 'Price must be a positive number' });
      }
      plan.price = price;
    }
    if (credits !== undefined) {
      if (typeof credits !== 'number' || credits < 0) {
        return res.status(400).json({ error: 'Credits must be a non-negative number' });
      }
      plan.credits = credits;
    }
    if (bonusCredits !== undefined) {
      if (typeof bonusCredits !== 'number' || bonusCredits < 0) {
        return res.status(400).json({ error: 'Bonus credits must be a non-negative number' });
      }
      plan.bonusCredits = bonusCredits;
    }
    if (type !== undefined) {
      plan.type = type === 'PACK' ? 'PACK' : 'PLAN';
    }
    if (description !== undefined) {
      plan.description = description ? description.trim() : '';
    }
    if (displayOrder !== undefined) {
      plan.displayOrder = displayOrder || 0;
    }
    if (isActive !== undefined) {
      plan.isActive = Boolean(isActive);
    }
    if (validityDays !== undefined && validityDays > 0) {
      plan.validityDays = validityDays;
    }
    if (visibility !== undefined && ['public', 'private', 'selected'].includes(visibility)) {
      plan.visibility = visibility;
    }
    if (visibleToUsers !== undefined) {
      plan.visibleToUsers = Array.isArray(visibleToUsers) ? visibleToUsers : [];
    }
    
    await plan.save();
    
    console.log(`[CREDIT_PLANS] Updated: ${plan.name} (${plan._id})`);
    
    return res.status(200).json({
      id: plan._id.toString(),
      name: plan.name,
      price: plan.price,
      credits: plan.credits,
      bonusCredits: plan.bonusCredits,
      totalCredits: plan.totalCredits,
      type: plan.type,
      description: plan.description,
      displayOrder: plan.displayOrder,
      validityDays: plan.validityDays,
      visibility: plan.visibility,
      visibleToUsers: (plan.visibleToUsers || []).map(id => id.toString()),
      isActive: plan.isActive
    });
  } catch (err) {
    console.error('[CREDIT_PLANS] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update credit plan' });
  }
});

// DELETE /admin/credit-plans/:id - Delete a credit plan
router.delete('/credit-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const plan = await CreditPlan.findById(id);
    if (!plan) {
      return res.status(404).json({ error: 'Credit plan not found' });
    }
    
    const planName = plan.name;
    await plan.deleteOne();
    
    console.log(`[CREDIT_PLANS] Deleted: ${planName} (${id})`);
    
    return res.status(200).json({ success: true, message: 'Credit plan deleted' });
  } catch (err) {
    console.error('[CREDIT_PLANS] Delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete credit plan' });
  }
});

// ======================================================================
// COUPON CRUD (Admin manages coupons for subscription plan purchases)
// ======================================================================

// GET /admin/coupons - List all coupons
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).exec();
    return res.status(200).json({
      coupons: coupons.map(c => ({
        id: c._id.toString(),
        code: c.code,
        type: c.type,
        value: c.value,
        isActive: c.isActive,
        expiryDate: c.expiryDate,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    });
  } catch (err) {
    console.error('[COUPONS] List error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve coupons' });
  }
});

// POST /admin/coupons - Create a coupon
router.post('/coupons', async (req, res) => {
  try {
    const { code, type, value, isActive, expiryDate } = req.body || {};
    if (!code || !type || value === undefined) {
      return res.status(400).json({ error: 'code, type, and value are required' });
    }
    if (!['discount', 'bonus'].includes(type)) {
      return res.status(400).json({ error: 'type must be discount or bonus' });
    }
    if (type === 'discount' && (value <= 0 || value > 100)) {
      return res.status(400).json({ error: 'Discount value must be between 1 and 100' });
    }
    if (type === 'bonus' && value <= 0) {
      return res.status(400).json({ error: 'Bonus value must be positive' });
    }
    const coupon = await Coupon.create({
      code: code.toUpperCase().trim(),
      type,
      value,
      isActive: isActive !== false,
      expiryDate: expiryDate || null,
    });
    console.log(`[COUPONS] Created: ${coupon.code}`);
    return res.status(201).json({
      id: coupon._id.toString(),
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      isActive: coupon.isActive,
      expiryDate: coupon.expiryDate,
      createdAt: coupon.createdAt,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Coupon code already exists' });
    console.error('[COUPONS] Create error:', err.message);
    return res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// PATCH /admin/coupons/:id - Update a coupon
router.patch('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, type, value, isActive, expiryDate } = req.body || {};
    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    if (code !== undefined) coupon.code = code.toUpperCase().trim();
    if (type !== undefined) {
      if (!['discount', 'bonus'].includes(type)) return res.status(400).json({ error: 'type must be discount or bonus' });
      coupon.type = type;
    }
    if (value !== undefined) coupon.value = value;
    if (isActive !== undefined) coupon.isActive = Boolean(isActive);
    if (expiryDate !== undefined) coupon.expiryDate = expiryDate || null;
    await coupon.save();
    console.log(`[COUPONS] Updated: ${coupon.code}`);
    return res.status(200).json({
      id: coupon._id.toString(),
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      isActive: coupon.isActive,
      expiryDate: coupon.expiryDate,
      updatedAt: coupon.updatedAt,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Coupon code already exists' });
    console.error('[COUPONS] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// DELETE /admin/coupons/:id - Delete a coupon
router.delete('/coupons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    await coupon.deleteOne();
    console.log(`[COUPONS] Deleted: ${coupon.code}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[COUPONS] Delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

// ============================================================
// ADMIN SETTINGS (Phase 5 - Invoice Branding)
// ============================================================

// GET /admin/settings - Get agency/branding settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    return res.status(200).json({
      settings: {
        agencyName: settings.agencyName || 'Go Viral Ads',
        agencyAddress: settings.agencyAddress || '',
        supportEmail: settings.supportEmail || '',
        gstNumber: settings.gstNumber || '',
        logoUrl: settings.logoUrl || '',
        phoneNumber: settings.phoneNumber || '',
        websiteUrl: settings.websiteUrl || '',
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    console.error('[SETTINGS] Get error:', err.message);
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PATCH /admin/settings - Update agency/branding settings
router.patch('/settings', async (req, res) => {
  try {
    const { agencyName, agencyAddress, supportEmail, gstNumber, logoUrl, phoneNumber, websiteUrl } = req.body || {};
    
    const updates = {};
    if (agencyName !== undefined) updates.agencyName = agencyName.trim();
    if (agencyAddress !== undefined) updates.agencyAddress = agencyAddress.trim();
    if (supportEmail !== undefined) updates.supportEmail = supportEmail.trim();
    if (gstNumber !== undefined) updates.gstNumber = gstNumber.trim();
    if (logoUrl !== undefined) updates.logoUrl = logoUrl.trim();
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber.trim();
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl.trim();
    
    const settings = await Settings.updateSettings(updates);
    
    console.log(`[SETTINGS] Updated by admin ${req.user.id}`);
    
    return res.status(200).json({
      success: true,
      settings: {
        agencyName: settings.agencyName,
        agencyAddress: settings.agencyAddress,
        supportEmail: settings.supportEmail,
        gstNumber: settings.gstNumber,
        logoUrl: settings.logoUrl,
        phoneNumber: settings.phoneNumber,
        websiteUrl: settings.websiteUrl,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    console.error('[SETTINGS] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ===== COMMISSION TRACKING =====

// GET /admin/commissions - Get commission logs with aggregation
router.get('/commissions', async (req, res) => {
  try {
    const adminUser = await User.findById(req.user.id);
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    const { startDate, endDate, userId } = req.query;
    
    // Build date filter
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    
    // STEP 6: Non-main-admin users can only see their own commissions
    const isMainAdmin = adminUser.identifier === 'admin' || adminUser.role === ROLES.ADMIN;
    if (!isMainAdmin) {
      filter.userId = adminUser._id;
    } else if (userId) {
      // Main admin can filter by specific user
      filter.userId = userId;
    }
    
    // Get commission logs
    const logs = await CommissionLog.find(filter)
      .populate('userId', 'identifier')
      .sort({ createdAt: -1 })
      .limit(500);
    
    // Aggregate by user
    const userAggregation = await CommissionLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$userId',
          totalAmount: { $sum: '$amount' },
          taskCount: { $sum: 1 },
        },
      },
    ]);
    
    // Get overall total
    const overallTotal = userAggregation.reduce((sum, u) => sum + u.totalAmount, 0);
    const overallTaskCount = userAggregation.reduce((sum, u) => sum + u.taskCount, 0);
    
    // Populate user details for aggregation
    const userIds = userAggregation.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('identifier');
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u.identifier; });
    
    const userSummary = userAggregation.map(u => ({
      userId: u._id.toString(),
      userIdentifier: userMap[u._id.toString()] || 'Unknown',
      totalAmount: u.totalAmount,
      taskCount: u.taskCount,
    }));
    
    // Get list of admin users for filter dropdown (main admin only)
    let adminUsers = [];
    if (isMainAdmin) {
      adminUsers = await User.find({ role: { $in: ['admin', 'ADMIN'] } })
        .select('_id identifier')
        .sort({ identifier: 1 });
    }
    
    return res.status(200).json({
      success: true,
      logs: logs.map(l => ({
        id: l._id.toString(),
        userId: l.userId?._id?.toString() || null,
        userIdentifier: l.userId?.identifier || 'Unknown',
        taskId: l.taskId?.toString(),
        taskTitle: l.taskTitle,
        amount: l.amount,
        commissionType: l.commissionType,
        commissionValue: l.commissionValue,
        createdAt: l.createdAt,
      })),
      userSummary,
      overallTotal,
      overallTaskCount,
      adminUsers: adminUsers.map(u => ({ id: u._id.toString(), identifier: u.identifier })),
      isMainAdmin,
    });
  } catch (err) {
    console.error('[COMMISSIONS] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});

module.exports = router;
