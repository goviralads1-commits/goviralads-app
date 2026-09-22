'use strict';

// Offline tests only: VM modules accept explicit mocks, never real application imports.
// No server startup, database driver, network client, real timer, or .env is loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const readSource = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const duplicate = () => Object.assign(new Error('Duplicate fixture key'), { code: 11000 });
const query = work => ({ exec: async () => work() });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

for (const file of [
  'src/server.js', 'src/models/seedWallets.js', 'src/models/LegalPage.js',
  'src/models/Settings.js', 'src/services/reminderService.js',
  'src/services/reminderScheduler.js', 'test/startupSafety.test.js', 'test_login.js',
]) {
  test(`syntax check without execution: ${file}`, () => {
    new vm.Script(readSource(file), { filename: file });
  });
}

function sandbox(overrides = {}) {
  const logs = [];
  const errors = [];
  const timers = [];
  return {
    logs, errors, timers,
    globals: {
      console: {
        log: (...args) => logs.push(args),
        error: (...args) => errors.push(args),
      },
      process: { env: {} },
      setInterval: (work, delay) => {
        const timer = { work, delay };
        timers.push(timer);
        return timer;
      },
      clearInterval: timer => { timer.cleared = true; },
      ...overrides,
    },
  };
}

function evaluate(source, mocks = {}, box = sandbox()) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    ...box.globals,
    module,
    require: name => {
      assert.ok(Object.hasOwn(mocks, name), `Unmocked import blocked: ${name}`);
      return mocks[name];
    },
  }, { timeout: 2000 });
  return { api: module.exports, ...box };
}

function load(file, mocks, box) {
  return evaluate(readSource(file), mocks, box);
}

function schemaMock() {
  class Schema {
    constructor() { this.statics = {}; }
    index() {}
  }
  Schema.Types = { ObjectId: class FixtureObjectId {} };
  return { Schema, model: (_name, schema) => schema.statics };
}

function seedFixture(env) {
  const users = new Map();
  const wallets = new Map();
  const counts = { reads: 0, hashes: 0, users: 0, wallets: 0 };
  const User = {
    findOne: ({ identifier }) => query(() => {
      counts.reads++;
      return users.get(identifier) || null;
    }),
    find: () => query(() => [...users.values()].filter(user => user.role === 'CLIENT')),
    create: async data => {
      if (users.has(data.identifier)) throw duplicate();
      const user = { _id: data.identifier, ...data };
      users.set(data.identifier, user);
      counts.users++;
      return user;
    },
  };
  const Wallet = {
    findOne: ({ clientId }) => query(() => wallets.get(clientId) || null),
    exists: async ({ clientId }) => wallets.has(clientId),
    create: async data => {
      if (wallets.has(data.clientId)) throw duplicate();
      wallets.set(data.clientId, { ...data });
      counts.wallets++;
    },
  };
  const mocks = {
    './User': User,
    './Wallet': Wallet,
    '../config': { ROLES: { CLIENT: 'CLIENT' } },
    '../services/passwordService': {
      hashPassword: async () => { counts.hashes++; return '$2-fixture-only'; },
    },
  };
  const reload = () => load('src/models/seedWallets.js', mocks,
    sandbox({ process: { env: { NODE_ENV: env, TEST_CLIENT_IDENTIFIER: 'fixture@example.invalid' } } })).api;
  return { api: reload(), reload, users, wallets, counts, User, Wallet };
}

for (const env of ['production', undefined, 'staging']) {
  test(`test-user seed performs no queries or hashing when NODE_ENV=${env}`, async () => {
    const fixture = seedFixture(env);
    await fixture.api.ensureTestClient();
    await fixture.reload().ensureTestClient();
    assert.deepEqual(fixture.counts, { reads: 0, hashes: 0, users: 0, wallets: 0 });
  });
}

test('existing development client hash, role, and status are never repaired or reset', async () => {
  const f = seedFixture('development');
  const user = { identifier: 'fixture@example.invalid', passwordHash: 'legacy-hash', role: 'CLIENT', status: 'SUSPENDED' };
  f.users.set(user.identifier, user);
  const snapshot = structuredClone(user);
  assert.equal(await f.api.ensureTestClient(), user);
  assert.equal(await f.reload().ensureTestClient(), user);
  assert.deepEqual(user, snapshot);
  assert.equal(f.counts.hashes, 0);
  assert.equal(f.counts.users, 0);
});

