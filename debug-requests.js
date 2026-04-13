require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./src/config');
const { SubscriptionRequest } = require('./src/models/SubscriptionRequest');
const { RechargeRequest } = require('./src/models/RechargeRequest');

async function debugRequests() {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log('Connected to MongoDB\n');

    // Last 10 Subscription Requests
    console.log('=== LAST 10 SUBSCRIPTION REQUESTS ===');
    const subs = await SubscriptionRequest.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    subs.forEach((s, i) => {
      console.log(`${i+1}. _id: ${s._id}`);
      console.log(`   clientId: ${s.clientId}`);
      console.log(`   planId: ${s.planId}`);
      console.log(`   status: "${s.status}"`);
      console.log(`   createdAt: ${s.createdAt}`);
      console.log('');
    });

    // Last 10 Recharge Requests
    console.log('=== LAST 10 RECHARGE REQUESTS ===');
    const recharges = await RechargeRequest.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    recharges.forEach((r, i) => {
      console.log(`${i+1}. _id: ${r._id}`);
      console.log(`   clientId: ${r.clientId}`);
      console.log(`   amount: ${r.amount}`);
      console.log(`   status: "${r.status}"`);
      console.log(`   createdAt: ${r.createdAt}`);
      console.log('');
    });

    // Counts
    const pendingSubs = await SubscriptionRequest.countDocuments({ status: 'PENDING' });
    const approvedSubs = await SubscriptionRequest.countDocuments({ status: 'APPROVED' });
    const rejectedSubs = await SubscriptionRequest.countDocuments({ status: 'REJECTED' });
    
    const pendingRecharges = await RechargeRequest.countDocuments({ status: 'PENDING' });
    const approvedRecharges = await RechargeRequest.countDocuments({ status: 'APPROVED' });
    const rejectedRecharges = await RechargeRequest.countDocuments({ status: 'REJECTED' });

    console.log('=== COUNTS ===');
    console.log(`Subscription Requests:`);
    console.log(`  PENDING: ${pendingSubs}`);
    console.log(`  APPROVED: ${approvedSubs}`);
    console.log(`  REJECTED: ${rejectedSubs}`);
    console.log(`\nRecharge Requests:`);
    console.log(`  PENDING: ${pendingRecharges}`);
    console.log(`  APPROVED: ${approvedRecharges}`);
    console.log(`  REJECTED: ${rejectedRecharges}`);

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

debugRequests();
