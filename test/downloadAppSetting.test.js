'use strict';

/**
 * Offline tests for the "Download App" public website footer setting.
 *
 * No .env, database, network or deployment access is required. The real handler
 * source is sliced out of the production files and executed inside a VM sandbox
 * whose `require` only ever returns the explicit mocks declared here, so no real
 * Mongoose model, Express app or network client is ever loaded.
 *
 * Every assertion below runs against the ACTUAL shipped code text — the handler
 * bodies are extracted from src/routes/admin.js, src/server.js,
 * frontend/admin-panel/src/pages/Settings.jsx and
 * frontend/client-app/src/components/LoginForm.jsx rather than re-implemented.
 *
 * Scenarios covered (mirrors the acceptance list for this feature):
 *   1. admin enables Download App and saves a URL
 *   2. website footer displays the icon/link
 *   3. clicking the link opens the configured URL
 *   4. admin changes the URL; the website uses the latest URL
 *   5. admin disables Download App; the footer link disappears
 *   6. a missing/invalid URL never produces a broken link
 *   7. unauthorized users cannot modify the setting
 *   8. existing social icons continue working
 *   9. mobile and desktop footer layouts stay responsive
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const readSource = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ADMIN_ROUTES = 'src/routes/admin.js';
const SERVER = 'src/server.js';
const SETTINGS_MODEL = 'src/models/Settings.js';
const ADMIN_SETTINGS_PAGE = 'frontend/admin-panel/src/pages/Settings.jsx';
const CLIENT_LOGIN_FORM = 'frontend/client-app/src/components/LoginForm.jsx';

/**
 * Code evaluated in a VM realm has a different Object.prototype than fixtures
 * built here, and deepEqual is reference-prototype strict. Compare through JSON.
 */
function same(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

// ---------------------------------------------------------------------------
// Source extraction helpers
// ---------------------------------------------------------------------------

/** Slices a handler out of a route file, from its registration call to its close. */
function extractHandler(source, registrationCall, label) {
  const start = source.indexOf(registrationCall);
  assert.ok(start >= 0, `${label}: handler registration not found`);
  // Route handlers close with an unindented `});`; inner object literals close
  // with an indented one, so this lands on the real end of the handler.
  const end = source.indexOf('\n});', start);
  assert.ok(end > start, `${label}: handler close not found`);
  return source.slice(start, end + '\n});'.length);
}

/** Rewrites an extracted `router.x(...)` registration into a callable function. */
function toFunction(block, registrationCall, exportName, params, label) {
  assert.ok(block.startsWith(registrationCall), `${label}: unexpected handler signature`);
  const body = block.slice(registrationCall.length, block.length - '\n});'.length);
  return `module.exports.${exportName} = async (${params}) => {${body}\n};`;
}

/**
 * Evaluates source in a locked-down realm. Mocks are exposed BOTH as globals (the
 * extracted handlers close over module-scope bindings such as `Settings` and `User`
 * that live in the file's require block, which is not part of the slice) and through
 * `require`, where any undeclared import fails the test loudly.
 */
function evaluate(source, mocks) {
  const module = { exports: {} };
  const errors = [];
  vm.runInNewContext(
    source,
    {
      ...mocks,
      console: {
        log: () => {},
        warn: () => {},
        error: (...args) => errors.push(args.map((a) => (a && a.stack) || String(a))),
      },
      module,
      URL,
      require: (name) => {
        assert.ok(Object.hasOwn(mocks, name), `Unmocked import blocked: ${name}`);
        return mocks[name];
      },
    },
    { timeout: 5000 }
  );
  return { ...module.exports, __errors: errors };
}

/**
 * Minimal Express response double. statusCode defaults to 200 because Express
 * implies it when a handler calls `res.json()` without `res.status()` first.
 */
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof cursor[parts[i]] !== 'object' || cursor[parts[i]] === null) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * In-memory stand-in for the Settings singleton. Applies dotted `$set` paths the
 * same way Mongoose does, so "did this partial write clobber a sibling field?"
 * is answered by the same semantics production uses.
 */
