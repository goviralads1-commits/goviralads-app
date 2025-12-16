const express = require('express');
const Wallet = require('../models/Wallet');
const { WalletTransaction } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task } = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');
const { purchaseTaskFromTemplate } = require('../services/taskService');
const { getClientWalletSummary, getClientTaskSummary, getClientRecentActivity } = require('../services/reportingService');
const { getNotificationsForUser, markNotificationAsRead, markAllNotificationsAsRead, createNotification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../services/notificationService');
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
    const { templateId } = req.body || {};

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    const result = await purchaseTaskFromTemplate(clientId, templateId);

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

router.get('/tasks', async (req, res) => {
  try {
    const clientId = req.user.id;

    const tasks = await Task.find({ clientId })
      .sort({ createdAt: -1 })
      .exec();

    return res.status(200).json({
      tasks: tasks.map((t) => ({
        id: t._id.toString(),
        title: t.title,
        description: t.description,
        creditCost: t.creditCost,
        status: t.status,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (err) {
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

module.exports = router;
