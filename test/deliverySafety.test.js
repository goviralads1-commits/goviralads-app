'use strict';

// Offline only: every application dependency is explicitly mocked; no .env or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const copy = value => structuredClone(value);
const duplicate = () => Object.assign(new Error('fixture duplicate'), { code: 11000 });
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source(file), {
    module, Buffer, console: { log() {}, error() {} }, process: { env: {} }, ...globals,
    require: name => {
      assert.ok(Object.hasOwn(mocks, name), `Blocked unmocked import: ${name}`);
      return mocks[name];
    },
  }, { filename: file, timeout: 2000 });
  return module.exports;
}
function query(work) {
  const q = { exec: async () => work(), select: () => q, lean: () => q, session: () => q,
    sort: () => q, then: (yes, no) => q.exec().then(yes, no) };
  return q;
}
function matches(doc, filter) {
  return Object.entries(filter).every(([key, wanted]) => {
    if (key === '$or') return wanted.some(f => matches(doc, f));
    const actual = doc[key];
    if (wanted && typeof wanted === 'object' && !(wanted instanceof Date)) {
      return Object.entries(wanted).every(([op, value]) => {
        if (op === '$in') return value.includes(actual);
        if (op === '$lt') return actual < value;
        if (op === '$lte') return actual <= value;
        if (op === '$gt') return actual > value;
        if (op === '$ne') return actual !== value;
        throw new Error(`Unsupported fixture operator: ${op}`);
      });
    }
    return actual instanceof Date ? +actual === +wanted : actual === wanted;
  });
}
function update(doc, changes) {
  Object.assign(doc, copy(changes.$set || {}));
  for (const [key, value] of Object.entries(changes.$inc || {})) doc[key] = (doc[key] || 0) + value;
  for (const key of Object.keys(changes.$unset || {})) delete doc[key];
}
function transactional(state) {
  let tail = Promise.resolve();
  return { startSession: async () => ({
    withTransaction: async work => {
      const prior = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await prior;
      const before = copy(state);
      try { return await work(); }
      catch (error) { Object.assign(state, before); throw error; }
      finally { release(); }
    },
    endSession: async () => {},
  }) };
}

test('every backend module parses without executing application startup', () => {
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    }
  }
  check(path.join(root, 'src'));
});