function makeSettingsStore(initial) {
  const state = JSON.parse(JSON.stringify(initial));
  const writes = [];
  return {
    state,
    writes,
    Settings: {
      getSettings: async () => JSON.parse(JSON.stringify(state)),
      updateSettings: async (updates) => {
        writes.push(JSON.parse(JSON.stringify(updates)));
        for (const [key, value] of Object.entries(updates)) setPath(state, key, value);
        return JSON.parse(JSON.stringify(state));
      },
    },
  };
}

const BASE_SETTINGS = {
  agencyName: 'Go Viral Ads',
  agencyAddress: '12 Test Street',
  supportEmail: 'support@example.test',
  gstNumber: '29ABCDE1234F1Z5',
  logoUrl: '',
  phoneNumber: '+91 90000 00000',
  websiteUrl: 'https://goviralads.test',
  whatsappNumber: '919000000000',
  socialLinks: {
    facebook: 'https://facebook.com/goviralads',
    instagram: 'https://instagram.com/goviralads',
    twitter: '',
    linkedin: '',
    youtube: 'https://youtube.com/@goviralads',
  },
  downloadApp: { enabled: false, url: '' },
  subscriptionReminders: { enabled: true, inAppEnabled: true, emailEnabled: true },
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Build the modules under test once
// ---------------------------------------------------------------------------

const adminRouteSource = readSource(ADMIN_ROUTES);
const serverSource = readSource(SERVER);
const adminPageSource = readSource(ADMIN_SETTINGS_PAGE);
const loginFormSource = readSource(CLIENT_LOGIN_FORM);
const settingsModelSource = readSource(SETTINGS_MODEL);

const HELPERS_START = 'const DOWNLOAD_APP_URL_MAX_LENGTH';
const helpersStart = adminRouteSource.indexOf(HELPERS_START);
assert.ok(helpersStart >= 0, 'Download App helpers missing from admin routes');
const helperSource = adminRouteSource.slice(
  helpersStart,
  adminRouteSource.indexOf('// GET /admin/settings', helpersStart)
);

const GET_CALL = "router.get('/settings', async (req, res) => {";
const PATCH_CALL = "router.patch('/settings', async (req, res) => {";
const getHandler = extractHandler(adminRouteSource, GET_CALL, 'GET /admin/settings');
const patchHandler = extractHandler(adminRouteSource, PATCH_CALL, 'PATCH /admin/settings');

const AGENCY_CALL = "app.get('/public/agency-info', async (_req, res) => {";
const agencyHandler = extractHandler(serverSource, AGENCY_CALL, 'GET /public/agency-info');

/** Runs GET/PATCH /admin/settings against a fresh in-memory settings store. */
function makeAdminApi({ store = makeSettingsStore(BASE_SETTINGS), caller = { _id: 'admin-1' } } = {}) {
  const User = { findById: () => ({ populate: async () => caller }) };
  const api = evaluate(
    `${helperSource}\n${toFunction(getHandler, GET_CALL, 'getSettings', 'req, res', 'GET')}\n${toFunction(patchHandler, PATCH_CALL, 'patchSettings', 'req, res', 'PATCH')}\nmodule.exports.normalizeDownloadAppUrl = normalizeDownloadAppUrl;\nmodule.exports.serializeDownloadApp = serializeDownloadApp;\nmodule.exports.DOWNLOAD_APP_URL_MAX_LENGTH = DOWNLOAD_APP_URL_MAX_LENGTH;`,
    { User, Settings: store.Settings }
  );
  return { api, store, User };
}

/** Runs GET /public/agency-info against a supplied settings document. */
function makePublicApi(settings) {
  const store = makeSettingsStore(settings);
  const api = evaluate(
    toFunction(agencyHandler, AGENCY_CALL, 'agencyInfo', '_req, res', 'agency-info'),
    { Settings: store.Settings }
  );
  return api;
}

const clientLinkGuard = evaluate(
  `${loginFormSource.slice(
    loginFormSource.indexOf('const getDownloadAppLink'),
    loginFormSource.indexOf('const LoginForm = () => {')
  )}\nmodule.exports.getDownloadAppLink = getDownloadAppLink;`,
  {}
).getDownloadAppLink;

const adminPageGuard = evaluate(
  `${adminPageSource.slice(
    adminPageSource.indexOf('const isValidDownloadAppUrl = (value) => {'),
    adminPageSource.indexOf('const handleSave = async () => {')
  )}\nmodule.exports.isValidDownloadAppUrl = isValidDownloadAppUrl;`,
  {}
).isValidDownloadAppUrl;

// ===========================================================================
// Scenario 1 + 4 — admin enables Download App and saves / changes a URL
// ===========================================================================

test('PATCH /admin/settings persists an enabled Download App URL', async () => {
  const { api, store } = makeAdminApi();
  const res = mockRes();

  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://play.google.com/store/apps/details?id=com.goviralads.app' } } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  same(res.body.settings.downloadApp, {
    enabled: true,
    url: 'https://play.google.com/store/apps/details?id=com.goviralads.app',
  }, 'the admin response must echo back exactly what was persisted');
  same(store.state.downloadApp, {
    enabled: true,
    url: 'https://play.google.com/store/apps/details?id=com.goviralads.app',
  }, 'the stored document must hold the enabled flag and the URL');
});

