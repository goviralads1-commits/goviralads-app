/**
 * Migration script: Hybrid Credit System
 * 
 * Migrates existing wallet data to the new hybrid credit system:
 * 1. Moves wallet.balance → wallet.walletCredits
 * 2. Syncs active UserSubscription.creditsRemaining → wallet.subscriptionCredits
 * 
 * Run once after deploying the hybrid credit system changes.
 * Safe to run multiple times (idempotent).
 * 
 * Usage: node src/models/migrateHybridCredits.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');

const Wallet = require('./Wallet');
const UserSubscription = require('./UserSubscription');

async function migrateHybridCredits() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.MONGO_URI);
    console.log('Connected.');

    console.log('\n=== HYBRID CREDIT MIGRATION ===\n');

    // 1. Migrate balance → walletCredits for wallets without walletCredits set
    console.log('Step 1: Migrating balance → walletCredits...');
    const walletsToMigrate = await Wallet.find({
      $or: [
        { walletCredits: { $exists: false } },
        { walletCredits: null },
        { walletCredits: 0, balance: { $gt: 0 } }
      ]
    }).exec();

    let migratedWallets = 0;
    for (const wallet of walletsToMigrate) {
      if ((wallet.balance || 0) > 0 && (wallet.walletCredits || 0) === 0) {
        wallet.walletCredits = wallet.balance;
        await wallet.save();
        migratedWallets++;
        console.log(`  Migrated wallet ${wallet._id}: balance ${wallet.balance} → walletCredits`);
      }
    }
    console.log(`  Total wallets migrated: ${migratedWallets}`);

    // 2. Sync active UserSubscription → wallet.subscriptionCredits
    console.log('\nStep 2: Syncing active subscriptions → subscriptionCredits...');
    const now = new Date();
    const activeSubs = await UserSubscription.find({
      isActive: true,
      expiresAt: { $gt: now }
    }).exec();

    let syncedSubs = 0;
    for (const sub of activeSubs) {
      const wallet = await Wallet.findOne({ clientId: sub.userId }).exec();
      if (wallet) {
        // Only sync if subscription credits differ
        if ((wallet.subscriptionCredits || 0) !== sub.creditsRemaining ||
            !wallet.subscriptionExpiresAt ||
            wallet.subscriptionExpiresAt.getTime() !== sub.expiresAt.getTime()) {
          wallet.subscriptionCredits = sub.creditsRemaining;
          wallet.subscriptionExpiresAt = sub.expiresAt;
          await wallet.save();
          syncedSubs++;
          console.log(`  Synced wallet ${wallet._id}: subscriptionCredits = ${sub.creditsRemaining}, expires = ${sub.expiresAt}`);
        }
      }
    }
    console.log(`  Total subscriptions synced: ${syncedSubs}`);

    console.log('\n=== MIGRATION COMPLETE ===');
    console.log(`Wallets migrated: ${migratedWallets}`);
    console.log(`Subscriptions synced: ${syncedSubs}`);

  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

// Run migration
migrateHybridCredits();