test('missing development client is created once across concurrent and repeated seeds', async () => {
  const f = seedFixture('test');
  const [first, second] = await Promise.all([f.api.ensureTestClient(), f.reload().ensureTestClient()]);
  assert.equal(first, second);
  assert.equal(first.passwordHash, '$2-fixture-only');
  assert.equal(await f.reload().ensureTestClient(), first);
  assert.equal(f.counts.users, 1);
});

test('existing wallets are unchanged; a missing wallet is created only once', async () => {
  const f = seedFixture();
  f.users.set('one', { _id: 'one', role: 'CLIENT' });
  f.users.set('two', { _id: 'two', role: 'CLIENT' });
  const wallet = { clientId: 'one', balance: 19, walletCredits: 27, subscriptionCredits: 41,
    subscriptionExpiresAt: 'fixture-expiry', currentPlanId: 'fixture-plan', updatedAt: 'original' };
  f.wallets.set('one', wallet);
  const snapshot = structuredClone(wallet);
  await Promise.all([f.api.ensureClientWallets(), f.reload().ensureClientWallets()]);
  await f.reload().ensureClientWallets();
  assert.deepEqual(wallet, snapshot);
  assert.equal(f.counts.wallets, 1);
  assert.equal(f.wallets.get('two').balance, 0);
});

test('seed creation errors propagate unless the expected concurrent record exists', async () => {
  const f = seedFixture('development');
  const failure = new Error('Fixture database unavailable');
  f.User.create = async () => { throw failure; };
  await assert.rejects(f.api.ensureTestClient(), error => error === failure);
  f.User.create = async () => { throw duplicate(); };
  await assert.rejects(f.api.ensureTestClient(), { code: 11000 });
  f.users.set('one', { _id: 'one', role: 'CLIENT' });
  f.Wallet.create = async () => { throw failure; };
  await assert.rejects(f.api.ensureClientWallets(), error => error === failure);
  f.Wallet.create = async () => { throw duplicate(); };
  await assert.rejects(f.api.ensureClientWallets(), { code: 11000 });
});

function legalFixture() {
  const pages = new Map();
  const model = load('src/models/LegalPage.js', { mongoose: schemaMock() }).api;
  let inserts = 0;
  model.exists = async ({ slug }) => pages.has(slug);
  model.create = async page => {
    if (pages.has(page.slug)) throw duplicate();
    pages.set(page.slug, { ...page, createdAt: 'fixture-created', updatedAt: 'fixture-updated' });
    inserts++;
  };
  return { pages, model, inserts: () => inserts };
}

test('legal initialization preserves customized content, publication state, and timestamps', async () => {
  const f = legalFixture();
  const existing = { slug: 'privacy-policy', title: 'Custom', content: 'Existing content',
    isPublished: false, createdAt: 'old-created', updatedAt: 'old-updated' };
  f.pages.set(existing.slug, existing);
  const snapshot = structuredClone(existing);
  await Promise.all([f.model.ensureDefaults(), f.model.ensureDefaults()]);
  await f.model.ensureDefaults();
  assert.deepEqual(existing, snapshot);
  assert.equal(f.pages.size, 5);
  assert.equal(f.inserts(), 4);
});

test('legal initialization propagates failures and unmatched duplicate-key errors', async () => {
  const f = legalFixture();
  const failure = new Error('Fixture write failed');
  f.model.create = async () => { throw failure; };
  await assert.rejects(f.model.ensureDefaults(), error => error === failure);
  f.model.create = async () => { throw duplicate(); };
  await assert.rejects(f.model.ensureDefaults(), { code: 11000 });
});

test('settings initialization handles concurrent creation without modifying existing values', async () => {
  const model = load('src/models/Settings.js', { mongoose: schemaMock() }).api;
  let stored;
  let inserts = 0;
  model.findOne = async () => stored;
  model.create = async data => {
    if (stored) throw duplicate();
    stored = { ...data, agencyName: 'Fixture branding', updatedAt: 'original' };
    inserts++;
    return stored;
  };
  const results = await Promise.all([model.getSettings(), model.getSettings()]);
  assert.equal(results[0], results[1]);
  const snapshot = structuredClone(stored);
  await model.getSettings();
  assert.equal(inserts, 1);
  assert.deepEqual(stored, snapshot);
  stored = null;
  model.create = async () => { throw duplicate(); };
  await assert.rejects(model.getSettings(), { code: 11000 });
  const failure = new Error('Fixture settings failure');
  model.create = async () => { throw failure; };
  await assert.rejects(model.getSettings(), error => error === failure);
});

