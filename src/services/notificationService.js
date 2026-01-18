const Notification = require('../models/Notification');

const NOTIFICATION_TYPES = Object.freeze({
  RECHARGE_REQUEST_SUBMITTED: 'RECHARGE_REQUEST_SUBMITTED',
  RECHARGE_APPROVED: 'RECHARGE_APPROVED',
  RECHARGE_REJECTED: 'RECHARGE_REJECTED',
  TASK_PURCHASED: 'TASK_PURCHASED',
  TASK_APPROVED: 'TASK_APPROVED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  WALLET_ADJUSTED: 'WALLET_ADJUSTED',
  TICKET_REPLIED: 'TICKET_REPLIED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  NEW_NOTICE: 'NEW_NOTICE',
  TASK_REMINDER: 'TASK_REMINDER',
});

const ENTITY_TYPES = Object.freeze({
  RECHARGE_REQUEST: 'RECHARGE_REQUEST',
  TASK: 'TASK',
  WALLET: 'WALLET',
  TICKET: 'TICKET',
  NOTICE: 'NOTICE',
});

async function getNotificationsForUser(userId, options = {}) {
  const { unreadOnly = false } = options;
  
  const query = { recipientId: userId };
  if (unreadOnly) {
    query.isRead = false;
  }
  
  return await Notification.find(query)
    .sort({ createdAt: -1 })
    .exec();
}

async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipientId: userId
  }).exec();
  
  if (!notification) {
    throw new Error('Notification not found');
  }
  
  notification.isRead = true;
  notification.readAt = new Date();
  
  return await notification.save();
}

async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  
  return result.nModified;
}

async function createNotification(notificationData) {
  return await Notification.create(notificationData);
}

async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    recipientId: userId,
    isRead: false
  }).exec();
  
  return count;
}

module.exports = {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  getUnreadCount,
  NOTIFICATION_TYPES,
  ENTITY_TYPES,
};