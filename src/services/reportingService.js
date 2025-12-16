const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { Task, TASK_STATUS } = require('../models/Task');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');

async function getClientWalletSummary(clientId) {
  const wallet = await Wallet.findOne({ clientId }).exec();

  if (!wallet) {
    return null;
  }

  const transactions = await WalletTransaction.find({ walletId: wallet._id }).exec();

  const lifetimeSpending = transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const lifetimeAdded = transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    currentBalance: wallet.balance,
    lifetimeSpending,
    lifetimeAdded,
  };
}

async function getClientTaskSummary(clientId) {
  const tasks = await Task.find({ clientId }).exec();

  const tasksByStatus = {
    PENDING: 0,
    ACTIVE: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  tasks.forEach((task) => {
    if (tasksByStatus.hasOwnProperty(task.status)) {
      tasksByStatus[task.status]++;
    }
  });

  const totalTasks = tasks.length;
  const completedTasks = tasksByStatus.COMPLETED;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return {
    totalTasks,
    tasksByStatus,
    completionRate: Math.round(completionRate * 100) / 100,
  };
}

async function getClientRecentActivity(clientId, days = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const wallet = await Wallet.findOne({ clientId }).exec();

  if (!wallet) {
    return { spending: 0, tasksCreated: 0 };
  }

  const recentTransactions = await WalletTransaction.find({
    walletId: wallet._id,
    createdAt: { $gte: cutoffDate },
  }).exec();

  const spending = recentTransactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const recentTasks = await Task.countDocuments({
    clientId,
    createdAt: { $gte: cutoffDate },
  }).exec();

  return {
    spending,
    tasksCreated: recentTasks,
  };
}

async function getSystemOverview() {
  const totalClients = await Wallet.countDocuments().exec();

  const wallets = await Wallet.find().exec();
  const totalWalletBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

  const allTransactions = await WalletTransaction.find().exec();

  const totalCreditsCirculated = allTransactions
    .filter((t) => t.type === TRANSACTION_TYPES.RECHARGE_APPROVED)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalTasks = await Task.countDocuments().exec();

  const rechargeRequestCounts = await RechargeRequest.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]).exec();

  const rechargeRequests = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
  };

  rechargeRequestCounts.forEach((item) => {
    if (rechargeRequests.hasOwnProperty(item._id)) {
      rechargeRequests[item._id] = item.count;
    }
  });

  const activeTasks = await Task.countDocuments({
    status: { $in: [TASK_STATUS.PENDING, TASK_STATUS.ACTIVE] },
  }).exec();

  return {
    totalClients,
    totalWalletBalance,
    totalCreditsCirculated,
    totalTasks,
    rechargeRequests,
    activeTasks,
  };
}

async function getCreditFlowByPeriod(period = 'weekly', startDate = null, endDate = null) {
  const dateFilter = {};

  if (startDate) {
    dateFilter.$gte = new Date(startDate);
  }

  if (endDate) {
    dateFilter.$lte = new Date(endDate);
  } else if (!startDate) {
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    dateFilter.$gte = defaultStart;
  }

  const transactions = await WalletTransaction.find(
    Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}
  ).exec();

  const creditsAdded = transactions
    .filter((t) => t.type === TRANSACTION_TYPES.RECHARGE_APPROVED)
    .reduce((sum, t) => sum + t.amount, 0);

  const creditsSpent = transactions
    .filter((t) => [TRANSACTION_TYPES.TASK_PURCHASE, TRANSACTION_TYPES.TASK_ASSIGNED].includes(t.type))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netFlow = creditsAdded - creditsSpent;

  return {
    period,
    creditsAdded,
    creditsSpent,
    netFlow,
  };
}

async function getTopSpenders(limit = 10) {
  const wallets = await Wallet.find().populate('clientId', 'identifier').exec();

  const spenderData = await Promise.all(
    wallets.map(async (wallet) => {
      const transactions = await WalletTransaction.find({ walletId: wallet._id }).exec();

      const spending = transactions
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      return {
        clientId: wallet.clientId._id.toString(),
        clientIdentifier: wallet.clientId.identifier,
        spending,
      };
    })
  );

  return spenderData.sort((a, b) => b.spending - a.spending).slice(0, limit);
}

async function getTaskAnalyticsByTemplate() {
  const tasks = await Task.find().populate('templateId', 'name').exec();

  const templateCounts = {};

  tasks.forEach((task) => {
    const templateName = task.templateId ? task.templateId.name : 'Custom/Assigned';

    if (!templateCounts[templateName]) {
      templateCounts[templateName] = 0;
    }

    templateCounts[templateName]++;
  });

  return Object.entries(templateCounts)
    .map(([name, count]) => ({ templateName: name, taskCount: count }))
    .sort((a, b) => b.taskCount - a.taskCount);
}

async function getTaskAnalyticsByStatus() {
  const taskCounts = await Task.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]).exec();

  const statusDistribution = {
    PENDING: 0,
    ACTIVE: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  };

  taskCounts.forEach((item) => {
    if (statusDistribution.hasOwnProperty(item._id)) {
      statusDistribution[item._id] = item.count;
    }
  });

  const total = Object.values(statusDistribution).reduce((sum, count) => sum + count, 0);
  const completionRate = total > 0 ? (statusDistribution.COMPLETED / total) * 100 : 0;

  return {
    statusDistribution,
    totalTasks: total,
    completionRate: Math.round(completionRate * 100) / 100,
  };
}

module.exports = {
  getClientWalletSummary,
  getClientTaskSummary,
  getClientRecentActivity,
  getSystemOverview,
  getCreditFlowByPeriod,
  getTopSpenders,
  getTaskAnalyticsByTemplate,
  getTaskAnalyticsByStatus,
};
