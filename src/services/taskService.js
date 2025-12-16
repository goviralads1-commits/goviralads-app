const Wallet = require('../models/Wallet');
const { WalletTransaction, TRANSACTION_TYPES } = require('../models/WalletTransaction');
const { Task, TASK_STATUS } = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');

async function purchaseTaskFromTemplate(clientId, templateId) {
  const template = await TaskTemplate.findById(templateId).exec();

  if (!template) {
    throw new Error('Task template not found');
  }

  if (!template.isActive) {
    throw new Error('Task template is not available');
  }

  const wallet = await Wallet.findOne({ clientId }).exec();

  if (!wallet) {
    throw new Error('Wallet not found');
  }

  if (wallet.balance < template.creditCost) {
    throw new Error('Insufficient balance');
  }

  const newBalance = wallet.balance - template.creditCost;

  if (newBalance < 0) {
    throw new Error('Insufficient balance');
  }

  wallet.balance = newBalance;
  await wallet.save();

  const task = await Task.create({
    clientId,
    title: template.name,
    description: template.description,
    creditCost: template.creditCost,
    status: TASK_STATUS.PENDING,
    assignedBy: null,
    templateId: template._id,
  });

  const transaction = await WalletTransaction.create({
    walletId: wallet._id,
    type: TRANSACTION_TYPES.TASK_PURCHASE,
    amount: -template.creditCost,
    description: `Task purchase: ${template.name}`,
    referenceId: task._id,
  });

  return {
    task,
    transaction,
    newBalance: wallet.balance,
  };
}

async function assignTaskToClient(adminId, clientId, taskData) {
  const { title, description, creditCost } = taskData;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('Valid title is required');
  }

  if (typeof creditCost !== 'number' || creditCost < 0) {
    throw new Error('creditCost must be a non-negative number');
  }

  const wallet = await Wallet.findOne({ clientId }).exec();

  if (!wallet) {
    throw new Error('Client wallet not found');
  }

  if (wallet.balance < creditCost) {
    throw new Error('Insufficient balance');
  }

  const newBalance = wallet.balance - creditCost;

  if (newBalance < 0) {
    throw new Error('Insufficient balance');
  }

  wallet.balance = newBalance;
  await wallet.save();

  const task = await Task.create({
    clientId,
    title: title.trim(),
    description: description ? description.trim() : '',
    creditCost,
    status: TASK_STATUS.PENDING,
    assignedBy: adminId,
    templateId: null,
  });

  const transaction = await WalletTransaction.create({
    walletId: wallet._id,
    type: TRANSACTION_TYPES.TASK_ASSIGNED,
    amount: -creditCost,
    description: `Admin assigned task: ${title.trim()}`,
    referenceId: task._id,
  });

  return {
    task,
    transaction,
    newBalance: wallet.balance,
  };
}

module.exports = {
  purchaseTaskFromTemplate,
  assignTaskToClient,
};
