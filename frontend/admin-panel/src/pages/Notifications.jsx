import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'unread'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = filter === 'unread' ? { unreadOnly: true } : {};
        const response = await api.get('/admin/notifications', { params });
        setNotifications(response.data);
      } catch (err) {
        setError('Failed to load notifications');
        console.error('Notifications error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filter]);

  const markAsRead = async (notificationId) => {
    try {
      await api.patch(`/admin/notifications/${notificationId}/read`);
      // Update local state
      setNotifications(notifications.map(notification => 
        notification._id === notificationId 
          ? { ...notification, read: true } 
          : notification
      ));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/admin/notifications/read-all');
      // Update local state
      setNotifications(notifications.map(notification => ({
        ...notification,
        read: true
      })));
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="text-center py-12">
              <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="rounded-lg bg-red-50 p-4">
              <div className="text-red-700">{error}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
            <div className="flex space-x-4">
              <div>
                <label htmlFor="filter" className="sr-only">Filter</label>
                <select
                  id="filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  <option value="all">All Notifications</option>
                  <option value="unread">Unread Only</option>
                </select>
              </div>
              <button
                onClick={markAllAsRead}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Mark All as Read
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {notifications.length === 0 ? (
                <li className="px-6 py-4 text-center">
                  <p className="text-gray-500">No notifications found</p>
                </li>
              ) : (
                notifications.map((notification) => (
                  <li key={notification._id} className={`${!notification.read ? 'bg-blue-50' : ''}`}>
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-3 w-3 rounded-full ${
                            notification.type === 'RECHARGE_REQUEST_SUBMITTED' ? 'bg-yellow-500' :
                            notification.type === 'TASK_PURCHASED' ? 'bg-green-500' :
                            notification.type === 'SYSTEM_ALERT' ? 'bg-red-500' : 'bg-gray-500'
                          }`}></div>
                          <div className="ml-4">
                            <h3 className={`text-sm font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification._id)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Mark as Read
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;