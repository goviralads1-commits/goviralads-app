import api from './api';

/**
 * Submit client approval selection
 * @param {string} taskId - Task ID
 * @param {string} approvalId - Approval request ID
 * @param {string[]} selectedOptions - Array of selected option strings
 * @returns {Promise} API response
 */
export const submitApprovalSelection = (taskId, approvalId, selectedOptions) => {
  return api.post(`/client/tasks/${taskId}/approvals/${approvalId}/select`, {
    selectedOptions
  });
};

/**
 * Refresh task data after approval submission
 * @param {string} taskId - Task ID
 * @returns {Promise} Task data
 */
export const fetchTaskData = (taskId) => {
  return api.get(`/client/tasks/${taskId}`);
};
