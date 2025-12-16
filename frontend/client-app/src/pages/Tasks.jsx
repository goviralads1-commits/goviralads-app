import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Tasks = () => {
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [ownedTasks, setOwnedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [templatesResponse, tasksResponse] = await Promise.all([
          api.get('/client/task-templates'),
          api.get('/client/tasks')
        ]);
        
        setTaskTemplates(templatesResponse.data);
        setOwnedTasks(tasksResponse.data);
      } catch (err) {
        setError('Failed to load tasks data');
        console.error('Tasks error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setPurchaseSubmitting(true);
    
    try {
      await api.post('/client/tasks/purchase', {
        templateId: selectedTemplate._id,
        quantity: parseInt(purchaseQuantity)
      });
      
      // Refresh data after successful purchase
      const tasksResponse = await api.get('/client/tasks');
      setOwnedTasks(tasksResponse.data);
      setSelectedTemplate(null);
      setPurchaseQuantity(1);
      setShowPurchaseForm(false);
    } catch (err) {
      setError('Failed to purchase tasks');
      console.error('Purchase error:', err);
    } finally {
      setPurchaseSubmitting(false);
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
            <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
            <button
              onClick={() => setShowPurchaseForm(!showPurchaseForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Purchase Tasks
            </button>
          </div>

          {/* Available Task Templates */}
          <div className="mb-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Available Task Templates</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {taskTemplates.map((template) => (
                <div key={template._id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                    <p className="mt-2 text-sm text-gray-500">{template.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {template.creditCost.toFixed(2)} credits
                      </p>
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowPurchaseForm(true);
                        }}
                        className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Purchase
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Purchase Task Form */}
          {showPurchaseForm && selectedTemplate && (
            <div className="bg-white shadow sm:rounded-lg mb-8">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Purchase Task: {selectedTemplate.name}</h3>
                <div className="mt-5">
                  <form onSubmit={handlePurchaseSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                        Quantity
                      </label>
                      <div className="mt-1">
                        <input
                          type="number"
                          id="quantity"
                          value={purchaseQuantity}
                          onChange={(e) => setPurchaseQuantity(e.target.value)}
                          min="1"
                          required
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPurchaseForm(false);
                          setSelectedTemplate(null);
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={purchaseSubmitting}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {purchaseSubmitting ? 'Purchasing...' : 'Confirm Purchase'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {/* Owned Tasks */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900">My Tasks</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">Tasks you have purchased</p>
            </div>
            <div className="border-t border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ownedTasks.map((task) => (
                    <tr key={task._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {task.template.name}
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
                        {task.assignedTo ? task.assignedTo.email : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(task.createdAt).toLocaleDateString()}
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