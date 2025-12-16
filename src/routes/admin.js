const express = require('express');
const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task, TASK_STATUS } = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');
const { assignTaskToClient } = require('../services/taskService');
const { getSystemOverview, getCreditFlowByPeriod, getTopSpenders, getTaskAnalyticsByTemplate, getTaskAnalyticsByStatus, getClientWalletSummary, getClientTaskSummary, getClientRecentActivity } = require('../services/reportingService');
const { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsRead, createNotification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
const User = require('../models/User');
const { ROLES } = require('../config');
const { authenticateJWT } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorization');

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

    const transactions = await WalletTransaction.find({ walletId: wallet._id })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      clientId: client._id.toString(),
      clientIdentifier: client.identifier,
      balance: wallet.balance,
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

    const request = await RechargeRequest.findById(id).exec();

    if (!request) {
      return res.status(404).json({ error: 'Recharge request not found' });
    }

    if (request.status !== RECHARGE_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be approved' });
    }

    const wallet = await Wallet.findOne({ clientId: request.clientId }).exec();

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found for this client' });
    }

    wallet.balance += request.amount;
    await wallet.save();

    const transaction = await WalletTransaction.create({
      walletId: wallet._id,
      type: TRANSACTION_TYPES.RECHARGE_APPROVED,
      amount: request.amount,
      description: `Recharge approved: ${request.paymentReference}`,
      referenceId: request._id,
    });

    request.status = RECHARGE_STATUS.APPROVED;
    request.reviewedBy = adminId;
    await request.save();

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: request.clientId,
        type: NOTIFICATION_TYPES.RECHARGE_APPROVED,
        title: 'Recharge Approved',
        message: `Your recharge request for ${request.amount} credits has been approved.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.RECHARGE_REQUEST,
          entityId: request._id,
        },
      });
    } catch (err) {
      console.error('Failed to notify client of recharge approval:', err.message);
    }
    // ------------------------------------

    return res.status(200).json({
      id: request._id.toString(),
      clientId: request.clientId.toString(),
      amount: request.amount,
      paymentReference: request.paymentReference,
      status: request.status,
      reviewedBy: adminId,
      walletBalance: wallet.balance,
      transactionId: transaction._id.toString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to approve recharge request' });
  }
});

router.post('/recharge-requests/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const request = await RechargeRequest.findById(id).exec();

    if (!request) {
      return res.status(404).json({ error: 'Recharge request not found' });
    }

    if (request.status !== RECHARGE_STATUS.PENDING) {
      return res.status(400).json({ error: 'Only PENDING requests can be rejected' });
    }

    request.status = RECHARGE_STATUS.REJECTED;
    request.reviewedBy = adminId;
    await request.save();

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: request.clientId,
        type: NOTIFICATION_TYPES.RECHARGE_REJECTED,
        title: 'Recharge Rejected',
        message: `Your recharge request for ${request.amount} credits has been rejected.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.RECHARGE_REQUEST,
          entityId: request._id,
        },
      });
    } catch (err) {
      console.error('Failed to notify client of recharge rejection:', err.message);
    }
    // ------------------------------------

    return res.status(200).json({
      id: request._id.toString(),
      clientId: request.clientId.toString(),
      amount: request.amount,
      paymentReference: request.paymentReference,
      status: request.status,
      reviewedBy: adminId,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject recharge request' });
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const { clientId, status } = req.query;

    let filter = {};

    if (clientId) {
      filter.clientId = clientId;
    }

    if (status) {
      if (!Object.values(TASK_STATUS).includes(status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      filter.status = status;
    }

    const tasks = await Task.find(filter)
      .populate('clientId', 'identifier')
      .populate('assignedBy', 'identifier')
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      tasks: tasks.map((t) => ({
        id: t._id.toString(),
        clientId: t.clientId._id.toString(),
        clientIdentifier: t.clientId.identifier,
        title: t.title,
        description: t.description,
        creditCost: t.creditCost,
        status: t.status,
        assignedBy: t.assignedBy ? t.assignedBy._id.toString() : null,
        assignedByIdentifier: t.assignedBy ? t.assignedBy.identifier : null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId)
      .populate('clientId', 'identifier')
      .populate('assignedBy', 'identifier')
      .exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(200).json({
      id: task._id.toString(),
      clientId: task.clientId._id.toString(),
      clientIdentifier: task.clientId.identifier,
      title: task.title,
      description: task.description,
      creditCost: task.creditCost,
      status: task.status,
      assignedBy: task.assignedBy ? task.assignedBy._id.toString() : null,
      assignedByIdentifier: task.assignedBy ? task.assignedBy.identifier : null,
      templateId: task.templateId ? task.templateId.toString() : null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve task details' });
  }
});

router.post('/tasks/assign', async (req, res) => {
  try {
    const adminId = req.user.id;
    const { clientId, title, description, creditCost } = req.body || {};

    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Valid title is required' });
    }

    if (creditCost === undefined || creditCost === null) {
      return res.status(400).json({ error: 'creditCost is required' });
    }

    if (typeof creditCost !== 'number' || creditCost < 0) {
      return res.status(400).json({ error: 'creditCost must be a non-negative number' });
    }

    const client = await User.findById(clientId).exec();

    if (!client || client.role !== ROLES.CLIENT) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await assignTaskToClient(adminId, clientId, {
      title,
      description: description || '',
      creditCost,
    });

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: clientId,
        type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
        title: 'New Task Assigned',
        message: `A new task has been assigned to you: ${title}`,
        relatedEntity: {
          entityType: ENTITY_TYPES.TASK,
          entityId: result.task._id,
        },
      });
    } catch (err) {
      console.error('Failed to notify client of task assignment:', err.message);
    }
    // ------------------------------------

    return res.status(201).json({
      task: {
        id: result.task._id.toString(),
        clientId: result.task.clientId.toString(),
        title: result.task.title,
        description: result.task.description,
        creditCost: result.task.creditCost,
        status: result.task.status,
        assignedBy: result.task.assignedBy.toString(),
        createdAt: result.task.createdAt,
      },
      walletBalance: result.newBalance,
      transactionId: result.transaction._id.toString(),
    });
  } catch (err) {
    if (err.message === 'Insufficient balance') {
      return res.status(400).json({ error: 'Client has insufficient balance' });
    }
    if (err.message === 'Client wallet not found') {
      return res.status(404).json({ error: 'Client wallet not found' });
    }
    if (err.message === 'Valid title is required') {
      return res.status(400).json({ error: 'Valid title is required' });
    }
    if (err.message === 'creditCost must be a non-negative number') {
      return res.status(400).json({ error: 'creditCost must be a non-negative number' });
    }
    return res.status(500).json({ error: 'Failed to assign task' });
  }
});

router.patch('/tasks/:taskId/status', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    if (!Object.values(TASK_STATUS).includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const task = await Task.findById(taskId).exec();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const validTransitions = {
      PENDING: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowedStatuses = validTransitions[task.status] || [];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from ${task.status} to ${status}`,
      });
    }

    task.status = status;
    await task.save();

    // --- Notification Hook (Phase 5) ---
    try {
      await createNotification({
        recipientId: task.clientId,
        type: NOTIFICATION_TYPES.TASK_STATUS_CHANGED,
        title: `Task Status Updated`,
        message: `Your task "${task.title}" status has been updated to ${status}.`,
        relatedEntity: {
          entityType: ENTITY_TYPES.TASK,
          entityId: task._id,
        },
      });
    } catch (err) {
      console.error('Failed to notify client of task status change:', err.message);
    }
    // ------------------------------------

    return res.status(200).json({
      id: task._id.toString(),
      clientId: task.clientId.toString(),
      title: task.title,
      status: task.status,
      updatedAt: task.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update task status' });
  }
});

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
    const overview = await getSystemOverview();

    return res.status(200).json({
      systemStats: {
        totalClients: overview.totalClients,
        totalWalletBalance: overview.totalWalletBalance,
        totalCreditsCirculated: overview.totalCreditsCirculated,
        totalTasks: overview.totalTasks,
      },
      rechargeRequests: overview.rechargeRequests,
      activeTasks: overview.activeTasks,
    });
  } catch (err) {
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

module.exports = router;
