import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [assignClientId, setAssignClientId] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [statusChangeTask, setStatusChangeTask] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusChangeSubmitting, setStatusChangeSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksResponse, templatesResponse, clientsResponse] = await Promise.all([
          api.get('/admin/tasks'),
          api.get('/client/task-templates'),
          api.get('/admin/wallets')
        ]);
        
        setTasks(tasksResponse.data);
        setTaskTemplates(templatesResponse.data);
        setClients(clientsResponse.data);
      } catch (err) {
        setError('Failed to load tasks data');
        console.error('Tasks error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    setAssignSubmitting(true);
    
    try {
      await api.post('/admin/tasks/assign', {
        taskId: selectedTask._id,
        clientId: assignClientId
      });
      
      // Refresh data after successful assignment
      const response = await api.get('/admin/tasks');
      setTasks(response.data);
      setSelectedTask(null);
      setAssignClientId('');
      setShowAssignForm(false);
    } catch (err) {
      setError('Failed to assign task');
      console.error('Assignment error:', err);
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleStatusChangeSubmit = async (e) => {
    e.preventDefault();
    setStatusChangeSubmitting(true);
    
    try {
      await api.patch(`/admin/tasks/${statusChangeTask._id}/status`, {
        status: newStatus
      });
      
      // Refresh data after successful status change
      const response = await api.get('/admin/tasks');
      setTasks(response.data);
      setStatusChangeTask(null);
      setNewStatus('');
    } catch (err) {
      setError('Failed to update task status');
      console.error('Status change error:', err);
    } finally {
      setStatusChangeSubmitting(false);
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
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Tasks Management</h1>

          {/* Task Assignment Form */}
          {showAssignForm && selectedTask && (
            <div className="bg-white shadow sm:rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Assign Task: {selectedTask.template.name}</h3>
                <div className="mt-5">
                  <form onSubmit={handleAssignSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="client" className="block text-sm font-medium text-gray-700">
                        Assign to Client
                      </label>
                      <div className="mt-1">
                        <select
                          id="client"
                          value={assignClientId}
                          onChange={(e) => setAssignClientId(e.target.value)}
                          required
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        >
                          <option value="">Select a client</option>
                          {clients.map((client) => (
                            <option key={client._id} value={client._id}>
                              {client.user.email} ({client.user.name || 'N/A'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAssignForm(false);
                          setSelectedTask(null);
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={assignSubmitting}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {assignSubmitting ? 'Assigning...' : 'Assign Task'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Status Change Form */}
          {statusChangeTask && (
            <div className="bg-white shadow sm:rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Update Task Status: {statusChangeTask.template.name}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Currently assigned to {statusChangeTask.client?.email || 'N/A'}
                </p>
                <div className="mt-5">
                  <form onSubmit={handleStatusChangeSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                        New Status
                      </label>
                      <div className="mt-1">
                        <select
                          id="status"
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value)}
                          required
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        >
                          <option value="">Select status</option>
                          <option value="PENDING">PENDING</option>
                          <option value="ASSIGNED">ASSIGNED</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusChangeTask(null);
                          setNewStatus('');
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={statusChangeSubmitting}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {statusChangeSubmitting ? 'Updating...' : 'Update Status'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Tasks Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">All Tasks</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Manage all client tasks</p>
            </div>
            <div className="border-t border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tasks.map((task) => (
                    <tr key={task._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {task.template.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {task.client ? task.client.email : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          task.status === 'COMPLETED' 
                            ? 'bg-green-100 text-green-800' 
                            : task.status === 'IN_PROGRESS' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : task.status === 'ASSIGNED' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-800'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {!task.client && (
                          <button
                            onClick={() => {
                              setSelectedTask(task);
                              setShowAssignForm(true);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 mr-2"
                          >
                            Assign
                          </button>
                        )}
                        {task.client && (
                          <button
                            onClick={() => {
                              setStatusChangeTask(task);
                              setNewStatus('');
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            Update Status
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tasks;