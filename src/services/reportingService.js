const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const { WalletTransaction } = require('../models/WalletTransaction');
const { Task } = require('../models/Task');
const User = require('../models/User');

// Helper: calculate dual-pool balance
function calcBalance(wallet) {
  const now = new Date();
  const subNotExpired = wallet.subscriptionExpiresAt && new Date(wallet.subscriptionExpiresAt) > now;
  return (wallet.walletCredits || 0) + (subNotExpired ? (wallet.subscriptionCredits || 0) : 0);
}

// 1. System Overview (not directly called — endpoint inlines its own logic)
async function getSystemOverview() {
  const totalClients = await User.countDocuments({ role: 'CLIENT', isDeleted: { $ne: true } });
  const activeTasks = await Task.countDocuments({ status: { $in: ['ACTIVE', 'IN_PROGRESS'] }, isListedInPlans: { $ne: true } });
  const wallets = await Wallet.find({}).exec();
  const totalCredits = wallets.reduce((sum, w) => sum + calcBalance(w), 0);
  return { totalClients, activeTasks, totalCredits };
}

// 2. Credit Flow by Period
async function getCreditFlowByPeriod(period = 'weekly', startDate, endDate) {
  const now = new Date();
  let start, end;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate + 'T23:59:59.999Z');
  } else {
    end = now;
    switch (period) {
      case 'daily':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'weekly':
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  const transactions = await WalletTransaction.find({
    createdAt: { $gte: start, $lte: end },
  }).exec();

  let creditsAdded = 0;
  let creditsSpent = 0;

  for (const t of transactions) {
    const val = t.credits !== undefined && t.credits !== 0 ? t.credits : t.amount;
    if (val > 0) {
      creditsAdded += Math.abs(val);
    } else if (val < 0) {
      creditsSpent += Math.abs(val);
    }
  }

  return {
    period,
    creditsAdded,
    creditsSpent,
    netFlow: creditsAdded - creditsSpent,
  };
}

// 3. Top Spenders
async function getTopSpenders(limit = 10) {
  const wallets = await Wallet.find({})
    .populate('clientId', 'identifier')
    .exec();

  const results = [];
  for (const wallet of wallets) {
    if (!wallet.clientId) continue;
    const spending = await WalletTransaction.aggregate([
      { $match: { walletId: wallet._id, amount: { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
    ]);
    const totalSpent = spending[0]?.total || 0;
    if (totalSpent > 0) {
      results.push({
        clientId: wallet.clientId._id.toString(),
        identifier: wallet.clientId.identifier,
        totalSpent,
      });
    }
  }

  return results.sort((a, b) => b.totalSpent - a.totalSpent).slice(0, limit);
}

// 4. Task Analytics by Status
async function getTaskAnalyticsByStatus() {
  const tasks = await Task.find({ isDeleted: { $ne: true }, isListedInPlans: { $ne: true } }).exec();

  const statusDistribution = {};
  for (const t of tasks) {
    statusDistribution[t.status] = (statusDistribution[t.status] || 0) + 1;
  }

  const totalTasks = tasks.length;
  const completed = statusDistribution['COMPLETED'] || 0;
  const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  return { statusDistribution, totalTasks, completionRate };
}

// 5. Task Analytics by Template
async function getTaskAnalyticsByTemplate() {
  const tasks = await Task.find({ isDeleted: { $ne: true }, templateId: { $ne: null } })
    .populate('templateId', 'name')
    .exec();

  const templateMap = {};
  for (const t of tasks) {
    const name = t.templateId?.name || 'Unknown';
    templateMap[name] = (templateMap[name] || 0) + 1;
  }

  return Object.entries(templateMap)
    .map(([templateName, count]) => ({ templateName, count }))
    .sort((a, b) => b.count - a.count);
}

// 6. Client Wallet Summary
async function getClientWalletSummary(clientId) {
  const wallet = await Wallet.findOne({ clientId }).exec();
  if (!wallet) return null;

  const currentBalance = calcBalance(wallet);

  const transactions = await WalletTransaction.find({ walletId: wallet._id }).exec();

  let lifetimeSpending = 0;
  let lifetimeAdded = 0;

  for (const t of transactions) {
    const val = t.credits !== undefined && t.credits !== 0 ? t.credits : t.amount;
    if (val > 0) {
      lifetimeAdded += Math.abs(val);
    } else if (val < 0) {
      lifetimeSpending += Math.abs(val);
    }
  }

  return { currentBalance, lifetimeSpending, lifetimeAdded };
}

// 7. Client Task Summary
async function getClientTaskSummary(clientId) {
  const tasks = await Task.find({ clientId, isDeleted: { $ne: true } }).exec();

  const tasksByStatus = {};
  for (const t of tasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
  }

  const totalTasks = tasks.length;
  const completed = tasksByStatus['COMPLETED'] || 0;
  const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  return { totalTasks, tasksByStatus, completionRate };
}

// 8. Client Recent Activity
async function getClientRecentActivity(clientId, days = 7) {
  const wallet = await Wallet.findOne({ clientId }).exec();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let spending = 0;
  if (wallet) {
    const transactions = await WalletTransaction.find({
      walletId: wallet._id,
      amount: { $lt: 0 },
      createdAt: { $gte: startDate },
    }).exec();
    spending = transactions.reduce((sum, t) => sum + Math.abs(t.credits || t.amount || 0), 0);
  }

  const tasksCreated = await Task.countDocuments({
    clientId,
    createdAt: { $gte: startDate },
  }).exec();

  return { spending, tasksCreated };
}

module.exports = {
  getSystemOverview,
  getCreditFlowByPeriod,
  getTopSpenders,
  getTaskAnalyticsByStatus,
  getTaskAnalyticsByTemplate,
  getClientWalletSummary,
  getClientTaskSummary,
  getClientRecentActivity,
};

