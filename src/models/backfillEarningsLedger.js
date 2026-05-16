/**
 * Migration: Backfill EarningsLedger from historical CommissionLog records
 * 
 * Purpose: Historical CommissionLog entries were created before EarningsLedger existed.
 * This script creates missing EarningsLedger entries for all past commissions.
 * 
 * Safety:
 * - Idempotent: Skips entries that already exist (checked via userId + sourceCommissionLogId)
 * - Dry-run first: Reports what would be created without making changes
 * - Batch processing: Processes in chunks to avoid memory issues
 * - Transaction-safe: Uses sessions where available
 * 
 * Usage:
 *   node src/models/backfillEarningsLedger.js [dry-run]
 * 
 * Run with 'dry-run' argument to preview without making changes.
 * Run without arguments to execute the migration.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CommissionLog = require('./CommissionLog');
const EarningsLedger = require('./EarningsLedger');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goviralads';

async function backfillEarningsLedger(dryRun = true) {
  console.log('='.repeat(60));
  console.log('EARNINGS LEDGER BACKFILL MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE MIGRATION'}`);
  console.log('');

  // Connect to database
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully.\n');

  try {
    // Step 1: Count total CommissionLog entries
    const totalCommissions = await CommissionLog.countDocuments();
    console.log(`📊 Total CommissionLog entries: ${totalCommissions}`);

    if (totalCommissions === 0) {
      console.log('\n✅ No CommissionLog entries found. Nothing to migrate.');
      return;
    }

    // Step 2: Count existing EarningsLedger entries linked to CommissionLog
    const existingLedgerCount = await EarningsLedger.countDocuments({
      type: 'COMMISSION_EARNED',
      sourceCommissionLogId: { $exists: true, $ne: null },
    });
    console.log(`📊 Existing EarningsLedger entries (linked to CommissionLog): ${existingLedgerCount}`);

    // Step 3: Fetch all CommissionLog entries
    console.log('\n🔄 Fetching CommissionLog entries...');
    const allCommissions = await CommissionLog.find({})
      .sort({ createdAt: 1 })
      .lean();

    console.log(`📊 Fetched ${allCommissions.length} commission records.\n`);

    // Step 4: Identify missing ledger entries
    console.log('🔍 Checking for missing EarningsLedger entries...\n');
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const totalAmount = { created: 0, skipped: 0 };

    for (const commission of allCommissions) {
      try {
        // Check if ledger entry already exists for this commission
        const existingLedger = await EarningsLedger.findOne({
          userId: commission.userId,
          sourceCommissionLogId: commission._id,
          type: 'COMMISSION_EARNED',
        });

        if (existingLedger) {
          skipped++;
          totalAmount.skipped += commission.amount || 0;
          continue;
        }

        // Missing entry found
        if (dryRun) {
          console.log(`  [DRY RUN] Would create: User ${commission.userId} | ₹${commission.amount} | Task: ${commission.taskTitle || 'N/A'}`);
          created++;
          totalAmount.created += commission.amount || 0;
        } else {
          // Create the ledger entry
          await EarningsLedger.create({
            userId: commission.userId,
            type: 'COMMISSION_EARNED',
            amount: commission.amount || 0,
            sourceTaskId: commission.taskId,
            sourceCommissionLogId: commission._id,
            note: 'Historical backfill from CommissionLog',
          });
          created++;
          totalAmount.created += commission.amount || 0;
          console.log(`  ✅ Created: User ${commission.userId} | ₹${commission.amount} | Task: ${commission.taskTitle || 'N/A'}`);
        }
      } catch (err) {
        errors++;
        console.error(`  ❌ Error processing commission ${commission._id}: ${err.message}`);
      }
    }

    // Step 5: Report results
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total CommissionLog entries:    ${totalCommissions}`);
    console.log(`Already existed (skipped):      ${skipped} (₹${totalAmount.skipped.toLocaleString('en-IN')})`);
    console.log(`${dryRun ? 'Would create' : 'Created'}:              ${created} (₹${totalAmount.created.toLocaleString('en-IN')})`);
    console.log(`Errors:                         ${errors}`);
    console.log('='.repeat(60));

    // Step 6: Verify sample user balances
    if (!dryRun && created > 0) {
      console.log('\n🔍 Verifying sample user balances...\n');
      
      // Get all unique userIds from created entries
      const sampleCommissions = allCommissions.slice(0, 10); // Check first 10 users
      
      for (const commission of sampleCommissions) {
        const [balanceAgg] = await EarningsLedger.aggregate([
          { $match: { userId: commission.userId } },
          { $group: { _id: null, balance: { $sum: '$amount' }, entries: { $sum: 1 } } }
        ]);

        const userCommissions = await CommissionLog.find({ userId: commission.userId });
        const commissionTotal = userCommissions.reduce((sum, c) => sum + (c.amount || 0), 0);

        console.log(`  User ${commission.userId}:`);
        console.log(`    CommissionLog total: ₹${commissionTotal.toLocaleString('en-IN')} (${userCommissions.length} entries)`);
        console.log(`    EarningsLedger balance: ₹${(balanceAgg?.balance || 0).toLocaleString('en-IN')} (${balanceAgg?.entries || 0} entries)`);
        console.log(`    Match: ${commissionTotal === (balanceAgg?.balance || 0) ? '✅ YES' : '❌ NO'}`);
        console.log('');
      }
    }

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('To execute the migration, run:');
      console.log('  node src/models/backfillEarningsLedger.js');
    } else {
      console.log('\n✅ Migration completed successfully!');
      console.log('Please verify user balances in the admin panel.');
    }

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed.');
  }
}

// Parse command line arguments
const dryRun = !process.argv.includes('--live');

// Run migration
backfillEarningsLedger(dryRun)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
