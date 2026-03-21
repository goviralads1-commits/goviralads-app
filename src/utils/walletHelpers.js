/**
 * Wallet Helper Functions
 * 
 * RULE: Runtime expiry check is the ONLY source of truth
 * Never use subscriptionCredits directly - always use getAvailableSubscriptionCredits()
 */

/**
 * Get available subscription credits (respects expiry)
 * @param {Object} wallet - Wallet document
 * @returns {number} Available subscription credits (0 if expired)
 */
function getAvailableSubscriptionCredits(wallet) {
  if (!wallet) return 0;
  
  const now = new Date();
  const expiresAt = wallet.subscriptionExpiresAt;
  
  // Check expiry
  const isExpired = !expiresAt || new Date(expiresAt) < now;
  
  if (isExpired) {
    return 0;
  }
  
  return wallet.subscriptionCredits || 0;
}

/**
 * Get total available credits (subscription + wallet)
 * @param {Object} wallet - Wallet document
 * @returns {number} Total available credits
 */
function getTotalAvailableCredits(wallet) {
  if (!wallet) return 0;
  
  const subCredits = getAvailableSubscriptionCredits(wallet);
  // SINGLE SOURCE OF TRUTH: walletCredits only (ignore legacy balance)
  const walletCredits = wallet.walletCredits || 0;
  
  return subCredits + walletCredits;
}

/**
 * Check if subscription is active (not expired and has credits)
 * @param {Object} wallet - Wallet document
 * @returns {boolean} True if subscription is active
 */
function hasActiveSubscription(wallet) {
  return getAvailableSubscriptionCredits(wallet) > 0;
}

module.exports = {
  getAvailableSubscriptionCredits,
  getTotalAvailableCredits,
  hasActiveSubscription,
};
