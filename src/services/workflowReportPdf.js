const PDFDocument = require('pdfkit');
const Settings = require('../models/Settings');

// Premium, minimal business report styling. No financial data is ever rendered:
// this module receives an already-assembled report model and prints only
// workflow, package, status and date information.
const INK = {
  brand: '#4f46e5',
  brandSoft: '#eef2ff',
  title: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  card: '#f8fafc',
  done: '#059669',
  active: '#2563eb',
  scheduled: '#d97706',
  rejected: '#dc2626',
};

const PAGE = { size: 'A4', margin: 46 };

async function resolveBrand(brand) {
  if (brand) return brand;
  try {
    const settings = await Settings.getSettings();
    return settings?.agencyName || 'Go Viral Ads';
  } catch (_) {
    return 'Go Viral Ads';
  }
}

function drawHeader(doc, model) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;
  doc.save();
  doc.roundedRect(left, top, right - left, 74, 12).fill(INK.brand);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
    .text(model.brand, left + 20, top + 20, { width: 300, lineBreak: false });
  doc.fillColor('#e0e7ff').font('Helvetica').fontSize(10)
    .text('PROFESSIONAL WORKFLOW REPORT', left + 20, top + 46, { width: 320, lineBreak: false });
  const generated = `Generated ${model.generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
    .text(generated, right - 240, top + 48, { width: 220, align: 'right', lineBreak: false });
  doc.restore();
  doc.y = top + 74 + 18;
  doc.x = left;
}

function metaRow(doc, pairs) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cell = width / pairs.length;
  const top = doc.y;
  let tallest = 0;
  pairs.forEach(([label, value], index) => {
    const x = left + index * cell;
    doc.fillColor(INK.faint).font('Helvetica-Bold').fontSize(7.5)
      .text(String(label).toUpperCase(), x + 10, top + 9, { width: cell - 20, lineBreak: false, characterSpacing: 0.4 });
    doc.fillColor(INK.title).font('Helvetica').fontSize(10.5)
      .text(String(value ?? '—'), x + 10, top + 22, { width: cell - 20 });
    tallest = Math.max(tallest, doc.heightOfString(String(value ?? '—'), { width: cell - 20 }));
  });
  doc.save();
  doc.roundedRect(left, top, width, tallest + 34, 10).lineWidth(1).stroke(INK.line);
  doc.restore();
  doc.y = top + tallest + 34 + 16;
  doc.x = left;
}

function sectionTitle(doc, text, subtitle) {
  const left = doc.page.margins.left;
  doc.fillColor(INK.title).font('Helvetica-Bold').fontSize(13).text(text, left, doc.y, { lineBreak: false });
  doc.moveDown(0.2);
  if (subtitle) {
    doc.fillColor(INK.muted).font('Helvetica').fontSize(9)
      .text(subtitle, left, doc.y, { width: doc.page.width - left - doc.page.margins.right });
    doc.moveDown(0.4);
  } else {
    doc.moveDown(0.5);
  }
  doc.x = left;
}

function statCards(doc, cards) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const gap = 10;
  const columns = 3;
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = 62;
  const gridTop = doc.y;
  cards.forEach((card, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + column * (cardWidth + gap);
    const y = gridTop + row * (cardHeight + gap);
    doc.save();
    doc.roundedRect(x, y, cardWidth, cardHeight, 10).fill(INK.card);
    doc.roundedRect(x, y, 3, cardHeight, 1.5).fill(card.color);
    doc.fillColor(INK.muted).font('Helvetica-Bold').fontSize(7.5)
      .text(card.label.toUpperCase(), x + 14, y + 12, { width: cardWidth - 24, lineBreak: false, characterSpacing: 0.3 });
    doc.fillColor(INK.title).font('Helvetica-Bold').fontSize(21)
      .text(String(card.value), x + 14, y + 26, { width: cardWidth - 24, lineBreak: false });
    doc.restore();
  });
  doc.y = gridTop + Math.ceil(cards.length / columns) * (cardHeight + gap) + 6;
  doc.x = left;
}

// One stacked bar plus a legend: readable at a glance, no chart dependency.
function summaryBar(doc, segments) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const barHeight = 14;
  doc.save();
  doc.roundedRect(left, doc.y, width, barHeight, 7).fill(INK.line);
  if (total > 0) {
    let x = left;
    for (const segment of segments.filter(item => item.value > 0)) {
      const segmentWidth = Math.max(3, (segment.value / total) * width);
      if (x + segmentWidth > left + width) break;
      doc.roundedRect(x, doc.y, Math.min(segmentWidth, left + width - x), barHeight, 6).fill(segment.color);
      x += segmentWidth;
    }
  }
  doc.restore();
  doc.y += barHeight + 10;
  const legendTop = doc.y;
  let legendX = left;
  for (const segment of segments) {
    const label = `${segment.label} ${segment.value}`;
    const labelWidth = doc.font('Helvetica').fontSize(8.5).widthOfString(label) + 20;
    if (legendX + labelWidth > left + width) {
      legendX = left;
      doc.y += 15;
    }
    doc.save();
    doc.circle(legendX + 5, doc.y + 5, 4).fill(segment.color);
    doc.fillColor(INK.body).font('Helvetica').fontSize(8.5).text(label, legendX + 14, doc.y + 1, { lineBreak: false });
    doc.restore();
    legendX += labelWidth;
  }
  doc.y = Math.max(legendTop, doc.y) + 20;
  doc.x = left;
}

function stageList(doc, model) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const rows = [
    ['Order Placed', 'Recorded order date', `${model.summary.activeOrders} order(s)`, INK.brand],
    ['Scheduled', '0% progress', `${model.summary.scheduled} task(s)`, INK.scheduled],
    ['Started', '1% - 4% progress', `${model.summary.started} task(s)`, INK.active],
    ['In Process', '5% - 99% progress', `${model.summary.process} task(s)`, INK.active],
    ['Completed', '100% progress', `${model.summary.completed} task(s)`, INK.done],
  ];
  const top = doc.y;
  rows.forEach((row, index) => {
    const y = top + index * 26;
    doc.save();
    doc.circle(left + 6, y + 9, 4).fill(row[3]);
    if (index < rows.length - 1) {
      doc.moveTo(left + 6, y + 14).lineTo(left + 6, y + 24).lineWidth(1).stroke(INK.line);
    }
    doc.fillColor(INK.title).font('Helvetica-Bold').fontSize(9.5).text(row[0], left + 18, y + 3, { width: 150, lineBreak: false });
    doc.fillColor(INK.faint).font('Helvetica').fontSize(8.5).text(row[1], left + 170, y + 4, { width: 200, lineBreak: false });
    doc.fillColor(INK.body).font('Helvetica-Bold').fontSize(9.5)
      .text(row[2], left, y + 3, { width, align: 'right', lineBreak: false });
    doc.restore();
  });
  doc.y = top + rows.length * 26 + 8;
  doc.x = left;
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom - 26;
  if (doc.y + needed > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

function progressBar(doc, x, y, width, progress, color) {
  const value = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  doc.save();
  doc.roundedRect(x, y, width, 6, 3).fill(INK.line);
  if (value > 0) doc.roundedRect(x, y, Math.max(4, (value / 100) * width), 6, 3).fill(color);
  doc.restore();
}

function stageColor(stage) {
  if (stage === 'Completed') return INK.done;
  if (stage === 'Scheduled') return INK.scheduled;
  if (stage === 'In Process' || stage === 'Started') return INK.active;
  return INK.faint;
}

function renderTask(doc, task, index, showClient) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const color = stageColor(task.stage);

  const descriptionHeight = task.description ? doc.heightOfString(task.description, { width: width - 30 }) + 6 : 0;
  const milestoneHeight = task.milestones.length ? task.milestones.length * 13 + 6 : 0;
  const linkHeight = task.links.length ? task.links.reduce((sum, link) => sum + doc.heightOfString(link, { width: width - 44, font: 'Helvetica', fontSize: 8 }) + 3, 0) + 6 : 0;
  const needed = 62 + descriptionHeight + milestoneHeight + linkHeight;
  ensureSpace(doc, needed);

  const top = doc.y;
  doc.save();
  doc.roundedRect(left, top, width, needed - 8, 9).fill('#ffffff').lineWidth(1).stroke(INK.line);
  doc.roundedRect(left, top, width, 3, 1.5).fill(color);
  doc.restore();

  let y = top + 13;
  doc.fillColor(INK.title).font('Helvetica-Bold').fontSize(10.5)
    .text(`${index + 1}. ${task.title}`, left + 14, y, { width: width - 150 });
  const titleHeight = doc.heightOfString(`${index + 1}. ${task.title}`, { width: width - 150, font: 'Helvetica-Bold', fontSize: 10.5 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(8.5)
    .text(task.stageLabel, left, y + 1, { width: width - 14, align: 'right', lineBreak: false });
  y += Math.max(titleHeight, 13) + 5;

  doc.fillColor(INK.muted).font('Helvetica').fontSize(8.5)
    .text(`Status ${task.status}${showClient && task.clientName ? `  ·  Client ${task.clientName}` : ''}`, left + 14, y, { width: width - 28, lineBreak: false });
  y += 13;
  progressBar(doc, left + 14, y + 1, 120, task.progress, color);
  doc.fillColor(INK.faint).font('Helvetica').fontSize(8)
    .text(Number.isFinite(task.progress) ? `${task.progress}% recorded progress` : 'Progress unavailable', left + 142, y - 2, { width: 190, lineBreak: false });
  doc.fillColor(INK.faint).font('Helvetica').fontSize(8)
    .text(`Completed: ${task.completedLabel}`, left, y - 2, { width: width - 14, align: 'right', lineBreak: false });
  y += 16;

  if (task.description) {
    doc.fillColor(INK.body).font('Helvetica').fontSize(8.5)
      .text(task.description, left + 14, y, { width: width - 30 });
    y += descriptionHeight;
  }
  if (task.milestones.length) {
    doc.fillColor(INK.faint).font('Helvetica-Bold').fontSize(7.5)
      .text('SAVED MILESTONES (EVIDENCE ONLY, NOT STAGE TRANSITIONS)', left + 14, y, { width: width - 28, lineBreak: false });
    y += 11;
    for (const milestone of task.milestones) {
      doc.fillColor(INK.body).font('Helvetica').fontSize(8.5)
        .text(`• ${milestone.name}${Number.isFinite(milestone.percentage) ? ` (${milestone.percentage}%)` : ''} — ${milestone.dateLabel}`, left + 20, y, { width: width - 40 });
      y += 13;
    }
    y += 2;
  }
  if (task.links.length) {
    doc.fillColor(INK.faint).font('Helvetica-Bold').fontSize(7.5)
      .text('CONTENT / INPUT LINKS', left + 14, y, { width: width - 28, lineBreak: false });
    y += 11;
    for (const link of task.links) {
      doc.fillColor(INK.brand).font('Helvetica').fontSize(8).text(link, left + 20, y, { width: width - 44 });
      y += doc.heightOfString(link, { width: width - 44, font: 'Helvetica', fontSize: 8 }) + 3;
    }
  }
  doc.y = top + needed + 6;
  doc.x = left;
}

function renderJourney(doc, journey, showClient) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  ensureSpace(doc, 96);

  const top = doc.y;
  doc.save();
  doc.roundedRect(left, top, 34, 34, 9).fill(journey.sequence ? INK.brand : INK.line);
  doc.fillColor(journey.sequence ? '#ffffff' : INK.muted).font('Helvetica-Bold').fontSize(13)
    .text(journey.sequence ? String(journey.sequence) : '—', left, top + 10, { width: 34, align: 'center', lineBreak: false });
  doc.restore();

  const nameWidth = width - 46;
  doc.fillColor(INK.title).font('Helvetica-Bold').fontSize(12).text(journey.packageName, left + 46, top + 2, { width: nameWidth });
  const nameHeight = doc.heightOfString(journey.packageName, { width: nameWidth, font: 'Helvetica-Bold', fontSize: 12 });
  const meta = [
    `Order date: ${journey.orderDateLabel}`,
    journey.orderCode ? `Order ${journey.orderCode}` : null,
    `Order status: ${journey.orderStatus}`,
    showClient && journey.clientNames.length ? journey.clientNames.join(', ') : null,
  ].filter(Boolean).join('   ·   ');
  doc.fillColor(INK.muted).font('Helvetica').fontSize(8.5).text(meta, left + 46, top + 4 + Math.max(nameHeight, 15), { width: nameWidth });
  doc.y = top + Math.max(38, 8 + Math.max(nameHeight, 15) + 16);
  doc.x = left;
  if (!journey.sequence) {
    doc.fillColor(INK.faint).font('Helvetica-Oblique').fontSize(8)
      .text(journey.unnumberedReason, left + 46, doc.y, { width: nameWidth, lineBreak: false });
    doc.moveDown(0.6);
    doc.x = left;
  } else {
    doc.moveDown(0.4);
  }

  if (!journey.tasks.length) {
    doc.fillColor(INK.muted).font('Helvetica-Oblique').fontSize(9)
      .text('No active task record is linked to this order in the selected period.', left + 14, doc.y, { width: width - 28 });
    doc.moveDown(1);
    doc.x = left;
    return;
  }
  journey.tasks.forEach((task, index) => renderTask(doc, task, index, showClient));
  doc.moveDown(0.5);
}

function renderListSection(doc, title, items, color, render) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  ensureSpace(doc, 54);
  doc.save();
  doc.opacity(0.1).roundedRect(left, doc.y, width, 26, 8).fill(color);
  doc.restore();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10)
    .text(`${title} (${items.length})`, left + 12, doc.y + 8, { width: width - 24, lineBreak: false });
  doc.y += 34;
  doc.x = left;
  if (!items.length) {
    doc.fillColor(INK.faint).font('Helvetica-Oblique').fontSize(9).text('None in this period.', left + 12, doc.y, { width: width - 24, lineBreak: false });
    doc.moveDown(1.2);
    doc.x = left;
    return;
  }
  for (const item of items) render(item);
  doc.moveDown(0.6);
}

function renderSummaryLine(doc, text, muted = false) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const height = doc.heightOfString(text, { width: width - 26, font: 'Helvetica', fontSize: 9 });
  ensureSpace(doc, height + 10);
  doc.save();
  doc.circle(left + 6, doc.y + 5, 2.5).fill(muted ? INK.faint : INK.body);
  doc.fillColor(muted ? INK.muted : INK.body).font('Helvetica').fontSize(9).text(text, left + 16, doc.y, { width: width - 26 });
  doc.restore();
  doc.y += height + 5;
  doc.x = left;
}

function drawFooters(doc, model) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom + 8;
    // pdfkit inserts an automatic page break whenever text is drawn below the
    // bottom margin. The footer lives inside that margin, so lift it for the
    // duration of the draw; otherwise every footer silently appends blank pages
    // and the report ends up with far more pages than it has content.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.6).stroke(INK.line);
    doc.fillColor(INK.faint).font('Helvetica').fontSize(7.5)
      .text(`${model.brand} · ${model.title} · ${model.clientLabel}`, left, y, { width: width - 90, lineBreak: false });
    doc.fillColor(INK.faint).font('Helvetica').fontSize(7.5)
      .text(`Page ${index - range.start + 1} of ${range.count}`, left, y, { width, align: 'right', lineBreak: false });
    doc.restore();
    doc.page.margins.bottom = bottomMargin;
  }
}

/**
 * Render the workflow report PDF.
 * @param {Object} model - output of buildReportModel()
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateWorkflowReportPDF(model) {
  const brand = await resolveBrand(model.brand);
  const report = { ...model, brand };
  const showClient = report.clients.length !== 1;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ ...PAGE, bufferPages: true, info: { Title: `${brand} — ${report.title}`, Author: brand, Subject: `${report.clientLabel} · ${report.period.label}` } });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      drawHeader(doc, report);
      metaRow(doc, [
        ['Client', report.clientLabel],
        ['Reporting period', report.period.label],
        ['Generated by', report.generatedBy],
        ...(report.employee ? [['Assigned employee', report.employee]] : []),
      ]);

      sectionTitle(doc, 'Executive Summary', `${report.summary.totalTasks} task record(s) across ${report.summary.totalOrders} order(s) in the selected period.`);
      statCards(doc, [
        { label: 'Orders / Packages', value: report.summary.totalOrders, color: INK.brand },
        { label: 'Tasks', value: report.summary.totalTasks, color: INK.brand },
        { label: 'Completed', value: report.summary.completed, color: INK.done },
        { label: 'In Progress', value: report.summary.inProgress, color: INK.active },
        { label: 'Scheduled', value: report.summary.scheduled, color: INK.scheduled },
        { label: 'Rejected / Cancelled', value: report.summary.rejected, color: INK.rejected },
      ]);
      summaryBar(doc, [
        { label: 'Completed', value: report.summary.completed, color: INK.done },
        { label: 'In progress', value: report.summary.inProgress, color: INK.active },
        { label: 'Scheduled', value: report.summary.scheduled, color: INK.scheduled },
        { label: 'Stage unavailable', value: report.summary.unavailable, color: INK.faint },
        { label: 'Rejected / cancelled', value: report.summary.rejected, color: INK.rejected },
      ]);
      sectionTitle(doc, 'Workflow Stages', 'Current recorded progress only — historical transition dates are never inferred.');
      stageList(doc, report);

      doc.addPage();
      sectionTitle(doc, 'Order & Task Details', 'Chronologically numbered by the recorded order date inside the selected period.');
      if (report.empty) {
        doc.fillColor(INK.muted).font('Helvetica').fontSize(10)
          .text('No order or task record exists for this client and period. Select a different month or custom date range.', doc.page.margins.left, doc.y, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
      } else {
        report.journeys.forEach(journey => renderJourney(doc, journey, showClient));
      }

      doc.addPage();
      sectionTitle(doc, 'Summary', 'Completed, pending and rejected work reported separately.');
      renderListSection(doc, 'Completed work', report.journeys.flatMap(journey => journey.tasks.filter(task => task.completed).map(task => ({ journey, task }))), INK.done,
        ({ journey, task }) => renderSummaryLine(doc, `${journey.sequence ? `Order ${journey.sequence} · ` : ''}${task.title} — completed ${task.completedLabel}`));
      renderListSection(doc, 'Pending / in-progress work', report.journeys.flatMap(journey => journey.tasks.filter(task => !task.completed).map(task => ({ journey, task }))), INK.active,
        ({ journey, task }) => renderSummaryLine(doc, `${journey.sequence ? `Order ${journey.sequence} · ` : ''}${task.title} — ${task.stageLabel}, status ${task.status}`));
      renderListSection(doc, 'Rejected / cancelled work', [...report.rejected.map(item => ({ ...item, kind: 'order' })), ...report.cancelled.map(item => ({ ...item, kind: 'task' }))], INK.rejected,
        item => renderSummaryLine(doc, item.kind === 'order'
          ? `${item.packageName}${item.orderCode ? ` (${item.orderCode})` : ''} — ${item.reason}, ${item.orderDateLabel}`
          : `${item.title} — ${item.reason}, status ${item.status}`));

      sectionTitle(doc, 'Important Notes');
      for (const note of report.notes) renderSummaryLine(doc, note, true);

      drawFooters(doc, report);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateWorkflowReportPDF, INK };
