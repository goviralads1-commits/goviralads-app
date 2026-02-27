const PDFDocument = require('pdfkit');
const BillingConfig = require('../models/BillingConfig');

/**
 * Generate Invoice PDF
 * @param {Object} invoice - Invoice document with populated fields
 * @returns {Buffer} PDF buffer
 */
async function generateInvoicePDF(invoice) {
  const config = await BillingConfig.getConfig();
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('TAX INVOICE', { align: 'center' });
      doc.moveDown(0.5);

      // Company Details
      doc.fontSize(12).font('Helvetica-Bold').text(config.companyName || 'Company Name');
      doc.fontSize(10).font('Helvetica');
      if (config.companyAddress) doc.text(config.companyAddress);
      if (config.companyEmail) doc.text(`Email: ${config.companyEmail}`);
      if (config.companyPhone) doc.text(`Phone: ${config.companyPhone}`);
      if (config.companyGST) doc.text(`GST: ${config.companyGST}`);
      if (config.companyPAN) doc.text(`PAN: ${config.companyPAN}`);
      doc.moveDown();

      // Divider
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Invoice Details
      const invoiceDate = new Date(invoice.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      
      doc.fontSize(11).font('Helvetica-Bold').text('Invoice Details', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
      doc.text(`Date: ${invoiceDate}`);
      doc.text(`Status: ${invoice.status}`);
      doc.moveDown();

      // Bill To (use billing details if available, fallback to profile)
      const client = invoice.clientId;
      const billing = client?.billing || {};
      const profile = client?.profile || {};
      const clientName = billing.name || profile.name || client?.identifier || 'Client';
      const clientEmail = billing.email || client?.identifier || 'N/A';
      const clientPhone = billing.phone || profile.phone || '';
      const clientAddress = [billing.address, billing.city, billing.state, billing.pincode, billing.country]
        .filter(Boolean).join(', ');
      const clientGST = billing.gstNumber || '';
      const clientCompany = billing.companyName || profile.company || '';
      
      doc.fontSize(11).font('Helvetica-Bold').text('Bill To', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      if (clientCompany) doc.text(clientCompany);
      doc.text(clientName);
      doc.text(`Email: ${clientEmail}`);
      if (clientPhone) doc.text(`Phone: ${clientPhone}`);
      if (clientAddress) doc.text(clientAddress);
      if (clientGST) doc.text(`GST: ${clientGST}`);
      doc.moveDown();

      // Divider
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Payment Details Table
      const tableTop = doc.y;
      const tableHeaders = ['Description', 'Payment Method', 'Reference', 'Amount'];
      const colWidths = [200, 100, 130, 65];
      let xPos = 50;

      // Table Header
      doc.fillColor('#6366f1').rect(50, tableTop, 495, 25).fill();
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      xPos = 50;
      tableHeaders.forEach((header, i) => {
        doc.text(header, xPos + 5, tableTop + 7, { width: colWidths[i] - 10 });
        xPos += colWidths[i];
      });

      // Table Row
      const rowY = tableTop + 25;
      doc.fillColor('#f8fafc').rect(50, rowY, 495, 30).fill();
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica');
      xPos = 50;
      const rowData = [
        'Wallet Recharge',
        invoice.paymentMethod || 'Online Transfer',
        invoice.paymentReference || '-',
        `${config.currencySymbol || '₹'}${invoice.amount.toLocaleString()}`
      ];
      rowData.forEach((data, i) => {
        doc.text(data, xPos + 5, rowY + 10, { width: colWidths[i] - 10 });
        xPos += colWidths[i];
      });

      doc.moveDown(3);

      // Total
      doc.y = rowY + 50;
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(350, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(12).font('Helvetica-Bold')
        .text(`Total: ${config.currencySymbol || '₹'}${invoice.amount.toLocaleString()}`, 350, doc.y, { align: 'right' });
      
      doc.moveDown(2);

      // Notes
      if (invoice.notes) {
        doc.fontSize(10).font('Helvetica-Bold').text('Notes:', 50);
        doc.font('Helvetica').text(invoice.notes);
      }

      // Footer
      doc.fontSize(9).fillColor('#64748b')
        .text('This is a computer-generated invoice.', 50, 750, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate Receipt PDF
 * @param {Object} receipt - Receipt document with populated fields
 * @returns {Buffer} PDF buffer
 */
async function generateReceiptPDF(receipt) {
  const config = await BillingConfig.getConfig();
  
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).font('Helvetica-Bold').text('SERVICE RECEIPT', { align: 'center' });
      doc.fontSize(10).fillColor('#64748b').text('Paid via Wallet Credits', { align: 'center' });
      doc.moveDown();

      // Company Details
      doc.fillColor('#0f172a');
      doc.fontSize(12).font('Helvetica-Bold').text(config.companyName || 'Company Name');
      doc.fontSize(10).font('Helvetica');
      if (config.companyAddress) doc.text(config.companyAddress);
      if (config.companyEmail) doc.text(`Email: ${config.companyEmail}`);
      if (config.companyPhone) doc.text(`Phone: ${config.companyPhone}`);
      doc.moveDown();

      // Divider
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Receipt Details
      const receiptDate = new Date(receipt.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      
      doc.fontSize(11).font('Helvetica-Bold').text('Receipt Details', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Receipt Number: ${receipt.receiptNumber}`);
      doc.text(`Date: ${receiptDate}`);
      doc.text(`Status: ${receipt.status}`);
      doc.moveDown();

      // Client Details (use billing if available)
      const client = receipt.clientId;
      const billing = client?.billing || {};
      const profile = client?.profile || {};
      const clientName = billing.name || profile.name || client?.identifier || 'Client';
      const clientEmail = billing.email || client?.identifier || 'N/A';
      
      doc.fontSize(11).font('Helvetica-Bold').text('Client', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(clientName);
      doc.text(`Email: ${clientEmail}`);
      doc.moveDown();

      // Divider
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Service Details Table
      const tableTop = doc.y;
      const tableHeaders = ['Service Description', 'Credits Used'];
      const colWidths = [395, 100];
      let xPos = 50;

      // Table Header
      doc.fillColor('#10b981').rect(50, tableTop, 495, 25).fill();
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      xPos = 50;
      tableHeaders.forEach((header, i) => {
        doc.text(header, xPos + 5, tableTop + 7, { width: colWidths[i] - 10 });
        xPos += colWidths[i];
      });

      // Table Row
      const rowY = tableTop + 25;
      doc.fillColor('#f0fdf4').rect(50, rowY, 495, 30).fill();
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica');
      xPos = 50;
      const rowData = [
        receipt.taskTitle || receipt.taskId?.title || 'Task Service',
        `${receipt.creditsUsed} credits`
      ];
      rowData.forEach((data, i) => {
        doc.text(data, xPos + 5, rowY + 10, { width: colWidths[i] - 10 });
        xPos += colWidths[i];
      });

      doc.moveDown(3);

      // Total
      doc.y = rowY + 50;
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(350, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      
      doc.fontSize(12).font('Helvetica-Bold')
        .text(`Total Credits Used: ${receipt.creditsUsed}`, 350, doc.y, { align: 'right' });
      
      doc.moveDown(2);

      // Referenced Invoices
      if (receipt.rechargeInvoiceIds && receipt.rechargeInvoiceIds.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('Credits sourced from invoices:', 50);
        doc.font('Helvetica');
        receipt.rechargeInvoiceIds.forEach(inv => {
          if (inv.invoiceNumber) {
            doc.text(`• ${inv.invoiceNumber} - ${config.currencySymbol || '₹'}${inv.amount}`);
          }
        });
      }

      // Footer
      doc.fontSize(9).fillColor('#64748b')
        .text('This receipt confirms payment via wallet credits. No additional tax invoice required.', 50, 720, { align: 'center' });
      doc.text('Credits were previously invoiced during wallet recharge.', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateInvoicePDF,
  generateReceiptPDF,
};