function adminFixture(env = {}, existing) {
  let stored = existing;
  let hashes = 0;
  const logs = [];
  const mocks = {
    './User': {
      findOne: () => query(() => stored),
      create: async data => { if (stored) throw duplicate(); stored = copy(data); return stored; },
    },
    '../config': { ROLES: { ADMIN: 'ADMIN' }, mainAdminIdentifier: 'admin@example.invalid' },
    '../services/passwordService': { hashPassword: async () => { hashes++; return 'fixture-hash'; } },
  };
  const reload = () => load('src/models/seedMainAdmin.js', mocks, {
    process: { env }, console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  return { reload, hashes: () => hashes, logs, stored: () => stored };
}
test('existing disabled/deleted admin remains byte-for-byte unchanged without bootstrap config', async () => {
  const user = { identifier: 'admin@example.invalid', role: 'ADMIN', status: 'DISABLED',
    passwordHash: 'legacy-fixture', isDeleted: true, updatedAt: 'original' };
  const before = copy(user);
  const f = adminFixture({}, user);
  assert.equal(await f.reload().ensureMainAdminSeed(), user);
  assert.equal(await f.reload().ensureMainAdminSeed(), user);
  assert.deepEqual(user, before);
  assert.equal(f.hashes(), 0);
});
test('missing bootstrap config and existing non-admin fail without mutation or hashing', async () => {
  const missing = adminFixture({ NODE_ENV: 'production' });
  await assert.rejects(missing.reload().ensureMainAdminSeed(), /ADMIN_BOOTSTRAP_CONFIG_REQUIRED/);
  assert.equal(missing.hashes(), 0);
  const existing = { role: 'CLIENT', status: 'ACTIVE', passwordHash: 'original' };
  const f = adminFixture({}, existing);
  await assert.rejects(f.reload().ensureMainAdminSeed(), /IDENTITY_CONFLICT/);
  assert.deepEqual(existing, { role: 'CLIENT', status: 'ACTIVE', passwordHash: 'original' });
});
test('explicit bootstrap creates once under concurrency and never logs fixture password/hash', async () => {
  const password = crypto.randomBytes(24).toString('hex');
  const f = adminFixture({ MAIN_ADMIN_IDENTIFIER: 'admin@example.invalid', MAIN_ADMIN_PASSWORD: password });
  const [one, two] = await Promise.all([f.reload().ensureMainAdminSeed(), f.reload().ensureMainAdminSeed()]);
  assert.equal(one, two);
  assert.equal(one.role, 'ADMIN');
  await f.reload().ensureMainAdminSeed();
  assert.ok(!JSON.stringify(f.logs).includes(password));
  assert.ok(!JSON.stringify(f.logs).includes('fixture-hash'));
});

function expiryFixture(failLedger = false) {
  const now = new Date('2030-01-05T12:00:00Z');
  const state = {
    wallets: [{ _id: 'wallet', clientId: 'client', subscriptionExpiresAt: new Date('2030-01-01'),
      subscriptionCredits: 19, walletCredits: 31, balance: 7 }],
    subs: [{ userId: 'client', isActive: true, expiresAt: new Date('2030-01-01'), creditsRemaining: 19 }],
    ledger: [], notifications: [],
  };
  const mongoose = transactional(state);
  const mocks = {
    mongoose,
    '../models/UserSubscription': {
      find: filter => query(() => copy(state.subs.filter(doc => matches(doc, filter)))),
      updateMany: async (filter, changes, options) => {
        assert.ok(options.session);
        const found = state.subs.filter(doc => matches(doc, filter));
        found.forEach(doc => update(doc, changes));
        return { modifiedCount: found.length };
      },
    },
    '../models/Wallet': {
      find: filter => query(() => copy(state.wallets.filter(doc => matches(doc, filter)))),
      findOneAndUpdate: (filter, changes, options) => query(() => {
        assert.ok(options.session);
        const doc = state.wallets.find(doc => matches(doc, filter));
        if (!doc) return null;
        const before = copy(doc); update(doc, changes); return before;
      }),
    },
    '../models/WalletTransaction': {
      TRANSACTION_TYPES: { SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED' },
      WalletTransaction: { create: async (docs, options) => {
        assert.ok(options.session);
        if (failLedger) throw new Error('fixture ledger failure');
        state.ledger.push(...copy(docs));
      } },
    },
    '../models/Notification': { create: async (docs, options) => {
      assert.ok(options.session); state.notifications.push(...copy(docs));
    } },
  };
  return { state, now, mongoose, run: () => load('src/services/subscriptionExpiryService.js', mocks).expireSubscriptions(now) };
}
test('expiry commits exactly one ledger/notification across concurrent and repeated workers', async () => {
  const f = expiryFixture();
  await Promise.all([f.run(), f.run()]);
  await f.run();
  assert.equal(f.state.wallets[0].subscriptionCredits, 0);
  assert.equal(f.state.wallets[0].walletCredits, 31);
  assert.equal(f.state.wallets[0].balance, 7);
  assert.equal(f.state.ledger.length, 1);
  assert.equal(f.state.ledger[0].credits, -19);
  assert.equal(f.state.ledger[0].amount, 0);
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.subs[0].isActive, false);
});
test('ledger failure rolls back wallet, legacy subscription, and notification together', async () => {
  const f = expiryFixture(true);
  const before = copy(f.state);
  await assert.rejects(f.run(), /ledger failure/);
  assert.deepEqual(f.state, before);
});
test('expiry rechecks renewed wallets inside transaction and has no standalone fallback', async () => {
  const f = expiryFixture();
  const start = f.mongoose.startSession;
  f.mongoose.startSession = async () => {
    f.state.wallets[0].subscriptionExpiresAt = new Date('2031-01-01');
    f.state.wallets[0].subscriptionCredits = 52;
    return start();
  };
  await f.run();
  assert.equal(f.state.wallets[0].subscriptionCredits, 52);
  assert.equal(f.state.ledger.length, 0);
  const unsupported = expiryFixture();
  const before = copy(unsupported.state);
  unsupported.mongoose.startSession = async () => ({
    withTransaction: async () => { throw new Error('transactions unsupported'); }, endSession: async () => {},
  });
  await assert.rejects(unsupported.run(), /transactions unsupported/);
  assert.deepEqual(unsupported.state, before);
});

function deliveryFixture() {
  let clock = Date.parse('2030-01-05T12:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }
  const state = { entries: [], notifications: [] };
  const sends = [];
  const providerSeen = new Set();
  let mode = 'success';
  let providerDeliveries = 0;
  let failRecorded = false;
  const mongoose = transactional(state);
  const journal = {
    findById: id => query(() => copy(state.entries.find(doc => doc._id === id) || null)),
    create: async data => {
      if (state.entries.some(doc => doc._id === data._id)) throw duplicate();
      const doc = { attempts: 0, ...copy(data) }; state.entries.push(doc); return copy(doc);
    },
    findOneAndUpdate: (filter, changes) => query(() => {
      const doc = state.entries.find(doc => matches(doc, filter));
      if (!doc) return null;
      update(doc, changes); return copy(doc);
    }),
    updateOne: async (filter, changes) => {
      if (failRecorded && changes.$set?.state === 'RECORDED') throw new Error('fixture journal failure');
      const doc = state.entries.find(doc => matches(doc, filter));
      if (!doc) return { modifiedCount: 0 };
      update(doc, changes); return { modifiedCount: 1 };
    },
    updateMany: async (filter, changes) => {
      const found = state.entries.filter(doc => matches(doc, filter));
      found.forEach(doc => update(doc, changes)); return { modifiedCount: found.length };
    },
  };
  const mocks = {
    mongoose, crypto, '../models/ReminderDelivery': journal,
    '../models/Notification': { create: async (docs, options) => {
      assert.ok(options.session);
      const result = docs.map(doc => ({ ...copy(doc), _id: 'notification' }));
      state.notifications.push(...result); return result;
    } },
    './emailService': {
      isConfigured: () => true,
      send: async (payload, options) => {
        sends.push(copy({ payload, options }));
        if (!providerSeen.has(options.idempotencyKey)) { providerSeen.add(options.idempotencyKey); providerDeliveries++; }
        if (mode === 'throw') throw new Error('fixture provider timeout after acceptance');
        if (mode === 'no-id') return { success: true };
        return { success: true, messageId: 'fixture-message-id' };
      },
    },
  };
  const reload = () => load('src/services/reminderDeliveryService.js', mocks, { Date: Clock });
  const options = {
    scope: 'fixture', key: 'event-1', recipientId: 'client', subjectId: 'task',
    entityCreatedAt: new Date(clock + 1), periodStart: new Date(clock),
    email: { to: 'client@example.invalid', from: 'sender@example.invalid', subject: 'Frozen', html: '<p>Fixture</p>', text: 'Frozen' },
    eligible: async () => true,
  };
  return { reload, state, sends, options, journal, advance: ms => { clock += ms; },
    mode: value => { mode = value; }, failRecorded: () => { failRecorded = true; },
    delivered: () => providerDeliveries };
}
test('email-only delivery persists acceptance and suppresses parallel/restarted duplicates', async () => {
  const f = deliveryFixture();
  await Promise.all([f.reload().deliverReminder(f.options), f.reload().deliverReminder(f.options)]);
  assert.equal((await f.reload().deliverReminder(f.options)).complete, true);
  assert.equal(f.sends.length, 1);
  assert.equal(f.state.notifications.length, 0);
  assert.equal(f.state.entries.find(e => e.channel === 'EMAIL').state, 'ACCEPTED');
});
test('uncertain provider acceptance retries only the same frozen payload and key', async () => {
  const f = deliveryFixture();
  f.mode('throw');
  assert.equal((await f.reload().deliverReminder(f.options)).complete, false);
  assert.equal(f.state.entries.find(e => e.channel === 'EMAIL').state, 'UNKNOWN');
  f.mode('success');
  f.advance(3600000);
  await f.reload().deliverReminder({ ...f.options, email: { ...f.options.email, subject: 'Changed template' } });
  assert.deepEqual(f.sends[1], f.sends[0]);
  assert.equal(f.delivered(), 1);
});
test('missing provider ID is uncertain and expired retry window never resends', async () => {
  const f = deliveryFixture(); f.mode('no-id');
  assert.equal((await f.reload().deliverReminder(f.options)).complete, false);
  f.advance(24 * 3600000);
  await f.reload().deliverReminder(f.options);
  assert.equal(f.sends.length, 1);
  assert.equal(f.state.entries.find(e => e.channel === 'EMAIL').state, 'HELD');
});
test('interrupted sending lease recovers without changing idempotency identity', async () => {
  const f = deliveryFixture(); f.mode('throw');
  await f.reload().deliverReminder(f.options);
  const email = f.state.entries.find(e => e.channel === 'EMAIL');
  email.state = 'SENDING';
  f.advance(6 * 60000); f.mode('success');
  await f.reload().deliverReminder(f.options);
  assert.equal(email.state, 'ACCEPTED');
  assert.deepEqual(f.sends[1], f.sends[0]);
});
test('cutover is persisted once, holds ambiguous period, and permits next daily period', async () => {
  const f = deliveryFixture();
  const options = { ...f.options, entityCreatedAt: new Date('2029-01-01'), periodStart: new Date('2030-01-05') };
  await f.reload().deliverReminder(options);
  assert.equal(f.sends.length, 0);
  const boundary = f.state.entries.find(e => e.channel === 'BOUNDARY').cutoverAt;
  f.advance(24 * 3600000);
  await f.reload().deliverReminder(options);
  await f.reload().deliverReminder({ ...options, key: 'event-2', periodStart: new Date('2030-01-06') });
  assert.equal(f.sends.length, 1);
  assert.equal(+f.state.entries.find(e => e.channel === 'BOUNDARY').cutoverAt, +boundary);
});
test('in-app journal and notification commit atomically and deduplicate', async () => {
  const f = deliveryFixture();
  const options = { ...f.options, email: null, notification: { recipientId: 'client', title: 'Fixture', message: 'Fixture' } };
  await Promise.all([f.reload().deliverReminder(options), f.reload().deliverReminder(options)]);
  assert.equal(f.state.notifications.length, 1);
  assert.equal(f.state.entries.find(e => e.channel === 'IN_APP').state, 'RECORDED');
  const failed = deliveryFixture(); failed.failRecorded();
  await assert.rejects(failed.reload().deliverReminder(options), /journal failure/);
  assert.equal(failed.state.notifications.length, 0);
  assert.equal(failed.state.entries.find(e => e.channel === 'IN_APP').state, 'PENDING');
});
test('lost eligibility cancels without sending; client reset removes payload but retains tombstone', async () => {
  const f = deliveryFixture();
  await f.reload().deliverReminder({ ...f.options, eligible: async () => false });
  assert.equal(f.sends.length, 0);
  assert.equal(f.state.entries.find(e => e.channel === 'EMAIL').state, 'CANCELLED');
  await f.reload().cancelClientDeliveries(['client'], {});
  assert.equal(f.state.entries.find(e => e.channel === 'EMAIL').payload, undefined);
  await f.reload().deliverReminder(f.options);
  assert.equal(f.sends.length, 0);
});
test('subscription email-only job dispatches independently and never logs unconfirmed acceptance', async () => {
  for (const complete of [false, true]) {
    const code = source('src/server.js');
    const begin = code.indexOf('function startSubscriptionReminderJob()');
    const end = code.indexOf('// Function to update progress for all AUTO tasks', begin);
    const wallet = { _id: 'wallet', clientId: 'client', currentPlanId: 'plan', subscriptionExpiresAt: new Date() };
    const sub = { _id: 'sub', isActive: true, planName: 'Fixture', createdAt: new Date() };
    const deliveries = [];
    const logs = [];
    let run;
    const mocks = {
      './models/ReminderLog': { REMINDER_STATUS: { SENT: 'SENT' }, ReminderLog: {
        findOne: () => query(() => null), create: async data => logs.push(data),
      } },
      './models/Wallet': { find: () => query(() => [wallet]), exists: async () => true },
      './services/emailService': { buildSubscriptionReminder: to => ({ to, subject: 'Fixture' }) },
      './services/reminderDeliveryService': {
        initializeReminderDelivery: async () => {},
        deliverReminder: async options => { deliveries.push(options); return { complete }; },
      },
    };
    vm.runInNewContext(code.slice(begin, end) + '\nstartSubscriptionReminderJob();', {
      require: name => { assert.ok(Object.hasOwn(mocks, name)); return mocks[name]; },
      console: { log() {}, error() {} }, process: { env: {} },
      startBackgroundInterval: (_name, work) => { run = work; },
      Settings: { getSettings: async () => ({ subscriptionReminders: {
        enabled: true, inAppEnabled: false, emailEnabled: true,
        beforeExpiry: { enabled: true, days: [0] },
      } }) },
      User: { findById: () => query(() => ({ identifier: 'client@example.invalid' })) },
      UserSubscription: { findOne: () => query(() => sub), exists: async () => true },
      NOTIFICATION_TYPES: { SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING' },
    });
    await run();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].notification, null);
    assert.equal(deliveries[0].email.to, 'client@example.invalid');
    assert.equal(logs.length, complete ? 1 : 0);
  }
});

test('provider adapter passes the frozen sender and SDK idempotency option', async () => {
  const requests = [];
  const api = load('src/services/emailService.js', { resend: { Resend: class {
    constructor() { this.emails = { send: async (...args) => { requests.push(args); return { data: { id: 'fixture-id' } }; } }; }
  } } }, { process: { env: { RESEND_API_KEY: 'nonfunctional-test-fixture' } } });
  const result = await api.send({ to: 'client@example.invalid', from: 'fixed@example.invalid', subject: 'Fixture', html: 'Fixture' },
    { idempotencyKey: 'fixture-key' });
  assert.equal(result.messageId, 'fixture-id');
  assert.equal(requests[0][0].from, 'fixed@example.invalid');
  assert.equal(requests[0][1].idempotencyKey, 'fixture-key');
});
