'use strict';

// Real-pdfkit verification for the workflow report renderer: valid PDF bytes,
// page breaks, per-page footers, text wrapping, long package names, missing
// dates and empty reports.
//
// This file must stay separate from test/workflowReport.test.js. Node caches a
// module's bare-specifier resolution, so once this renderer has loaded real
// pdfkit in a process, the stubbed pdfkit contract harness in the other file
// would be silently bypassed instead of failing loudly. The test runner executes
// each file in its own process, which keeps both harnesses honest.
//
// Offline fixtures only. Never import the app, load .env, or connect to a
// database: the only dependency stubbed here is the Settings branding lookup.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const Module = require('node:module');

const report = require('../src/services/workflowReportService');
const rendererPath = require.resolve('../src/services/workflowReportPdf');

// Without pdfkit installed the tests are skipped with an explicit reason instead
// of failing or silently passing.
let pdfkitSkip = false;
try {
  require.resolve('pdfkit');
} catch (error) {
  pdfkitSkip = `pdfkit unavailable locally: ${error.code || error.message}`;
}

const order = (id, createdAt, orderStatus = 'APPROVED', extra = {}) => ({
  id, orderId: `CODE-${id}`, orderStatus, createdAt,
  approvedAt: null, completedAt: null, services: ['Social Media Package'], ...extra,
});
const task = (id, linked, overrides = {}) => ({
  id, title: `Task ${id}`, status: 'ACTIVE', clientId: 'c1', clientName: 'Acme Media',
  createdAt: '2026-09-01T09:00:00.000Z', approvedAt: null, completedAt: null, progress: 0,
  orderContext: linked ? 'available' : 'not_applicable',
  order: linked ? { id: linked.id, orderId: linked.orderId, createdAt: linked.createdAt, approvedAt: linked.approvedAt } : null,
  milestones: [], description: '', clientInputs: [], clientContentLinks: [], clientDriveLink: '',
  ...overrides,
});
const model = input => report.buildReportModel({
  range: { startDate: '2026-09-01', endDate: '2026-09-30' },
  clients: [{ id: 'c1', name: 'Acme Media' }],
  generatedBy: { name: 'Main Admin', identifier: 'ADMIN01' },
  generatedAt: new Date('2026-11-21T10:00:00.000Z'),
  brand: 'Go Viral Ads',
  ...input,
});

// Real pdfkit with only the Settings branding lookup stubbed, so the genuine
// layout pass runs and produces genuine PDF bytes without a database driver.
async function renderReal(reportModel) {
  const settingsPath = path.join(os.tmpdir(), 'gva-report-real-settings.js');
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patched(request, ...rest) {
    if (request === '../models/Settings') return settingsPath;
    return resolveFilename.call(this, request, ...rest);
  };
  require.cache[settingsPath] = { id: settingsPath, filename: settingsPath, loaded: true, exports: { getSettings: async () => ({ agencyName: 'Go Viral Ads' }) }, children: [], paths: [] };
  delete require.cache[rendererPath];
  try {
    return await require(rendererPath).generateWorkflowReportPDF(reportModel);
  } finally {
    Module._resolveFilename = resolveFilename;
    delete require.cache[settingsPath];
    delete require.cache[rendererPath];
  }
}

