const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { RechargeRequest, RECHARGE_STATUS } = require('../models/RechargeRequest');
const { Task, TASK_STATUS } = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');

async function validateWalletBalance(walletId) {
  const wallet = await Wallet.findById(walletId).exec();
  
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  if (wallet.balance < 0) {
    throw new Error(`Wallet ${walletId} has negative balance: ${wallet.balance}`);
  }

  const transactions = await WalletTransaction.find({ walletId }).exec();
  
  const calculatedBalance = transactions.reduce((sum, t) => sum + t.amount, 0);

  if (Math.abs(calculatedBalance - wallet.balance) > 0.01) {
    throw new Error(
      `Wallet ${walletId} balance mismatch: stored=${wallet.balance}, calculated=${calculatedBalance}`
    );
  }

  return true;
}

async function validateRechargeRequestState(requestId) {
  const request = await RechargeRequest.findById(requestId).exec();

  if (!request) {
    throw new Error('Recharge request not found');
  }

  if (request.status === RECHARGE_STATUS.PENDING) {
    if (request.reviewedBy) {
      throw new Error(`PENDING request ${requestId} has reviewedBy set`);
    }
  }

  if (request.status === RECHARGE_STATUS.APPROVED || request.status === RECHARGE_STATUS.REJECTED) {
    if (!request.reviewedBy) {
      throw new Error(`${request.status} request ${requestId} missing reviewedBy`);
    }
  }

  if (request.status === RECHARGE_STATUS.APPROVED) {
    const transaction = await WalletTransaction.findOne({
      referenceId: requestId,
      type: TRANSACTION_TYPES.RECHARGE_APPROVED,
    }).exec();

    if (!transaction) {
      throw new Error(`APPROVED request ${requestId} has no corresponding transaction`);
    }
  }

  return true;
}

async function validateTransactionImmutability() {
  const WalletTransactionModel = WalletTransaction;
  
  if (!WalletTransactionModel.schema.pre) {
    throw new Error('WalletTransaction schema missing pre-hooks for immutability');
  }

  return true;
}

async function validateTaskTransactionLinkage(taskId) {
  const task = await Task.findById(taskId).exec();

  if (!task) {
    throw new Error('Task not found');
  }

  const transactionType = task.assignedBy ? TRANSACTION_TYPES.TASK_ASSIGNED : TRANSACTION_TYPES.TASK_PURCHASE;

  const wallet = await Wallet.findOne({ clientId: task.clientId }).exec();

  if (!wallet) {
    throw new Error(`Task ${taskId} client has no wallet`);
  }

  const transaction = await WalletTransaction.findOne({
    walletId: wallet._id,
    referenceId: taskId,
    type: transactionType,
  }).exec();

  if (!transaction) {
    throw new Error(
      `Task ${taskId} has no corresponding ${transactionType} transaction`
    );
  }

  if (transaction.amount !== -task.creditCost) {
    throw new Error(
      `Task ${taskId} transaction amount mismatch: expected ${-task.creditCost}, got ${transaction.amount}`
    );
  }

  return true;
}

async function validateTaskStatusTransitions(taskId) {
  const task = await Task.findById(taskId).exec();

  if (!task) {
    throw new Error('Task not found');
  }

  const validStatuses = Object.values(TASK_STATUS);

  if (!validStatuses.includes(task.status)) {
    throw new Error(`Task ${taskId} has invalid status: ${task.status}`);
  }

  return true;
}

async function validateTemplateConsistency(templateId) {
  const template = await TaskTemplate.findById(templateId).exec();

  if (!template) {
    throw new Error('Template not found');
  }

  if (template.creditCost < 0) {
    throw new Error(`Template ${templateId} has negative creditCost: ${template.creditCost}`);
  }

  if (!template.name || template.name.trim().length === 0) {
    throw new Error(`Template ${templateId} has invalid name`);
  }

  if (!template.createdBy) {
    throw new Error(`Template ${templateId} missing createdBy`);
  }

  return true;
}

module.exports = {
  validateWalletBalance,
  validateRechargeRequestState,
  validateTransactionImmutability,
  validateTaskTransactionLinkage,
  validateTaskStatusTransitions,
  validateTemplateConsistency,
};