function intervalFixture() {
  const source = readSource('src/server.js');
  const begin = source.indexOf('// These guards are process-local;');
  const end = source.lastIndexOf('\nstart();');
  assert.ok(begin > 0 && end > begin);
  const counters = { progress: 0, expiry: 0, reminders: 0, cleanup: 0 };
  const box = sandbox({
    Task: { find: async () => { counters.progress++; return []; } },
    UserSubscription: { updateMany: async () => { counters.expiry++; return { modifiedCount: 0 }; } },
    Settings: { getSettings: async () => { counters.reminders++; return { subscriptionReminders: { enabled: false } }; } },
  });
  const mocks = {
    './models/Wallet': { find: () => query(() => []) },
    './models/WalletTransaction': { WalletTransaction: {}, TRANSACTION_TYPES: {} },
    './models/ReminderLog': {},
    './services/emailService': {},
    './services/reminderDeliveryService': { initializeReminderDelivery: async () => {} },
    './services/subscriptionExpiryService': { expireSubscriptions: async () => {
      counters.expiry++; return { subscriptions: 0, wallets: 0 };
    } },
    './services/notificationService': {},
    './models/DeviceToken': {
      deactivateOldTokens: async () => { counters.cleanup++; return { modifiedCount: 0 }; },
    },
  };
  // Only declarations below the route setup are evaluated; start() is never called/exported.
  const loaded = evaluate(source.slice(begin, end) + '\nmodule.exports = { startBackgroundInterval, ' +
    'startDeviceTokenCleanupJob, startSubscriptionExpiryJob, startSubscriptionReminderJob, startAutomaticProgressUpdates };', mocks, box);
  return { ...loaded, counters };
}

test('all server interval jobs register once, run immediately, and retain their periods', async () => {
  const f = intervalFixture();
  const starters = ['startDeviceTokenCleanupJob', 'startSubscriptionExpiryJob',
    'startSubscriptionReminderJob', 'startAutomaticProgressUpdates'];
  for (let pass = 0; pass < 2; pass++) for (const name of starters) f.api[name]();
  await flush();
  assert.equal(f.timers.length, 4);
  assert.deepEqual(f.timers.map(timer => timer.delay).sort((a, b) => a - b),
    [10 * 60000, 60 * 60000, 12 * 3600000, 24 * 3600000]);
  assert.deepEqual(f.counters, { progress: 1, expiry: 1, reminders: 1, cleanup: 1 });
  for (const timer of f.timers) await timer.work();
  assert.deepEqual(f.counters, { progress: 2, expiry: 2, reminders: 2, cleanup: 2 });
});

test('interval jobs skip overlapping runs and recover after synchronous/asynchronous errors', async () => {
  const f = intervalFixture();
  const gate = deferred();
  let calls = 0;
  f.api.startBackgroundInterval('fixture', async () => { calls++; await gate.promise; }, 123);
  await f.timers[0].work();
  assert.equal(calls, 1);
  gate.resolve();
  await flush();
  await f.timers[0].work();
  assert.equal(calls, 2);
  for (const asynchronous of [false, true]) {
    let attempts = 0;
    f.api.startBackgroundInterval(`failure-${asynchronous}`, () => {
      attempts++;
      if (attempts > 1) return;
      if (asynchronous) return Promise.reject(new Error('Fixture rejection'));
      throw new Error('Fixture throw');
    }, 456);
    await flush();
    await f.timers.at(-1).work();
    assert.equal(attempts, 2);
  }
  assert.equal(f.errors.length, 2);
});

function cronFixture(scheduleOverride) {
  const jobs = [];
  const gate = deferred();
  let queries = 0;
  const Task = {
    find: () => {
      queries++;
      return { populate: () => gate.promise, then: (yes, no) => gate.promise.then(yes, no) };
    },
  };
  const loaded = load('src/services/reminderScheduler.js', {
    'node-cron': { schedule: (expression, work) => {
      if (scheduleOverride) scheduleOverride(expression);
      const job = { expression, work };
      jobs.push(job);
      return job;
    } },
    '../models/Task': { Task }, '../models/User': {}, '../models/Ticket': {},
    '../models/Notification': {}, './emailService': {}, './notificationService': {},
    './reminderDeliveryService': {},
  });
  return { ...loaded, jobs, gate, Task, queries: () => queries };
}