test('PATCH /admin/settings trims surrounding whitespace from the URL', async () => {
  const { api, store } = makeAdminApi();
  const res = mockRes();

  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: '   https://goviralads.test/app   ' } } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(store.state.downloadApp.url, 'https://goviralads.test/app');
});

test('changing the URL overwrites the previous one, so the website always serves the latest', async () => {
  const { api, store } = makeAdminApi();

  const first = mockRes();
  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://goviralads.test/v1' } } },
    first
  );
  assert.equal(store.state.downloadApp.url, 'https://goviralads.test/v1');

  const second = mockRes();
  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://goviralads.test/v2' } } },
    second
  );
  assert.equal(second.statusCode, 200);
  assert.equal(store.state.downloadApp.url, 'https://goviralads.test/v2', 'the newer URL must win');

  // The public endpoint must serve the newest value on the very next request.
  const publicRes = mockRes();
  await makePublicApi(store.state).agencyInfo({}, publicRes);
  same(publicRes.body.downloadApp, { enabled: true, url: 'https://goviralads.test/v2' });
});

test('a partial payload (toggle only) cannot wipe the saved URL, and vice versa', async () => {
  const { api, store } = makeAdminApi();

  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://goviralads.test/app' } } },
    mockRes()
  );

  // Toggle off without sending the URL.
  await api.patchSettings({ user: { id: 'admin-1' }, body: { downloadApp: { enabled: false } } }, mockRes());
  same(store.state.downloadApp, { enabled: false, url: 'https://goviralads.test/app' },
    'disabling must not erase the configured destination');

  // Change only the URL without sending the toggle.
  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { url: 'https://goviralads.test/app-v2' } } },
    mockRes()
  );
  same(store.state.downloadApp, { enabled: false, url: 'https://goviralads.test/app-v2' },
    'a URL-only write must not flip the enabled flag');
});

test('the write uses dotted paths, never a whole-object replacement', () => {
  assert.ok(patchHandler.includes("updates['downloadApp.enabled']"), 'enabled must be written with a dotted path');
  assert.ok(patchHandler.includes("updates['downloadApp.url']"), 'url must be written with a dotted path');
  assert.ok(!/updates\.downloadApp\s*=/.test(patchHandler), 'the sub-document must not be replaced wholesale');
});

// ===========================================================================
// Scenario 6 — missing / invalid URL never produces a broken link
// ===========================================================================

const INVALID_URLS = [
  ['javascript:alert(1)', 'script URL'],
  ['data:text/html,<script>alert(1)</script>', 'data URL'],
  ['file:///etc/passwd', 'file URL'],
  ['ftp://goviralads.test/app.apk', 'non-http protocol'],
  ['/download', 'relative path'],
  ['goviralads.test/app', 'scheme-less host'],
  ['not a url at all', 'free text'],
  ['https://', 'scheme with no host'],
];

