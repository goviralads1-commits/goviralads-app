const { Notification, NOTIFICATION_TYPES, ENTITY_TYPES } = require('../models/Notification');
const User = require('../models/User');

/**
 * Create a new notification for a user
 * @param {Object} params - Notification parameters
 * @param {String} params.recipientId - User ID who receives notification
 * @param {String} params.type - Notification type (from NOTIFICATION_TYPES)
 * @param {String} params.title - Short notification title
 * @param {String} params.message - Full notification message
 * @param {Object} params.relatedEntity - Related entity details
 * @param {String} params.relatedEntity.entityType - Entity type (from ENTITY_TYPES)
 * @param {String} params.relatedEntity.entityId - Entity ID (optional)
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({ recipientId, type, title, message, relatedEntity }) {
  // Validate recipient exists
  const recipient = await User.findById(recipientId).exec();

  if (!recipient) {
    throw new Error('Recipient user not found');
  }

  // Validate notification type
  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new Error('Invalid notification type');
  }

  // Validate entity type
  if (!Object.values(ENTITY_TYPES).includes(relatedEntity.entityType)) {
    throw new Error('Invalid entity type');
  }

  // Create notification
  const notification = await Notification.create({
    recipientId,
    type,
    title: title.trim(),
    message: message.trim(),
    relatedEntity: {
      entityType: relatedEntity.entityType,
      entityId: relatedEntity.entityId || null,
    },
    isRead: false,
    readAt: null,
  });

  return notification;
}

/**
 * Get notifications for a specific user
 * @param {String} userId - User ID
 * @param {Object} options - Query options
 * @param {Boolean} options.unreadOnly - Only return unread notifications
 * @returns {Promise<Array>} Array of notifications
 */
async function getNotificationsForUser(userId, { unreadOnly = false } = {}) {
  const filter = { recipientId: userId };

  if (unreadOnly) {
    filter.isRead = false;
  }

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .exec();

  return notifications;
}

/**
 * Mark a notification as read
 * @param {String} notificationId - Notification ID
 * @param {String} userId - User ID (for ownership verification)
 * @returns {Promise<Object>} Updated notification
 */
async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findById(notificationId).exec();

  if (!notification) {
    throw new Error('Notification not found');
  }

  // Verify ownership
  if (notification.recipientId.toString() !== userId.toString()) {
    throw new Error('Unauthorized to modify this notification');
  }

  // Skip if already read
  if (notification.isRead) {
    return notification;
  }

  notification.isRead = true;
  notification.readAt = new Date();
  await notification.save();

  return notification;
}

/**
 * Mark all notifications as read for a user
 * @param {String} userId - User ID
 * @returns {Promise<Number>} Count of updated notifications
 */
async function markAllNotificationsAsRead(userId) {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  ).exec();

  return result.modifiedCount;
}

/**
 * Get unread notification count for a user
 * @param {String} userId - User ID
 * @returns {Promise<Number>} Unread count
 */
async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    recipientId: userId,
    isRead: false,
  }).exec();

  return count;
}

/**
 * Delete a notification (optional - for future use)
 * @param {String} notificationId - Notification ID
 * @param {String} userId - User ID (for ownership verification)
 * @returns {Promise<Object>} Deleted notification
 */
async function deleteNotification(notificationId, userId) {
  const notification = await Notification.findById(notificationId).exec();

  if (!notification) {
    throw new Error('Notification not found');
  }

  // Verify ownership
  if (notification.recipientId.toString() !== userId.toString()) {
    throw new Error('Unauthorized to delete this notification');
  }

  await Notification.findByIdAndDelete(notificationId).exec();

  return notification;
}

module.exports = {
  createNotification,
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
  deleteNotification,
  NOTIFICATION_TYPES,
  ENTITY_TYPES,
};
