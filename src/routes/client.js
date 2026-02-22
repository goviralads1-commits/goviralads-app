const express = require('express');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task, TASK_STATUS } = require('../models/Task');
const { Category } = require('../models/Category');
const TaskTemplate = require('../models/TaskTemplate');
const Subscription = require('../models/Subscription');
const Notice = require('../models/Notice');
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

    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const totalTransactions = await WalletTransaction.countDocuments({ walletId: wallet._id }).exec();

    return res.status(200).json({
      balance: wallet.balance,
      transactions: transactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
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
        progress: task.progress,
        status: task.status,
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
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task' });
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

    console.log('=== PLAN PURCHASE START ===');
    console.log('Client ID:', clientId);
    console.log('Plan ID:', planId);

    // 1. Fetch the plan
    const plan = await Task.findById(planId).exec();

    if (!plan) {
      console.log('Plan not found');
      return res.status(404).json({ error: 'Plan not found' });
    }

    // 2. Validate it's a plan
    if (!plan.isListedInPlans) {
      console.log('Not a valid plan (isListedInPlans = false)');
      return res.status(400).json({ error: 'This is not a purchasable plan' });
    }

    if (plan.clientId !== null) {
      console.log('Plan already assigned to a client');
      return res.status(400).json({ error: 'This plan is no longer available' });
    }

    // 3. Check if plan is active
    if (!plan.isActivePlan) {
      console.log('Plan is not active');
      return res.status(400).json({ error: 'This plan is not available' });
    }

    // 4. Check visibility rules
    const visibility = plan.visibility || 'PUBLIC';
    if (visibility === 'HIDDEN') {
      console.log('Plan is hidden');
      return res.status(400).json({ error: 'This plan is not available' });
    }
    if (visibility === 'SELECTED') {
      const allowedClients = plan.allowedClients || [];
      const isAllowed = allowedClients.some(id => id.toString() === clientId);
      if (!isAllowed) {
        console.log('Client not in allowed list');
        return res.status(403).json({ error: 'You are not eligible for this plan' });
      }
    }

    // 5. Check targeting (legacy)
    if (plan.targetClients && plan.targetClients.length > 0) {
      const isTargeted = plan.targetClients.some(targetId => targetId.toString() === clientId);
      if (!isTargeted) {
        console.log('Client not in target list');
        return res.status(403).json({ error: 'You are not eligible for this plan' });
      }
    }

    // 6. Determine price
    console.log('=== PHASE F PRICE DECISION ===');
    console.log('creditCost:', plan.creditCost);
    console.log('offerPrice:', plan.offerPrice);
    console.log('originalPrice:', plan.originalPrice, '(DISPLAY ONLY)');
    const price = plan.offerPrice || plan.creditCost || 0;
    console.log('finalDeduction:', price);
    console.log('Logic: offerPrice ?? creditCost');

    // 7. Get wallet
    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      console.log('Wallet not found');
      return res.status(404).json({ error: 'Wallet not found' });
    }

    console.log('Wallet balance before:', wallet.balance);

    // 8. Check balance
    if (wallet.balance < price) {
      console.log('Insufficient balance');
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 9. Deduct wallet (ATOMIC)
    wallet.balance -= price;
    await wallet.save();

    console.log('Wallet balance after:', wallet.balance);

    // 10. Create wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: 'PLAN_PURCHASE',
      amount: -price,
      description: `Plan Purchase: ${plan.title}`,
      referenceId: null, // Will update after task creation
    });

    // 11. Clone task for client (DO NOT MODIFY ORIGINAL)
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
      autoCompletionCap: plan.autoCompletionCap || 100
    });

    console.log('Task created:', newTask._id.toString());
    console.log('MODE: TASK (converted from PLAN)');
    console.log('VISIBILITY TARGET: ClientTasks | AdminTasks');
    console.log('=== PLAN PURCHASE COMPLETE ===');

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

    console.log('=== SUBSCRIPTION PURCHASE START ===');
    console.log('Client ID:', clientId);
    console.log('Subscription ID:', id);

    // 1. Fetch the subscription
    const subscription = await Subscription.findById(id).populate('tasks').exec();

    if (!subscription) {
      console.log('Subscription not found');
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // 2. Validate it's active
    if (!subscription.isActive) {
      console.log('Subscription not active');
      return res.status(400).json({ error: 'This subscription is not available' });
    }

    // 3. Check targeting
    if (subscription.targetClients && subscription.targetClients.length > 0) {
      const isTargeted = subscription.targetClients.some(targetId => targetId.toString() === clientId);
      if (!isTargeted) {
        console.log('Client not in target list');
        return res.status(403).json({ error: 'You are not eligible for this subscription' });
      }
    }

    // 4. Determine price
    console.log('=== PHASE F PRICE DECISION (SUBSCRIPTION) ===');
    console.log('totalPrice:', subscription.totalPrice);
    console.log('offerPrice:', subscription.offerPrice);
    const price = subscription.offerPrice || subscription.totalPrice || 0;
    console.log('finalDeduction:', price);
    console.log('Logic: offerPrice ?? totalPrice');

    // 5. Get wallet
    const wallet = await Wallet.findOne({ clientId }).exec();

    if (!wallet) {
      console.log('Wallet not found');
      return res.status(404).json({ error: 'Wallet not found' });
    }

    console.log('Wallet before:', wallet.balance);

    // 6. Check balance
    if (wallet.balance < price) {
      console.log('Insufficient balance');
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 7. Deduct wallet (ATOMIC)
    wallet.balance -= price;
    await wallet.save();

    console.log('Wallet after:', wallet.balance);

    // 8. Create wallet transaction
    await WalletTransaction.create({
      walletId: wallet._id,
      type: 'SUBSCRIPTION_PURCHASE',
      amount: -price,
      description: `Subscription Purchase: ${subscription.title}`,
      referenceId: null,
    });

    // 9. Clone all tasks for client (DO NOT MODIFY ORIGINALS)
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

    console.log('Tasks cloned:', clonedTasks);
    console.log('=== SUBSCRIPTION PURCHASE COMPLETE ===');

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
    return res.status(200).json({
      tasks: tasks.map((t) => ({
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
        progress: t.progress,
        status: t.status,
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
      })),
    });
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
    const filter = {
      isActive: true,
      $or: [
        { targetType: 'ALL' },
        { targetType: 'SELECTED', targetClients: clientId },
      ],
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    };

    // Combine $or conditions properly
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
    const { name, phone, photoUrl, company, timezone, language, preferences } = req.body || {};

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

    // Update preferences
    if (preferences) {
      if (preferences.emailNotifications !== undefined) user.preferences.emailNotifications = preferences.emailNotifications;
      if (preferences.inAppNotifications !== undefined) user.preferences.inAppNotifications = preferences.inAppNotifications;
      if (preferences.marketingEmails !== undefined) user.preferences.marketingEmails = preferences.marketingEmails;
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
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
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
      message: message.trim(),
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

module.exports = router;
