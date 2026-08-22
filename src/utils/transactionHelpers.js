/**
 * Transaction Helpers
 *
 * Purpose: Provide computed interpretation of WalletTransaction records.
 *
 * IMPORTANT:
 * WalletTransaction.amount is NOT universally "credits".
 * Depending on transaction type it may represent ₹ money or credits.
 * WalletTransaction.credits contains credit movement for some types only.
 *
 * computeCreditDelta() returns the credit movement for any transaction type
 * as a single number: positive = credits in, negative = credits out.
 *
 * This is a READ-ONLY computed value. It does NOT modify stored data.
 */

/**
 * Compute the credit movement for a WalletTransaction.
 *
 * @param {Object} transaction - WalletTransaction document or plain object
 *   Expected fields: { type, amount, credits }
 * @returns {Number} creditDelta — positive = credit in, negative = credit out, 0 = informational
 */
function computeCreditDelta(transaction) {
  if (!transaction || !transaction.type) return 0;

  const type = transaction.type;
  const amount = Number(transaction.amount) || 0;
  const credits = Number(transaction.credits) || 0;

  switch (type) {
    // --- CREDIT IN ---

    case 'RECHARGE_APPROVED':
      // amount = ₹ paid = credits added (1:1 ratio)
      return Math.abs(amount);

    case 'SUBSCRIPTION_PURCHASE':
      // Admin approval: credits = +positive (credit inflow, base + bonus)
      // Client bundle path: credits = -negative (credit outflow)
      // Preserve sign: positive = inflow, negative = outflow
      return credits;

    case 'MANUAL_CREDIT':
      return Math.abs(amount);

    case 'CREDIT':
      // Legacy type
      return Math.abs(amount);

    case 'EARNINGS_REDEEM':
      // amount = credits equivalent added to wallet (1:1)
      return Math.abs(amount);

    // --- CREDIT OUT ---

    case 'ORDER_PAYMENT':
      // amount = negative credits
      return -Math.abs(amount);

    case 'PLAN_PURCHASE':
      // amount is 0; credits field contains negative credit deduction
      return -Math.abs(credits);

    case 'SUBSCRIPTION_DEDUCTION':
      // amount is 0; credits field contains negative credit deduction
      return -Math.abs(credits);

    case 'MANUAL_DEBIT':
      return -Math.abs(amount);

    case 'DEBIT':
      // Legacy type
      return -Math.abs(amount);

    // --- REFUNDS (CREDIT IN) ---

    case 'ORDER_REFUND':
      // amount = positive credits refunded
      return Math.abs(amount);

    case 'REFUND':
      // amount = positive credits refunded
      return Math.abs(amount);

    // --- ADMIN ADJUSTMENT (ambiguous — two creation paths) ---

    case 'ADMIN_ADJUSTMENT':
      // Path 1 (newer /admin/wallets/:clientId/adjust): amount=0, credits=value
      // Path 2 (older /admin/users/:userId/wallet POST): amount=value, credits=0
      if (credits !== 0) return credits;
      return amount;

    // --- INFORMATIONAL ---

    case 'SUBSCRIPTION_EXPIRED':
      // credits field contains negative expired credits (wallet IS zeroed)
      return -Math.abs(credits);

    case 'SUBSCRIPTION_CREDIT':
      // Credits added via subscription approval (if used)
      if (credits !== 0) return credits;
      return amount;

    case 'TASK_PURCHASE':
      // amount = negative credits deducted from wallet
      return -Math.abs(amount);

    case 'TASK_ASSIGNED':
      // amount = negative credits deducted from wallet
      return -Math.abs(amount);

    default:
      // Unknown type — attempt best effort
      if (credits !== 0) return credits;
      return amount;
  }
}

/**
 * Get a human-readable label for a transaction type.
 *
 * @param {Object} transaction - WalletTransaction document or plain object
 * @returns {String} label
 */
function getTransactionLabel(transaction) {
  if (!transaction || !transaction.type) return 'Transaction';

  const type = transaction.type;

  switch (type) {
    case 'RECHARGE_APPROVED':       return 'Wallet Recharge';
    case 'SUBSCRIPTION_PURCHASE':    return 'Buy Credits';
    case 'ORDER_PAYMENT':            return 'Order Payment';
    case 'ORDER_REFUND':             return 'Order Refund';
    case 'REFUND':                   return 'Refund';
    case 'PLAN_PURCHASE':            return 'Plan Purchase';
    case 'SUBSCRIPTION_DEDUCTION':   return 'Subscription Usage';
    case 'MANUAL_CREDIT':            return 'Manual Credit';
    case 'MANUAL_DEBIT':             return 'Manual Deduction';
    case 'ADMIN_ADJUSTMENT':         return 'Admin Adjustment';
    case 'EARNINGS_REDEEM':          return 'Earnings Redeem';
    case 'CREDIT':                   return 'Credit';
    case 'DEBIT':                    return 'Debit';
    case 'SUBSCRIPTION_EXPIRED':     return 'Subscription Expired';
    case 'SUBSCRIPTION_CREDIT':      return 'Subscription Credit';
    case 'TASK_PURCHASE':            return 'Task Purchase';
    case 'TASK_ASSIGNED':            return 'Task Assigned';
    default:                         return transaction.description || 'Transaction';
  }
}

module.exports = {
  computeCreditDelta,
  getTransactionLabel,
};