test('normalizeDownloadAppUrl accepts only absolute http/https URLs', () => {
  const { api } = makeAdminApi();

  for (const [url, label] of [
    ['https://play.google.com/store/apps/details?id=com.goviralads.app', 'https'],
    ['http://goviralads.test/app', 'http'],
  ]) {
    const result = api.normalizeDownloadAppUrl(url);
    assert.equal(result.ok, true, `${label} URL must be accepted`);
    assert.equal(result.url, url);
  }

  // Empty means "not configured yet" and is allowed, so an admin can clear it.
  for (const empty of ['', '   ', null, undefined]) {
    const result = api.normalizeDownloadAppUrl(empty);
    assert.equal(result.ok, true, `${JSON.stringify(empty)} must be treated as unconfigured`);
    assert.equal(result.url, '');
  }

  for (const [url, label] of INVALID_URLS) {
    const result = api.normalizeDownloadAppUrl(url);
    assert.equal(result.ok, false, `${label} must be rejected`);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0, `${label} must return a message`);
  }
});

test('normalizeDownloadAppUrl caps absurdly long URLs', () => {
  const { api } = makeAdminApi();
  const tooLong = `https://goviralads.test/${'a'.repeat(api.DOWNLOAD_APP_URL_MAX_LENGTH)}`;
  const result = api.normalizeDownloadAppUrl(tooLong);
  assert.equal(result.ok, false);
  assert.match(result.error, /characters or fewer/);
});

test('PATCH /admin/settings rejects an invalid Download App URL with 400 and writes nothing', async () => {
  for (const [url, label] of INVALID_URLS) {
    const { api, store } = makeAdminApi();
    const res = mockRes();

    await api.patchSettings({ user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url } } }, res);

    assert.equal(res.statusCode, 400, `${label} must be refused with 400`);
    assert.equal(typeof res.body.error, 'string');
    same(store.writes, [], `${label} must not reach the database`);
    same(store.state.downloadApp, { enabled: false, url: '' }, `${label} must leave the stored config untouched`);
  }
});

test('GET /public/agency-info hides the link unless it is enabled AND the URL is valid', async () => {
  const hiddenCases = [
    [{ enabled: false, url: '' }, 'never configured'],
    [{ enabled: false, url: 'https://goviralads.test/app' }, 'valid URL but disabled'],
    [{ enabled: true, url: '' }, 'enabled with no URL'],
    [{ enabled: true, url: '   ' }, 'enabled with whitespace only'],
    [{ enabled: true, url: 'javascript:alert(1)' }, 'enabled with a script URL'],
    [{ enabled: true, url: '/download' }, 'enabled with a relative path'],
    [{ enabled: true, url: 'goviralads.test/app' }, 'enabled with a scheme-less host'],
    [undefined, 'sub-document absent entirely (pre-existing database row)'],
  ];

  for (const [downloadApp, label] of hiddenCases) {
    const settings = { ...BASE_SETTINGS, downloadApp };
    if (downloadApp === undefined) delete settings.downloadApp;
    const res = mockRes();
    await makePublicApi(settings).agencyInfo({}, res);

    assert.equal(res.statusCode, 200, `${label}: the endpoint must still succeed`);
    same(res.body.downloadApp, { enabled: false, url: '' }, `${label}: the footer link must stay hidden`);
  }

  const shown = mockRes();
  await makePublicApi({ ...BASE_SETTINGS, downloadApp: { enabled: true, url: 'https://goviralads.test/app' } })
    .agencyInfo({}, shown);
  same(shown.body.downloadApp, { enabled: true, url: 'https://goviralads.test/app' },
    'enabled with a valid URL is the only case that publishes the link');
});

test('the client-side footer guard rejects the same URLs the server does', () => {
  assert.equal(clientLinkGuard({ enabled: true, url: 'https://goviralads.test/app' }), 'https://goviralads.test/app');
  assert.equal(clientLinkGuard({ enabled: true, url: 'http://goviralads.test/app' }), 'http://goviralads.test/app');

  assert.equal(clientLinkGuard(null), null);
  assert.equal(clientLinkGuard(undefined), null);
  assert.equal(clientLinkGuard({}), null);
  assert.equal(clientLinkGuard({ enabled: false, url: 'https://goviralads.test/app' }), null, 'disabled must not render');
  assert.equal(clientLinkGuard({ enabled: true, url: '' }), null, 'empty must not render');
  assert.equal(clientLinkGuard({ enabled: true, url: '   ' }), null, 'whitespace must not render');

  for (const [url, label] of INVALID_URLS) {
    assert.equal(clientLinkGuard({ enabled: true, url }), null, `${label} must not render a footer link`);
  }
});

