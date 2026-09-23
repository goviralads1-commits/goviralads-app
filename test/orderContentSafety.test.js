'use strict';

// Focused offline checks: no .env, database, R2, payment, or deployment access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => process.env.ORDER_CONTENT_GIT_INDEX === '1'
  ? require('node:child_process').execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, file), 'utf8');
const { validateOrderInputs, orderContentFiles } = require('../src/utils/orderContent');
const owner = 'a'.repeat(24);
const other = 'b'.repeat(24);
const DAY = 86400000;
const now = Date.UTC(2026, 8, 23);
const attachment = (overrides = {}) => ({
  key: `orders/${owner}/${'c'.repeat(32)}.mp4`, kind: 'video', name: 'clip.mp4',
  size: 100, mime: 'video/mp4', etag: 'original', expiresAt: new Date(now + DAY), ...overrides,
});
const status = code => err => err.status === code;
const noStorage = () => { throw new Error('Unexpected storage call'); };

function storageFixture(env = {}) {
  const calls = { heads: [], signs: [] };
  let head = { ContentLength: 100, ContentType: 'video/mp4', LastModified: new Date(now - DAY), ETag: 'original' };
  let failure;
  class Command { constructor(input) { this.input = input; } }
  class HeadObjectCommand extends Command {}
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class S3Client {
    async send(command) {
      assert.ok(command instanceof HeadObjectCommand, 'Only HEAD may reach storage');
      calls.heads.push(command.input);
      if (failure) throw failure;
      return head;
    }
  }
  class Clock extends Date { static now() { return now; } }
  const module = { exports: {} };
  vm.runInNewContext(read('src/services/mediaStorageService.js'), {
    module, Date: Clock, console: { error() {} },
    process: { env: { CHAT_MEDIA_ENABLED: 'true', R2_ACCOUNT_ID: 'offline', R2_ACCESS_KEY_ID: 'offline',
      R2_SECRET_ACCESS_KEY: 'offline', R2_BUCKET_NAME: 'existing-bucket', ...env } },
    require(name) {
      if (name === 'crypto') return require('node:crypto');
      if (name === 'mongoose') return { isValidObjectId: id => /^[a-f0-9]{24}$/.test(id) };
      if (name === '@aws-sdk/client-s3') return { S3Client, HeadObjectCommand, PutObjectCommand, GetObjectCommand };
      if (name === '@aws-sdk/s3-request-presigner') return { getSignedUrl: async (_, command, options) => {
        calls.signs.push({ type: command.constructor.name, input: command.input, options });
        return 'https://offline.invalid/signed';
      } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { service: module.exports, calls, setHead: updates => { head = { ...head, ...updates }; }, fail: err => { failure = err; } };
}

for (const [label, inputs] of [
  ['missing inputs', undefined], ['blank', [{}]], ['whitespace', [{ link: ' ', customInput: '\n' }]],
  ['wrong count', []], ['null unit', [null]], ['array unit', [[]]],
  ['non-string text', [{ customInput: 42 }]], ['oversized text', [{ customInput: 'x'.repeat(4001) }]],
  ['unsafe URL', [{ link: 'javascript:alert(1)' }]], ['relative URL', [{ link: '/path' }]],
  ['invalid attachment', [{ attachment: 'file' }]],
]) {
  test(`checkout rejects ${label}`, async () => {
    await assert.rejects(validateOrderInputs([{ quantity: 1, inputs }], owner, noStorage), status(400));
  });
}

test('link-only and instructions-only inputs work regardless of old required flags', async () => {
  const result = await validateOrderInputs([{ quantity: 2, requireLink: true, requireCustomInput: true,
    inputs: [{ link: ' https://example.com/a ', ignored: 'strip' }, { customInput: ' Instructions ' }] }], owner, noStorage);
  assert.deepEqual(result, [[{ link: 'https://example.com/a', customInput: '' }, { link: '', customInput: 'Instructions' }]]);
});

test('file-only and mixed units persist only validated metadata, deduplicated', async () => {
  let calls = 0;
  const canonical = attachment();
  const result = await validateOrderInputs([{ quantity: 3, inputs: [
    { attachment: { ...canonical, expiresAt: '2099-01-01', unknown: 'strip' } },
    { link: 'https://example.com', customInput: 'Notes', attachment: canonical }, { customInput: 'Text' },
  ] }], owner, async (id) => { assert.equal(id, owner); calls++; return canonical; });
  assert.equal(calls, 1);
  assert.equal(result[0][0].attachment, canonical);
  assert.equal(result[0][1].attachment, canonical);
  assert.equal(result[0][2].attachment, undefined);
});

test('conflicting duplicate references and invalid supplied files cannot bypass validation with text', async () => {
  await assert.rejects(validateOrderInputs([{ quantity: 2, inputs: [
    { attachment: attachment() }, { attachment: attachment({ size: 200 }) },
  ] }], owner, noStorage), status(400));
  await assert.rejects(validateOrderInputs([{ inputs: [{ customInput: 'Valid text', attachment: attachment() }] }], owner,
    async () => { throw Object.assign(new Error('Missing'), { status: 404 }); }), status(404));
});

test('attachment HEAD validation concurrency is bounded to four', async () => {
  let active = 0, peak = 0, calls = 0;
  const inputs = Array.from({ length: 11 }, (_, i) => ({ attachment: attachment({ key: String(i) }) }));
  await validateOrderInputs([{ quantity: inputs.length, inputs }], owner, async (_, att) => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--; return att;
  });
  assert.equal(calls, 11);
  assert.equal(peak, 4);
});

test('signs direct PUT at 500 MB in existing bucket with no body', async () => {
  const f = storageFixture();
  const result = await f.service.issueOrderUpload({ clientId: owner, filename: '../evil"\r\n.mp4', size: 500 * 1024 ** 2, mime: 'video/mp4' });
  assert.match(result.attachment.key, new RegExp(`^orders/${owner}/[a-f0-9]{32}\\.mp4$`));
  assert.equal(+result.attachment.expiresAt, now + 10 * DAY);
  assert.equal(f.calls.signs[0].type, 'PutObjectCommand');
  assert.equal(f.calls.signs[0].input.Bucket, 'existing-bucket');
  assert.equal(f.calls.signs[0].input.Body, undefined);
  assert.equal(f.calls.signs[0].options.expiresIn, 1800);
  assert.doesNotMatch(result.attachment.name, /["\r\n/]/);
});

for (const [label, att, code] of [
  ['zero bytes', { size: 0 }, 400], ['fractional bytes', { size: 1.5 }, 400],
  ['above 500 MB', { size: 500 * 1024 ** 2 + 1 }, 413], ['executable MIME', { mime: 'application/x-msdownload' }, 400],
  ['prototype MIME', { mime: 'constructor' }, 400], ['wrong owner', { key: `orders/${other}/${'c'.repeat(32)}.mp4` }, 400],
  ['path traversal', { key: `orders/${owner}/../clip.mp4` }, 400], ['wrong extension', { key: `orders/${owner}/${'c'.repeat(32)}.pdf` }, 400],
]) {
  test(`storage rejects ${label} before HEAD/signing`, async () => {
    const f = storageFixture();
    await assert.rejects(f.service.validateOrderAttachment(owner, attachment(att)), status(code));
    assert.equal(f.calls.heads.length + f.calls.signs.length, 0);
  });
}

test('uses existing enabled flag and existing limit without raising it', async () => {
  await assert.rejects(storageFixture({ CHAT_MEDIA_ENABLED: 'false' }).service.validateOrderAttachment(owner, attachment()), status(403));
  await assert.rejects(storageFixture({ MEDIA_MAX_VIDEO_MB: '1' }).service.validateOrderAttachment(owner, attachment({ size: 1024 ** 2 + 1 })), status(413));
});

test('expiry is anchored to actual upload time and cannot be extended by submitted metadata or retries', async () => {
  const f = storageFixture();
  const a = await f.service.validateOrderAttachment(owner, attachment({ expiresAt: '2099-01-01', kind: 'file' }));
  const b = await f.service.validateOrderAttachment(owner, a);
  assert.equal(+a.expiresAt, now + 9 * DAY);
  assert.equal(+b.expiresAt, +a.expiresAt);
  assert.equal(a.kind, 'video');
  assert.equal(a.etag, 'original');
});

for (const [label, head, code] of [
  ['size mismatch', { ContentLength: 101 }, 400], ['type mismatch', { ContentType: 'text/html' }, 400],
  ['missing age', { LastModified: undefined }, 502], ['expired object', { LastModified: new Date(now - 10 * DAY) }, 410],
]) {
  test(`HEAD rejects ${label}`, async () => {
    const f = storageFixture(); f.setHead(head);
    await assert.rejects(f.service.validateOrderAttachment(owner, attachment()), status(code));
  });
}

for (const [label, error, code] of [
  ['missing object', { name: 'NotFound' }, 404], ['deleted object', { $metadata: { httpStatusCode: 404 } }, 404],
  ['storage outage', new Error('offline'), 502],
]) {
  test(`HEAD handles ${label}`, async () => {
    const f = storageFixture(); f.fail(error);
    await assert.rejects(f.service.validateOrderAttachment(owner, attachment()), status(code));
  });
}

test('view denies expired or changed stored files and caps signed URL to remaining retention', async () => {
  const f = storageFixture();
  await assert.rejects(f.service.issueOrderViewUrl(owner, attachment({ expiresAt: new Date(now) })), status(410));
  assert.equal(f.calls.heads.length, 0);
  await assert.rejects(f.service.issueOrderViewUrl(owner, attachment({ etag: 'different' })), status(410));
  assert.equal(f.calls.signs.length, 0);
  const result = await f.service.issueOrderViewUrl(owner, attachment({ expiresAt: new Date(now + 45000) }));
  assert.equal(result.expiresInSec, 45);
  const signed = f.calls.signs[0];
  assert.equal(signed.type, 'GetObjectCommand');
  assert.match(signed.input.ResponseContentDisposition, /^inline;/);
  assert.equal(signed.input.ResponseCacheControl, 'private, no-store');
});

test('documents are downloaded and explicit video download uses attachment disposition', async () => {
  const f = storageFixture(); f.setHead({ ContentType: 'application/pdf' });
  await f.service.issueOrderViewUrl(owner, attachment({ key: `orders/${owner}/${'c'.repeat(32)}.pdf`, mime: 'application/pdf', kind: 'file' }));
  assert.match(f.calls.signs[0].input.ResponseContentDisposition, /^attachment;/);
  f.setHead({ ContentType: 'video/mp4' });
  await f.service.issueOrderViewUrl(owner, attachment(), true);
  assert.match(f.calls.signs[1].input.ResponseContentDisposition, /^attachment;/);
});

// Evaluate only the selected, unmodified route callback with explicit collaborators.
function routeSource(file, method, route) {
  const source = read(file);
  const start = source.indexOf(`router.${method}('${route}',`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n});', start);
  assert.ok(end > start);
  return source.slice(start, end + 4);
}
function handler(file, method, route, mocks) {
  let callback;
  vm.runInNewContext(routeSource(file, method, route), {
    router: { [method]: (_, fn) => { callback = fn; } },
    mongoose: { isValidObjectId: id => /^[a-f0-9]{24}$/.test(id) },
    orderContentFiles, validateOrderInputs, console: { log() {}, error() {} }, ...mocks,
  });
  return callback;
}
function response() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
    set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
}
const query = value => ({ select() { return this; }, populate() { return this; }, lean: async () => value, exec: async () => value });

for (const scope of ['client-order', 'admin-order', 'admin-task']) {
  test(`${scope} content requires exact membership and metadata loading never signs files`, async () => {
    const isTask = scope === 'admin-task';
    const isClient = scope === 'client-order';
    const att = attachment();
    let signs = 0, filter;
    const doc = { clientId: owner, orderId: other, title: 'Plan', clientInputs: [{ attachment: att }],
      items: [{ planTitle: 'Plan', inputs: [{ attachment: att }] }] };
    const mocks = {
      User: { findById: () => ({ populate: async () => ({ customRole: null }) }) },
      Order: { findOne: where => { filter = where; return query(doc); }, findById: () => query(doc) },
      Task: { findById: () => query(doc) },
      mediaStorage: { issueOrderViewUrl: async (id, value, download) => {
        assert.equal(id, owner); assert.equal(value.key, att.key); assert.equal(download, true);
        signs++; return { url: 'https://offline.invalid/signed' };
      } },
    };
    const fn = handler(`src/routes/${isClient ? 'client' : 'admin'}.js`, 'get', isTask ? '/tasks/:taskId/order-content' : '/orders/:orderId/content', mocks);
    const req = { user: { id: isClient ? owner : other }, params: { orderId: other, taskId: other }, query: {} };
    const meta = await fn(req, response());
    assert.equal(meta.body.files.length, 1); assert.equal(signs, 0);
    assert.equal(meta.headers['Cache-Control'], 'no-store');
    if (isClient) assert.equal(filter.clientId, owner);
    const denied = await fn({ ...req, query: { key: 'not-in-order' } }, response());
    assert.equal(denied.statusCode, 404); assert.equal(signs, 0);
    await fn({ ...req, query: { key: att.key, download: '1' } }, response());
    assert.equal(signs, 1);
  });
}

test('custom-role admin cannot read order content', async () => {
  const fn = handler('src/routes/admin.js', 'get', '/orders/:orderId/content', {
    User: { findById: () => ({ populate: async () => ({ customRole: {} }) }) },
  });
  const res = await fn({ user: { id: owner }, params: { orderId: other }, query: {} }, response());
  assert.equal(res.statusCode, 403);
});

test('checkout rejects empty units before starting transaction or reaching wallet/order writes', async () => {
  let ended = false;
  const plan = { _id: other, title: 'Plan', clientId: null, isListedInPlans: true, isActivePlan: true };
  const fn = handler('src/routes/client.js', 'post', '/purchase-cart', {
    mongoose: { startSession: async () => ({ startTransaction: noStorage, endSession: () => { ended = true; } }) },
    Task: { find: () => query([plan]) }, mediaStorage: { validateOrderAttachment: noStorage },
    Wallet: { findOne: noStorage }, Order: { create: noStorage, findOne: noStorage },
  });
  const res = await fn({ user: { id: owner }, body: { items: [{ planId: other, quantity: 1, inputs: [{}] }] } }, response());
  assert.equal(res.statusCode, 400); assert.equal(ended, true);
});

test('route/model integration keeps metadata out of normal lists and uses existing approval copy path', () => {
  for (const file of ['src/routes/client.js', 'src/routes/admin.js']) {
    const list = routeSource(file, 'get', '/orders');
    assert.match(list, /select\('-items\.inputs\.attachment'\)/);
    assert.doesNotMatch(list, /mediaStorage|issueOrderViewUrl|HeadObject/);
    const source = read(file);
    assert.match(source, /router\.use\(authenticateJWT\)/);
    assert.match(source, file.includes('client') ? /router\.use\(requireClient\)/ : /router\.use\(requireAdmin\)/);
  }
  for (const file of ['src/models/Order.js', 'src/models/Task.js']) {
    assert.match(read(file), /(?:inputs|clientInputs):\s*\[\s*\{\s*link:.*\s*customInput:.*\s*attachment: \{ type: orderContentAttachment, default: undefined, select: false \}/);
  }
  const approval = routeSource('src/routes/admin.js', 'post', '/orders/:orderId/approve');
  assert.match(approval, /select\('\+items\.inputs\.attachment'\)/);
  assert.match(approval, /clientInputs: item\.inputs && item\.inputs\[i\] \? \[item\.inputs\[i\]\] : \[\]/);
  assert.doesNotMatch(approval, /validateOrderAttachment|issueOrder|expiresAt/);
  assert.match(routeSource('src/routes/client.js', 'post', '/purchase-cart'), /orderStatus: ORDER_STATUS\.PENDING_APPROVAL/);
  assert.match(routeSource('src/routes/admin.js', 'get', '/tasks/:taskId'), /orderId: task\.orderId\?\.toString\(\) \|\| null/);
  assert.doesNotMatch(read('src/models/orderContentAttachment.js'), /mongoose\.model\(/);
});

// Exercise upload async handlers without React/DOM; syntax is checked separately below.
function uploadFixture(api, putToR2) {
  const source = read('frontend/client-app/src/components/OrderContentUpload.jsx');
  const block = source.slice(source.indexOf('  const clear ='), source.indexOf('  const choose ='));
  const changes = [];
  const entryRef = { current: { file: { name: 'clip.mp4', size: 100 }, mime: 'video/mp4' } };
  const mounted = { current: true };
  const controls = vm.runInNewContext(`(() => { ${block}; return { run, clear }; })()`, {
    entryRef, mounted, api, putToR2, AbortController, Date,
    setStatus() {}, setSummary() {}, setError() {}, setProgress() {},
    onChange: (att, state) => changes.push({ att, state }),
  });
  return { ...controls, entryRef, mounted, changes };
}
const signed = { data: { uploadUrl: 'https://offline.invalid/put', expiresInSec: 1800, attachment: attachment() } };
const verified = { data: { attachment: attachment() } };

test('lost validation response retries HEAD reconciliation without a second PUT', async () => {
  let puts = 0, validations = 0;
  const f = uploadFixture({ post: async url => {
    if (url.endsWith('upload-url')) return signed;
    if (++validations === 1) throw new Error('Lost response');
    return verified;
  } }, async () => { puts++; });
  const entry = f.entryRef.current;
  await f.run(entry); assert.equal(f.changes.at(-1).state, 'failed');
  await f.run(entry); assert.equal(f.changes.at(-1).state, 'ready');
  assert.equal(puts, 1); assert.equal(entry.file, null);
});

test('failed PUT retries only after a missing-object response', async () => {
  let puts = 0;
  const f = uploadFixture({ post: async url => {
    if (url.endsWith('upload-url')) return signed;
    if (puts === 1) throw { response: { status: 404 } };
    return verified;
  } }, async () => { if (++puts === 1) throw new Error('Connection lost'); });
  await f.run(f.entryRef.current); await f.run(f.entryRef.current);
  assert.equal(puts, 2); assert.equal(f.changes.at(-1).state, 'ready');
});

test('concurrent retries are suppressed; cancel ignores late upload URL response', async () => {
  let release, requests = 0, puts = 0;
  const f = uploadFixture({ post: () => { requests++; return new Promise(resolve => { release = resolve; }); } }, async () => { puts++; });
  const entry = f.entryRef.current;
  const pending = f.run(entry);
  await f.run(entry);
  assert.equal(requests, 1);
  f.clear(); release(signed); await pending;
  assert.equal(entry.controller.signal.aborted, true);
  assert.equal(puts, 0); assert.equal(f.changes.at(-1).state, 'idle');
});

test('unmount/abort ignores late verification response', async () => {
  let release;
  const f = uploadFixture({ post: () => new Promise(resolve => { release = resolve; }) }, noStorage);
  const entry = f.entryRef.current; entry.attachment = attachment();
  const pending = f.run(entry);
  f.mounted.current = false; entry.controller.abort(); f.entryRef.current = null;
  release(verified); await pending;
  assert.equal(f.changes.some(change => change.state === 'ready'), false);
});

test('admin panel has no mount-time loading and native media remains opt-in', () => {
  const source = read('frontend/admin-panel/src/components/OrderContentPanel.jsx');
  const effect = source.slice(source.indexOf('  useEffect('), source.indexOf('  const load ='));
  assert.doesNotMatch(effect, /api\.|load\(|open\(/);
  assert.match(source, /preload="none"/); assert.doesNotMatch(source, /autoPlay|responseType|arrayBuffer\(|FileReader/);
  assert.match(source, /tab\.location\.replace\(cached\.url\)/);
  const upload = read('frontend/client-app/src/components/OrderContentUpload.jsx');
  assert.doesNotMatch(upload, /FileReader|arrayBuffer|base64|localStorage|sessionStorage/);
  assert.match(upload, /putToR2\(entry\.uploadUrl, entry\.file/);
  assert.match(read('frontend/client-app/src/components/chat/mediaUpload.js'), /xhr\.send\(blob\)/);
});

test('changed backend modules parse without executing imports', () => {
  for (const file of ['src/utils/orderContent.js', 'src/models/orderContentAttachment.js', 'src/models/Order.js',
    'src/models/Task.js', 'src/services/mediaStorageService.js', 'src/routes/client.js', 'src/routes/admin.js']) {
    assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }));
  }
});

test('changed JSX parses with TypeScript when available', t => {
  let ts;
  try { ts = require(process.env.ORDER_CONTENT_TYPESCRIPT || '../frontend/client-app/node_modules/typescript'); }
  catch (_) { t.skip('Install frontend dev dependencies or set ORDER_CONTENT_TYPESCRIPT for JSX syntax checks'); return; }
  for (const file of ['frontend/client-app/src/components/OrderContentUpload.jsx', 'frontend/client-app/src/pages/Cart.jsx',
    'frontend/admin-panel/src/components/OrderContentPanel.jsx', 'frontend/admin-panel/src/pages/Orders.jsx',
    'frontend/admin-panel/src/pages/TaskDetail.jsx']) {
    const result = ts.transpileModule(read(file), { fileName: file, reportDiagnostics: true,
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${file}: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')}`);
  }
});