test('cron registration is idempotent and preserves every schedule', () => {
  const f = cronFixture();
  f.api.startSchedulers();
  f.api.startSchedulers();
  assert.deepEqual(f.jobs.map(job => job.expression), ['0 9 * * *', '0 10 * * *', '0 8 * * *', '*/10 * * * *']);
});

test('cron registration can retry a partial failure without registering earlier jobs again', () => {
  let fail = true;
  const f = cronFixture(expression => {
    if (expression === '0 10 * * *' && fail) { fail = false; throw new Error('Fixture registration failure'); }
  });
  assert.throws(() => f.api.startSchedulers(), /Fixture registration failure/);
  f.api.startSchedulers();
  assert.equal(f.jobs.length, 4);
});

test('cron and manual triggers share in-flight work separately for each job', async () => {
  const f = cronFixture();
  f.api.startSchedulers();
  const types = ['deadline', 'overdue', 'expiry', 'autostart'];
  const runs = f.jobs.map(job => job.work());
  const manual = types.map(type => f.api.triggerNow(type));
  await flush();
  assert.equal(f.queries(), 4);
  f.gate.resolve([]);
  await Promise.all([...runs, ...manual]);
  await f.jobs[0].work();
  assert.equal(f.queries(), 5);
});

test('cron guards log errors outside existing try blocks and allow a later run', async () => {
  const f = cronFixture();
  f.api.startSchedulers();
  f.api.updateSettings({ taskDeadline: null });
  await f.jobs[0].work();
  assert.equal(f.errors.length, 1);
  f.api.updateSettings({ taskDeadline: { enabled: true, daysBefore: 3 } });
  f.gate.resolve([]);
  await f.jobs[0].work();
  assert.equal(f.queries(), 1);
});

function reminderFixture() {
  let hour = 10;
  class FixtureDate extends Date { getHours() { return hour; } }
  const gate = deferred();
  let queries = 0;
  let failure = null;
  const box = sandbox({ Date: FixtureDate });
  const loaded = load('src/services/reminderService.js', {
    '../models/Task': { Task: { find: () => ({ exec: async () => {
      queries++;
      if (failure) throw failure;
      return gate.promise;
    } }) } },
    '../models/User': { findOne: () => ({ select: () => query(() => null) }) },
    './emailService': { isConfigured: () => true },
    './notificationService': {},
    './reminderDeliveryService': {},
  }, box);
  return { ...loaded, gate, queries: () => queries, setHour: value => { hour = value; },
    fail: value => { failure = value; } };
}

test('task reminders preserve startup run, three-hour interval, and 8am–8pm window', async () => {
  const f = reminderFixture();
  f.setHour(2);
  f.api.startReminderScheduler();
  f.api.startReminderScheduler();
  await flush();
  assert.equal(f.timers.length, 1);
  assert.equal(f.timers[0].delay, 3 * 3600000);
  assert.equal(f.queries(), 1);
  const first = f.api.runReminderCheck();
  assert.equal(first, f.api.runReminderCheck());
  f.gate.resolve([]);
  await first;
  await f.timers[0].work();
  assert.equal(f.queries(), 1);
  for (const hour of [8, 20]) { f.setHour(hour); await f.timers[0].work(); }
  assert.equal(f.queries(), 3);
  f.setHour(21);
  await f.timers[0].work();
  assert.equal(f.queries(), 3);
  f.api.stopReminderScheduler();
  assert.equal(f.timers[0].cleared, true);
  f.api.startReminderScheduler();
  await flush();
  assert.equal(f.queries(), 4);
  assert.equal(f.timers.length, 2);
});

test('scheduled task-reminder errors are logged; manual callers still receive rejections', async () => {
  const f = reminderFixture();
  const failure = new Error('Fixture task query failed');
  f.fail(failure);
  f.api.startReminderScheduler();
  await flush();
  assert.equal(f.errors.length, 1);
  await f.timers[0].work();
  assert.equal(f.errors.length, 2);
  await assert.rejects(f.api.runReminderCheck(), error => error === failure);
  f.fail(null);
  f.gate.resolve([]);
  await f.api.runReminderCheck();
  assert.equal(f.queries(), 4);
});