test('the Admin Panel form guard matches the backend rule', () => {
  assert.equal(adminPageGuard('https://goviralads.test/app'), true);
  assert.equal(adminPageGuard('http://goviralads.test/app'), true);
  assert.equal(adminPageGuard(''), true, 'empty is allowed so an admin can clear the field');
  assert.equal(adminPageGuard('   '), true);

  for (const [url, label] of INVALID_URLS) {
    assert.equal(adminPageGuard(url), false, `${label} must be flagged invalid in the form`);
  }
});

// ===========================================================================
// Scenario 7 — only an authorized admin can modify the setting
// ===========================================================================

test('PATCH /admin/settings refuses a caller with a custom role', async () => {
  const { api, store } = makeAdminApi({ caller: { _id: 'emp-1', customRole: { _id: 'role-9', name: 'Manager' } } });
  const res = mockRes();

  await api.patchSettings(
    { user: { id: 'emp-1' }, body: { downloadApp: { enabled: true, url: 'https://evil.test/app' } } },
    res
  );

  assert.equal(res.statusCode, 403);
  same(store.writes, [], 'a forbidden caller must never reach the database');
  same(store.state.downloadApp, { enabled: false, url: '' });
});

test('PATCH /admin/settings refuses an unknown caller', async () => {
  const { api, store } = makeAdminApi({ caller: null });
  const res = mockRes();

  await api.patchSettings({ user: { id: 'ghost' }, body: { downloadApp: { enabled: true, url: 'https://evil.test/app' } } }, res);

  assert.equal(res.statusCode, 403);
  same(store.writes, []);
});

test('the Download App write sits behind the main-admin guard, not before it', () => {
  const guardIndex = patchHandler.indexOf('if (!_caller || _caller.customRole) return res.status(403)');
  const writeIndex = patchHandler.indexOf("updates['downloadApp.enabled']");
  assert.ok(guardIndex >= 0, 'the main-admin guard must be present in the PATCH handler');
  assert.ok(writeIndex > guardIndex, 'the Download App write must come after the authorization guard');
});

test('the settings routes stay on the admin router and are not exposed publicly', () => {
  assert.ok(adminRouteSource.includes("router.patch('/settings'"), 'PATCH must live on the admin router');
  assert.ok(!serverSource.includes("app.patch('/public/settings'"), 'no public settings write endpoint may exist');
  assert.ok(!serverSource.includes("app.post('/public/settings'"), 'no public settings write endpoint may exist');
  // The public endpoint is read-only and unauthenticated by design.
  assert.ok(serverSource.includes(AGENCY_CALL), 'the public agency-info endpoint must remain a GET');
});

// ===========================================================================
// Data exposure — the public response carries only safe fields
// ===========================================================================

test('GET /public/agency-info exposes only safe public fields', async () => {
  const res = mockRes();
  await makePublicApi(BASE_SETTINGS).agencyInfo({}, res);

  const allowed = [
    'agencyName', 'agencyAddress', 'supportEmail', 'phoneNumber',
    'whatsappNumber', 'websiteUrl', 'logoUrl', 'socialLinks', 'downloadApp',
  ];
  same(Object.keys(res.body).sort(), allowed.slice().sort(), 'the public payload must not grow unexpected keys');

  assert.equal(res.body.gstNumber, undefined, 'the GST number is private and must not be published');
  assert.equal(res.body.subscriptionReminders, undefined, 'reminder templates are private and must not be published');
  assert.equal(res.body.updatedAt, undefined);
});

test('the Download App sub-document is published with exactly two fields', async () => {
  const res = mockRes();
  await makePublicApi({ ...BASE_SETTINGS, downloadApp: { enabled: true, url: 'https://goviralads.test/app' } })
    .agencyInfo({}, res);
  same(Object.keys(res.body.downloadApp).sort(), ['enabled', 'url']);
});

test('serializeDownloadApp is defensive about missing and malformed documents', () => {
  const { api } = makeAdminApi();
  same(api.serializeDownloadApp(null), { enabled: false, url: '' });
  same(api.serializeDownloadApp(undefined), { enabled: false, url: '' });
  same(api.serializeDownloadApp({}), { enabled: false, url: '' });
  same(api.serializeDownloadApp({ downloadApp: null }), { enabled: false, url: '' });
  same(api.serializeDownloadApp({ downloadApp: { enabled: 1, url: null } }), { enabled: true, url: '' });
});

