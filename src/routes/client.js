const express = require('express');
const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task, TASK_STATUS } = require('../models/Task');
const { Category } = require('../models/Category');
const TaskTemplate = require('../models/TaskTemplate');
const Subscription = require('../models/Subscription');
const Notice = require('../models/Notice');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { Invoice, INVOICE_STATUS } = require('../models/Invoice');
const CreditPlan = require('../models/CreditPlan');
const UserSubscription = require('../models/UserSubscription');
const Coupon = require('../models/Coupon');
const { SubscriptionRequest, SUBSCRIPTION_REQUEST_STATUS } = require('../models/SubscriptionRequest');
const billingService = require('../services/billingService');
const pdfService = require('../services/pdfService');
const User = require('../models/User');
const OfficeConfig = require('../models/OfficeConfig');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { purchaseTaskFromTemplate, updateTaskProgressAutomatically } = require('../services/taskService');
const { getClientWalletSummary, getClientTaskSummary, getClientRecentActivity } = require('../services/reportingService');
const { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsRead, createNotification, getUnreadCount, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
const { authenticateJWT } = require('../middleware/auth');
const { requireClient } = require('../middleware/authorization');

const router = express.Router();

router.use(authenticateJWT);
router.use(requireClient);

router.get('/wallet', async (req, res) => {
  try {
    const clientId = req.user.id;

    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Check if subscription is expired
    const now = new Date();
    const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
    const activeSubCredits = subNotExpired ? (wallet.subscriptionCredits || 0) : 0;
    
    // DEBUG: Log all wallet fields
    console.log('[WALLET_DEBUG]', {
      walletCredits: wallet.walletCredits,
      balance: wallet.balance,
      subscriptionCredits: wallet.subscriptionCredits
    });
    
    // SINGLE SOURCE OF TRUTH: walletCredits only (ignore legacy balance)
    const walletCredits = wallet.walletCredits || 0;
    const totalCredits = activeSubCredits + walletCredits;

    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ 
      walletId: wallet._id,
      isHidden: { $ne: true }  // Don't show hidden admin adjustments
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalTransactions = await WalletTransaction.countDocuments({ 
      walletId: wallet._id,
      isHidden: { $ne: true }
    }).exec();

    return res.status(200).json({
      balance: totalCredits, // totalCredits for backward compatibility
      subscriptionCredits: activeSubCredits,
      walletCredits: walletCredits,
      totalCredits: totalCredits,
      subscriptionExpiresAt: subNotExpired ? wallet.subscriptionExpiresAt : null,
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        credits: t.credits || 0,
        description: t.description,
        createdAt: t.createdAt,
      })),
      pagination: {
        page,
        limit,
        total: totalTransactions,
        totalPages: Math.ceil(totalTransactions / limit),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve wallet' });
  }
});

router.post('/wallet/recharge', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { amount, paymentReference } = req.body || {};

    if (!amount || !paymentReference) {
      return res.status(400).json({ error: 'amount and paymentReference are required' });
    }

    if (typeof amount !== 'number' || amount < 100 || amount > 100000) {
      return res.status(400).json({ error: 'amount must be between 100 and 100000' });
    }

    if (typeof paymentReference !== 'string' || paymentReference.trim().length === 0) {
      return res.status(400).json({ error: 'paymentReference must be a non-empty string' });
    }

    const pendingCount = await RechargeRequest.countDocuments({
      clientId,
      status: RECHARGE_STATUS.PENDING,
    }).exec();

    if (pendingCount >= 3) {
      return res.status(400).json({ error: 'Maximum 3 pending recharge requests allowed' });
    }

    const rechargeRequest = await RechargeRequest.create({
      clientId,
      amount,
      paymentReference: paymentReference.trim(),
      status: RECHARGE_STATUS.PENDING,
    });

    // --- Notification Hook (Phase 5) ---
    try {
      const mainAdmin = require('../../config').MAIN_ADMIN_ID;
      if (mainAdmin) {
        await createNotification({
          recipientId: mainAdmin,
          type: NOTIFICATION_TYPES.RECHARGE_REQUEST_SUBMITTED,
          title: 'New Recharge Request',
          message: `Client ${req.user.identifier} submitted a recharge request for ${amount} credits.`,
          relatedEntity: {
            entityType: ENTITY_TYPES.RECHARGE_REQUEST,
            entityId: rechargeRequest._id,
          },
          notifyByEmail: true, // Email trigger for admin
        });
      }
    } catch (err) {
      console.error('Failed to notify admin of recharge request:', err.message);
    }
    // ------------------------------------

    return res.status(201).json({
      id: rechargeRequest._id.toString(),
      amount: rechargeRequest.amount,
      paymentReference: rechargeRequest.paymentReference,
      status: rechargeRequest.status,
      createdAt: rechargeRequest.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create recharge request' });
  }
});

// GET /client/credit-plans - Get active credit plans for wallet upgrade
// NOTE: This only returns plan definitions - does NOT modify wallet logic
router.get('/credit-plans', async (req, res) => {
  try {
    const userId = req.user.id;
    const allPlans = await CreditPlan.find({ isActive: true })
      .sort({ type: 1, displayOrder: 1, price: 1 })
      .exec();

    // Filter by visibility
    const plans = allPlans.filter(p => {
      if (p.visibility === 'private') return false;
      if (p.visibility === 'selected') {
        return (p.visibleToUsers || []).some(uid => uid.toString() === userId);
      }
      return true; // public
    });
    
    return res.status(200).json({
      plans: plans.map(p => ({
        id: p._id.toString(),
        name: p.name,
        price: p.price,
        credits: p.credits,
        bonusCredits: p.bonusCredits,
        totalCredits: p.totalCredits,
        type: p.type,
        validityDays: p.validityDays,
        description: p.description
      }))
    });
  } catch (err) {
    console.error('[CREDIT_PLANS] Client fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve credit plans' });
  }
});

// POST /client/credit-plans/:id/purchase - Submit subscription request (requires admin approval)
// Does NOT deduct from wallet - only creates a pending request
router.post('/credit-plans/:id/purchase', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.id;
    const { couponCode } = req.body || {};

    console.log('=== SUBSCRIPTION REQUEST SUBMIT ===');
    console.log('Client:', clientId, '| Plan:', id, '| Coupon:', couponCode || 'none');

    // 1. Load plan first
    const plan = await CreditPlan.findById(id).exec();
    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: 'Subscription plan not found or inactive' });
    }

    // 2. Check for existing pending request FOR SAME PLAN
    const existingPendingSamePlan = await SubscriptionRequest.findOne({
      clientId,
      planId: plan._id,
      status: SUBSCRIPTION_REQUEST_STATUS.PENDING
    }).exec();
    if (existingPendingSamePlan) {
      return res.status(400).json({ error: 'Request already pending for this plan' });
    }

    // 3. Get wallet to check active subscription
    const now = new Date();
    const wallet = await Wallet.findOne({ clientId }).exec();
    
    // 4. SINGLE-ACTIVE SUBSCRIPTION RULE
    if (wallet) {
      const hasActiveSubscription = 
        wallet.subscriptionExpiresAt && 
        new Date(wallet.subscriptionExpiresAt) > now && 
        (wallet.subscriptionCredits || 0) > 0;
      
      if (hasActiveSubscription) {
        const currentPlanPrice = wallet.currentPlanPrice || 0;
        const newPlanPrice = plan.price || 0;
        
        // Check if same plan (by ID or price)
        if (wallet.currentPlanId && wallet.currentPlanId.toString() === plan._id.toString()) {
          return res.status(400).json({ error: 'You already have this plan active' });
        }
        
        // Check if lower/same price plan (downgrade blocked)
        if (newPlanPrice <= currentPlanPrice) {
          return res.status(400).json({ error: 'Cannot downgrade to a lower plan. Use remaining credits first.' });
        }
        
        // Higher price = upgrade allowed
        console.log(`[SUB_REQ] Upgrade detected: ₹${currentPlanPrice} → ₹${newPlanPrice}`);
      }
    }

    // DEBUG: Log full plan object
    console.log('[SUB_REQ] FULL PLAN OBJECT:', JSON.stringify(plan, null, 2));
    
    // Calculate credits: plan.credits + plan.bonusCredits
    const planCredits = Number(plan.credits) || 0;
    const planBonusCredits = Number(plan.bonusCredits) || 0;
    
    let finalPrice = plan.price;
    let totalCredits = planCredits + planBonusCredits;
    let couponDiscount = 0;
    let appliedCouponCode = null;

    // 3. Validate coupon if provided (but don't check balance yet)
    if (couponCode) {
      const now = new Date();
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() }).exec();
      if (!coupon) return res.status(400).json({ error: 'Invalid coupon code' });
      if (!coupon.isActive) return res.status(400).json({ error: 'Coupon is not active' });
      if (coupon.expiryDate && coupon.expiryDate < now) {
        return res.status(400).json({ error: 'Coupon has expired' });
      }
      appliedCouponCode = coupon.code;
      if (coupon.type === 'discount') {
        couponDiscount = coupon.value;
        finalPrice = Math.max(0, finalPrice * (1 - coupon.value / 100));
        finalPrice = Math.round(finalPrice * 100) / 100;
        console.log(`[COUPON] discount ${coupon.value}% → finalPrice: ${finalPrice}`);
      } else if (coupon.type === 'bonus') {
        totalCredits += coupon.value;
        console.log(`[COUPON] bonus +${coupon.value} credits → totalCredits: ${totalCredits}`);
      }
    }

    // 4. Create subscription request - use calculated plan values
    console.log('[SUB_REQ] Saving to request:', { planCredits, planBonusCredits, totalCredits });
    
    const subRequest = await SubscriptionRequest.create({
      clientId,
      planId: plan._id,
      planName: plan.name,
      planPrice: plan.price,
      planCredits: planCredits,
      planBonusCredits: planBonusCredits,
      planValidityDays: plan.validityDays || 30,
      couponCode: appliedCouponCode,
      couponDiscount,
      finalPrice,
      totalCredits,
      status: SUBSCRIPTION_REQUEST_STATUS.PENDING,
    });

    console.log(`[SUB_REQ] Created request ${subRequest._id} for plan ${plan.name}`);
    console.log('=== SUBSCRIPTION REQUEST SUBMIT COMPLETE ===');

    // 5. Notify admin (async, don't wait)
    try {
      const { createNotification } = require('../services/notificationService');
      const User = require('../models/User');
      const client = await User.findById(clientId).exec();
      const admins = await User.find({ role: { $in: ['ADMIN', 'MAIN_ADMIN'] } }).exec();
      for (const admin of admins) {
        await createNotification({
          recipientId: admin._id,
          type: 'SUBSCRIPTION_REQUEST_SUBMITTED',
          title: 'New Subscription Request',
          message: `${client?.identifier || 'A client'} requested subscription: ${plan.name} (₹${finalPrice})`,
          relatedEntity: { entityType: 'SUBSCRIPTION_REQUEST', entityId: subRequest._id },
          notifyByEmail: true,
        });
      }
      // Also notify the client
      await createNotification({
        recipientId: clientId,
        type: 'NEW_UPDATE',
        title: 'Subscription Request Submitted',
        message: `Your request for ${plan.name} (₹${finalPrice}) has been submitted. Awaiting admin approval.`,
        relatedEntity: { entityType: 'SUBSCRIPTION_REQUEST', entityId: subRequest._id },
      });
    } catch (notifErr) {
      console.error('[SUB_REQ] Notification error:', notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Subscription request submitted. Waiting for admin approval.',
      request: {
        id: subRequest._id.toString(),
        planId: subRequest.planId?.toString() || id,
        planName: subRequest.planName,
        finalPrice: subRequest.finalPrice,
        totalCredits: subRequest.totalCredits,
        status: subRequest.status,
        createdAt: subRequest.createdAt,
      },
    });
  } catch (err) {
    console.error('[SUB_REQ] Submit error:', err.message);
    return res.status(500).json({ error: 'Failed to submit subscription request' });
  }
});