// Pull the drawn text back out of real pdfkit output: inflate every content
// stream, then read each text operator together with the text matrix that
// positions it. pdfkit emits one TJ array per drawn line and splits words into
// hex strings around kerning adjustments, so the parts of one array are rejoined
// into the line a reader sees. The recorded y is in pdfkit's flipped space
// (measured up from the page bottom), which lets the tests prove that nothing is
// drawn outside the printable area.
function extractPdfLines(buffer) {
  const raw = buffer.toString('latin1');
  const decodeHex = hex => Buffer.from(hex.replace(/[^0-9a-fA-F]/g, ''), 'hex').toString('latin1');
  const unescape = value => value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[char] || char))
    .replace(/\\(\d{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
  const lines = [];
  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let stream;
  while ((stream = streamPattern.exec(raw)) !== null) {
    let content = stream[1];
    try { content = zlib.inflateSync(Buffer.from(content, 'latin1')).toString('latin1'); } catch (_) { /* uncompressed stream */ }
    const operatorPattern = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm|\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|(<[0-9A-Fa-f\s]+>)\s*Tj/g;
    let operator;
    let at = { x: null, y: null };
    while ((operator = operatorPattern.exec(content)) !== null) {
      if (operator[1] !== undefined) {
        at = { x: Number(operator[1]), y: Number(operator[2]) };
        continue;
      }
      let text = '';
      if (operator[3] !== undefined) {
        for (const part of operator[3].matchAll(/<([0-9A-Fa-f\s]*)>|\(((?:[^()\\]|\\.)*)\)/g)) {
          text += part[1] !== undefined ? decodeHex(part[1]) : unescape(part[2]);
        }
      } else if (operator[4] !== undefined) {
        text = unescape(operator[4]);
      } else {
        text = decodeHex(operator[5]);
      }
      if (text.length) lines.push({ text, x: at.x, y: at.y });
    }
  }
  return lines;
}

function pdfStructure(pdf) {
  assert.ok(Buffer.isBuffer(pdf), 'the renderer returns a Buffer');
  const raw = pdf.toString('latin1');
  assert.equal(raw.slice(0, 5), '%PDF-', 'the buffer starts with a PDF header');
  assert.match(raw.slice(0, 9), /^%PDF-1\.\d/, 'the header carries a PDF version');
  assert.ok(raw.trimEnd().endsWith('%%EOF'), 'the file ends with a trailer marker');
  const startXRef = Number(/startxref\s+(\d+)/.exec(raw)[1]);
  assert.ok(startXRef > 0 && startXRef < pdf.length, 'startxref points inside the file');
  const pageCount = (raw.match(/\/Type \/Page[^s]/g) || []).length;
  assert.equal(Number(/\/Count (\d+)/.exec(raw)[1]), pageCount, 'the page tree count matches the page objects');
  const lines = extractPdfLines(pdf);
  return { raw, pageCount, lines, text: lines.map(line => line.text) };
}

// A4 is 595.28 x 841.89 with a 46pt margin, so every drawn line must sit inside
// the physical page. Text outside these bounds means the layout lost track of
// the cursor and pdfkit silently broke to another page mid-card.
function assertTextInsidePage(lines) {
  for (const line of lines) {
    assert.ok(Number.isFinite(line.x) && Number.isFinite(line.y), `a drawn line has no position: ${line.text.slice(0, 40)}`);
    assert.ok(line.x >= 40 && line.x <= 560, `text starts outside the printable width at x=${line.x}: ${line.text.slice(0, 40)}`);
    assert.ok(line.y >= 20 && line.y <= 810, `text is drawn outside the page at y=${line.y}: ${line.text.slice(0, 40)}`);
  }
}

test('a large report renders as a valid multi-page PDF with footers and wrapped text', { skip: pdfkitSkip }, async () => {
  const orders = Array.from({ length: 8 }, (_, index) => order(`o${index}`, `2026-09-${String(index + 2).padStart(2, '0')}T09:00:00.000Z`, index === 7 ? 'REJECTED' : 'APPROVED'));
  const tasks = orders.flatMap((linked, index) => [
    task(`t${index}a`, linked, {
      progress: index * 12,
      title: `${'Premium Viral Content Package '.repeat(4)}${index}`,
      description: 'Long description '.repeat(30),
      clientContentLinks: ['https://example.com/very/long/content/path?reference=1'],
    }),
    task(`t${index}b`, linked, {
      progress: 100, status: 'COMPLETED', completedAt: '2026-09-25T09:00:00.000Z',
      milestones: [{ name: 'Published', percentage: 100, reached: true, reachedAt: '2026-09-25T09:00:00.000Z' }],
    }),
  ]);
  const pdf = await renderReal(model({ orders, tasks }));
  const { pageCount, lines, text } = pdfStructure(pdf);
  const printed = text.join('\n');
  assertTextInsidePage(lines);

  // Page breaks: summary, chronological details and closing summary each render,
  // and the details section runs across several pages.
  assert.ok(pageCount >= 3, `expected a multi-page PDF, got ${pageCount}`);
  for (const section of ['Executive Summary', 'Workflow Stages', 'Order & Task Details', 'Summary', 'Important Notes',
    'Completed work', 'Pending / in-progress work', 'Rejected / cancelled work']) {
    assert.ok(printed.includes(section), `the PDF must print the ${section} section`);
  }

  // Every page carries its own footer, numbered against the real page total.
  const footers = printed.match(/Page \d+ of \d+/g) || [];
  assert.equal(footers.length, pageCount, `expected one footer per page, got ${footers.length}`);
  assert.ok(footers.includes(`Page 1 of ${pageCount}`) && footers.includes(`Page ${pageCount} of ${pageCount}`));

  // Long package names, descriptions and links survive the real layout pass.
  assert.ok(printed.includes('Premium Viral Content Package'), 'long package names are printed');
  assert.ok(printed.includes('Long description'), 'long task descriptions are printed');
  assert.ok(printed.includes('https://example.com/very/long/content/path'), 'content links are printed');
  assert.ok(printed.includes('Published'), 'saved milestone evidence is printed');

  // Text wrapping: no drawn line exceeds the printable width, so nothing
  // overflows the page. 503pt of content width at the smallest 8.5pt face fits
  // about 118 characters.
  const longest = text.reduce((max, line) => Math.max(max, line.length), 0);
  assert.ok(longest <= 130, `a drawn line is ${longest} characters long and would overflow the page`);

  // Chronological numbering, recorded dates and client identity reached the page.
  for (const sequence of ['1', '2', '3', '4', '5', '6', '7']) assert.ok(text.includes(sequence), `order ${sequence} is numbered`);
  assert.ok(printed.includes('CODE-o0') && printed.includes('Order date: Sep 2, 2026'), 'the recorded order code and date are printed');
  assert.ok(printed.includes('Acme Media') && printed.includes('Sep 1, 2026'), 'client and reporting period are printed');
  // The executive summary counts come from the model, not from the layout.
  assert.ok(printed.includes('16 task record(s) across 8 order(s)'), 'the summary counts are printed');
  assert.ok(printed.includes('ORDERS / PACKAGES') && printed.includes('REJECTED / CANCELLED'), 'every summary card is labelled');

  // No financial, wallet or commission data anywhere in the rendered text.
  for (const forbidden of ['totalAmount', 'credits', 'wallet', 'commission', 'invoice', 'amount', 'revenue', 'payment']) {
    assert.ok(!printed.toLowerCase().includes(forbidden.toLowerCase()), `the PDF must never print ${forbidden}`);
  }
});

test('an empty report and unavailable dates render without failing', { skip: pdfkitSkip }, async () => {
  const empty = pdfStructure(await renderReal(model({ orders: [], tasks: [] })));
  assertTextInsidePage(empty.lines);
  assert.ok(empty.pageCount >= 3, 'every section still renders for an empty period');
  assert.ok(empty.text.join('\n').includes('No order or task record exists'), 'an empty period is explained, not left blank');
  assert.equal((empty.text.join('\n').match(/Page \d+ of \d+/g) || []).length, empty.pageCount);

  const undated = pdfStructure(await renderReal(model({
    orders: [order('o1', null, 'PENDING_APPROVAL'), order('o2', '2026-09-08T09:00:00.000Z', 'REJECTED')],
    tasks: [
      task('t1', { id: 'o1', orderId: 'CODE-o1', createdAt: null }, { progress: null, title: 'x'.repeat(300) }),
      task('t2', null, { progress: 0.2, status: 'CANCELLED' }),
    ],
  })));
  assertTextInsidePage(undated.lines);
  const printed = undated.text.join('\n');
  assert.ok(printed.includes('Date unavailable'), 'a missing order date is reported as unavailable');
  assert.ok(printed.includes('Stage unavailable'), 'an unusable progress value is reported as unavailable');
  assert.ok(printed.includes('Completion date unavailable'), 'a missing completion date is reported as unavailable');
  assert.ok(printed.includes('Order date unavailable'), 'an unnumbered journey explains why');
  assert.ok(printed.includes('Rejected / cancelled work'), 'rejected and cancelled work is separated');
  assert.ok(printed.includes('Sep 8, 2026'), 'a recorded date is still printed when it exists');
  assert.equal((printed.match(/Page \d+ of \d+/g) || []).length, undated.pageCount);
});

test('completed, in-progress and rejected work are reported in their own sections', { skip: pdfkitSkip }, async () => {
  const completed = order('o1', '2026-09-02T09:00:00.000Z', 'COMPLETED', { completedAt: '2026-09-20T09:00:00.000Z' });
  const inProgress = order('o2', '2026-09-05T09:00:00.000Z', 'IN_PROGRESS');
  const rejected = order('o3', '2026-09-06T09:00:00.000Z', 'REJECTED');
  const pdf = await renderReal(model({
    orders: [completed, inProgress, rejected],
    tasks: [
      task('t1', completed, { progress: 100, status: 'COMPLETED', completedAt: '2026-09-20T09:00:00.000Z' }),
      task('t2', inProgress, { progress: 40 }),
      task('t3', rejected, { progress: 0, status: 'CANCELLED' }),
    ],
  }));
  const { text } = pdfStructure(pdf);
  const printed = text.join('\n');
  assert.ok(printed.includes('Completed') && printed.includes('Sep 20, 2026'), 'the recorded completion date is printed');
  assert.ok(printed.includes('In Process'), 'the 5%-99% stage label is printed');
  assert.ok(printed.includes('CODE-o3'), 'the rejected order is identified in its own section');
  // Only the two non-rejected orders are numbered chronologically.
  assert.ok(printed.includes('Order date: Sep 2, 2026') && printed.includes('Order date: Sep 5, 2026'));
});

test('a task taller than one page still renders inside the page bounds', { skip: pdfkitSkip }, async () => {
  // A pathological description, many milestones and many links: the card cannot
  // fit on a single page, so the layout must keep every drawn line on the page
  // instead of letting pdfkit break mid-card and lose the cursor.
  const linked = order('o1', '2026-09-04T09:00:00.000Z');
  const huge = {
    progress: 62,
    title: 'Package '.repeat(60),
    description: 'Detailed production notes with a very long run of text. '.repeat(120),
    milestones: Array.from({ length: 14 }, (_, index) => ({
      name: `Milestone ${index + 1} approval and handover`, percentage: index * 7, reached: index < 9,
      reachedAt: index < 9 ? '2026-09-12T09:00:00.000Z' : null,
    })),
    clientContentLinks: Array.from({ length: 8 }, (_, index) => `https://example.com/assets/${index}/very/long/reference/path?token=abcdef${index}`),
  };
  const structure = pdfStructure(await renderReal(model({
    orders: [linked],
    tasks: [task('t1', linked, huge), task('t2', linked, { progress: 100, status: 'COMPLETED' })],
  })));
  assertTextInsidePage(structure.lines);
  const printed = structure.text.join('\n');
  assert.ok(structure.pageCount >= 3, `the oversized card must flow onto further pages, got ${structure.pageCount}`);
  assert.equal((printed.match(/Page \d+ of \d+/g) || []).length, structure.pageCount, 'one footer per page, with no blank pages appended');
  assert.ok(printed.includes('Milestone 9'), 'the last reached milestone is still printed');
  assert.ok(!printed.includes('Milestone 10'), 'a milestone that was never reached is not printed as evidence');
  assert.ok(printed.includes('assets/5'), 'the last permitted content link is still printed');
  assert.ok(!printed.includes('assets/7'), 'the link list stays inside its documented cap');
  const longest = structure.text.reduce((max, line) => Math.max(max, line.length), 0);
  assert.ok(longest <= 130, `a drawn line is ${longest} characters long and would overflow the page`);
});
