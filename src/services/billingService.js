const { Invoice, INVOICE_STATUS, INVOICE_TYPE } = require('../models/Invoice');
const { Receipt, RECEIPT_STATUS } = require('../models/Receipt');
const BillingConfig = require('../models/BillingConfig');
const User = require('../models/User');

/**
 * Calculate tax details for an invoice
 * @param {Number} amount - Base amount
 * @param {Object} config - BillingConfig
 * @param {Object} clientBilling - Client's billing info
 * @returns {Object} Tax details
 */
function calculateTaxDetails(amount, config, clientBilling) {
  // Default: no tax
  const taxDetails = {
    gstEnabled: config.gstEnabled || false,
    taxPercentage: config.taxPercentage || 0,
    isGstInvoice: false,
    cgst: 0,
    sgst: 0,
    igst: 0,
  };
  
  let taxAmount = 0;
  
  // Only calculate GST if:
  // 1. GST is enabled in config
  // 2. Client has a valid GST number
  if (config.gstEnabled && clientBilling?.gstNumber && clientBilling.gstNumber.trim()) {
    taxDetails.isGstInvoice = true;
    const totalTax = (amount * config.taxPercentage) / 100;
    
    // Determine if intra-state or inter-state
    const companyState = (config.companyState || '').toLowerCase().trim();
    const clientState = (clientBilling.state || '').toLowerCase().trim();
    
    if (companyState && clientState && companyState === clientState) {
      // Intra-state: Split into CGST + SGST (50% each)
      taxDetails.cgst = Math.round((totalTax / 2) * 100) / 100;
      taxDetails.sgst = Math.round((totalTax / 2) * 100) / 100;
      taxAmount = taxDetails.cgst + taxDetails.sgst;
    } else {
      // Inter-state: Full IGST
      taxDetails.igst = Math.round(totalTax * 100) / 100;
      taxAmount = taxDetails.igst;
    }
  }
  
  return { taxDetails, taxAmount };
}

/**
 * Generate unique invoice number: INV-2024-001234
 */