// ===========================================================================
// Persistence — the existing settings architecture is reused, no migration
// ===========================================================================

test('the Settings model declares downloadApp with safe defaults', () => {
  const start = settingsModelSource.indexOf('downloadApp: {');
  assert.ok(start >= 0, 'the Settings schema must declare downloadApp');
  // Take a window rather than slicing to the first `},`, which would stop at the
  // `enabled` field and cut the `url` field out of the assertion.
  const block = settingsModelSource.slice(start, start + 400);

  assert.match(block, /enabled:\s*\{\s*type:\s*Boolean,\s*default:\s*false\s*\}/,
    'the link must default to disabled so nothing renders before an admin opts in');
  assert.match(block, /url:\s*\{\s*type:\s*String,\s*trim:\s*true,\s*default:\s*''\s*\}/,
    'the URL must default to empty');
  assert.match(block, /downloadApp:\s*\{[^]*?enabled:[^]*?url:/,
    'both fields must live inside the same downloadApp sub-document');
});

test('no separate collection, model file or migration was introduced', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/models/DownloadApp.js')), 'no new model file');
  assert.ok(!fs.existsSync(path.join(root, 'src/models/downloadAppConfig.js')), 'no new model file');
  // The feature must ride on the existing singleton rather than a new settings system.
  assert.ok(patchHandler.includes('Settings.updateSettings(updates)'), 'writes must go through the existing static');
  const agencyBlock = extractHandler(serverSource, AGENCY_CALL, 'agency-info');
  assert.ok(agencyBlock.includes('Settings.getSettings()'), 'reads must go through the existing static');
});

// ===========================================================================
// Scenarios 2, 3, 8, 9 — the footer rendering contract
// ===========================================================================

test('the footer renders the Download App anchor with the admin-configured URL', () => {
  assert.ok(loginFormSource.includes('{getDownloadAppLink(downloadApp) && ('),
    'the anchor must be conditional on the validated link');
  assert.ok(loginFormSource.includes('<a href={getDownloadAppLink(downloadApp)}'),
    'the anchor href must be the admin-configured URL, never a literal');
  assert.ok(loginFormSource.includes('title="Download App"'), 'the icon must be labelled for screen readers');

  const anchorIndex = loginFormSource.indexOf('<a href={getDownloadAppLink(downloadApp)}');
  const anchorTag = loginFormSource.slice(anchorIndex, loginFormSource.indexOf('>', anchorIndex));
  assert.ok(anchorTag.includes('target="_blank"'), 'the destination must open in a new tab');
  assert.ok(anchorTag.includes('rel="noopener noreferrer"'), 'the new tab must be reverse-tabnabbing safe');
});