// GET /client/subscription-requests - Get client's subscription requests
router.get('/subscription-requests', async (req, res) => {
  try {
    const clientId = req.user.id;
    const requests = await SubscriptionRequest.find({ clientId })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();
    
    return res.status(200).json({
      requests: requests.map(r => ({
        id: r._id.toString(),
        planId: r.planId?.toString() || null,
        planName: r.planName,
        planPrice: r.planPrice,
        finalPrice: r.finalPrice,
        totalCredits: r.totalCredits,
        couponCode: r.couponCode,
        status: r.status,
        createdAt: r.createdAt,
        rejectionReason: r.rejectionReason,
      })),
    });
  } catch (err) {
    console.error('[SUB_REQ] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch subscription requests' });
  }
});

// GET /client/my-subscription - Get current active subscription for the logged-in client
router.get('/my-subscription', async (req, res) => {
  try {
    const clientId = req.user.id;
    const now = new Date();

    // Expire stale subscriptions on every call (lightweight guard)
    await UserSubscription.updateMany(
      { isActive: true, expiresAt: { $lt: now } },
      { $set: { isActive: false, creditsRemaining: 0 } }
    );

    const sub = await UserSubscription.findOne({ userId: clientId, isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    if (!sub) {
      // Return most recent expired subscription so the client can show an expired banner
      const recentExpired = await UserSubscription.findOne({ userId: clientId })
        .sort({ expiresAt: -1 })
        .exec();
      return res.status(200).json({
        subscription: null,
        recentExpired: recentExpired ? {
          planName: recentExpired.planName,
          expiresAt: recentExpired.expiresAt,
          isActive: false
        } : null
      });
    }

    return res.status(200).json({
      subscription: {
        id: sub._id.toString(),
        planName: sub.planName,
        creditsRemaining: sub.creditsRemaining,
        expiresAt: sub.expiresAt,
        isActive: sub.isActive,
        createdAt: sub.createdAt,
      }
    });
  } catch (err) {
    console.error('[SUB] my-subscription error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve subscription' });
  }
});

router.get('/wallet/recharge-requests', async (req, res) => {
  try {
    const clientId = req.user.id;

    const requests = await RechargeRequest.find({ clientId })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      requests: requests.map((r) => ({
        id: r._id.toString(),
        amount: r.amount,
        paymentReference: r.paymentReference,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve recharge requests' });
  }
});

// GET /client/coupons - Return active, non-expired coupons for client display
// Only shows code, type, value and expiry — no business logic changed
router.get('/coupons', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      $or: [
        { expiryDate: null },
        { expiryDate: { $gt: now } }
      ]
    })
      .select('code type value expiryDate')
      .sort({ value: -1 })
      .lean();

    return res.status(200).json({
      coupons: coupons.map(c => ({
        id: c._id.toString(),
        code: c.code,
        type: c.type,
        value: c.value,
        expiryDate: c.expiryDate || null,
      }))
    });
  } catch (err) {
    console.error('[GET /client/coupons] error:', err.message);
    return res.status(500).json({ error: 'Failed to load coupons' });
  }
});

// Get task details
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const clientId = req.user.id;

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Ensure the task belongs to the current client
    if (task.clientId.toString() !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // === SAME PROCESSING LOGIC AS GET /tasks LIST ===
    const now = new Date();
    let needsSave = false;
    let currentStatus = task.status;
    let currentProgress = task.progress;
    let currentMilestones = task.milestones || [];

    // Auto-start scheduled tasks if startDate has passed
    if (currentStatus === 'PENDING' && task.startDate && new Date(task.startDate) <= now) {
      task.status = 'ACTIVE';
      currentStatus = 'ACTIVE';
      needsSave = true;
      console.log(`[SINGLE-TASK] Task ${task._id} auto-started`);
    }

    // Recalculate progress for AUTO mode tasks
    if (task.progressMode === 'AUTO' && task.startDate && task.endDate) {
      const start = new Date(task.startDate);
      const end = new Date(task.endDate);
      const cap = task.autoCompletionCap || 100;
      
      if (now < start) {
        currentProgress = 0;
      } else if (now >= end) {
        currentProgress = cap;
      } else {
        const totalDuration = end - start;
        const elapsed = now - start;
        currentProgress = Math.min((elapsed / totalDuration) * 100, cap);
      }
      currentProgress = Math.round(currentProgress * 10) / 10;
      
      if (Math.abs(currentProgress - task.progress) > 0.1) {
        task.progress = currentProgress;
        needsSave = true;
      }
    } else if (task.progressMode === 'MANUAL') {
      // MANUAL mode: progress is admin-controlled.
      // Do NOT recalculate from progressAchieved.
      currentProgress = task.progress || 0;
    }

    // Evaluate milestones based on current progress
    if (currentMilestones.length > 0) {
      let milestonesChanged = false;
      currentMilestones = currentMilestones.map(m => {
        const shouldBeReached = currentProgress >= m.percentage;
        if (shouldBeReached && !m.reached) {
          milestonesChanged = true;
          return { ...m.toObject ? m.toObject() : m, reached: true, reachedAt: now };
        } else if (!shouldBeReached && m.reached) {
          milestonesChanged = true;
          return { ...m.toObject ? m.toObject() : m, reached: false, reachedAt: null };
        }
        return m.toObject ? m.toObject() : m;
      });
      if (milestonesChanged) {
        task.milestones = currentMilestones;
        needsSave = true;
      }
    }

    // Auto-update status based on progress
    if (currentStatus !== 'CANCELLED' && currentStatus !== 'PENDING_APPROVAL') {
      if (currentProgress >= 100 && currentStatus !== 'COMPLETED') {
        task.status = 'COMPLETED';
        currentStatus = 'COMPLETED';
        needsSave = true;
      } else if (currentProgress > 0 && currentStatus === 'PENDING') {
        task.status = 'ACTIVE';
        currentStatus = 'ACTIVE';
        needsSave = true;
      }
    }

    // Save if any changes detected
    if (needsSave) {
      await task.save();
      console.log(`[SINGLE-TASK SYNC] Task ${task._id} updated: status=${task.status}, progress=${task.progress}`);
    }

    // Log milestones for verification
    console.log(`[SINGLE-TASK] Task ${task._id} milestones:`, JSON.stringify(currentMilestones));

    return res.status(200).json({
      task: {
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        creditCost: task.creditCost,
        creditsUsed: task.creditsUsed || 0,
        priority: task.priority,
        startDate: task.startDate,
        endDate: task.endDate,
        publicNotes: task.publicNotes,
        progressMode: task.progressMode,
        progress: currentProgress,
        progressTarget: task.progressTarget,
        progressAchieved: task.progressAchieved,
        showProgressDetails: task.showProgressDetails,
        status: currentStatus,
        deadline: task.deadline || task.endDate,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        // PLAN SYSTEM EXTENSIONS (CLIENT VISIBILITY)
        quantity: task.quantity,
        showQuantityToClient: task.showQuantityToClient,
        showCreditsToClient: task.showCreditsToClient,
        featureImage: task.featureImage,
        offerPrice: task.offerPrice,
        originalPrice: task.originalPrice,
        countdownEndDate: task.countdownEndDate,
        // MILESTONES - CRITICAL FIX
        milestones: currentMilestones.map(m => ({
          name: m.name,
          percentage: m.percentage,
          color: m.color,
          reached: m.reached || false,
          reachedAt: m.reachedAt || null,
        })),
        // CLIENT CONTENT SUBMISSION (Phase 2)
        clientContentText: task.clientContentText || '',
        clientContentLinks: task.clientContentLinks || [],
        clientDriveLink: task.clientDriveLink || '',
        clientContentSubmittedAt: task.clientContentSubmittedAt || null,
        clientContentSubmitted: task.clientContentSubmitted || false,
        // CLIENT UPLOAD FOLDER (Phase 4B)
        clientUploadFolderLink: task.clientUploadFolderLink || '',
        // FINAL DELIVERY (Phase 3)
        finalDeliveryLink: task.finalDeliveryLink || '',
        finalDeliveryText: task.finalDeliveryText || '',
        finalDeliveredAt: task.finalDeliveredAt || null,
        // TASK DISCUSSION (Phase 6)
        messages: (task.messages || []).map(m => ({
          sender: m.sender,
          text: m.text,
          attachments: m.attachments || [],
          createdAt: m.createdAt,
        })),
        // APPROVAL REQUESTS (Phase 7) - Only visible ones
        approvalRequests: (task.approvalRequests || [])
          .filter(a => a.isVisibleToClient !== false)
          .map(a => ({
            id: a.id,
            title: a.title,
            type: a.type,
            options: a.options || [],
            selectionsHistory: (a.selectionsHistory || []).map(h => ({
              selectedOptions: h.selectedOptions || [],
              selectedBy: h.selectedBy,
              timestamp: h.timestamp,
            })),
            isLocked: a.isLocked || false,
            createdAt: a.createdAt,
          })),
        // PROGRESS ICON
        progressIcon: task.progressIcon || { type: 'default', value: '' },
      },
    });
  } catch (err) {
    console.error('[SINGLE-TASK ERROR]', err);
    return res.status(500).json({ error: 'Failed to retrieve task' });
  }
});

// ======================================================================
// CLIENT CONTENT SUBMISSION (Phase 2)
// Allows client to submit content for their purchased task
// ======================================================================
router.post('/tasks/:taskId/content', async (req, res) => {
  try {
    const { taskId } = req.params;
    const clientId = req.user.id;
    const { contentText, contentLinks, driveLink } = req.body || {};

    // Find the task
    const task = await Task.findById(taskId).exec();
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Ensure the task belongs to the current client
    if (!task.clientId || task.clientId.toString() !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only allow content submission for active/pending tasks (not completed/cancelled)
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot submit content for completed or cancelled tasks' });
    }

    // Validate contentText (optional, max 5000 chars)
    if (contentText !== undefined) {
      if (typeof contentText !== 'string') {
        return res.status(400).json({ error: 'contentText must be a string' });
      }
      if (contentText.length > 5000) {
        return res.status(400).json({ error: 'contentText cannot exceed 5000 characters' });
      }
      task.clientContentText = contentText.trim();
    }

    // Validate contentLinks (optional, array of strings, max 10)
    if (contentLinks !== undefined) {
      if (!Array.isArray(contentLinks)) {
        return res.status(400).json({ error: 'contentLinks must be an array' });
      }
      if (contentLinks.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 content links allowed' });
      }
      // Filter out empty strings and validate each link
      const validLinks = contentLinks
        .filter(link => typeof link === 'string' && link.trim().length > 0)
        .map(link => link.trim());
      task.clientContentLinks = validLinks;
    }

    // Validate driveLink (optional, string)
    if (driveLink !== undefined) {
      if (typeof driveLink !== 'string') {
        return res.status(400).json({ error: 'driveLink must be a string' });
      }
      task.clientDriveLink = driveLink.trim();
    }

    // Mark content as submitted
    task.clientContentSubmittedAt = new Date();
    task.clientContentSubmitted = true;

    await task.save();

    console.log(`[CONTENT_SUBMIT] Task ${taskId} content submitted by client ${clientId}`);

    return res.status(200).json({
      success: true,
      message: 'Content submitted successfully',
      task: {
        id: task._id.toString(),
        clientContentText: task.clientContentText,
        clientContentLinks: task.clientContentLinks,
        clientDriveLink: task.clientDriveLink,
        clientContentSubmittedAt: task.clientContentSubmittedAt,
        clientContentSubmitted: task.clientContentSubmitted,
      }
    });
  } catch (err) {
    console.error('[CONTENT_SUBMIT ERROR]', err);
    return res.status(500).json({ error: 'Failed to submit content' });
  }
});

