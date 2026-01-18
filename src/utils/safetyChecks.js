const { validateWalletBalance, validateRechargeRequestState, validateTransactionImmutability, validateTaskTransactionLinkage, validateTaskStatusTransitions, validateTemplateConsistency } = require('../utils/validators');
const Wallet = require('../models/Wallet');
const { RechargeRequest } = require('../models/RechargeRequest');
const { Task } = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');

async function runPhase2SafetyChecks() {
  console.log('Running Phase 2 safety checks...');
  try {
    await validateTransactionImmutability();
    console.log('✓ WalletTransaction immutability enforced');
    const wallets = await Wallet.find().exec();
    for (const wallet of wallets) {
      await validateWalletBalance(wallet._id);
    }
    console.log(`✓ All ${wallets.length} wallet balances validated`);
    const requests = await RechargeRequest.find().exec();
    for (const request of requests) {
      await validateRechargeRequestState(request._id);
    }
    console.log(`✓ All ${requests.length} recharge request states validated`);
    console.log('Phase 2 safety checks passed');
  } catch (err) {
    console.error('Phase 2 safety check FAILED:', err.message);
    throw err;
  }
}

async function runPhase3SafetyChecks() {
  console.log('Running Phase 3 safety checks...');
  try {
    const templates = await TaskTemplate.find().exec();
    for (const template of templates) {
      await validateTemplateConsistency(template._id);
    }
    console.log(`✓ All ${templates.length} task templates validated`);
    const tasks = await Task.find().exec();
    for (const task of tasks) {
      await validateTaskStatusTransitions(task._id);
      await validateTaskTransactionLinkage(task._id);
    }
    console.log(`✓ All ${tasks.length} tasks validated`);
    console.log('Phase 3 safety checks passed');
  } catch (err) {
    console.error('Phase 3 safety check FAILED:', err.message);
    throw err;
  }
}

module.exports = {
  runPhase2SafetyChecks,
  runPhase3SafetyChecks,
};