test('no Play Store URL is hardcoded anywhere in the shipped footer or endpoint code', () => {
  const footerBlock = loginFormSource.slice(loginFormSource.indexOf('{/* Social Media Links */}'));
  assert.ok(!footerBlock.includes('play.google.com'), 'the client footer must not hardcode a store URL');
  assert.ok(!serverSource.includes('play.google.com'), 'the public endpoint must not hardcode a store URL');
  assert.ok(!adminRouteSource.includes('play.google.com'), 'the admin route must not hardcode a store URL');
  // The admin form may show a store URL as a placeholder example only.
  const placeholder = adminPageSource.indexOf('placeholder="https://play.google.com/store/apps/details?id=com.yourcompany.app"');
  assert.ok(placeholder >= 0, 'the admin field keeps an illustrative placeholder');
  assert.ok(!/value=\{?['"]https:\/\/play\.google\.com/.test(adminPageSource), 'but never as a default value');
});

test('the Download App icon sits inside the existing social icon row, after them', () => {
  const socialRowStart = loginFormSource.indexOf('{/* Social Media Links */}');
  const facebookIndex = loginFormSource.indexOf('{socialLinks.facebook && (', socialRowStart);
  const whatsappIndex = loginFormSource.indexOf('{whatsappNumber && (', socialRowStart);
  const downloadIndex = loginFormSource.indexOf('{getDownloadAppLink(downloadApp) && (', socialRowStart);

  assert.ok(socialRowStart >= 0 && facebookIndex > socialRowStart, 'the social row must still exist');
  assert.ok(downloadIndex > facebookIndex, 'the Download App icon must render beside the social icons');
  assert.ok(downloadIndex > whatsappIndex, 'and after the existing WhatsApp icon, so nothing is reordered');
});

test('existing social icon rendering is untouched', async () => {
  for (const platform of ['facebook', 'instagram', 'youtube', 'linkedin', 'twitter']) {
    assert.ok(loginFormSource.includes(`{socialLinks.${platform} && (`),
      `${platform} must still render on its own saved URL`);
  }
  assert.ok(loginFormSource.includes('{whatsappNumber && ('), 'WhatsApp must still render');

  // The admin form must still manage all five platforms through the same
  // data-driven grid it always used.
  assert.ok(adminPageSource.includes('handleSocialChange(social.key, e.target.value)'),
    'the social link inputs must still be wired to handleSocialChange');
  assert.ok(adminPageSource.includes('value={formData.socialLinks[social.key]}'),
    'the social link inputs must still be bound to formData.socialLinks');
  for (const platform of ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube']) {
    assert.ok(adminPageSource.includes(`{ key: '${platform}',`),
      `${platform} must still be editable in the Admin Panel`);
  }

  // And saving a Download App change must not disturb stored social links.
  const { api, store } = makeAdminApi();
  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://goviralads.test/app' } } },
    mockRes()
  );
  same(store.state.socialLinks, BASE_SETTINGS.socialLinks, 'social links must survive a Download App write');

  const res = mockRes();
  await makePublicApi(store.state).agencyInfo({}, res);
  same(res.body.socialLinks, BASE_SETTINGS.socialLinks, 'social links must still be published');
});

test('social links and Download App can be saved together in one request', async () => {
  const { api, store } = makeAdminApi();
  const res = mockRes();

  await api.patchSettings({
    user: { id: 'admin-1' },
    body: {
      socialLinks: { facebook: 'https://facebook.com/new', instagram: '', twitter: '', linkedin: '', youtube: '' },
      downloadApp: { enabled: true, url: 'https://goviralads.test/app' },
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(store.state.socialLinks.facebook, 'https://facebook.com/new');
  same(store.state.downloadApp, { enabled: true, url: 'https://goviralads.test/app' });
});

test('the social row now also appears when only Download App is configured', () => {
  assert.ok(
    loginFormSource.includes('{(Object.values(socialLinks).some(v => v) || getDownloadAppLink(downloadApp)) && ('),
    'the row wrapper must open for a Download-App-only configuration'
  );
});

test('the footer row keeps its responsive flex layout', () => {
  const rowStart = loginFormSource.indexOf('{/* Social Media Links */}');
  const rowStyle = loginFormSource.slice(rowStart, loginFormSource.indexOf('marginTop', rowStart) + 40);
  assert.ok(rowStyle.includes("display: 'flex'"), 'the row must stay a flex container');
  assert.ok(rowStyle.includes("justifyContent: 'center'"), 'the row must stay centred');
  assert.ok(rowStyle.includes('gap:'), 'icons must stay spaced by gap, not fixed margins');
  // The added icon uses the same 20x20 box as every existing social icon.
  const downloadIndex = loginFormSource.indexOf('{getDownloadAppLink(downloadApp) && (', rowStart);
  const svg = loginFormSource.slice(downloadIndex, downloadIndex + 400);
  assert.ok(svg.includes('width="20" height="20"'), 'the new icon must match the existing 20x20 icon size');
  assert.ok(svg.includes('fill={accentColor}'), 'the icon must follow the configured brand accent colour');
});

// ===========================================================================
// Scenario 5 — disabling removes the link end to end
// ===========================================================================

test('disabling Download App removes the link from the public endpoint immediately', async () => {
  const { api, store } = makeAdminApi();

  await api.patchSettings(
    { user: { id: 'admin-1' }, body: { downloadApp: { enabled: true, url: 'https://goviralads.test/app' } } },
    mockRes()
  );
  const enabledRes = mockRes();
  await makePublicApi(store.state).agencyInfo({}, enabledRes);
  same(enabledRes.body.downloadApp, { enabled: true, url: 'https://goviralads.test/app' });

  const disableRes = mockRes();
  await api.patchSettings({ user: { id: 'admin-1' }, body: { downloadApp: { enabled: false } } }, disableRes);
  assert.equal(disableRes.statusCode, 200);
  assert.equal(disableRes.body.settings.downloadApp.enabled, false);

  const afterRes = mockRes();
  await makePublicApi(store.state).agencyInfo({}, afterRes);
  same(afterRes.body.downloadApp, { enabled: false, url: '' },
    'the next public request must no longer publish the link');
  assert.equal(clientLinkGuard(afterRes.body.downloadApp), null,
    'and the footer guard must therefore render nothing');
});

// ===========================================================================
// Admin Panel read path — the form shows the currently saved state
// ===========================================================================

test('GET /admin/settings returns the full-fidelity Download App config to admins', async () => {
  const { api } = makeAdminApi({
    store: makeSettingsStore({
      ...BASE_SETTINGS,
      downloadApp: { enabled: true, url: 'https://goviralads.test/app' },
    }),
  });
  const res = mockRes();

  await api.getSettings({ user: { id: 'admin-1' } }, res);

  assert.equal(res.statusCode, 200);
  same(res.body.settings.downloadApp, { enabled: true, url: 'https://goviralads.test/app' });
  same(res.body.settings.socialLinks, BASE_SETTINGS.socialLinks, 'social links must still be returned');
  assert.equal(res.body.settings.gstNumber, BASE_SETTINGS.gstNumber, 'admins still see the private GST number');
});

test('GET /admin/settings tolerates a settings document with no downloadApp field', async () => {
  const legacy = { ...BASE_SETTINGS };
  delete legacy.downloadApp;
  const { api } = makeAdminApi({ store: makeSettingsStore(legacy) });
  const res = mockRes();

  await api.getSettings({ user: { id: 'admin-1' } }, res);

  assert.equal(res.statusCode, 200);
  same(res.body.settings.downloadApp, { enabled: false, url: '' },
    'a pre-existing database row must read back as disabled, with no migration');
});

test('the Admin Panel surfaces the saved state and blocks an invalid save client-side', () => {
  assert.ok(adminPageSource.includes('savedDownloadApp'), 'the form must track the persisted value');
  assert.ok(adminPageSource.includes('● Live — visible in the website footer'), 'a live state must be shown');
  assert.ok(adminPageSource.includes('○ Hidden — not visible in the website footer'), 'a hidden state must be shown');
  assert.ok(adminPageSource.includes('if (!isValidDownloadAppUrl(formData.downloadApp.url))'),
    'handleSave must validate before calling the API');
  assert.ok(adminPageSource.includes("handleDownloadAppChange('enabled', e.target.checked)"), 'the toggle must be wired');
  assert.ok(adminPageSource.includes("handleDownloadAppChange('url', e.target.value)"), 'the URL field must be wired');
  assert.ok(adminPageSource.includes('err.response?.data?.error'),
    'the backend 400 message must be surfaced to the admin');
});

test('the Download App card is placed in the social icons section of the Admin Panel', () => {
  const socialIndex = adminPageSource.indexOf('Social Media Links');
  const downloadIndex = adminPageSource.indexOf('📱 Download App Link');
  const remindersIndex = adminPageSource.indexOf('⏳ Subscription Reminders');

  assert.ok(socialIndex >= 0, 'the Social Media Links section must still exist');
  assert.ok(downloadIndex > socialIndex, 'Download App must appear after the social links');
  assert.ok(downloadIndex < remindersIndex, 'and before Subscription Reminders, i.e. inside the same settings page');
});

test('the Settings route stays admin-only in the Admin Panel router', () => {
  const appSource = readSource('frontend/admin-panel/src/App.jsx');
  const routeIndex = appSource.indexOf('path="/settings"');
  assert.ok(routeIndex >= 0, 'the /settings route must exist');
  const routeBlock = appSource.slice(Math.max(0, routeIndex - 200), routeIndex + 200);
  assert.ok(routeBlock.includes("allowedRoles={['ADMIN']}"), 'the settings page must remain ADMIN-only');
});