async function generateInvoiceNumber() {
  const config = await BillingConfig.findOneAndUpdate(
    { configType: 'BILLING_CONFIG' },
    { $inc: { currentInvoiceSeq: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear();
  const seq = String(config.currentInvoiceSeq).padStart(6, '0');
  return `${config.invoicePrefix}-${year}-${seq}`;
}

/**
 * Generate unique receipt number: RCP-2024-001234
 */
async function generateReceiptNumber() {
  const config = await BillingConfig.findOneAndUpdate(
    { configType: 'BILLING_CONFIG' },
    { $inc: { currentReceiptSeq: 1 } },
    { new: true, upsert: true }
  );
  const year = new Date().getFullYear();
  const seq = String(config.currentReceiptSeq).padStart(6, '0');
  return `${config.receiptPrefix}-${year}-${seq}`;
}

/**
 * Create invoice when recharge is approved
 * @param {Object} rechargeRequest - The approved recharge request
 * @param {Object} transaction - The wallet transaction
 * @param {String} adminId - Admin who approved
 * @returns {Object} Created invoice
 */
async function createInvoiceForRecharge(rechargeRequest, transaction, adminId) {
  try {
    const config = await BillingConfig.getConfig();
    const invoiceNumber = await generateInvoiceNumber();
    
    // Get client billing info
    const client = await User.findById(rechargeRequest.clientId).select('billing identifier profile');
    const clientBilling = client?.billing || {};
    
    // Calculate tax
    const { taxDetails, taxAmount } = calculateTaxDetails(rechargeRequest.amount, config, clientBilling);
    const totalAmount = rechargeRequest.amount + taxAmount;

    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceType: INVOICE_TYPE.RECHARGE,
      clientId: rechargeRequest.clientId,
      rechargeRequestId: rechargeRequest._id,
      transactionId: transaction?._id || null,
      amount: rechargeRequest.amount,
      taxAmount,
      totalAmount,
      paymentMethod: 'Online Transfer',
      paymentReference: rechargeRequest.paymentReference || '',
      status: INVOICE_STATUS.FINALIZED,
      isDownloadableByClient: config.defaultClientInvoiceDownload,
      generatedBy: adminId,
      billingSnapshot: {
        companyName: config.companyName,
        companyAddress: config.companyAddress,
        companyGST: config.companyGST,
        companyPAN: config.companyPAN,
        companyEmail: config.companyEmail,
        companyPhone: config.companyPhone,
        companyState: config.companyState,
      },
      clientBillingSnapshot: {
        name: clientBilling.name || client?.profile?.name || '',
        companyName: clientBilling.companyName || '',
        email: clientBilling.email || client?.identifier || '',
        phone: clientBilling.phone || '',
        address: clientBilling.address || '',
        city: clientBilling.city || '',
        state: clientBilling.state || '',
        pincode: clientBilling.pincode || '',
        country: clientBilling.country || 'India',
        gstNumber: clientBilling.gstNumber || '',
      },
      taxDetails,
    });

    console.log(`[BILLING] Invoice ${invoiceNumber} created for recharge ${rechargeRequest._id}` + 
      (taxDetails.isGstInvoice ? ` (GST: ${taxAmount})` : ' (Non-GST)'));
    return invoice;
  } catch (err) {
    console.error('[BILLING] Failed to create invoice:', err.message);
    // Don't throw - invoice creation failure shouldn't block recharge approval
    return null;
  }
}

/**
 * Create invoice when order is approved
 * @param {Object} order - The approved order
 * @param {String} adminId - Admin who approved
 * @returns {Object} Created invoice
 */
async function createInvoiceForOrder(order, adminId) {
  try {
    const config = await BillingConfig.getConfig();
    const invoiceNumber = await generateInvoiceNumber();
    
    // Get client billing info
    const client = await User.findById(order.clientId).select('billing identifier profile');
    const clientBilling = client?.billing || {};
    
    // Calculate tax
    const { taxDetails, taxAmount } = calculateTaxDetails(order.totalAmount, config, clientBilling);
    const totalAmount = order.totalAmount + taxAmount;

    const invoice = await Invoice.create({
      invoiceNumber,
      invoiceType: INVOICE_TYPE.ORDER,
      clientId: order.clientId,
      orderId: order._id,
      items: (order.items || []).map(item => ({
        planTitle: item.planTitle,
        planIcon: item.planIcon,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      amount: order.totalAmount,
      taxAmount,
      totalAmount,
      paymentMethod: 'Wallet',
      paymentReference: order.orderId,
      status: INVOICE_STATUS.FINALIZED,
      isDownloadableByClient: config.defaultClientInvoiceDownload,
      generatedBy: adminId,
      billingSnapshot: {
        companyName: config.companyName,
        companyAddress: config.companyAddress,
        companyGST: config.companyGST,
        companyPAN: config.companyPAN,
        companyEmail: config.companyEmail,
        companyPhone: config.companyPhone,
        companyState: config.companyState,
      },
      clientBillingSnapshot: {
        name: clientBilling.name || client?.profile?.name || '',
        companyName: clientBilling.companyName || '',
        email: clientBilling.email || client?.identifier || '',
        phone: clientBilling.phone || '',
        address: clientBilling.address || '',
        city: clientBilling.city || '',
        state: clientBilling.state || '',
        pincode: clientBilling.pincode || '',
        country: clientBilling.country || 'India',
        gstNumber: clientBilling.gstNumber || '',
      },
      taxDetails,
    });

    console.log(`[BILLING] Invoice ${invoiceNumber} created for order ${order.orderId}` +
      (taxDetails.isGstInvoice ? ` (GST: ${taxAmount})` : ' (Non-GST)'));
    return invoice;
  } catch (err) {
    console.error('[BILLING] Failed to create order invoice:', err.message);
    // Don't throw - invoice creation failure shouldn't block order approval
    return null;
  }
}

/**
 * Create receipt when task is purchased with wallet credits
 * @param {Object} task - The purchased task
 * @param {Object} transaction - The wallet transaction (debit)
 * @param {String} clientId - Client who purchased
 * @returns {Object} Created receipt
 */
async function createReceiptForTaskPurchase(task, transaction, clientId) {
  try {
    const config = await BillingConfig.getConfig();
    const receiptNumber = await generateReceiptNumber();

    // Find recent invoices for this client to reference
    const recentInvoices = await Invoice.find({
      clientId,
      status: INVOICE_STATUS.FINALIZED,
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .select('_id')
      .exec();

    const receipt = await Receipt.create({
      receiptNumber,
      clientId,
      taskId: task._id,
      transactionId: transaction?._id || null,
      rechargeInvoiceIds: recentInvoices.map(inv => inv._id),
      creditsUsed: task.creditsUsed || task.creditCost,
      taskTitle: task.title,
      status: RECEIPT_STATUS.GENERATED,
      isDownloadableByClient: config.defaultClientReceiptDownload,
    });

    console.log(`[BILLING] Receipt ${receiptNumber} created for task ${task._id}`);
    return receipt;
  } catch (err) {
    console.error('[BILLING] Failed to create receipt:', err.message);
    // Don't throw - receipt creation failure shouldn't block task purchase
    return null;
  }
}

/**
 * Get billing config
 */
async function getBillingConfig() {
  return await BillingConfig.getConfig();
}

/**
 * Update billing config
 */
async function updateBillingConfig(updates) {
  const config = await BillingConfig.findOneAndUpdate(
    { configType: 'BILLING_CONFIG' },
    { $set: updates },
    { new: true, upsert: true }
  );
  return config;
}

/**
 * Toggle invoice download permission for client
 */
async function toggleInvoiceDownload(invoiceId, isDownloadable) {
  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { isDownloadableByClient: isDownloadable },
    { new: true }
  );
  return invoice;
}

/**
 * Toggle receipt download permission for client
 */
async function toggleReceiptDownload(receiptId, isDownloadable) {
  const receipt = await Receipt.findByIdAndUpdate(
    receiptId,
    { isDownloadableByClient: isDownloadable },
    { new: true }
  );
  return receipt;
}

/**
 * Get invoices with filters
 */
async function getInvoices(filters = {}) {
  const query = {};

  if (filters.clientId) {
    query.clientId = filters.clientId;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) {
      query.createdAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      query.createdAt.$lte = new Date(filters.dateTo);
    }
  }

  const invoices = await Invoice.find(query)
    .populate('clientId', 'identifier profile')
    .populate('generatedBy', 'identifier')
    .sort({ createdAt: -1 })
    .exec();

  return invoices;
}

/**
 * Get receipts with filters
 */
async function getReceipts(filters = {}) {
  const query = {};

  if (filters.clientId) {
    query.clientId = filters.clientId;
  }
  if (filters.status) {
    query.status = filters.status;
  }
  if (filters.taskId) {
    query.taskId = filters.taskId;
  }
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) {
      query.createdAt.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      query.createdAt.$lte = new Date(filters.dateTo);
    }
  }

  const receipts = await Receipt.find(query)
    .populate('clientId', 'identifier profile')
    .populate('taskId', 'title')
    .sort({ createdAt: -1 })
    .exec();

  return receipts;
}

/**
 * Get invoice by ID
 */
async function getInvoiceById(invoiceId) {
  return await Invoice.findById(invoiceId)
    .populate('clientId', 'identifier profile billing')
    .populate('generatedBy', 'identifier')
    .populate('rechargeRequestId')
    .populate('orderId')
    .exec();
}

/**
 * Get invoice by order ID
 */
async function getInvoiceByOrderId(orderId) {
  return await Invoice.findOne({ orderId })
    .populate('clientId', 'identifier profile billing')
    .exec();
}

/**
 * Get receipt by ID
 */
async function getReceiptById(receiptId) {
  return await Receipt.findById(receiptId)
    .populate('clientId', 'identifier profile billing')
    .populate('taskId', 'title description creditCost creditsUsed')
    .populate('rechargeInvoiceIds', 'invoiceNumber amount')
    .exec();
}

/**
 * Get receipt by task ID
 */
async function getReceiptByTaskId(taskId) {
  return await Receipt.findOne({ taskId })
    .populate('clientId', 'identifier profile')
    .exec();
}

/**
 * Update invoice (admin only)
 */
async function updateInvoice(invoiceId, updates) {
  // Only allow certain fields to be updated
  const allowedUpdates = {};
  if (updates.notes !== undefined) allowedUpdates.notes = updates.notes;
  if (updates.status !== undefined) allowedUpdates.status = updates.status;
  if (updates.paymentMethod !== undefined) allowedUpdates.paymentMethod = updates.paymentMethod;

  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: allowedUpdates },
    { new: true }
  );
  return invoice;
}

module.exports = {
  generateInvoiceNumber,
  generateReceiptNumber,
  createInvoiceForRecharge,
  createInvoiceForOrder,
  createReceiptForTaskPurchase,
  getBillingConfig,
  updateBillingConfig,
  toggleInvoiceDownload,
  toggleReceiptDownload,
  getInvoices,
  getReceipts,
  getInvoiceById,
  getInvoiceByOrderId,
  getReceiptById,
  getReceiptByTaskId,
  updateInvoice,
};