// ======================================================================
// TASK DISCUSSION SYSTEM (Phase 6)
// Client can send messages within task context
// ======================================================================
router.post('/tasks/:taskId/message', async (req, res) => {
  try {
    const { taskId } = req.params;
    const clientId = req.user.id;
    const { text, attachments } = req.body || {};

    // Allow empty text if there are attachments
    if ((!text || !text.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message text or attachment is required' });
    }

    if (text && text.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    // Validate attachments (URLs only, max 5)
    if (attachments && attachments.length > 0) {
      if (attachments.length > 5) {
        return res.status(400).json({ error: 'Maximum 5 attachments allowed' });
      }
      for (const att of attachments) {
        if (typeof att !== 'string' || !att.startsWith('http')) {
          return res.status(400).json({ error: 'Attachments must be valid URLs' });
        }
      }
    }

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (task.clientId.toString() !== clientId) {
      return res.status(403).json({ error: 'Not authorized to message on this task' });
    }

    // Add message
    const newMessage = {
      sender: 'CLIENT',
      senderId: clientId,
      text: (text || '').trim() || (attachments?.length ? '[Image]' : ''),
      attachments: attachments || [],
      createdAt: new Date(),
    };

    task.messages = task.messages || [];
    task.messages.push(newMessage);
    await task.save();
    console.log('[DISCUSSION] Client message saved to task:', taskId);

    // Notify admin(s) with email
    try {
      const { createNotification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
      const admins = await User.find({ role: 'ADMIN', isDeleted: { $ne: true } }).select('_id').exec();
      const adminUrl = process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL || 'https://admin.goviralads.com';
      const taskUrl = `${adminUrl}/tasks/${task._id}?scrollToChat=true`;
      
      // Get last 3 messages for email preview
      const recentMessages = (task.messages || []).slice(-3).map(m => ({
        sender: m.sender,
        text: m.text.substring(0, 100) + (m.text.length > 100 ? '...' : ''),
        createdAt: m.createdAt
      }));
      
      for (const admin of admins) {
        await createNotification({
          recipientId: admin._id,
          type: NOTIFICATION_TYPES.TASK_MESSAGE,
          title: `New message on: ${task.title}`,
          message: (text || '').trim().substring(0, 200) + ((text || '').length > 200 ? '...' : ''),
          relatedEntity: { entityType: ENTITY_TYPES.TASK, entityId: task._id },
          taskUrl: taskUrl,
          recentMessages: recentMessages,
          notifyByEmail: true,
        });
      }
      console.log(`[DISCUSSION] Notified ${admins.length} admin(s) with email`);
    } catch (notifErr) {
      console.error('[DISCUSSION] Notification error:', notifErr.message);
    }

    console.log(`[DISCUSSION] Client ${clientId} sent message on task ${taskId}`);

    return res.status(200).json({
      success: true,
      message: newMessage,
    });
  } catch (err) {
    console.error('[DISCUSSION ERROR]', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// =======================================================================
// APPROVAL REQUEST SYSTEM (Phase 7) - Client Endpoints
// =======================================================================

// POST /client/tasks/:taskId/approvals/:approvalId/select - Submit selection
router.post('/tasks/:taskId/approvals/:approvalId/select', async (req, res) => {
  try {
    const { taskId, approvalId } = req.params;
    const clientId = req.user.id;
    const { selectedOptions } = req.body || {};

    // Validation
    if (!selectedOptions || !Array.isArray(selectedOptions) || selectedOptions.length === 0) {
      return res.status(400).json({ error: 'At least one option must be selected' });
    }

    const task = await Task.findById(taskId).exec();
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify task belongs to client
    if (task.clientId?.toString() !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const approval = task.approvalRequests?.find(a => a.id === approvalId);
    if (!approval) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    // Check if visible to client
    if (!approval.isVisibleToClient) {
      return res.status(403).json({ error: 'Approval request is not visible' });
    }

    // Check if locked
    if (approval.isLocked) {
      return res.status(403).json({ error: 'Approval request is locked' });
    }

    // Validate selected options
    const validOptions = approval.options || [];
    const invalidSelections = selectedOptions.filter(opt => !validOptions.includes(opt));
    if (invalidSelections.length > 0) {
      return res.status(400).json({ error: 'Invalid option(s) selected' });
    }

    // For single type, only allow one selection
    if (approval.type === 'single' && selectedOptions.length > 1) {
      return res.status(400).json({ error: 'Only one option can be selected for single-type approvals' });
    }

    // Add to history
    approval.selectionsHistory = approval.selectionsHistory || [];
    approval.selectionsHistory.push({
      selectedOptions: selectedOptions.map(o => o.trim()),
      selectedBy: 'CLIENT',
      timestamp: new Date(),
    });

    await task.save();

    // Notify admin(s)
    try {
      const { createNotification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
      const admins = await User.find({ role: 'ADMIN', isDeleted: { $ne: true } }).select('_id').exec();
      const adminUrl = process.env.ADMIN_FRONTEND_URL || process.env.ADMIN_URL || 'https://admin.goviralads.com';
      const taskUrl = `${adminUrl}/tasks/${task._id}?scrollToChat=true`;
      
      for (const admin of admins) {
        await createNotification({
          recipientId: admin._id,
          type: NOTIFICATION_TYPES.TASK_MESSAGE,
          title: `Approval updated: ${task.title}`,
          message: `Client selected: ${selectedOptions.join(', ')}`,
          relatedEntity: { entityType: ENTITY_TYPES.TASK, entityId: task._id },
          taskUrl: taskUrl,
          notifyByEmail: true,
        });
      }
      console.log(`[APPROVAL] Notified ${admins.length} admin(s) of client selection`);
    } catch (notifErr) {
      console.error('[APPROVAL] Notification error:', notifErr.message);
    }

    console.log(`[APPROVAL] Client ${clientId} submitted selection on approval ${approvalId}`);

    return res.status(200).json({
      success: true,
      approval,
    });
  } catch (err) {
    console.error('[APPROVAL SELECTION ERROR]', err);
    return res.status(500).json({ error: 'Failed to submit selection' });
  }
});

router.get('/task-templates', async (req, res) => {
  try {
    const templates = await TaskTemplate.find({ isActive: true })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      templates: templates.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        description: t.description,
        creditCost: t.creditCost,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task templates' });
  }
});

router.post('/tasks/purchase', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { templateId, priority, startDate, endDate, publicNotes, progressMode } = req.body || {};

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    // Prepare task options with additional fields
    const taskOptions = {
      priority: priority || 'Medium',  // Default to Medium
      startDate: startDate || new Date(),
      endDate: endDate || null,
      publicNotes: publicNotes || '',
      progressMode: progressMode || 'AUTO',
    };
    
    const result = await purchaseTaskFromTemplate(clientId, templateId, taskOptions);
    
    // If progress mode is AUTO, update progress automatically
    if (result.task.progressMode === 'AUTO') {
      await updateTaskProgressAutomatically(result.task._id);
    }

    // --- Notification Hook (Phase 5) ---
    try {
      const mainAdmin = require('../../config').MAIN_ADMIN_ID;
      if (mainAdmin) {
        await createNotification({
          recipientId: mainAdmin,
          type: NOTIFICATION_TYPES.TASK_PURCHASED,
          title: 'New Task Purchased',
          message: `Client ${req.user.identifier} purchased a task: ${result.task.title}`,
          relatedEntity: {
            entityType: ENTITY_TYPES.TASK,
            entityId: result.task._id,
          },
          notifyByEmail: true, // Email trigger for admin
        });
      }
    } catch (err) {
      console.error('Failed to notify admin of task purchase:', err.message);
    }
    // ------------------------------------

    return res.status(201).json({
      task: {
        id: result.task._id.toString(),
        title: result.task.title,
        description: result.task.description,
        creditCost: result.task.creditCost,
        priority: result.task.priority,
        startDate: result.task.startDate,
        endDate: result.task.endDate,
        publicNotes: result.task.publicNotes,
        progressMode: result.task.progressMode,
        progress: result.task.progress,
        status: result.task.status,
        createdAt: result.task.createdAt,
      },
      walletBalance: result.newBalance,
      transactionId: result.transaction._id.toString(),
    });
  } catch (err) {
    if (err.message === 'Insufficient balance') {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    if (err.message === 'Task template not found') {
      return res.status(404).json({ error: 'Task template not found' });
    }
    if (err.message === 'Task template is not available') {
      return res.status(400).json({ error: 'Task template is not available' });
    }
    return res.status(500).json({ error: 'Failed to purchase task' });
  }
});

router.get('/plans', async (req, res) => {
  console.log('[FORENSIC] ===== GET /client/plans CALLED =====');
  try {
    const clientId = req.user.id;
    const { categoryId, search, sort } = req.query;
    
    console.log('[FORENSIC] Client ID:', clientId);
    console.log('[FORENSIC] Category filter:', categoryId || 'ALL');
    console.log('[FORENSIC] Search:', search || 'none');
    console.log('[FORENSIC] Sort:', sort || 'default');

    // STRICT VISIBILITY: Only active plans with proper visibility
    let query = { 
      isListedInPlans: true, 
      clientId: null,
      isActivePlan: true,
      $or: [
        { visibility: 'PUBLIC' },
        { visibility: 'SELECTED', allowedClients: clientId },
      ]
    };
    
    console.log('[FORENSIC] Query filter:', JSON.stringify(query));
    
    // Category filter
    if (categoryId && categoryId !== 'ALL') {
      query.categoryId = categoryId;
    }
    
    let plansQuery = Task.find(query)
      .populate('categoryId', 'name icon color slug');
    
    // Sorting
    switch(sort) {
      case 'price_low':
        plansQuery = plansQuery.sort({ creditCost: 1 });
        break;
      case 'price_high':
        plansQuery = plansQuery.sort({ creditCost: -1 });
        break;
      case 'newest':
      default:
        plansQuery = plansQuery.sort({ createdAt: -1 });
    }
    
    const allPlans = await plansQuery.exec();
    
    console.log('[FORENSIC] Plans found from DB:', allPlans.length);
    allPlans.forEach(p => console.log('[FORENSIC] - Plan:', p.title, '| Active:', p.isActivePlan));
    
    // Filter by targetClients
    let filteredPlans = allPlans.filter(plan => {
      if (!plan.targetClients || plan.targetClients.length === 0) {
        return true;
      }
      return plan.targetClients.some(targetId => targetId.toString() === clientId);
    });
    
    // Search filter (client-side after DB query for now)
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredPlans = filteredPlans.filter(p => 
        p.title?.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower)
      );
    }
    
    console.log('Plans found:', filteredPlans.length);
    
    return res.status(200).json({
      plans: filteredPlans.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        creditCost: p.creditCost,
        featureImage: p.featureImage,
        planMedia: p.planMedia,
        offerPrice: p.offerPrice,
        originalPrice: p.originalPrice,
        countdownEndDate: p.countdownEndDate,
        quantity: p.showQuantityToClient ? p.quantity : null,
        showCreditsToClient: p.showCreditsToClient,
        progressTarget: p.progressTarget,
        categoryId: p.categoryId ? p.categoryId._id.toString() : null,
        categoryName: p.categoryId ? p.categoryId.name : null,
        categoryIcon: p.categoryId ? p.categoryId.icon : null,
        categoryColor: p.categoryId ? p.categoryId.color : null,
        publicNotes: p.publicNotes,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    console.error('Client marketplace error:', err);
    return res.status(500).json({ error: 'Failed to retrieve marketplace plans' });
  }
});

// GET /client/categories - Get all active categories for marketplace
router.get('/categories', async (req, res) => {
  try {
    console.log('[CLIENT CATEGORIES] Fetching active categories');
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .exec();
    
    console.log('[CLIENT CATEGORIES] Found', categories.length, 'active categories');
    
    // Get plan counts for each category
    const categoryCounts = await Task.aggregate([
      { $match: { isListedInPlans: true, clientId: null, isActivePlan: { $ne: false } } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);
    
    const countMap = {};
    categoryCounts.forEach(c => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });
    
    // Count uncategorized plans
    const uncategorizedCount = await Task.countDocuments({
      isListedInPlans: true,
      clientId: null,
      isActivePlan: { $ne: false },
      categoryId: null
    });

    return res.status(200).json({
      categories: [
        // Add "All" pseudo-category
        {
          id: 'ALL',
          name: 'All',
          icon: '🏠',
          color: '#6366f1',
          slug: 'all',
          planCount: categoryCounts.reduce((sum, c) => sum + c.count, 0) + uncategorizedCount
        },
        ...categories.map(c => ({
          id: c._id.toString(),
          name: c.name,
          slug: c.slug,
          icon: c.icon,
          image: c.image,
          color: c.color,
          description: c.description,
          planCount: countMap[c._id.toString()] || 0,
        }))
      ],
    });
  } catch (err) {
    console.error('Categories error:', err);
    return res.status(500).json({ error: 'Failed to retrieve categories' });
  }
});

// GET /client/plans/:planId - Get single plan detail
router.get('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const clientId = req.user.id;
    
    const plan = await Task.findById(planId)
      .populate('categoryId', 'name icon color slug')
      .exec();
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (!plan.isListedInPlans || plan.clientId !== null) {
      return res.status(404).json({ error: 'Plan not available' });
    }
    
    // Check if plan is active
    if (!plan.isActivePlan) {
      return res.status(404).json({ error: 'Plan not available' });
    }
    
    // Check visibility rules
    const visibility = plan.visibility || 'PUBLIC';
    if (visibility === 'HIDDEN') {
      return res.status(404).json({ error: 'Plan not available' });
    }
    if (visibility === 'SELECTED') {
      const allowedClients = plan.allowedClients || [];
      const isAllowed = allowedClients.some(id => id.toString() === clientId);
      if (!isAllowed) {
        return res.status(404).json({ error: 'Plan not available' });
      }
    }
    
    // Check targeting (legacy field)
    if (plan.targetClients && plan.targetClients.length > 0) {
      const isTargeted = plan.targetClients.some(targetId => targetId.toString() === clientId);
      if (!isTargeted) {
        return res.status(403).json({ error: 'You are not eligible for this plan' });
      }
    }
    
    return res.status(200).json({
      plan: {
        id: plan._id.toString(),
        title: plan.title,
        description: plan.description,
        creditCost: plan.creditCost,
        featureImage: plan.featureImage,
        planMedia: plan.planMedia,
        offerPrice: plan.offerPrice,
        originalPrice: plan.originalPrice,
        countdownEndDate: plan.countdownEndDate,
        quantity: plan.showQuantityToClient ? plan.quantity : null,
        showQuantityToClient: plan.showQuantityToClient,
        showCreditsToClient: plan.showCreditsToClient,
        progressTarget: plan.progressTarget,
        progressMode: plan.progressMode,
        milestones: plan.milestones,
        categoryId: plan.categoryId ? plan.categoryId._id.toString() : null,
        categoryName: plan.categoryId ? plan.categoryId.name : null,
        categoryIcon: plan.categoryId ? plan.categoryId.icon : null,
        categoryColor: plan.categoryId ? plan.categoryId.color : null,
        publicNotes: plan.publicNotes,
        createdAt: plan.createdAt,
      },
    });
  } catch (err) {
    console.error('Plan detail error:', err);
    return res.status(500).json({ error: 'Failed to retrieve plan' });
  }
});

// PLAN PURCHASE ENDPOINT (PHASE D - STEP 3)
router.post('/plans/:planId/purchase', async (req, res) => {
  try {
    const { planId } = req.params;
    const clientId = req.user.id;

    // 1. Fetch the plan
    const plan = await Task.findById(planId).exec();

    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // 2. Validate it's a plan
    if (!plan.isListedInPlans) {
      return res.status(400).json({ error: 'This is not a purchasable plan' });
    }

    if (plan.clientId !== null) {
      return res.status(400).json({ error: 'This plan is no longer available' });
    }

    // 3. Check if plan is active
    if (!plan.isActivePlan) {
      return res.status(400).json({ error: 'This plan is not available' });
    }

    // 4. Check visibility rules
    const visibility = plan.visibility || 'PUBLIC';
    if (visibility === 'HIDDEN') {
      return res.status(400).json({ error: 'This plan is not available' });
    }
    if (visibility === 'SELECTED') {
      const allowedClients = plan.allowedClients || [];
      const isAllowed = allowedClients.some(id => id.toString() === clientId);
      if (!isAllowed) {
        return res.status(403).json({ error: 'You are not eligible for this plan' });
      }
    }

    // 5. Check targeting (legacy)
    if (plan.targetClients && plan.targetClients.length > 0) {
      const isTargeted = plan.targetClients.some(targetId => targetId.toString() === clientId);
      if (!isTargeted) {
        return res.status(403).json({ error: 'You are not eligible for this plan' });
      }
    }

    // 6. Determine price
    const price = plan.offerPrice || plan.creditCost || 0;

    // 7. Get wallet
    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // 8. HYBRID CREDIT DEDUCTION: subscriptionCredits first, then walletCredits
    const now = new Date();
    const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
    const availableSubCredits = subNotExpired ? (wallet.subscriptionCredits || 0) : 0;
    const availableWalletCredits = wallet.walletCredits || 0;
    const totalAvailable = availableSubCredits + availableWalletCredits;

    if (totalAvailable < price) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    // Calculate deduction: subscriptionCredits FIRST, then walletCredits
    const subDeduct = Math.min(availableSubCredits, price);
    const remaining = price - subDeduct;
    const walletDeduct = Math.min(availableWalletCredits, remaining);

    // ATOMIC UPDATE
    const incUpdate = {};
    if (subDeduct > 0) incUpdate.subscriptionCredits = -subDeduct;
    if (walletDeduct > 0) incUpdate.walletCredits = -walletDeduct;

    await Wallet.findByIdAndUpdate(wallet._id, { $inc: incUpdate });

    // Create wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: subDeduct > 0 ? 'SUBSCRIPTION_DEDUCTION' : 'PLAN_PURCHASE',
      amount: 0,
      credits: -price,
      description: `Plan Purchase: ${plan.title}`,
      referenceId: null,
    });

    // 9. Clone task for client (DO NOT MODIFY ORIGINAL)
    const newTask = await Task.create({
      title: plan.title,
      description: plan.description,
      creditCost: plan.creditCost,
      creditsUsed: price,
      priority: plan.priority,
      startDate: null, // Admin sets dates on approval
      endDate: null,
      publicNotes: plan.publicNotes,
      internalNotes: plan.internalNotes,
      progressMode: plan.progressMode,
      progress: 0, // Reset progress for the work instance
      progressTarget: plan.progressTarget, // Snapshot of plan target
      progressAchieved: 0, // Reset achieved
      status: TASK_STATUS.PENDING_APPROVAL, // MUST start as PENDING_APPROVAL
      deadline: null,
      planId: plan._id, // HARD REFERENCE to original Plan
      categoryId: plan.categoryId, // Inherit category from Plan
      // CLIENT ASSIGNMENT
      clientId: clientId,
      // PLAN FIELDS (COPIED)
      quantity: plan.quantity,
      showQuantityToClient: plan.showQuantityToClient,
      showCreditsToClient: plan.showCreditsToClient,
      isListedInPlans: false, // THIS IS A TASK, NOT A PLAN
      isActivePlan: false,
      targetClients: null, // CLEAR TARGETING
      featureImage: plan.featureImage,
      planMedia: plan.planMedia,
      offerPrice: plan.offerPrice,
      originalPrice: plan.originalPrice,
      countdownEndDate: null,
      milestones: plan.milestones || [], // Copy milestones
      autoCompletionCap: plan.autoCompletionCap || 100,
      // CONTENT REQUIREMENT CONTROL (Phase 2 Step 4)
      requireClientContent: plan.requireClientContent || false
    });

    return res.status(201).json({
      success: true,
      task: {
        id: newTask._id.toString(),
        title: newTask.title,
        status: newTask.status,
        creditsUsed: newTask.creditsUsed,
      },
      walletBalance: wallet.balance,
    });
  } catch (err) {
    console.error('Plan purchase error:', err);
    return res.status(500).json({ error: 'Failed to purchase plan' });
  }
});

// CLIENT SUBSCRIPTION ENDPOINTS (PHASE E)

// GET SUBSCRIPTIONS
router.get('/subscriptions', async (req, res) => {
  try {
    const clientId = req.user.id;
    console.log('=== CLIENT SUBSCRIPTIONS FETCH ===');
    console.log('Client ID from token:', clientId);

    // Fetch active subscriptions
    const allSubscriptions = await Subscription.find({ isActive: true })
      .populate('tasks', 'title creditCost')
      .sort({ createdAt: -1 })
      .exec();

    console.log('Total subscriptions found (before targeting):', allSubscriptions.length);

    // Filter by targetClients
    const filteredSubscriptions = allSubscriptions.filter(sub => {
      // If targetClients is null or empty array, visible to all
      if (!sub.targetClients || sub.targetClients.length === 0) {
        return true;
      }
      // If targetClients is set, check if current client is in the list
      return sub.targetClients.some(targetId => targetId.toString() === clientId);
    });

    console.log('Filtered subscriptions for client:', filteredSubscriptions.length);

    return res.status(200).json({
      subscriptions: filteredSubscriptions.map(s => ({
        id: s._id.toString(),
        title: s.title,
        description: s.description,
        tasks: s.tasks.map(t => ({
          id: t._id.toString(),
          title: t.title,
          creditCost: t.creditCost,
        })),
        totalPrice: s.totalPrice,
        offerPrice: s.offerPrice,
        durationDays: s.durationDays,
        featureImage: s.featureImage,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error('Client subscriptions error:', err);
    return res.status(500).json({ error: 'Failed to retrieve subscriptions' });
  }
});

// PURCHASE SUBSCRIPTION
router.post('/subscriptions/:id/purchase', async (req, res) => {
  try {
    const { id } = req.params;
    const clientId = req.user.id;

    // 1. Fetch the subscription
    const subscription = await Subscription.findById(id).populate('tasks').exec();

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // 2. Validate it's active
    if (!subscription.isActive) {
      return res.status(400).json({ error: 'This subscription is not available' });
    }

    // 3. Check targeting
    if (subscription.targetClients && subscription.targetClients.length > 0) {
      const isTargeted = subscription.targetClients.some(targetId => targetId.toString() === clientId);
      if (!isTargeted) {
        return res.status(403).json({ error: 'You are not eligible for this subscription' });
      }
    }

    // 4. Determine price
    const price = subscription.offerPrice || subscription.totalPrice || 0;

    // 5. Get wallet
    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // 6. HYBRID CREDIT DEDUCTION: subscriptionCredits first, then walletCredits
    const nowBundle = new Date();
    const subNotExpiredBundle = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > nowBundle;
    const availableSubCreditsBundle = subNotExpiredBundle ? (wallet.subscriptionCredits || 0) : 0;
    const availableWalletCreditsBundle = wallet.walletCredits || 0;
    const totalAvailableBundle = availableSubCreditsBundle + availableWalletCreditsBundle;

    if (totalAvailableBundle < price) {
      return res.status(400).json({ error: 'Insufficient credits' });
    }

    // Calculate deduction: subscriptionCredits FIRST, then walletCredits
    const subDeductBundle = Math.min(availableSubCreditsBundle, price);
    const remainingBundle = price - subDeductBundle;
    const walletDeductBundle = Math.min(availableWalletCreditsBundle, remainingBundle);

    // ATOMIC UPDATE
    const incUpdateBundle = {};
    if (subDeductBundle > 0) incUpdateBundle.subscriptionCredits = -subDeductBundle;
    if (walletDeductBundle > 0) incUpdateBundle.walletCredits = -walletDeductBundle;

    await Wallet.findByIdAndUpdate(wallet._id, { $inc: incUpdateBundle });

    // Create wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: subDeductBundle > 0 ? 'SUBSCRIPTION_DEDUCTION' : 'SUBSCRIPTION_PURCHASE',
      amount: 0,
      credits: -price,
      description: `Bundle Purchase: ${subscription.title}`,
      referenceId: null,
    });

    // 7. Clone all tasks for client (DO NOT MODIFY ORIGINALS)
    const clonedTasks = [];
    
    for (const task of subscription.tasks) {
      const newTask = await Task.create({
        title: task.title,
        description: task.description,
        creditCost: task.creditCost,
        creditsUsed: 0, // Part of subscription, no individual cost
        priority: task.priority,
        startDate: task.startDate,
        endDate: task.endDate,
        publicNotes: task.publicNotes,
        internalNotes: task.internalNotes,
        progressMode: task.progressMode,
        progress: task.progress,
        status: TASK_STATUS.PENDING_APPROVAL,
        deadline: task.deadline,
        planId: task._id,
        // CLIENT ASSIGNMENT
        clientId: clientId,
        // PLAN FIELDS (COPIED)
        quantity: task.quantity,
        showQuantityToClient: task.showQuantityToClient,
        showCreditsToClient: task.showCreditsToClient,
        isListedInPlans: false, // NOT A PLAN
        targetClients: null, // CLEAR TARGETING
        featureImage: task.featureImage,
        offerPrice: task.offerPrice,
        originalPrice: task.originalPrice,
        countdownEndDate: task.countdownEndDate,
      });

      clonedTasks.push(newTask._id.toString());
    }

    return res.status(201).json({
      success: true,
      subscription: {
        id: subscription._id.toString(),
        title: subscription.title,
      },
      tasksCreated: clonedTasks.length,
      walletBalance: wallet.balance,
    });
  } catch (err) {
    console.error('Subscription purchase error:', err);
    return res.status(500).json({ error: 'Failed to purchase subscription' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const clientId = req.user.id;
    console.log('=== CLIENT TASKS FETCH ===' );
    console.log('Client ID from token:', clientId);
    console.log('MODE: TASK');
    console.log('VISIBILITY TARGET: ClientTasks');

    // STRICT VISIBILITY: Only return client tasks (NOT plans)
    const filter = { clientId: clientId, isListedInPlans: { $ne: true } };
    console.log('Filter:', JSON.stringify(filter));
    const tasks = await Task.find(filter).sort({ createdAt: -1 }).exec();
    console.log('Tasks found:', tasks.length);

    const now = new Date();
    const processedTasks = [];

    for (const t of tasks) {
      let needsSave = false;
      let currentStatus = t.status;
      let currentProgress = t.progress;
      let currentMilestones = t.milestones || [];

      // FIX #2: Auto-start scheduled tasks if startDate has passed
      // PENDING = Scheduled, ACTIVE = In Progress
      if (currentStatus === 'PENDING' && t.startDate && new Date(t.startDate) <= now) {
        t.status = 'ACTIVE';
        currentStatus = 'ACTIVE';
        needsSave = true;
        console.log(`[AUTO-START] Task ${t._id} started: startDate ${t.startDate} <= now`);
      }

      // Recalculate progress for AUTO mode tasks
      if (t.progressMode === 'AUTO' && t.startDate && t.endDate) {
        const start = new Date(t.startDate);
        const end = new Date(t.endDate);
        const cap = t.autoCompletionCap || 100;
        
        if (now < start) {
          currentProgress = 0;
        } else if (now >= end) {
          currentProgress = cap;
        } else {
          const totalDuration = end - start;
          const elapsed = now - start;
          currentProgress = Math.min((elapsed / totalDuration) * 100, cap);
        }
        currentProgress = Math.round(currentProgress * 10) / 10;
        
        if (Math.abs(currentProgress - t.progress) > 0.1) {
          t.progress = currentProgress;
          needsSave = true;
        }
      } else if (t.progressMode === 'MANUAL') {
        // MANUAL mode: progress is admin-controlled.
        // Do NOT recalculate from progressAchieved.
        currentProgress = t.progress || 0;
      }

      // FIX #1: Evaluate milestones based on current progress
      if (currentMilestones.length > 0) {
        let milestonesChanged = false;
        currentMilestones = currentMilestones.map(m => {
          const shouldBeReached = currentProgress >= m.percentage;
          if (shouldBeReached && !m.reached) {
            milestonesChanged = true;
            return { ...m.toObject ? m.toObject() : m, reached: true, reachedAt: now };
          } else if (!shouldBeReached && m.reached) {
            milestonesChanged = true;
            return { ...m.toObject ? m.toObject() : m, reached: false, reachedAt: null };
          }
          return m.toObject ? m.toObject() : m;
        });
        if (milestonesChanged) {
          t.milestones = currentMilestones;
          needsSave = true;
        }
      }

      // FIX #3: Auto-update status based on progress (only if not cancelled/completed manually)
      if (currentStatus !== 'CANCELLED' && currentStatus !== 'PENDING_APPROVAL') {
        if (currentProgress >= 100 && currentStatus !== 'COMPLETED') {
          t.status = 'COMPLETED';
          currentStatus = 'COMPLETED';
          needsSave = true;
        } else if (currentProgress > 0 && currentStatus === 'PENDING') {
          t.status = 'ACTIVE';
          currentStatus = 'ACTIVE';
          needsSave = true;
        }
      }

      // Save if any changes detected
      if (needsSave) {
        await t.save();
        console.log(`[TASK SYNC] Task ${t._id} updated: status=${t.status}, progress=${t.progress}`);
      }

      processedTasks.push({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        creditCost: t.creditCost,
        creditsUsed: t.creditsUsed || 0,
        priority: t.priority,
        startDate: t.startDate,
        endDate: t.endDate,
        publicNotes: t.publicNotes,
        progressMode: t.progressMode,
        progress: currentProgress,
        progressTarget: t.progressTarget,
        progressAchieved: t.progressAchieved,
        showProgressDetails: t.showProgressDetails,
        status: currentStatus,
        deadline: t.deadline || t.endDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        quantity: t.quantity,
        showQuantityToClient: t.showQuantityToClient,
        showCreditsToClient: t.showCreditsToClient,
        featureImage: t.featureImage,
        offerPrice: t.offerPrice,
        originalPrice: t.originalPrice,
        countdownEndDate: t.countdownEndDate,
        // FIX #1: Include milestones in response
        milestones: currentMilestones.map(m => ({
          name: m.name,
          percentage: m.percentage,
          color: m.color,
          reached: m.reached || false,
          reachedAt: m.reachedAt || null,
        })),
      });
    }

    return res.status(200).json({ tasks: processedTasks });
  } catch (err) {
    console.error('Client tasks error:', err);
    return res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const clientId = req.user.id;

    const walletSummary = await getClientWalletSummary(clientId);

    if (!walletSummary) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const taskSummary = await getClientTaskSummary(clientId);
    const recentActivity = await getClientRecentActivity(clientId, 7);

    return res.status(200).json({
      summary: {
        currentBalance: walletSummary.currentBalance,
        lifetimeSpending: walletSummary.lifetimeSpending,
        lifetimeAdded: walletSummary.lifetimeAdded,
        lifetimeTasks: taskSummary.totalTasks,
      },
      tasksByStatus: taskSummary.tasksByStatus,
      completionRate: taskSummary.completionRate,
      recentActivity: {
        last7Days: {
          spending: recentActivity.spending,
          tasksCreated: recentActivity.tasksCreated,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve dashboard' });
  }
});

router.get('/insights/spending', async (req, res) => {
  try {
    const clientId = req.user.id;

    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const transactions = await WalletTransaction.find({
      walletId: wallet._id,
      amount: { $lt: 0 },
    })
      .populate('referenceId')
      .sort({ createdAt: -1 })
      .exec();

    const totalSpending = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const spendingByMonth = {};
    const taskBreakdown = {};

    for (const transaction of transactions) {
      const monthKey = new Date(transaction.createdAt).toISOString().substring(0, 7);

      if (!spendingByMonth[monthKey]) {
        spendingByMonth[monthKey] = 0;
      }
      spendingByMonth[monthKey] += Math.abs(transaction.amount);

      if (transaction.referenceId) {
        const task = await Task.findById(transaction.referenceId).populate('templateId', 'name').exec();

        if (task) {
          const taskName = task.templateId ? task.templateId.name : task.title;

          if (!taskBreakdown[taskName]) {
            taskBreakdown[taskName] = { count: 0, spending: 0 };
          }

          taskBreakdown[taskName].count++;
          taskBreakdown[taskName].spending += Math.abs(transaction.amount);
        }
      }
    }

    const averageTaskCost = transactions.length > 0 ? totalSpending / transactions.length : 0;

    const topTasks = Object.entries(taskBreakdown)
      .map(([name, data]) => ({
        taskName: name,
        count: data.count,
        spending: data.spending,
      }))
      .sort((a, b) => b.spending - a.spending)
      .slice(0, 5);

    return res.status(200).json({
      totalSpending,
      averageTaskCost: Math.round(averageTaskCost * 100) / 100,
      spendingByMonth: Object.entries(spendingByMonth)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      topTasks,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve spending insights' });
  }
});

router.get('/insights/tasks', async (req, res) => {
  try {
    const clientId = req.user.id;

    const taskSummary = await getClientTaskSummary(clientId);

    const tasks = await Task.find({ clientId })
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .exec();

    const tasksByTemplate = {};

    tasks.forEach((task) => {
      const templateName = task.templateId ? task.templateId.name : 'Custom/Assigned';

      if (!tasksByTemplate[templateName]) {
        tasksByTemplate[templateName] = 0;
      }

      tasksByTemplate[templateName]++;
    });

    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
    const avgDuration = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => {
          const duration = new Date(t.updatedAt) - new Date(t.createdAt);
          return sum + duration;
        }, 0) / completedTasks.length
      : 0;

    const avgDurationDays = Math.round((avgDuration / (1000 * 60 * 60 * 24)) * 100) / 100;

    return res.status(200).json({
      taskSummary: {
        totalTasks: taskSummary.totalTasks,
        tasksByStatus: taskSummary.tasksByStatus,
        completionRate: taskSummary.completionRate,
      },
      tasksByTemplate: Object.entries(tasksByTemplate)
        .map(([name, count]) => ({ templateName: name, count }))
        .sort((a, b) => b.count - a.count),
      averageTaskDuration: avgDurationDays,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task insights' });
  }
});

// --- Notification Routes (Phase 5) ---

router.get('/notifications', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { unreadOnly } = req.query;

    const notifications = await getNotificationsForUser(clientId, {
      unreadOnly: unreadOnly === 'true',
    });

    const unreadCount = await getUnreadCount(clientId);

    return res.status(200).json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
        readAt: n.readAt,
        relatedEntity: {
          entityId: n.relatedEntity?.entityId,
          entityType: n.relatedEntity?.entityType
        }
      })),
      unreadCount,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { id: notificationId } = req.params;

    const notification = await markNotificationAsRead(notificationId, clientId);

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
    const clientId = req.user.id;

    const count = await markAllNotificationsAsRead(clientId);

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

// GET /client/notices - Get notices for this client (recent + paginated)
router.get('/notices', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { page = 1, limit = 10, viewAll = false } = req.query;

    // Build filter for notices targeting this client or ALL
    // Combine targeting filter AND expiration filter using $and
    const effectiveFilter = {
      isActive: true,
      $and: [
        {
          $or: [
            { targetType: 'ALL' },
            { targetType: 'SELECTED', targetClients: clientId },
          ],
        },
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    };

    const skip = viewAll === 'true' ? (parseInt(page) - 1) * parseInt(limit) : 0;
    const queryLimit = viewAll === 'true' ? parseInt(limit) : 3;

    const notices = await Notice.find(effectiveFilter)
      .sort({ isPinned: -1, priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(queryLimit)
      .exec();

    const total = await Notice.countDocuments(effectiveFilter).exec();

    // Check which notices the client has responded to
    const noticesWithResponseStatus = notices.map(n => {
      const hasResponded = n.responses?.some(r => r.clientId?.toString() === clientId);
      const myResponse = n.responses?.find(r => r.clientId?.toString() === clientId);
      return {
        id: n._id.toString(),
        title: n.title,
        content: n.content,
        type: n.type,
        priority: n.priority,
        responseRequired: n.responseRequired,
        responseType: n.responseType,
        hasResponded,
        myResponse: myResponse ? {
          responseType: myResponse.responseType,
          value: myResponse.value,
          respondedAt: myResponse.respondedAt,
        } : null,
        isPinned: n.isPinned,
        imageUrl: n.imageUrl,
        linkUrl: n.linkUrl,
        linkText: n.linkText,
        expiresAt: n.expiresAt,
        createdAt: n.createdAt,
      };
    });

    return res.status(200).json({
      notices: noticesWithResponseStatus,
      pagination: viewAll === 'true' ? {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      } : { total },
    });
  } catch (err) {
    console.error('Failed to retrieve notices:', err);
    return res.status(500).json({ error: 'Failed to retrieve notices' });
  }
});

// GET /client/notices/:noticeId - Get single notice detail
router.get('/notices/:noticeId', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const clientId = req.user.id;

    const notice = await Notice.findById(noticeId).exec();

    if (!notice || !notice.isActive) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    // Check if client is allowed to view this notice
    const isTargeted = notice.targetType === 'ALL' || 
      (notice.targetType === 'SELECTED' && notice.targetClients?.some(t => t.toString() === clientId));
    
    if (!isTargeted) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Mark as viewed
    if (!notice.viewedBy?.some(v => v.toString() === clientId)) {
      notice.viewedBy = notice.viewedBy || [];
      notice.viewedBy.push(clientId);
      notice.viewCount = (notice.viewCount || 0) + 1;
      await notice.save();
    }

    const myResponse = notice.responses?.find(r => r.clientId?.toString() === clientId);

    return res.status(200).json({
      notice: {
        id: notice._id.toString(),
        title: notice.title,
        content: notice.content,
        type: notice.type,
        priority: notice.priority,
        responseRequired: notice.responseRequired,
        responseType: notice.responseType,
        hasResponded: !!myResponse,
        myResponse: myResponse ? {
          responseType: myResponse.responseType,
          value: myResponse.value,
          fileUrl: myResponse.fileUrl,
          respondedAt: myResponse.respondedAt,
        } : null,
        isPinned: notice.isPinned,
        imageUrl: notice.imageUrl,
        linkUrl: notice.linkUrl,
        linkText: notice.linkText,
        expiresAt: notice.expiresAt,
        createdAt: notice.createdAt,
      },
    });
  } catch (err) {
    console.error('Failed to retrieve notice:', err);
    return res.status(500).json({ error: 'Failed to retrieve notice' });
  }
});

// POST /client/notices/:noticeId/respond - Respond to a notice
router.post('/notices/:noticeId/respond', async (req, res) => {
  try {
    const { noticeId } = req.params;
    const clientId = req.user.id;
    const { responseType, value, fileUrl } = req.body || {};

    const notice = await Notice.findById(noticeId).exec();

    if (!notice || !notice.isActive) {
      return res.status(404).json({ error: 'Notice not found' });
    }

    // Check if client is allowed to respond to this notice
    const isTargeted = notice.targetType === 'ALL' || 
      (notice.targetType === 'SELECTED' && notice.targetClients?.some(t => t.toString() === clientId));
    
    if (!isTargeted) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (notice.responseType === 'NONE') {
      return res.status(400).json({ error: 'This notice does not accept responses' });
    }

    // Check if already responded
    const existingResponseIdx = notice.responses?.findIndex(r => r.clientId?.toString() === clientId);
    
    const newResponse = {
      clientId,
      responseType: responseType || (notice.responseType === 'YES_NO' ? 'YES' : notice.responseType),
      value: value || null,
      fileUrl: fileUrl || null,
      respondedAt: new Date(),
    };

    if (existingResponseIdx >= 0) {
      // Update existing response
      notice.responses[existingResponseIdx] = newResponse;
    } else {
      // Add new response
      notice.responses = notice.responses || [];
      notice.responses.push(newResponse);
    }

    await notice.save();

    // --- Notification Hook: Notify admin about client response ---
    try {
      const { mainAdminIdentifier } = require('../config');
      const User = require('../models/User');
      
      const adminUser = await User.findOne({ identifier: mainAdminIdentifier }).exec();
      if (adminUser) {
        await createNotification({
          recipientId: adminUser._id,
          type: NOTIFICATION_TYPES.NOTICE_RESPONSE,
          title: 'Client Response Received',
          message: `Client responded to notice: "${notice.title.substring(0, 50)}${notice.title.length > 50 ? '...' : ''}" — Response: ${value !== undefined ? String(value).substring(0, 50) : responseType}`,
          relatedEntity: {
            entityType: ENTITY_TYPES.NOTICE,
            entityId: notice._id,
          },
          metadata: {
            response: value !== undefined ? value : responseType,
            responseType: responseType,
            noticeTitle: notice.title,
          },
          notifyByEmail: true,
        });
        
        console.log(`[NOTICE_RESPONSE] Notification sent to admin for notice ${notice._id}`);
      }
    } catch (notifErr) {
      console.error('[NOTICE_RESPONSE] Notification error (non-fatal):', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Response submitted successfully',
      response: {
        responseType: newResponse.responseType,
        value: newResponse.value,
        respondedAt: newResponse.respondedAt,
      },
    });
  } catch (err) {
    console.error('Failed to respond to notice:', err);
    return res.status(500).json({ error: 'Failed to respond to notice' });
  }
});

// =============================================
// PROFILE ROUTES
// =============================================

// GET /client/profile - Get own profile
router.get('/profile', async (req, res) => {
  try {
    const clientId = req.user.id;

    const user = await User.findById(clientId).select('-passwordHash').exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get wallet balance
    const wallet = await Wallet.findOne({ clientId }).exec();
    
    // Get task counts
    const activeTasks = await Task.countDocuments({ clientId, status: { $in: ['ACTIVE', 'IN_PROGRESS'] }, isListedInPlans: { $ne: true } }).exec();
    const completedTasks = await Task.countDocuments({ clientId, status: 'COMPLETED', isListedInPlans: { $ne: true } }).exec();
    const pendingTasks = await Task.countDocuments({ clientId, status: 'PENDING_APPROVAL', isListedInPlans: { $ne: true } }).exec();

    // Get purchased plans count (tasks that came from plans)
    const purchasedPlans = await Task.countDocuments({ clientId, planId: { $ne: null }, isListedInPlans: { $ne: true } }).exec();

    // Get response count
    const responses = await Notice.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.clientId': user._id } },
      { $count: 'total' }
    ]);
    const responseCount = responses[0]?.total || 0;

    return res.status(200).json({
      profile: {
        id: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        status: user.status,
        name: user.profile?.name || '',
        phone: user.profile?.phone || '',
        photoUrl: user.profile?.photoUrl || null,
        company: user.profile?.company || '',
        timezone: user.profile?.timezone || 'UTC',
        language: user.profile?.language || 'en',
        preferences: user.preferences || {},
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        // Phase 4A+ - Default content folder
        defaultContentFolder: user.defaultContentFolder || '',
      },
      billing: {
        name: user.billing?.name || '',
        email: user.billing?.email || user.identifier || '',
        phone: user.billing?.phone || user.profile?.phone || '',
        address: user.billing?.address || '',
        city: user.billing?.city || '',
        state: user.billing?.state || '',
        pincode: user.billing?.pincode || '',
        country: user.billing?.country || 'India',
        gstNumber: user.billing?.gstNumber || '',
        companyName: user.billing?.companyName || user.profile?.company || '',
      },
      stats: {
        walletBalance: wallet?.balance || 0,
        activeTasks,
        completedTasks,
        pendingTasks,
        purchasedPlans,
        responseCount,
      },
    });
  } catch (err) {
    console.error('Failed to get profile:', err);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

// PATCH /client/profile - Update own profile
router.patch('/profile', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { name, phone, photoUrl, company, timezone, language, preferences, billing, defaultContentFolder } = req.body || {};

    const user = await User.findById(clientId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update profile fields
    if (name !== undefined) user.profile.name = name.trim();
    if (phone !== undefined) user.profile.phone = phone.trim();
    if (photoUrl !== undefined) user.profile.photoUrl = photoUrl || null;
    if (company !== undefined) user.profile.company = company.trim();
    if (timezone !== undefined) user.profile.timezone = timezone;
    if (language !== undefined) user.profile.language = language;

    // Update default content folder (Phase 4A+)
    if (defaultContentFolder !== undefined) {
      user.defaultContentFolder = defaultContentFolder.trim();
    }

    // Update preferences
    if (preferences) {
      if (preferences.emailNotifications !== undefined) user.preferences.emailNotifications = preferences.emailNotifications;
      if (preferences.inAppNotifications !== undefined) user.preferences.inAppNotifications = preferences.inAppNotifications;
      if (preferences.marketingEmails !== undefined) user.preferences.marketingEmails = preferences.marketingEmails;
      // Deduction mode control
      if (preferences.defaultDeductionMode !== undefined) {
        const validModes = ['AUTO', 'SUBSCRIPTION_ONLY', 'WALLET_ONLY'];
        if (validModes.includes(preferences.defaultDeductionMode)) {
          user.preferences.defaultDeductionMode = preferences.defaultDeductionMode;
        }
      }
    }

    // Update billing details
    if (billing) {
      if (!user.billing) user.billing = {};
      if (billing.name !== undefined) user.billing.name = billing.name.trim();
      if (billing.email !== undefined) user.billing.email = billing.email.trim();
      if (billing.phone !== undefined) user.billing.phone = billing.phone.trim();
      if (billing.address !== undefined) user.billing.address = billing.address.trim();
      if (billing.city !== undefined) user.billing.city = billing.city.trim();
      if (billing.state !== undefined) user.billing.state = billing.state.trim();
      if (billing.pincode !== undefined) user.billing.pincode = billing.pincode.trim();
      if (billing.country !== undefined) user.billing.country = billing.country.trim();
      if (billing.gstNumber !== undefined) user.billing.gstNumber = billing.gstNumber.trim();
      if (billing.companyName !== undefined) user.billing.companyName = billing.companyName.trim();
    }

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
        company: user.profile?.company || '',
        timezone: user.profile?.timezone || 'UTC',
        language: user.profile?.language || 'en',
        preferences: user.preferences || {},
        defaultContentFolder: user.defaultContentFolder || '',
      },
      billing: {
        name: user.billing?.name || '',
        email: user.billing?.email || '',
        phone: user.billing?.phone || '',
        address: user.billing?.address || '',
        city: user.billing?.city || '',
        state: user.billing?.state || '',
        pincode: user.billing?.pincode || '',
        country: user.billing?.country || 'India',
        gstNumber: user.billing?.gstNumber || '',
        companyName: user.billing?.companyName || '',
      },
    });
  } catch (err) {
    console.error('Failed to update profile:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /client/profile/change-password - Change password
router.post('/profile/change-password', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(clientId).exec();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and save new password
    user.passwordHash = await hashPassword(newPassword);
    user.lastActivityAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (err) {
    console.error('Failed to change password:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /client/profile/activity - Get own activity
router.get('/profile/activity', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get recent tasks
    const tasks = await Task.find({ clientId, isListedInPlans: { $ne: true } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .exec();

    // Get wallet transactions
    const wallet = await Wallet.findOne({ clientId }).exec();
    const transactions = wallet ? await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .exec() : [];

    // Get responses to notices
    const responses = await Notice.aggregate([
      { $unwind: '$responses' },
      { $match: { 'responses.clientId': new require('mongoose').Types.ObjectId(clientId) } },
      { $sort: { 'responses.respondedAt': -1 } },
      { $limit: 10 },
      { $project: { title: 1, type: 1, 'responses': 1 } }
    ]);

    return res.status(200).json({
      tasks: tasks.map(t => ({
        id: t._id.toString(),
        title: t.title,
        status: t.status,
        progress: t.progress,
        createdAt: t.createdAt,
      })),
      transactions: transactions.map(t => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        description: t.description,
        createdAt: t.createdAt,
      })),
      responses: responses.map(r => ({
        noticeTitle: r.title,
        noticeType: r.type,
        responseType: r.responses.responseType,
        value: r.responses.value,
        respondedAt: r.responses.respondedAt,
      })),
    });
  } catch (err) {
    console.error('Failed to get activity:', err);
    return res.status(500).json({ error: 'Failed to get activity' });
  }
});

// ===============================
// SUPPORT TICKETS
// ===============================
const Ticket = require('../models/Ticket');

// Create new ticket
router.post('/tickets', async (req, res) => {
  // IMMEDIATE LOG - confirms route was hit
  console.log('\n[TICKET ROUTE] ==========================================');
  console.log('[TICKET ROUTE] POST /client/tickets HIT');
  console.log('[TICKET ROUTE] Original URL:', req.originalUrl);
  console.log('[TICKET ROUTE] Method:', req.method);
  console.log('[TICKET ROUTE] Headers Content-Type:', req.headers['content-type']);
  console.log('[TICKET ROUTE] User from token:', req.user ? req.user.id : 'NO USER');
  console.log('[TICKET ROUTE] Body keys:', Object.keys(req.body || {}));
  console.log('[TICKET ROUTE] Raw body:', JSON.stringify(req.body));
  console.log('[TICKET ROUTE] ==========================================\n');
  
  console.log('[TICKET] ========== CREATE TICKET START ==========');
  console.log('[TICKET] Timestamp:', new Date().toISOString());
  
  try {
    const clientId = req.user.id;
    console.log('[TICKET] Step 1: Client ID from token:', clientId);
    
    // Log incoming request body (with safe type handling)
    console.log('[TICKET] Step 2: Request body received:');
    console.log('[TICKET]   - subject:', req.body.subject, '(type:', typeof req.body.subject, ')');
    console.log('[TICKET]   - category:', req.body.category || '(default: GENERAL)');
    console.log('[TICKET]   - priority:', req.body.priority || '(default: NORMAL)');
    console.log('[TICKET]   - message:', req.body.message, '(type:', typeof req.body.message, ')');
    console.log('[TICKET]   - relatedTaskId:', req.body.relatedTaskId || '(none)');
    
    // Extract and type-check values
    let { subject, category, priority, message, relatedTaskId } = req.body;
    
    // Ensure subject and message are strings
    if (typeof subject !== 'string') {
      console.error('[TICKET] ❌ TYPE ERROR: subject is not a string, got:', typeof subject);
      return res.status(400).json({ error: 'Subject must be a string' });
    }
    if (typeof message !== 'string') {
      console.error('[TICKET] ❌ TYPE ERROR: message is not a string, got:', typeof message);
      return res.status(400).json({ error: 'Message must be a string' });
    }

    // Validation
    console.log('[TICKET] Step 3: Validation...');
    subject = subject.trim();
    message = message.trim();
    
    if (!subject || !message) {
      console.error('[TICKET] ❌ VALIDATION FAILED: Subject or message is empty after trim');
      console.log('[TICKET]   - subject length:', subject.length);
      console.log('[TICKET]   - message length:', message.length);
      console.log('[TICKET] ========== CREATE TICKET END (400) ==========');
      return res.status(400).json({ error: 'Subject and message are required' });
    }
    console.log('[TICKET] ✅ Validation passed');

    // Create ticket
    console.log('[TICKET] Step 4: Creating ticket in database...');
    const ticket = await Ticket.create({
      clientId,
      subject: subject,
      category: category || 'GENERAL',
      priority: priority || 'NORMAL',
      relatedTaskId: relatedTaskId || null,
      messages: [{
        senderId: clientId,
        senderRole: 'CLIENT',
        message: message,
      }],
    });
    
    console.log('[TICKET] ✅ Ticket created successfully!');
    console.log('[TICKET]   - Ticket ID:', ticket._id.toString());
    console.log('[TICKET]   - Ticket Number:', ticket.ticketNumber);
    console.log('[TICKET]   - Status:', ticket.status);

    // --- Notification Hook (HIGH PRIORITY FIX) ---
    // Notify admin(s) of new ticket
    console.log('[TICKET] Step 5: Notifying admins...');
    try {
      const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' }).select('_id').exec();
      console.log('[TICKET]   - Found', admins.length, 'active admin(s)');
      
      for (const admin of admins) {
        await createNotification({
          recipientId: admin._id,
          type: 'TICKET_CREATED',
          title: 'New Support Ticket',
          message: `New ticket #${ticket.ticketNumber}: ${subject.trim().substring(0, 50)}${subject.length > 50 ? '...' : ''}`,
          relatedEntity: {
            entityType: 'TICKET',
            entityId: ticket._id,
          },
        });
      }
      console.log('[TICKET] ✅ Admin(s) notified of new ticket:', ticket.ticketNumber);
    } catch (notifErr) {
      console.error('[TICKET] ⚠️ Notification failed (non-blocking):', notifErr.message);
    }
    // ------------------------------------

    console.log('[TICKET] Step 6: Sending success response (201)...');
    console.log('[TICKET] ========== CREATE TICKET END (201) ==========');
    
    return res.status(201).json({
      success: true,
      ticket: {
        id: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (err) {
    console.error('[TICKET] ❌ CREATE TICKET FAILED!');
    console.error('[TICKET]   - Error name:', err.name);
    console.error('[TICKET]   - Error message:', err.message);
    console.error('[TICKET]   - Error code:', err.code);
    
    // Check for specific MongoDB errors
    if (err.name === 'ValidationError') {
      console.error('[TICKET]   - Mongoose validation error');
      const validationErrors = Object.keys(err.errors).map(key => `${key}: ${err.errors[key].message}`);
      console.error('[TICKET]   - Fields:', validationErrors.join(', '));
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }
    
    if (err.code === 11000) {
      console.error('[TICKET]   - Duplicate key error (ticketNumber collision)');
      return res.status(500).json({ error: 'Ticket number collision, please try again' });
    }
    
    console.error('[TICKET]   - Stack:', err.stack);
    console.log('[TICKET] ========== CREATE TICKET END (500) ==========');
    return res.status(500).json({ error: 'Failed to create ticket', details: err.message });
  }
});

// Get all tickets for client
router.get('/tickets', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { status } = req.query;

    const filter = { clientId };
    if (status) filter.status = status;

    const tickets = await Ticket.find(filter)
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
    const clientId = req.user.id;
    const { ticketId } = req.params;

    const ticket = await Ticket.findOne({ _id: ticketId, clientId })
      .populate('relatedTaskId', 'title')
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
        relatedTask: ticket.relatedTaskId ? {
          id: ticket.relatedTaskId._id.toString(),
          title: ticket.relatedTaskId.title,
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

// Add reply to ticket
router.post('/tickets/:ticketId/reply', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { ticketId } = req.params;
    const { message, attachments } = req.body;

    // Allow empty message if there are attachments
    if ((!message || message.trim().length === 0) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: 'Message or attachment is required' });
    }

    // Validate attachments (URLs only, max 5)
    if (attachments && attachments.length > 0) {
      if (attachments.length > 5) {
        return res.status(400).json({ error: 'Maximum 5 attachments allowed' });
      }
      for (const att of attachments) {
        if (typeof att !== 'string' || !att.startsWith('http')) {
          return res.status(400).json({ error: 'Attachments must be valid URLs' });
        }
      }
    }

    const ticket = await Ticket.findOne({ _id: ticketId, clientId });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (ticket.status === 'CLOSED') {
      return res.status(400).json({ error: 'Cannot reply to closed ticket' });
    }

    ticket.messages.push({
      senderId: clientId,
      senderRole: 'CLIENT',
      message: (message || '').trim() || (attachments?.length ? '[Image]' : ''),
      attachments: attachments || [],
    });
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = 'CLIENT';
    if (ticket.status === 'AWAITING_CLIENT') {
      ticket.status = 'IN_PROGRESS';
    }

    await ticket.save();

    // Notify admin via email
    try {
      const reminderScheduler = require('../services/reminderScheduler');
      await reminderScheduler.sendTicketReplyEmail(ticket, message.trim(), 'ADMIN');
    } catch (emailErr) {
      // Silent fail - email is optional
    }

    return res.status(200).json({
      success: true,
      message: 'Reply added successfully',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add reply' });
  }
});

// =============================================
// OFFICE CONFIG ENDPOINT (CLIENT VIEW)
// =============================================

// GET Office Config for Client (view-only)
router.get('/office-config', async (req, res) => {
  try {
    const config = await OfficeConfig.getConfig();
    
    // Filter active banners and sort by order
    const activeBanners = config.banners
      .filter(b => b.isActive)
      .sort((a, b) => a.order - b.order);
    
    // Filter enabled sections and sort by order
    const enabledSections = config.sections
      .filter(s => s.isEnabled)
      .sort((a, b) => a.order - b.order);
    
    // Get featured plans based on config
    let featuredPlans = [];
    if (config.featuredPlansConfig.selectionMode === 'manual' && config.featuredPlansConfig.manualPlanIds.length > 0) {
      // Fetch manually selected plans
      featuredPlans = await Task.find({
        _id: { $in: config.featuredPlansConfig.manualPlanIds },
        isListedInPlans: true,
        isHidden: { $ne: true }
      }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').limit(config.featuredPlansConfig.displayCount);
    } else {
      // Auto mode: fetch featured plans or most recent plans
      featuredPlans = await Task.find({
        isListedInPlans: true,
        isHidden: { $ne: true },
        isFeatured: true
      }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').sort({ createdAt: -1 }).limit(config.featuredPlansConfig.displayCount);
      
      // If not enough featured, fill with recent plans
      if (featuredPlans.length < config.featuredPlansConfig.displayCount) {
        const remaining = config.featuredPlansConfig.displayCount - featuredPlans.length;
        const existingIds = featuredPlans.map(p => p._id);
        const morePlans = await Task.find({
          _id: { $nin: existingIds },
          isListedInPlans: true,
          isHidden: { $ne: true }
        }).select('_id title description offerPrice originalPrice creditCost planMedia featureImage isFeatured').sort({ createdAt: -1 }).limit(remaining);
        featuredPlans = [...featuredPlans, ...morePlans];
      }
    }
    
    return res.status(200).json({
      config: {
        pageTitle: config.pageTitle,
        banners: activeBanners,
        bannerAutoRotate: config.bannerAutoRotate,
        bannerRotateInterval: config.bannerRotateInterval,
        sections: enabledSections,
        featuredPlansConfig: {
          displayCount: config.featuredPlansConfig.displayCount,
          showSeeAllButton: config.featuredPlansConfig.showSeeAllButton,
          seeAllButtonText: config.featuredPlansConfig.seeAllButtonText
        },
        seeMoreButtonConfig: config.seeMoreButtonConfig,
        updatesSectionConfig: config.updatesSectionConfig,
        requirementsSectionConfig: config.requirementsSectionConfig
      },
      featuredPlans: featuredPlans.map(p => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        offerPrice: p.offerPrice,
        originalPrice: p.originalPrice,
        creditCost: p.creditCost,
        planMedia: p.planMedia,
        featureImage: p.featureImage,
        isFeatured: p.isFeatured
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch office config' });
  }
});

// --- Client Order Routes ---

// GET /client/orders - Fetch client's own orders
router.get('/orders', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { status } = req.query;
    
    const query = { clientId };
    if (status && ORDER_STATUS[status]) {
      query.orderStatus = status;
    }
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    return res.status(200).json({
      orders: orders.map(order => ({
        id: order._id.toString(),
        orderId: order.orderId,
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        rejectionReason: order.rejectionReason,
        taskIds: order.taskIds,
        createdAt: order.createdAt,
        approvedAt: order.approvedAt,
        rejectedAt: order.rejectedAt,
        completedAt: order.completedAt,
      })),
    });
  } catch (err) {
    console.error('[CLIENT/ORDERS] Fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /client/orders/:orderId - Fetch single order with linked tasks
router.get('/orders/:orderId', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { orderId } = req.params;
    
    const order = await Order.findOne({ _id: orderId, clientId })
      .populate('taskIds')
      .lean();
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    return res.status(200).json({
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        items: order.items,
        subtotal: order.subtotal,
        discount: order.discount,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        rejectionReason: order.rejectionReason,
        tasks: (order.taskIds || []).map(t => ({
          id: t._id?.toString(),
          title: t.title,
          status: t.status,
          progress: t.progress,
        })),
        createdAt: order.createdAt,
        approvedAt: order.approvedAt,
        rejectedAt: order.rejectedAt,
        completedAt: order.completedAt,
      },
    });
  } catch (err) {
    console.error('[CLIENT/ORDERS] Fetch single error:', err);
    return res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /client/purchase-cart - Create order from cart (Phase 1: Order System)
// FEATURES: Atomic MongoDB Transaction + Duplicate Order Protection
router.post('/purchase-cart', async (req, res) => {
  // Start MongoDB session for atomic transaction
  const session = await mongoose.startSession();
  
  try {
    // Accept both old format (planIds) and new format (items with quantities)
    let { planIds, items } = req.body;
    const clientId = req.user.id;

    console.log('=== ORDER CREATION START ===');
    console.log('Client ID:', clientId);

    // Convert old format to new format for backward compatibility
    if (planIds && !items) {
      items = planIds.map(id => ({ planId: id, quantity: 1 }));
    }

    // 1. Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    // Extract unique plan IDs
    const uniquePlanIds = [...new Set(items.map(item => item.planId))];
    console.log('Plan IDs:', uniquePlanIds);
    console.log('Items with quantities:', items);

    // 2. Fetch all plans
    const plans = await Task.find({ _id: { $in: uniquePlanIds } }).populate('categoryId').exec();

    if (plans.length !== uniquePlanIds.length) {
      return res.status(404).json({ error: 'One or more plans not found' });
    }

    // Create a map for quick plan lookup
    const planMap = {};
    plans.forEach(plan => {
      planMap[plan._id.toString()] = plan;
    });

    // 3. Validate all plans
    for (const plan of plans) {
      if (!plan.isListedInPlans) {
        return res.status(400).json({ error: `${plan.title} is not a purchasable plan` });
      }
      if (plan.clientId !== null) {
        return res.status(400).json({ error: `${plan.title} is no longer available` });
      }
      if (!plan.isActivePlan) {
        return res.status(400).json({ error: `${plan.title} is not active` });
      }
      const visibility = plan.visibility || 'PUBLIC';
      if (visibility === 'HIDDEN') {
        return res.status(400).json({ error: `${plan.title} is not available` });
      }
      if (visibility === 'SELECTED') {
        const allowedClients = plan.allowedClients || [];
        const isAllowed = allowedClients.some(id => id.toString() === clientId);
        if (!isAllowed) {
          return res.status(403).json({ error: `You are not eligible for ${plan.title}` });
        }
      }
      if (plan.targetClients && plan.targetClients.length > 0) {
        const isTargeted = plan.targetClients.some(targetId => targetId.toString() === clientId);
        if (!isTargeted) {
          return res.status(403).json({ error: `You are not eligible for ${plan.title}` });
        }
      }
    }

    // 4. Build order items and calculate total price
    const orderItems = [];
    let totalPrice = 0;

    for (const item of items) {
      const plan = planMap[item.planId];
      if (!plan) {
        return res.status(404).json({ error: `Plan ${item.planId} not found` });
      }

      const quantity = Math.max(1, parseInt(item.quantity) || 1);
      const unitPrice = plan.offerPrice || plan.creditCost || 0;
      const itemTotalPrice = unitPrice * quantity;
      totalPrice += itemTotalPrice;

      orderItems.push({
        planId: plan._id,
        planTitle: plan.title,
        planImage: plan.featureImage || (plan.planMedia && plan.planMedia[0]?.url) || null,
        planIcon: plan.icon || '📦',
        categoryId: plan.categoryId?._id || null,
        categoryName: plan.categoryId?.name || null,
        quantity: quantity,
        unitPrice: unitPrice,
        originalPrice: plan.originalPrice || plan.creditCost || null,
        totalPrice: itemTotalPrice,
        planSnapshot: {
          description: plan.description || '',
          creditCost: plan.creditCost || 0,
          publicNotes: plan.publicNotes || '',
          progressMode: plan.progressMode || 'AUTO',
          progressTarget: plan.progressTarget || 100,
          milestones: plan.milestones || [],
          autoCompletionCap: plan.autoCompletionCap || 100,
          internalNotes: plan.internalNotes || '',
          priority: plan.priority || 'Medium',
          showQuantityToClient: plan.showQuantityToClient !== false,
          showCreditsToClient: plan.showCreditsToClient !== false,
        },
      });
    }

    console.log('Total price:', totalPrice);
    console.log('Order items count:', orderItems.length);

    // 5. DUPLICATE ORDER PROTECTION (before wallet deduction)
    // Check if same client has a PENDING_APPROVAL order within last 30 seconds with same totalAmount
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    const duplicateOrder = await Order.findOne({
      clientId: clientId,
      orderStatus: ORDER_STATUS.PENDING_APPROVAL,
      totalAmount: totalPrice,
      createdAt: { $gte: thirtySecondsAgo },
    }).exec();

    if (duplicateOrder) {
      console.log('Duplicate order detected:', duplicateOrder.orderId);
      return res.status(409).json({ 
        error: 'Duplicate order attempt detected.',
        existingOrderId: duplicateOrder.orderId,
      });
    }

    // 6. Get wallet (outside transaction for validation)
    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    console.log('Wallet balance before:', wallet.balance);

    // 7. Check balance (outside transaction for fast rejection)
    if (wallet.balance < totalPrice) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // ============================================================
    // START ATOMIC TRANSACTION
    // All database modifications happen inside this transaction
    // ============================================================
    session.startTransaction();
    console.log('Transaction started');

    let order;
    let transaction;

    try {
      // 8. Deduct wallet balance (INSIDE TRANSACTION)
      const walletUpdate = await Wallet.findOneAndUpdate(
        { _id: wallet._id },
        { $inc: { balance: -totalPrice } },
        { new: true, session }
      );

      if (!walletUpdate) {
        throw new Error('Failed to update wallet');
      }

      console.log('Wallet balance after deduction:', walletUpdate.balance);

      // 9. Create Order with PENDING_APPROVAL status (INSIDE TRANSACTION)
      const orderDocs = await Order.create([{
        clientId: clientId,
        items: orderItems,
        subtotal: totalPrice,
        discount: 0,
        totalAmount: totalPrice,
        paymentMethod: 'WALLET',
        paymentStatus: PAYMENT_STATUS.PAID,
        transactionId: null, // Will update after transaction creation
        orderStatus: ORDER_STATUS.PENDING_APPROVAL,
      }], { session });

      order = orderDocs[0];
      console.log('Order created:', order.orderId);

      // 10. Create wallet transaction (INSIDE TRANSACTION)
      const transactionDocs = await WalletTransaction.create([{
        walletId: wallet._id,
        type: 'ORDER_PAYMENT',
        amount: -totalPrice,
        description: `Order Payment: ${order.orderId}`,
        referenceId: order._id,
      }], { session });

      transaction = transactionDocs[0];

      // 11. Link transaction to order (INSIDE TRANSACTION)
      order.transactionId = transaction._id;
      await order.save({ session });

      // ============================================================
      // COMMIT TRANSACTION - All operations succeeded
      // ============================================================
      await session.commitTransaction();
      console.log('Transaction committed successfully');

    } catch (txError) {
      // ============================================================
      // ABORT TRANSACTION - Rollback all changes
      // ============================================================
      await session.abortTransaction();
      console.error('Transaction aborted:', txError.message);
      throw txError; // Re-throw to be caught by outer catch
    }

    // 12. Send notification to admin(s) (OUTSIDE TRANSACTION - non-critical)
    try {
      const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' }).exec();
      console.log(`[ORDER NOTIFICATION] Sending NEW_ORDER notification to ${admins.length} admin(s)`);
      for (const admin of admins) {
        console.log(`[ORDER NOTIFICATION] Creating notification for admin: ${admin._id}`);
        await createNotification({
          recipientId: admin._id,  // FIXED: was 'userId'
          type: NOTIFICATION_TYPES.NEW_ORDER,
          title: 'New Order Received',
          message: `New order ${order.orderId} from client (${orderItems.length} item(s), ₹${totalPrice})`,
          relatedEntity: {  // FIXED: was flat entityType/entityId
            entityType: ENTITY_TYPES.ORDER,
            entityId: order._id,
          },
        });
        console.log(`[ORDER NOTIFICATION] Notification created for admin: ${admin._id}`);
      }
    } catch (notifErr) {
      console.error('Failed to send order notification:', notifErr);
      // Don't fail the order creation if notification fails
    }

    console.log('=== ORDER CREATION COMPLETE ===');

    // Get updated wallet balance for response
    const updatedWallet = await Wallet.findOne({ clientId }).exec();

    // Return order info (compatible response for frontend)
    return res.status(201).json({
      success: true,
      order: {
        id: order._id.toString(),
        orderId: order.orderId,
        status: order.orderStatus,
        totalAmount: order.totalAmount,
        itemCount: orderItems.length,
        createdAt: order.createdAt,
      },
      // Include tasks array for backward compatibility (empty since tasks created on approval)
      tasks: [],
      walletBalance: updatedWallet?.balance ?? 0,
      message: 'Order placed successfully. Awaiting admin approval.',
    });

  } catch (err) {
    console.error('Order creation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create order' });
  } finally {
    // Always end the session
    session.endSession();
  }
});

// =============================================
// CLIENT BILLING ROUTES
// =============================================

// GET /client/invoices - Fetch client's own invoices
router.get('/invoices', async (req, res) => {
  try {
    const clientId = req.user.id;
    const invoices = await Invoice.find({ clientId })
      .sort({ createdAt: -1 })
      .lean();
    
    return res.status(200).json({
      invoices: invoices.map(inv => ({
        id: inv._id.toString(),
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.invoiceType || 'RECHARGE',
        amount: inv.amount,
        totalAmount: inv.totalAmount || inv.amount,
        status: inv.status,
        isDownloadableByClient: inv.isDownloadableByClient,
        orderId: inv.orderId?.toString() || null,
        items: inv.items || [],
        createdAt: inv.createdAt,
      }))
    });
  } catch (err) {
    console.error('[CLIENT/INVOICES] Fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// GET /client/invoices/:invoiceId - Get single invoice
router.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { invoiceId } = req.params;
    
    const invoice = await Invoice.findOne({ _id: invoiceId, clientId })
      .populate('orderId')
      .lean();
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    return res.status(200).json({
      invoice: {
        id: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType || 'RECHARGE',
        amount: invoice.amount,
        totalAmount: invoice.totalAmount || invoice.amount,
        status: invoice.status,
        isDownloadableByClient: invoice.isDownloadableByClient,
        orderId: invoice.orderId?._id?.toString() || null,
        orderNumber: invoice.orderId?.orderId || null,
        items: invoice.items || [],
        billingSnapshot: invoice.billingSnapshot || {},
        paymentMethod: invoice.paymentMethod,
        paymentReference: invoice.paymentReference,
        createdAt: invoice.createdAt,
      }
    });
  } catch (err) {
    console.error('[CLIENT/INVOICES] Fetch single error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// GET /client/invoices/:invoiceId/download - Download invoice PDF
router.get('/invoices/:invoiceId/download', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { invoiceId } = req.params;
    
    const invoice = await billingService.getInvoiceById(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    // Verify ownership
    if (invoice.clientId?._id?.toString() !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if download is allowed
    if (!invoice.isDownloadableByClient) {
      return res.status(403).json({ error: 'Download not allowed for this invoice' });
    }
    
    const pdfBuffer = await pdfService.generateInvoicePDF(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[CLIENT/INVOICES] Download error:', err.message);
    return res.status(500).json({ error: 'Failed to download invoice' });
  }
});

// GET /client/orders/:orderId/invoice - Get invoice for specific order
router.get('/orders/:orderId/invoice', async (req, res) => {
  try {
    const clientId = req.user.id;
    const { orderId } = req.params;
    
    const invoice = await Invoice.findOne({ orderId, clientId }).lean();
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found for this order' });
    }
    
    return res.status(200).json({
      invoice: {
        id: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: invoice.invoiceType || 'ORDER',
        amount: invoice.amount,
        totalAmount: invoice.totalAmount || invoice.amount,
        status: invoice.status,
        isDownloadableByClient: invoice.isDownloadableByClient,
        items: invoice.items || [],
        createdAt: invoice.createdAt,
      }
    });
  } catch (err) {
    console.error('[CLIENT/ORDERS] Fetch invoice error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

module.exports = router;
