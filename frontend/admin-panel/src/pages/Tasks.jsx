import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Header from '../components/Header';

const Tasks = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);  // Category list
  const [toast, setToast] = useState(null);
  
  // Filter state
  const [filters, setFilters] = useState({
    status: 'ALL',
    priority: 'ALL',
    clientId: 'ALL',
    search: '',
    sort: 'newest'
  });
  
  // Status change modal
  const [statusModal, setStatusModal] = useState({ open: false, task: null });
  const [changingStatus, setChangingStatus] = useState(false);
  
  // Approval modal state
  const [approvalModal, setApprovalModal] = useState({ open: false, task: null });
  const [approvalFormData, setApprovalFormData] = useState({
    title: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    priority: 'Medium',
    internalNotes: '',
    publicNotes: '',
    specialInstructions: ''
  });
  const [approving, setApproving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    clientId: '',
    startDate: '',
    endDate: '',
    deadline: '',
    progressMode: 'AUTO',
    progress: 0,
    priority: 'Medium',
    status: 'PENDING',
    creditCost: 0,
    creditsUsed: 0,
    publicNotes: '',
    internalNotes: '',
    icon: '📝',
    showOfferPrice: false,
    // SMART PROGRESS SYSTEM
    progressTarget: 100,
    progressAchieved: 0,
    showProgressDetails: false,
    autoCompletionCap: 100,
    milestones: [
      { name: 'Work Started', percentage: 10, color: '#8b5cf6' },
      { name: 'First Draft', percentage: 30, color: '#6366f1' },
      { name: 'Review Phase', percentage: 60, color: '#3b82f6' },
      { name: 'Almost Ready', percentage: 80, color: '#0ea5e9' },
      { name: 'Delivered', percentage: 100, color: '#059669' },
      { name: 'Overachieved', percentage: 120, color: '#10b981' },
    ],
    // PLAN SYSTEM EXTENSIONS (OPTIONAL)
    quantity: '',
    showQuantityToClient: true,
    showCreditsToClient: true,
    isListedInPlans: false,
    isActivePlan: true,
    targetClients: [],
    featureImage: '',
    planMedia: [],  // Array of { type: 'image'|'video', url: string }
    offerPrice: '',
    originalPrice: '',
    countdownEndDate: '',
    categoryId: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [visibleToAll, setVisibleToAll] = useState(true);

  useEffect(() => {
    // Sync visibleToAll with targetClients
    if (formData.targetClients && formData.targetClients.length > 0) {
      setVisibleToAll(false);
    } else {
      setVisibleToAll(true);
    }
  }, [formData.targetClients]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksResponse, walletsResponse, categoriesResponse] = await Promise.all([
          api.get('/admin/tasks'),
          api.get('/admin/wallets'),
          api.get('/admin/categories').catch(() => ({ data: { categories: [] } }))
        ]);
        setTasks(tasksResponse.data.tasks || []);
        setCategories(categoriesResponse.data.categories || []);
        // Map wallets to client format for dropdown
        const clientsFromWallets = (walletsResponse.data.wallets || []).map(w => ({
          id: w.clientId,
          _id: w.clientId,
          name: w.clientIdentifier,
          email: w.clientIdentifier,
          walletBalance: w.balance
        }));
        setClients(clientsFromWallets);
      } catch (err) {
        console.error('API ERROR:', err.response?.status, err.response?.data || err.message);
        setError(err.response?.data?.error || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: null }));
    }
    // Log mode changes and reset mode-specific fields
    if (field === 'isListedInPlans') {
      // Reset mode-specific fields when switching modes
      if (value === true) {
        // Switching to PLAN mode - clear task-specific fields
        setFormData(prev => ({
          ...prev,
          isListedInPlans: true,
          clientId: '',
          startDate: '',
          endDate: '',
          deadline: '',
          status: 'LISTED'
        }));
      } else {
        // Switching to TASK mode - clear plan-specific fields
        setFormData(prev => ({
          ...prev,
          isListedInPlans: false,
          targetClients: [],
          originalPrice: '',
          countdownEndDate: '',
          status: 'PENDING'
        }));
      }
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.title.trim()) errors.title = 'Title is required';
    

    // STRICT SEPARATION: PLAN and TASK are mutually exclusive
    // PLAN MODE: clientId must be empty, PLAN fields required
    if (formData.isListedInPlans) {
      if (formData.clientId) {
        errors.clientId = 'Cannot assign client when creating a PLAN.';
      }
      // Example: Require at least a base price for PLAN
      if (formData.creditCost === undefined || formData.creditCost === null || formData.creditCost < 0) {
        errors.creditCost = 'Base price required for PLAN.';
      }
      // Target is REQUIRED for Plan (represents the promise)
      if (!formData.progressTarget || formData.progressTarget <= 0) {
        errors.progressTarget = 'Target Goal is required for PLAN.';
      }
    } else {
      // TASK MODE: clientId required, PLAN fields must be empty
      if (!formData.clientId) {
        errors.clientId = 'Client is required for TASK.';
      }
      
      if (!formData.startDate) {
        errors.startDate = 'Start Date is required for TASK.';
      }
      
      // Validate Original Amount
      if (formData.creditCost === undefined || formData.creditCost === null || formData.creditCost < 0) {
        errors.creditCost = 'Valid Credit Cost is required for TASK.';
      }
      
      // Validate Offer Price if provided
      if (formData.offerPrice !== '' && formData.offerPrice !== undefined && formData.offerPrice !== null) {
        if (formData.offerPrice < 0) {
          errors.offerPrice = 'Offer Price cannot be negative';
        }
      }
      
      // Hard block for insufficient credits (only if assigning to client)
      if (formData.clientId && formData.creditCost >= 0) {
        const selectedClient = clients.find(c => (c.id || c._id) === formData.clientId);
        const actualCharge = (formData.offerPrice && formData.offerPrice > 0) ? formData.offerPrice : formData.creditCost;
        if (selectedClient && (selectedClient.walletBalance || 0) < actualCharge) {
          errors.creditCost = 'Insufficient client balance';
        }
      }
      // No PLAN fields allowed in TASK mode
      if (formData.targetClients?.length > 0 || formData.featureImage || formData.originalPrice || formData.countdownEndDate) {
        errors.planFields = 'PLAN fields must be empty in TASK mode.';
      }
    }
    
    return errors;
  };

  // Filter tasks
  const getFilteredTasks = () => {
    let filtered = [...tasks];
    
    // Status filter
    if (filters.status !== 'ALL') {
      if (filters.status === 'OVERDUE') {
        const now = new Date();
        filtered = filtered.filter(t => {
          const deadline = t.deadline ? new Date(t.deadline) : null;
          return deadline && deadline < now && t.status !== 'COMPLETED';
        });
      } else {
        filtered = filtered.filter(t => t.status === filters.status);
      }
    }
    
    // Priority filter
    if (filters.priority !== 'ALL') {
      filtered = filtered.filter(t => t.priority === filters.priority);
    }
    
    // Client filter
    if (filters.clientId !== 'ALL') {
      filtered = filtered.filter(t => t.clientId === filters.clientId);
    }
    
    // Search filter
    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(t => 
        t.title?.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.clientIdentifier?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (filters.sort) {
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'priority':
          const priorityOrder = { High: 0, Medium: 1, Low: 2 };
          return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        default: // newest
          return new Date(b.createdAt) - new Date(a.createdAt);
      }
    });
    
    return filtered;
  };

  const handleSubmit = async () => {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    try {
      // Construct payload matching backend expectations
      let payload;
      if (formData.isListedInPlans) {
        // PLAN MODE: clientId must be null, PLAN fields only
        payload = {
          clientId: null,
          status: 'LISTED',
          title: formData.title.trim(),
          description: formData.description || '',
          creditCost: Number(formData.creditCost) || 0,
          priority: formData.priority || 'Medium',
          startDate: null,
          endDate: null,
          progressMode: formData.progressMode || 'AUTO',
          // SMART PROGRESS SYSTEM (Config snapshot)
          progressTarget: Number(formData.progressTarget) || 100,
          progressAchieved: 0,
          showProgressDetails: formData.showProgressDetails || false,
          autoCompletionCap: Number(formData.autoCompletionCap) || 100,
          milestones: formData.milestones || [],
          // PLAN FIELDS & VISIBILITY
          ...(formData.quantity && { quantity: Number(formData.quantity) }),
          showQuantityToClient: formData.showQuantityToClient,
          showCreditsToClient: formData.showCreditsToClient,
          isListedInPlans: true,
          isActivePlan: formData.isActivePlan !== false,
          planMedia: formData.planMedia,
          ...(formData.categoryId && { categoryId: formData.categoryId }),
          ...(formData.targetClients?.length > 0 && { targetClients: formData.targetClients }),
          ...(formData.offerPrice && { offerPrice: Number(formData.offerPrice) }),
          ...(formData.originalPrice && { originalPrice: Number(formData.originalPrice) }),
          ...(formData.countdownEndDate && { countdownEndDate: formData.countdownEndDate })
        };
      } else {
        // TASK MODE: clientId required, PLAN fields must be empty
        payload = {
          clientId: formData.clientId,
          title: formData.title.trim(),
          description: formData.description || '',
          creditCost: Number(formData.creditCost) || 0,
          ...(formData.offerPrice && formData.offerPrice > 0 && { offerPrice: Number(formData.offerPrice) }),
          priority: formData.priority || 'Medium',
          startDate: formData.startDate || new Date().toISOString(),
          endDate: formData.deadline || formData.endDate || null,
          publicNotes: formData.publicNotes || '',
          internalNotes: formData.internalNotes || '',
          progressMode: formData.progressMode || 'AUTO',
          // SMART PROGRESS SYSTEM
          progressTarget: Number(formData.progressTarget) || 100,
          progressAchieved: Number(formData.progressAchieved) || 0,
          showProgressDetails: formData.showProgressDetails || false,
          autoCompletionCap: Number(formData.autoCompletionCap) || 100,
          milestones: formData.milestones || [],
          // QUANTITY & VISIBILITY
          ...(formData.quantity && { quantity: Number(formData.quantity) }),
          showQuantityToClient: formData.showQuantityToClient,
          showCreditsToClient: formData.showCreditsToClient,
          isListedInPlans: false
        };
      }
      
      const response = await api.post('/admin/tasks/assign', payload);
      
      const { mode, task, plan, walletBalance } = response.data;

      if (mode === 'PLAN') {
        setToast('Plan created successfully');
        setShowCreatePanel(false);
        // Reset form for Plans
        setFormData({
          title: '', description: '', clientId: '', startDate: '', endDate: '',
          deadline: '', progressMode: 'AUTO', progress: 0, priority: 'Medium',
          status: 'PENDING', creditCost: 0, creditsUsed: 0, publicNotes: '', internalNotes: '',
          icon: '📝', showOfferPrice: false,
          progressTarget: 100, progressAchieved: 0, showProgressDetails: false, autoCompletionCap: 100,
          milestones: [
            { name: 'Work Started', percentage: 10, color: '#8b5cf6' },
            { name: 'First Draft', percentage: 30, color: '#6366f1' },
            { name: 'Review Phase', percentage: 60, color: '#3b82f6' },
            { name: 'Almost Ready', percentage: 80, color: '#0ea5e9' },
            { name: 'Delivered', percentage: 100, color: '#059669' },
            { name: 'Overachieved', percentage: 120, color: '#10b981' },
          ],
          quantity: '', showQuantityToClient: true, showCreditsToClient: true,
          isListedInPlans: false, isActivePlan: true, targetClients: [], featureImage: '',
          planMedia: [],
          offerPrice: '', originalPrice: '', countdownEndDate: '', categoryId: ''
        });
        
        // Refresh data without redirect
        const tasksRes = await api.get('/admin/tasks');
        setTasks(tasksRes.data.tasks || []);
        setTimeout(() => setToast(null), 3000);
        return; 
      }

      // --- TASK SUCCESS FLOW ---
      setToast('Task created successfully');
      setShowCreatePanel(false);
      
      // Redirect to newly created task
      if (task?.id || task?._id) {
        navigate(`/tasks/${task.id || task._id}`);
      } else {
        // Fallback: Refresh list if no ID returned
        const tasksRes = await api.get('/admin/tasks');
        setTasks(tasksRes.data.tasks || []);
      }
      
      setTimeout(() => setToast(null), 3000);

    } catch (err) {
      console.error('[FORENSIC] CREATION FAILURE');
      console.error('[FORENSIC] STATUS CODE:', err.response?.status);
      console.error('[FORENSIC] BACKEND ERROR:', err.response?.data?.error);
      console.error('[FORENSIC] FULL ERROR:', err);
      
      const backendError = err.response?.data?.error;
      const statusCode = err.response?.status;

      const displayError = backendError || `Connection Error (${err.message})`;
      setFormErrors({ submit: displayError });
      setToast(displayError);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenApproval = (task) => {
    setApprovalModal({ open: true, task });
    setApprovalFormData({
      title: task.title || '',
      description: task.description || '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '',
      priority: task.priority || 'Medium',
      internalNotes: task.internalNotes || '',
      publicNotes: task.publicNotes || '',
      specialInstructions: ''
    });
  };

  const handleApproveTask = async () => {
    setApproving(true);
    try {
      const taskId = approvalModal.task.id || approvalModal.task._id;
      const payload = {
        ...approvalFormData,
        status: 'ACTIVE'
      };
      
      await api.patch(`/admin/tasks/${taskId}/approve`, payload);
      
      setToast('Task approved and started successfully');
      setApprovalModal({ open: false, task: null });
      
      // Refresh tasks
      const tasksResponse = await api.get('/admin/tasks');
      setTasks(tasksResponse.data.tasks || []);
      
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Approval error:', err.response?.data || err.message);
      setToast(err.response?.data?.error || 'Failed to approve task');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setApproving(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (taskId, newStatus) => {
    setChangingStatus(true);
    try {
      await api.patch(`/admin/tasks/${taskId}/status`, { status: newStatus });
      
      // Refresh tasks
      const tasksResponse = await api.get('/admin/tasks');
      setTasks(tasksResponse.data.tasks || []);
      
      setStatusModal({ open: false, task: null });
      setToast(`Task status updated to ${newStatus}`);
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error('Status change error:', err.response?.data || err.message);
      setToast(err.response?.data?.error || 'Failed to update status');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setChangingStatus(false);
    }
  };



  if (loading) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
        <Header />
        <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
          {/* Skeleton Filter Bar */}
          <div style={{display: 'flex', gap: '12px', marginBottom: '24px'}}>
            <div style={{flex: 1, height: '48px', backgroundColor: '#e2e8f0', borderRadius: '10px', animation: 'pulse 1.5s infinite'}}></div>
            <div style={{width: '140px', height: '48px', backgroundColor: '#e2e8f0', borderRadius: '10px', animation: 'pulse 1.5s infinite'}}></div>
            <div style={{width: '130px', height: '48px', backgroundColor: '#e2e8f0', borderRadius: '10px', animation: 'pulse 1.5s infinite'}}></div>
          </div>
          {/* Skeleton Cards */}
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px'}}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{backgroundColor: '#fff', borderRadius: '20px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '16px'}}>
                  <div style={{width: '60%', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '6px', animation: 'pulse 1.5s infinite'}}></div>
                  <div style={{width: '80px', height: '24px', backgroundColor: '#e2e8f0', borderRadius: '12px', animation: 'pulse 1.5s infinite'}}></div>
                </div>
                <div style={{width: '40%', height: '16px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '16px', animation: 'pulse 1.5s infinite'}}></div>
                <div style={{width: '30%', height: '14px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '16px', animation: 'pulse 1.5s infinite'}}></div>
                <div style={{width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', marginBottom: '20px', animation: 'pulse 1.5s infinite'}}></div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <div style={{width: '80px', height: '28px', backgroundColor: '#e2e8f0', borderRadius: '6px', animation: 'pulse 1.5s infinite'}}></div>
                  <div style={{width: '100px', height: '36px', backgroundColor: '#e2e8f0', borderRadius: '10px', animation: 'pulse 1.5s infinite'}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
        <Header />
        <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
          <div style={{padding: '20px', backgroundColor: '#fef2f2', borderRadius: '16px', border: '1px solid #fecaca'}}>
            <p style={{color: '#dc2626', fontSize: '15px', fontWeight: '500', margin: 0}}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#f8fafc', paddingBottom: '100px'}}>
      <Header />
      
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: toast.toLowerCase().includes('fail') || toast.toLowerCase().includes('error') || toast.toLowerCase().includes('insufficient') ? '#ef4444' : '#10b981',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          zIndex: 100
        }}>
          {toast}
        </div>
      )}

      <div style={{maxWidth: '1400px', margin: '0 auto', padding: '24px 20px'}}>
        {/* Pending Approvals Queue */}
        {tasks.some(t => t.status === 'PENDING_APPROVAL') && (
          <div style={{marginBottom: '32px'}}>
            <h2 style={{fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <span style={{padding: '4px 8px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '6px', fontSize: '12px'}}>
                {tasks.filter(t => t.status === 'PENDING_APPROVAL').length}
              </span>
              Pending Approvals
            </h2>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px'}}>
              {tasks.filter(t => t.status === 'PENDING_APPROVAL').map(task => (
                <div key={task.id || task._id} style={{
                  backgroundColor: '#fff', border: '2px solid #6366f1', borderRadius: '16px', padding: '20px',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.1)', display: 'flex', flexDirection: 'column', gap: '12px'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <div>
                      <h3 style={{fontSize: '16px', fontWeight: '700', color: '#1e293b', margin: 0}}>{task.title}</h3>
                      <p style={{fontSize: '13px', color: '#64748b', margin: '4px 0 0 0'}}>
                        Client: <strong>{task.clientName || task.client?.name || `Client #${task.clientId?.slice(-6)}`}</strong>
                      </p>
                    </div>
                    <span style={{fontSize: '18px', fontWeight: '800', color: '#6366f1'}}>₹{task.creditCost}</span>
                  </div>
                  <p style={{fontSize: '13px', color: '#475569', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>
                    {task.description || 'No description provided'}
                  </p>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '12px', borderTop: '1px solid #f1f5f9'}}>
                    <span style={{fontSize: '12px', color: '#94a3b8'}}>Purchased: {new Date(task.createdAt).toLocaleDateString()}</span>
                    <button 
                      onClick={() => handleOpenApproval(task)}
                      style={{
                        padding: '8px 16px', backgroundColor: '#6366f1', color: '#fff', border: 'none',
                        borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Review & Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Task Button */}
        <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: '24px'}}>
          <button
            onClick={() => setShowCreatePanel(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
            </svg>
            Create Task
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '16px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #f1f5f9'
        }}>
          {/* Search */}
          <div style={{flex: '1', minWidth: '200px'}}>
            <input
              type="text"
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                outline: 'none',
                backgroundColor: '#f8fafc',
                transition: 'all 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#6366f1'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({...prev, status: e.target.value}))}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: '500',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              minWidth: '140px'
            }}
          >
            <option value="ALL">All Status</option>
            <option value="LISTED">Marketplace Plans</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="OVERDUE">Overdue</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters(prev => ({...prev, priority: e.target.value}))}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: '500',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              minWidth: '130px'
            }}
          >
            <option value="ALL">All Priority</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Client Filter */}
          <select
            value={filters.clientId}
            onChange={(e) => setFilters(prev => ({...prev, clientId: e.target.value}))}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: '500',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              minWidth: '150px'
            }}
          >
            <option value="ALL">All Clients</option>
            {clients.map(c => (
              <option key={c.id || c._id} value={c.id || c._id}>{c.name}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={filters.sort}
            onChange={(e) => setFilters(prev => ({...prev, sort: e.target.value}))}
            style={{
              padding: '12px 16px',
              fontSize: '13px',
              fontWeight: '500',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              minWidth: '130px'
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="priority">By Priority</option>
            <option value="deadline">By Deadline</option>
          </select>
        </div>

        {/* Results Count */}
        <div style={{marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <p style={{fontSize: '14px', color: '#64748b', margin: 0}}>
            Showing <strong style={{color: '#0f172a'}}>{getFilteredTasks().length}</strong> of {tasks.length} tasks
          </p>
          {(filters.status !== 'ALL' || filters.priority !== 'ALL' || filters.clientId !== 'ALL' || filters.search) && (
            <button
              onClick={() => setFilters({status: 'ALL', priority: 'ALL', clientId: 'ALL', search: '', sort: 'newest'})}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                color: '#6366f1',
                backgroundColor: '#eef2ff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Tasks Card Grid */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px'}}>
          {getFilteredTasks().map((task) => {
            const formatDate = (date) => {
              if (!date) return '';
              const d = new Date(date);
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              return `${day}/${month}/${year}`;
            };

            const startDate = task.startDate || task.createdAt;
            const dateRange = startDate && task.deadline 
              ? `${formatDate(startDate)} – ${formatDate(task.deadline)}`
              : task.deadline 
                ? `Due: ${formatDate(task.deadline)}`
                : startDate 
                  ? `Started: ${formatDate(startDate)}`
                  : '';

            // Check deadline status
            const now = new Date();
            const deadline = task.deadline ? new Date(task.deadline) : null;
            const daysUntilDeadline = deadline ? Math.ceil((deadline - now) / (1000 * 60 * 60 * 24)) : null;
            const isOverdue = deadline && deadline < now && task.status !== 'COMPLETED';
            const isCloseToDeadline = daysUntilDeadline !== null && daysUntilDeadline <= 3 && daysUntilDeadline > 0 && task.status !== 'COMPLETED';

            // Status-based card background tint
            const getCardBackground = () => {
              if (isOverdue) return 'rgba(254, 226, 226, 0.3)';
              if (task.status === 'PENDING') return 'rgba(254, 243, 199, 0.2)';
              if (task.status === 'ACTIVE') return 'rgba(219, 234, 254, 0.2)';
              if (task.status === 'COMPLETED') return 'rgba(220, 252, 231, 0.2)';
              return '#ffffff';
            };

            // Status pill style
            const getStatusStyle = (status) => {
              const styles = {
                'PENDING': { backgroundColor: '#fef3c7', color: '#92400e' },
                'ACTIVE': { backgroundColor: '#dbeafe', color: '#1d4ed8' },
                'COMPLETED': { backgroundColor: '#dcfce7', color: '#15803d' },
                'CANCELLED': { backgroundColor: '#f3f4f6', color: '#6b7280' }
              };
              return styles[status] || styles['PENDING'];
            };

            // Priority styling
            const priority = task.priority || 'Medium';
            const getPriorityStyle = (p) => {
              const styles = {
                'High': { backgroundColor: '#fee2e2', color: '#dc2626' },
                'Medium': { backgroundColor: '#e0e7ff', color: '#4338ca' },
                'Low': { backgroundColor: '#f3f4f6', color: '#6b7280' }
              };
              return styles[p] || styles['Medium'];
            };

            return (
              <div 
                key={task.id} 
                style={{
                  backgroundColor: getCardBackground(),
                  borderRadius: '20px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                  border: isOverdue ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Row 1: Title + Status */}
                <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px'}}>
                  <h3 style={{fontSize: '17px', fontWeight: '600', color: '#111827', margin: '0', lineHeight: '1.4', flex: '1', paddingRight: '12px'}}>
                    {task.title}
                  </h3>
                  <span style={{
                    ...getStatusStyle(task.status),
                    padding: '5px 10px',
                    borderRadius: '8px',
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap'
                  }}>
                    {task.status?.replace('_', ' ')}
                  </span>
                </div>

                {/* Row 2: Client + Meta */}
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px'}}>
                  <span style={{fontSize: '13px', color: task.isListedInPlans ? '#6366f1' : '#6b7280', fontWeight: '600'}}>
                    {task.isListedInPlans ? '🛒 Marketplace Listing' : (task.clientName || task.client?.name || `Client #${task.clientId?.slice(-6) || 'N/A'}`)}
                  </span>
                  <span style={{fontSize: '11px', color: '#9ca3af'}}>
                    ID: {task.id?.slice(-8) || 'N/A'}
                  </span>
                </div>

                {/* Row 3: Date + Deadline Warning */}
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px'}}>
                  <span style={{fontSize: '12px', color: '#6b7280'}}>
                    {task.isListedInPlans ? 'No execution timeline (Product)' : (dateRange || 'No date set')}
                  </span>
                  {isOverdue && (
                    <span style={{fontSize: '11px', fontWeight: '600', color: '#dc2626', backgroundColor: '#fee2e2', padding: '3px 8px', borderRadius: '6px'}}>
                      OVERDUE
                    </span>
                  )}
                  {isCloseToDeadline && (
                    <span style={{fontSize: '11px', fontWeight: '600', color: '#d97706', backgroundColor: '#fef3c7', padding: '3px 8px', borderRadius: '6px'}}>
                      {daysUntilDeadline}d left
                    </span>
                  )}
                </div>

                {/* Row 4: Progress */}
                <div style={{marginBottom: '16px'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                    <span style={{fontSize: '11px', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Progress</span>
                    <span style={{fontSize: '13px', fontWeight: '700', color: '#111827'}}>{task.progress || 0}%</span>
                  </div>
                  <div style={{width: '100%', height: '6px', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: '9999px', overflow: 'hidden'}}>
                    <div style={{
                      width: `${Math.min(task.progress || 0, 100)}%`,
                      height: '100%',
                      backgroundColor: isOverdue ? '#ef4444' : task.status === 'COMPLETED' ? '#22c55e' : '#6366f1',
                      borderRadius: '9999px',
                      transition: 'width 0.5s ease'
                    }}></div>
                  </div>
                </div>

                {/* Row 5: Price + Priority */}
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px'}}>
                  <span style={{fontSize: '20px', fontWeight: '700', color: '#111827'}}>₹{task.creditCost || 0}</span>
                  <span style={{
                    ...getPriorityStyle(priority),
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {priority}
                  </span>
                </div>

                {/* Row 6: Admin Action Zone */}
                <div style={{display: 'flex', gap: '8px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.06)'}}>
                  <button
                    onClick={() => {
                      if (task.isListedInPlans || task.status === 'LISTED') {
                        setToast('Plans are product listings. They do not have execution views.');
                        setTimeout(() => setToast(null), 3000);
                        return;
                      }
                      navigate(`/tasks/${task.id || task._id}`);
                    }}
                    style={{
                      flex: '1',
                      padding: '10px 12px',
                      backgroundColor: (task.isListedInPlans || task.status === 'LISTED') ? '#94a3b8' : '#6366f1',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: (task.isListedInPlans || task.status === 'LISTED') ? 'default' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!(task.isListedInPlans || task.status === 'LISTED')) e.currentTarget.style.backgroundColor = '#4f46e5'; }}
                    onMouseLeave={(e) => { if (!(task.isListedInPlans || task.status === 'LISTED')) e.currentTarget.style.backgroundColor = '#6366f1'; }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => {
                      if (task.isListedInPlans || task.status === 'LISTED') {
                        setToast('Plans are product listings. They do not have execution views.');
                        setTimeout(() => setToast(null), 3000);
                        return;
                      }
                      navigate(`/tasks/${task.id || task._id}`);
                    }}
                    style={{
                      flex: '1',
                      padding: '10px 12px',
                      backgroundColor: '#f3f4f6',
                      color: (task.isListedInPlans || task.status === 'LISTED') ? '#94a3b8' : '#374151',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: (task.isListedInPlans || task.status === 'LISTED') ? 'default' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { if (!(task.isListedInPlans || task.status === 'LISTED')) e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                    onMouseLeave={(e) => { if (!(task.isListedInPlans || task.status === 'LISTED')) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setStatusModal({ open: true, task })}
                    disabled={task.status === 'COMPLETED' || task.status === 'CANCELLED'}
                    style={{
                      flex: '1',
                      padding: '10px 12px',
                      backgroundColor: task.status === 'COMPLETED' || task.status === 'CANCELLED' ? '#e5e7eb' : '#f3f4f6',
                      color: task.status === 'COMPLETED' || task.status === 'CANCELLED' ? '#9ca3af' : '#374151',
                      fontSize: '12px',
                      fontWeight: '600',
                      borderRadius: '10px',
                      border: 'none',
                      cursor: task.status === 'COMPLETED' || task.status === 'CANCELLED' ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') e.currentTarget.style.backgroundColor = '#e5e7eb'; }}
                    onMouseLeave={(e) => { if (task.status !== 'COMPLETED' && task.status !== 'CANCELLED') e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                  >
                    Status
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Task Slide-in Panel */}
      {showCreatePanel && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setShowCreatePanel(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15,23,42,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 60,
              animation: 'fadeIn 0.25s ease'
            }}
          />
          
          {/* Panel */}
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            maxWidth: '480px',
            backgroundColor: '#ffffff',
            zIndex: 70,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-20px 0 60px rgba(0,0,0,0.2)',
            borderTopLeftRadius: '24px',
            borderBottomLeftRadius: '24px',
            animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '28px 28px 24px',
              borderBottom: '1px solid #f1f5f9',
              background: 'linear-gradient(to bottom, #ffffff, #fafbfc)'
            }}>
              <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'}}>
                <div>
                  <h2 style={{fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.02em'}}>Create New Task</h2>
                  <p style={{fontSize: '14px', color: '#64748b', margin: 0}}>Configure all task details below</p>
                </div>
                <button
                  onClick={() => setShowCreatePanel(false)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: '#f1f5f9',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel Content - Scrollable */}
            <div style={{flex: 1, overflowY: 'auto', padding: '28px'}}>
              {formErrors.submit && (
                <div style={{padding: '14px 18px', backgroundColor: '#fef2f2', borderRadius: '14px', marginBottom: '24px', border: '1px solid #fecaca'}}>
                  <p style={{fontSize: '13px', color: '#dc2626', margin: 0, fontWeight: '500'}}>{formErrors.submit}</p>
                </div>
              )}

              {/* MODE SWITCHER */}
              <div style={{marginBottom: '32px', display: 'flex', gap: '12px', padding: '8px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0'}}>
                <button
                  type="button"
                  onClick={() => handleInputChange('isListedInPlans', false)}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    fontSize: '15px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: !formData.isListedInPlans ? '#6366f1' : 'transparent',
                    color: !formData.isListedInPlans ? '#ffffff' : '#64748b',
                  }}
                >
                  📼 TASK
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange('isListedInPlans', true)}
                  style={{
                    flex: 1,
                    padding: '14px 24px',
                    fontSize: '15px',
                    fontWeight: '600',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    backgroundColor: formData.isListedInPlans ? '#6366f1' : 'transparent',
                    color: formData.isListedInPlans ? '#ffffff' : '#64748b',
                  }}
                >
                  📦 PLANS
                </button>
              </div>

              {/* TASK MODE UI */}
              {!formData.isListedInPlans && (
                <div>
                  {/* HEADER */}
                  <div style={{marginBottom: '32px', padding: '24px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px'}}>
                      {/* Icon Preview */}
                      <div style={{width: '64px', height: '64px', borderRadius: '12px', backgroundColor: '#ffffff', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px'}}>
                        {formData.icon || '📝'}
                      </div>
                      <div style={{flex: 1}}>
                        <h2 style={{fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0, marginBottom: '4px'}}>Create New Task</h2>
                        <p style={{fontSize: '14px', color: '#64748b', margin: 0}}>Assign real client work</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const icon = prompt('Enter an emoji icon:', formData.icon || '📝');
                          if (icon) handleInputChange('icon', icon);
                        }}
                        style={{padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: '#6366f1', backgroundColor: '#ffffff', border: '2px solid #6366f1', borderRadius: '8px', cursor: 'pointer'}}
                      >
                        Choose Icon
                      </button>
                    </div>
                  </div>

                  {/* SECTION 1: IDENTITY */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>🎯 IDENTITY</h3>
                    
                    {/* Title */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Title <span style={{color: '#ef4444'}}>*</span></label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder="e.g., Design 5 Instagram Posts"
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: formErrors.title ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                      />
                      {formErrors.title && <p style={{fontSize: '12px', color: '#ef4444', marginTop: '6px', margin: 0}}>{formErrors.title}</p>}
                    </div>

                    {/* Description */}
                    <div>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Description</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Add task details..."
                        rows={3}
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', resize: 'vertical'}}
                      />
                    </div>
                  </div>

                  {/* SECTION 2: OWNERSHIP */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>👤 OWNERSHIP</h3>
                    
                    <div>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Client <span style={{color: '#ef4444'}}>*</span></label>
                      <select
                        value={formData.clientId}
                        onChange={(e) => handleInputChange('clientId', e.target.value)}
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: formErrors.clientId ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'}}
                      >
                        <option value="">Select a client...</option>
                        {clients.map(client => (
                          <option key={client.id || client._id} value={client.id || client._id}>
                            {client.name || client.email} (Balance: ₹{client.walletBalance || 0})
                          </option>
                        ))}
                      </select>
                      {formErrors.clientId && <p style={{fontSize: '12px', color: '#ef4444', marginTop: '6px', margin: 0}}>{formErrors.clientId}</p>}
                    </div>
                  </div>

                  {/* SECTION 3: PRICING & WALLET */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>💰 PRICING & WALLET</h3>
                    
                    {/* Original Amount */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Original Amount <span style={{color: '#ef4444'}}>*</span></label>
                      <p style={{fontSize: '12px', color: '#64748b', marginBottom: '10px'}}>Base price • Default wallet deduction</p>
                      <div style={{position: 'relative'}}>
                        <span style={{position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '16px', fontWeight: '600'}}>₹</span>
                        <input
                          type="number"
                          value={formData.creditCost}
                          onChange={(e) => handleInputChange('creditCost', parseInt(e.target.value) || 0)}
                          style={{width: '100%', padding: '14px 16px 14px 40px', fontSize: '16px', fontWeight: '600', border: formErrors.creditCost ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                        />
                      </div>
                      {formErrors.creditCost && <p style={{fontSize: '12px', color: '#ef4444', marginTop: '6px', margin: 0}}>{formErrors.creditCost}</p>}
                    </div>

                    {/* Offer Price Toggle */}
                    {!formData.showOfferPrice && (
                      <button
                        type="button"
                        onClick={() => handleInputChange('showOfferPrice', true)}
                        style={{padding: '10px 18px', fontSize: '13px', fontWeight: '600', color: '#6366f1', backgroundColor: '#eff6ff', border: '1px solid #6366f1', borderRadius: '8px', cursor: 'pointer', marginBottom: '16px'}}
                      >
                        + Add Offer Price
                      </button>
                    )}

                    {/* Offer Price Field */}
                    {formData.showOfferPrice && (
                      <div style={{marginBottom: '16px', padding: '16px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '2px dashed #fbbf24'}}>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Offer Price <span style={{fontSize: '11px', color: '#64748b', fontWeight: '400'}}>(Optional)</span></label>
                        <p style={{fontSize: '12px', color: '#92400e', marginBottom: '10px'}}>If set and {'>'} 0, wallet will be charged at this amount</p>
                        <div style={{position: 'relative'}}>
                          <span style={{position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '16px', fontWeight: '600'}}>₹</span>
                          <input
                            type="number"
                            value={formData.offerPrice || ''}
                            onChange={(e) => handleInputChange('offerPrice', e.target.value ? parseInt(e.target.value) : '')}
                            placeholder="Leave empty to use Original Amount"
                            style={{width: '100%', padding: '14px 16px 14px 40px', fontSize: '16px', fontWeight: '600', border: '2px solid #fbbf24', borderRadius: '10px', backgroundColor: '#fefce8', boxSizing: 'border-box', outline: 'none'}}
                          />
                        </div>
                        {formData.offerPrice && formData.offerPrice > 0 && (
                          <div style={{marginTop: '12px', padding: '10px 14px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24'}}>
                            <p style={{fontSize: '12px', color: '#92400e', margin: 0, fontWeight: '600'}}>✓ Wallet will be charged ₹{formData.offerPrice} (Offer Price)</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            handleInputChange('offerPrice', '');
                            handleInputChange('showOfferPrice', false);
                          }}
                          style={{marginTop: '10px', padding: '8px 16px', fontSize: '12px', fontWeight: '600', color: '#64748b', backgroundColor: 'transparent', border: 'none', cursor: 'pointer'}}
                        >
                          Remove Offer Price
                        </button>
                      </div>
                    )}

                    {/* Show Credits Toggle */}
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px'}}>
                      <input
                        type="checkbox"
                        checked={formData.showCreditsToClient}
                        onChange={(e) => handleInputChange('showCreditsToClient', e.target.checked)}
                        style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1'}}
                      />
                      <label style={{fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer'}}>Show Credits to Client</label>
                    </div>

                    {/* Wallet Preview */}
                    {formData.clientId && formData.creditCost >= 0 && (() => {
                      const selectedClient = clients.find(c => (c.id || c._id) === formData.clientId);
                      const balance = selectedClient?.walletBalance || 0;
                      const actualCharge = (formData.offerPrice && formData.offerPrice > 0) ? formData.offerPrice : formData.creditCost;
                      const remaining = balance - actualCharge;
                      const insufficient = remaining < 0;
                      return (
                        <div style={{marginTop: '16px', padding: '16px', backgroundColor: insufficient ? '#fef2f2' : '#f0fdf4', borderRadius: '10px', border: insufficient ? '1px solid #fecaca' : '1px solid #bbf7d0'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                            <span style={{fontSize: '13px', color: '#64748b'}}>Current Balance</span>
                            <span style={{fontSize: '14px', fontWeight: '600', color: '#334155'}}>₹{balance}</span>
                          </div>
                          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                            <span style={{fontSize: '13px', color: '#64748b'}}>Wallet Deduction</span>
                            <span style={{fontSize: '14px', fontWeight: '600', color: '#ef4444'}}>- ₹{actualCharge}</span>
                          </div>
                          <div style={{borderTop: '1px dashed #cbd5e1', paddingTop: '8px', display: 'flex', justifyContent: 'space-between'}}>
                            <span style={{fontSize: '13px', fontWeight: '600', color: insufficient ? '#dc2626' : '#15803d'}}>After Creation</span>
                            <span style={{fontSize: '16px', fontWeight: '700', color: insufficient ? '#dc2626' : '#15803d'}}>₹{remaining}</span>
                          </div>
                          {insufficient && (
                            <div style={{marginTop: '10px', padding: '10px', backgroundColor: '#fee2e2', borderRadius: '8px'}}>
                              <p style={{fontSize: '12px', color: '#dc2626', margin: 0, fontWeight: '600'}}>⚠️ Insufficient credits! Client needs ₹{Math.abs(remaining)} more.</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* SECTION 4: STATUS & PRIORITY */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>📊 STATUS & PRIORITY</h3>
                    
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                      {/* Status */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Status</label>
                        <select
                          value={formData.status}
                          onChange={(e) => handleInputChange('status', e.target.value)}
                          style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'}}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="ACTIVE">Active</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>

                      {/* Priority */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Priority</label>
                        <select
                          value={formData.priority}
                          onChange={(e) => handleInputChange('priority', e.target.value)}
                          style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', cursor: 'pointer'}}
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 5: TIMELINE */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>📅 TIMELINE</h3>
                    
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                      {/* Start Date */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Start Date <span style={{color: '#ef4444'}}>*</span></label>
                        <input
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => handleInputChange('startDate', e.target.value)}
                          style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: formErrors.startDate ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                        />
                        {formErrors.startDate && <p style={{fontSize: '12px', color: '#ef4444', marginTop: '6px', margin: 0}}>{formErrors.startDate}</p>}
                      </div>

                      {/* End Date */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>End Date</label>
                        <input
                          type="date"
                          value={formData.deadline}
                          onChange={(e) => handleInputChange('deadline', e.target.value)}
                          style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECTION 6: SMART PROGRESS SYSTEM */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>📊 SMART PROGRESS SYSTEM</h3>
                    
                    {/* Progress Mode Selector */}
                    <div style={{marginBottom: '20px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '10px'}}>Progress Mode <span style={{color: '#ef4444'}}>*</span></label>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        {['AUTO', 'MANUAL'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleInputChange('progressMode', mode)}
                            style={{
                              padding: '14px',
                              fontSize: '13px',
                              fontWeight: '600',
                              border: formData.progressMode === mode ? '2px solid #6366f1' : '2px solid #e2e8f0',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              backgroundColor: formData.progressMode === mode ? (mode === 'AUTO' ? '#eff6ff' : '#fffbeb') : '#ffffff',
                              color: formData.progressMode === mode ? (mode === 'AUTO' ? '#6366f1' : '#b45309') : '#64748b',
                              transition: 'all 0.2s',
                            }}
                          >
                            {mode === 'AUTO' && '📅 AUTO'}
                            {mode === 'MANUAL' && '🎯 MANUAL'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* INFO BOXES */}
                    {formData.progressMode === 'AUTO' && (
                      <div style={{marginBottom: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe'}}>
                        <h4 style={{fontSize: '13px', fontWeight: '700', color: '#1e40af', margin: '0 0 6px 0'}}>AUTO MODE — Time-Based Progress</h4>
                        <p style={{fontSize: '12px', color: '#1e40af', margin: 0, lineHeight: '1.5'}}>
                          Progress % increases automatically with time (Start → End date). Target & Achieved are for context only and not used in calculation.
                        </p>
                      </div>
                    )}

                    {formData.progressMode === 'MANUAL' && (
                      <div style={{marginBottom: '20px', padding: '16px', backgroundColor: '#fffbeb', borderRadius: '12px', border: '1px solid #fde68a'}}>
                        <h4 style={{fontSize: '13px', fontWeight: '700', color: '#92400e', margin: '0 0 6px 0'}}>MANUAL MODE — Number-Based Progress</h4>
                        <p style={{fontSize: '12px', color: '#92400e', margin: 0, lineHeight: '1.5'}}>
                          Progress % = (Achieved ÷ Target) × 100. Over 100% is allowed.
                        </p>
                      </div>
                    )}

                    {/* TARGET & ACHIEVED (ALWAYS VISIBLE) */}
                    <div style={{marginBottom: '20px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0'}}>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px'}}>
                        <div>
                          <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Target (Goal)</label>
                          <input
                            type="number"
                            value={formData.progressTarget}
                            onChange={(e) => handleInputChange('progressTarget', parseInt(e.target.value) || 100)}
                            placeholder="e.g. 5000 views, 100 posts"
                            style={{width: '100%', padding: '12px 14px', fontSize: '14px', fontWeight: '600', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                          />
                          <p style={{fontSize: '11px', color: '#64748b', marginTop: '6px', fontStyle: 'italic'}}>Total goal of this task. This represents 100%.</p>
                        </div>
                        <div>
                          <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Achieved (Current)</label>
                          <input
                            type="number"
                            value={formData.progressAchieved}
                            onChange={(e) => handleInputChange('progressAchieved', parseInt(e.target.value) || 0)}
                            placeholder="e.g. 600 views"
                            style={{width: '100%', padding: '12px 14px', fontSize: '14px', fontWeight: '600', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                          />
                          <p style={{fontSize: '11px', color: '#64748b', marginTop: '6px', fontStyle: 'italic'}}>Current progress done so far.</p>
                        </div>
                      </div>

                      {/* AUTO COMPLETION CAP (ONLY IN AUTO) */}
                      {formData.progressMode === 'AUTO' && (
                        <div style={{marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #e2e8f0'}}>
                          <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Final Completion %</label>
                          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={formData.autoCompletionCap}
                              onChange={(e) => handleInputChange('autoCompletionCap', parseInt(e.target.value))}
                              style={{flex: 1, height: '6px'}}
                            />
                            <div style={{width: '50px', padding: '6px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '6px', textAlign: 'center', fontSize: '13px', fontWeight: '700'}}>
                              {formData.autoCompletionCap}%
                            </div>
                          </div>
                          <p style={{fontSize: '11px', color: '#64748b', marginTop: '8px', fontStyle: 'italic'}}>Maximum % that auto progress can reach by end date.</p>
                        </div>
                      )}

                      {/* Show Details Toggle */}
                      <div style={{marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0'}}>
                        <input
                          type="checkbox"
                          checked={formData.showProgressDetails}
                          onChange={(e) => handleInputChange('showProgressDetails', e.target.checked)}
                          style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: '#6366f1'}}
                        />
                        <label style={{fontSize: '13px', fontWeight: '600', color: '#475569', cursor: 'pointer'}}>Show Target & Achieved numbers to client</label>
                      </div>
                    </div>

                    {/* MILESTONES */}
                    <div style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <label style={{fontSize: '13px', fontWeight: '600', color: '#0f172a'}}>Custom Milestones</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newMilestone = { name: 'New Milestone', percentage: 50, color: '#6366f1' };
                            handleInputChange('milestones', [...formData.milestones, newMilestone]);
                          }}
                          style={{padding: '6px 12px', fontSize: '11px', fontWeight: '600', color: '#6366f1', backgroundColor: '#eff6ff', border: '1px solid #6366f1', borderRadius: '6px', cursor: 'pointer'}}
                        >
                          + Add Milestone
                        </button>
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {formData.milestones.map((milestone, index) => (
                          <div key={index} style={{display: 'flex', gap: '10px', alignItems: 'center', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                            <input
                              type="color"
                              value={milestone.color}
                              onChange={(e) => {
                                const updated = [...formData.milestones];
                                updated[index].color = e.target.value;
                                handleInputChange('milestones', updated);
                              }}
                              style={{width: '36px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer'}}
                            />
                            <input
                              type="text"
                              value={milestone.name}
                              onChange={(e) => {
                                const updated = [...formData.milestones];
                                updated[index].name = e.target.value;
                                handleInputChange('milestones', updated);
                              }}
                              placeholder="Milestone name"
                              style={{flex: 1, padding: '10px 12px', fontSize: '13px', fontWeight: '500', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#ffffff', outline: 'none'}}
                            />
                            <input
                              type="number"
                              value={milestone.percentage}
                              onChange={(e) => {
                                const updated = [...formData.milestones];
                                updated[index].percentage = parseInt(e.target.value) || 0;
                                handleInputChange('milestones', updated);
                              }}
                              placeholder="%"
                              style={{width: '70px', padding: '10px 12px', fontSize: '13px', fontWeight: '600', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#ffffff', outline: 'none', textAlign: 'center'}}
                            />
                            <span style={{fontSize: '13px', fontWeight: '600', color: '#64748b'}}>%</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.milestones.filter((_, i) => i !== index);
                                handleInputChange('milestones', updated);
                              }}
                              style={{padding: '8px', fontSize: '14px', color: '#dc2626', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px'}}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* QUANTITY (Scope Clarity) */}
                    <div style={{marginBottom: '20px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#15803d', marginBottom: '8px'}}>Quantity (Scope Clarity)</label>
                      <p style={{fontSize: '11px', color: '#166534', marginBottom: '10px'}}>e.g. "5 posts", "3 videos" — This helps client understand workload. NOT used for progress calculation.</p>
                      <input
                        type="number"
                        value={formData.quantity || ''}
                        onChange={(e) => handleInputChange('quantity', e.target.value)}
                        placeholder="e.g. 5"
                        style={{width: '100%', padding: '12px 14px', fontSize: '14px', border: '2px solid #bbf7d0', borderRadius: '8px', backgroundColor: '#f0fdf4', boxSizing: 'border-box', outline: 'none', marginBottom: '12px'}}
                      />
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <input
                          type="checkbox"
                          checked={formData.showQuantityToClient}
                          onChange={(e) => handleInputChange('showQuantityToClient', e.target.checked)}
                          style={{width: '16px', height: '16px', cursor: 'pointer', accentColor: '#22c55e'}}
                        />
                        <label style={{fontSize: '12px', fontWeight: '600', color: '#15803d', cursor: 'pointer'}}>Show Quantity to Client</label>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 7: NOTES */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>💬 NOTES</h3>
                    
                    {/* Public Notes */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Public Notes <span style={{fontSize: '11px', color: '#64748b', fontWeight: '400'}}>(Client visible)</span></label>
                      <textarea
                        value={formData.publicNotes}
                        onChange={(e) => handleInputChange('publicNotes', e.target.value)}
                        placeholder="Notes visible to client..."
                        rows={3}
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', resize: 'vertical'}}
                      />
                    </div>

                    {/* Internal Notes */}
                    <div>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Internal Notes <span style={{fontSize: '11px', color: '#f59e0b', fontWeight: '600'}}>(Admin only)</span></label>
                      <textarea
                        value={formData.internalNotes}
                        onChange={(e) => handleInputChange('internalNotes', e.target.value)}
                        placeholder="Private admin notes..."
                        rows={3}
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #fef3c7', borderRadius: '10px', backgroundColor: '#fffbeb', boxSizing: 'border-box', outline: 'none', resize: 'vertical'}}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PLANS MODE UI */}
              {formData.isListedInPlans && (
                <div>
                  {/* HEADER */}
                  <div style={{marginBottom: '32px', padding: '24px', backgroundColor: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px'}}>
                      {/* Icon Preview */}
                      <div style={{width: '64px', height: '64px', borderRadius: '12px', backgroundColor: '#ffffff', border: '2px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px'}}>
                        {formData.icon || '📦'}
                      </div>
                      <div style={{flex: 1}}>
                        <h2 style={{fontSize: '24px', fontWeight: '700', color: '#0c4a6e', margin: 0, marginBottom: '4px'}}>Create New Plan</h2>
                        <p style={{fontSize: '14px', color: '#0369a1', margin: 0}}>Create a marketplace product listing</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const icon = prompt('Enter an emoji icon:', formData.icon || '📦');
                          if (icon) handleInputChange('icon', icon);
                        }}
                        style={{padding: '10px 20px', fontSize: '13px', fontWeight: '600', color: '#0369a1', backgroundColor: '#ffffff', border: '2px solid #0369a1', borderRadius: '8px', cursor: 'pointer'}}
                      >
                        Choose Icon
                      </button>
                    </div>
                  </div>

                  {/* SECTION 1: MEDIA & IDENTITY */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>🖼️ MEDIA & IDENTITY</h3>
                    
                    {/* MEDIA SYSTEM: Array of items (1-4 allowed) */}
                    <div style={{marginBottom: '20px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '12px'}}>
                        Plan Media <span style={{fontSize: '11px', color: '#64748b', fontWeight: '400'}}>(1-4 items)</span>
                      </label>
                      
                      {/* Current Media Items */}
                      {formData.planMedia && formData.planMedia.length > 0 && (
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px'}}>
                          {formData.planMedia.map((media, idx) => (
                            <div key={idx} style={{
                              position: 'relative',
                              borderRadius: '12px',
                              border: '2px solid #e2e8f0',
                              overflow: 'hidden',
                              backgroundColor: '#f8fafc'
                            }}>
                              {media.type === 'image' ? (
                                <img 
                                  src={media.url} 
                                  alt={`Media ${idx + 1}`}
                                  style={{width: '100%', height: '120px', objectFit: 'cover'}}
                                  loading="lazy"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div style={{
                                  width: '100%', height: '120px', 
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  backgroundColor: '#1e293b', color: '#fff'
                                }}>
                                  <div style={{textAlign: 'center'}}>
                                    <span style={{fontSize: '24px'}}>🎬</span>
                                    <p style={{fontSize: '11px', margin: '4px 0 0', opacity: 0.8}}>Video</p>
                                  </div>
                                </div>
                              )}
                              {/* Remove Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...formData.planMedia];
                                  updated.splice(idx, 1);
                                  handleInputChange('planMedia', updated);
                                }}
                                style={{
                                  position: 'absolute', top: '6px', right: '6px',
                                  width: '24px', height: '24px',
                                  borderRadius: '50%', border: 'none',
                                  backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
                                  cursor: 'pointer', fontSize: '12px', fontWeight: '700'
                                }}
                              >✕</button>
                              {/* Type Badge */}
                              <div style={{
                                position: 'absolute', bottom: '6px', left: '6px',
                                padding: '2px 8px', borderRadius: '4px',
                                backgroundColor: media.type === 'image' ? '#6366f1' : '#ef4444',
                                color: '#fff', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
                              }}>{media.type}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Add Media Button (if < 4 items) */}
                      {(!formData.planMedia || formData.planMedia.length < 4) && (
                        <div style={{marginBottom: '12px'}}>
                          <div style={{display: 'flex', gap: '8px'}}>
                            <button
                              type="button"
                              onClick={() => {
                                const url = prompt('Enter Image URL:');
                                if (url && url.trim()) {
                                  const updated = [...(formData.planMedia || []), { type: 'image', url: url.trim() }];
                                  handleInputChange('planMedia', updated);
                                }
                              }}
                              style={{
                                flex: 1, padding: '14px',
                                fontSize: '13px', fontWeight: '600',
                                backgroundColor: '#eff6ff', color: '#6366f1',
                                border: '2px dashed #6366f1', borderRadius: '10px',
                                cursor: 'pointer'
                              }}
                            >
                              + Add Image URL
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const url = prompt('Enter Video URL (YouTube, Vimeo, MP4):');
                                if (url && url.trim()) {
                                  const updated = [...(formData.planMedia || []), { type: 'video', url: url.trim() }];
                                  handleInputChange('planMedia', updated);
                                }
                              }}
                              style={{
                                flex: 1, padding: '14px',
                                fontSize: '13px', fontWeight: '600',
                                backgroundColor: '#fef2f2', color: '#ef4444',
                                border: '2px dashed #ef4444', borderRadius: '10px',
                                cursor: 'pointer'
                              }}
                            >
                              + Add Video URL
                            </button>
                          </div>
                          <p style={{fontSize: '11px', color: '#64748b', marginTop: '8px', textAlign: 'center'}}>
                            {formData.planMedia?.length || 0}/4 media added • Any combination of images and videos allowed
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Plan Title */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Plan Title <span style={{color: '#ef4444'}}>*</span></label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        placeholder="e.g., Premium Instagram Growth"
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: formErrors.title ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                      />
                      {formErrors.title && <p style={{fontSize: '12px', color: '#ef4444', marginTop: '6px', margin: 0}}>{formErrors.title}</p>}
                    </div>

                    {/* Description */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Marketplace Description</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        placeholder="Public description for the marketplace..."
                        rows={3}
                        style={{width: '100%', padding: '14px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none', resize: 'vertical'}}
                      />
                    </div>

                    {/* Category Selector */}
                    <div style={{marginBottom: '16px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Category</label>
                      <select
                        value={formData.categoryId || ''}
                        onChange={(e) => handleInputChange('categoryId', e.target.value)}
                        style={{
                          width: '100%', 
                          padding: '14px 16px', 
                          fontSize: '14px', 
                          border: '2px solid #e2e8f0', 
                          borderRadius: '10px', 
                          backgroundColor: '#ffffff', 
                          boxSizing: 'border-box', 
                          outline: 'none',
                          cursor: 'pointer',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 16px center'
                        }}
                      >
                        <option value="">No Category</option>
                        {categories.map(cat => (
                          <option key={cat._id} value={cat._id}>
                            {cat.icon} {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Publish Status */}
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', backgroundColor: formData.isActivePlan ? '#f0fdf4' : '#f8fafc', borderRadius: '10px', border: formData.isActivePlan ? '1px solid #bbf7d0' : '1px solid #e2e8f0'}}>
                      <input
                        type="checkbox"
                        checked={formData.isActivePlan}
                        onChange={(e) => handleInputChange('isActivePlan', e.target.checked)}
                        style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: '#22c55e'}}
                      />
                      <div>
                        <label style={{fontSize: '13px', fontWeight: '700', color: formData.isActivePlan ? '#15803d' : '#475569', cursor: 'pointer', display: 'block'}}>
                          {formData.isActivePlan ? '🚀 LIVE ON MARKETPLACE' : '📁 DRAFT (HIDDEN)'}
                        </label>
                        <span style={{fontSize: '11px', color: '#64748b'}}>Toggle visibility for clients</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: PRICING */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>💰 PRICING</h3>
                    
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                      {/* Original Price */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Base Price <span style={{color: '#ef4444'}}>*</span></label>
                        <div style={{position: 'relative'}}>
                          <span style={{position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '16px', fontWeight: '600'}}>₹</span>
                          <input
                            type="number"
                            value={formData.creditCost}
                            onChange={(e) => handleInputChange('creditCost', parseInt(e.target.value) || 0)}
                            style={{width: '100%', padding: '14px 16px 14px 40px', fontSize: '16px', fontWeight: '600', border: formErrors.creditCost ? '2px solid #ef4444' : '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                          />
                        </div>
                      </div>

                      {/* Offer Price */}
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Offer Price (Optional)</label>
                        <div style={{position: 'relative'}}>
                          <span style={{position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '16px', fontWeight: '600'}}>₹</span>
                          <input
                            type="number"
                            value={formData.offerPrice}
                            onChange={(e) => handleInputChange('offerPrice', parseInt(e.target.value) || '')}
                            placeholder="Sale price"
                            style={{width: '100%', padding: '14px 16px 14px 40px', fontSize: '16px', fontWeight: '600', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 3: TARGET CLIENTS UX */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>👁️ TARGET CLIENTS</h3>
                    
                    {/* Visible to All Toggle */}
                    <div style={{marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: visibleToAll ? '#eff6ff' : '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', cursor: 'pointer'}} onClick={() => {
                      if (!visibleToAll) {
                        handleInputChange('targetClients', []);
                      }
                      setVisibleToAll(!visibleToAll);
                    }}>
                      <div style={{width: '40px', height: '20px', backgroundColor: visibleToAll ? '#6366f1' : '#cbd5e1', borderRadius: '20px', position: 'relative', transition: 'all 0.2s'}}>
                        <div style={{width: '16px', height: '16px', backgroundColor: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: visibleToAll ? '22px' : '2px', transition: 'all 0.2s'}} />
                      </div>
                      <span style={{fontSize: '14px', fontWeight: '600', color: visibleToAll ? '#6366f1' : '#64748b'}}>Visible to all clients</span>
                    </div>

                    {!visibleToAll && (
                      <div style={{position: 'relative'}}>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Select Specific Clients</label>
                        
                        {/* Selected Chips */}
                        {formData.targetClients?.length > 0 && (
                          <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px'}}>
                            {formData.targetClients.map(clientId => {
                              const client = clients.find(c => (c.id || c._id) === clientId);
                              return (
                                <div key={clientId} style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '20px', fontSize: '12px', fontWeight: '600'}}>
                                  {client?.name || client?.email || clientId}
                                  <span 
                                    style={{cursor: 'pointer', marginLeft: '4px', opacity: 0.8}}
                                    onClick={() => handleInputChange('targetClients', formData.targetClients.filter(id => id !== clientId))}
                                  >✕</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Search Input */}
                        <div style={{position: 'relative'}}>
                          <input
                            type="text"
                            value={clientSearch}
                            onChange={(e) => {
                              setClientSearch(e.target.value);
                              setShowClientDropdown(true);
                            }}
                            onFocus={() => setShowClientDropdown(true)}
                            placeholder="Type to search by name or email..."
                            style={{width: '100%', padding: '12px 16px', fontSize: '14px', border: '2px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff', boxSizing: 'border-box', outline: 'none'}}
                          />
                          
                          {showClientDropdown && clientSearch.trim() && (
                            <div style={{position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 80, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', marginTop: '4px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto'}}>
                              {clients
                                .filter(c => 
                                  (c.name?.toLowerCase().includes(clientSearch.toLowerCase()) || 
                                   c.email?.toLowerCase().includes(clientSearch.toLowerCase())) &&
                                  !formData.targetClients?.includes(c.id || c._id)
                                )
                                .map(client => (
                                  <div 
                                    key={client.id || client._id}
                                    onClick={() => {
                                      handleInputChange('targetClients', [...(formData.targetClients || []), (client.id || client._id)]);
                                      setClientSearch('');
                                      setShowClientDropdown(false);
                                    }}
                                    style={{padding: '10px 16px', cursor: 'pointer', fontSize: '14px', borderBottom: '1px solid #f1f5f9'}}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                  >
                                    <div style={{fontWeight: '600', color: '#334155'}}>{client.name}</div>
                                    <div style={{fontSize: '12px', color: '#64748b'}}>{client.email}</div>
                                  </div>
                                ))
                              }
                              {clients.filter(c => 
                                (c.name?.toLowerCase().includes(clientSearch.toLowerCase()) || 
                                 c.email?.toLowerCase().includes(clientSearch.toLowerCase())) &&
                                !formData.targetClients?.includes(c.id || c._id)
                              ).length === 0 && (
                                <div style={{padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px'}}>No clients found</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECTION 4: PROGRESS CONFIG (PLAN FORM) */}
                  <div style={{marginBottom: '28px'}}>
                    <h3 style={{fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px'}}>⚙️ PROGRESS CONFIG</h3>
                    <p style={{fontSize: '11px', color: '#64748b', marginBottom: '16px'}}>These rules will apply once the plan is purchased and approved.</p>
                    
                    {/* Progress Mode */}
                    <div style={{marginBottom: '20px'}}>
                      <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '10px'}}>Progress Mode</label>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        {['AUTO', 'MANUAL'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleInputChange('progressMode', mode)}
                            style={{
                              padding: '14px',
                              fontSize: '13px',
                              fontWeight: '600',
                              border: formData.progressMode === mode ? '2px solid #6366f1' : '2px solid #e2e8f0',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              backgroundColor: formData.progressMode === mode ? '#eff6ff' : '#ffffff',
                              color: formData.progressMode === mode ? '#6366f1' : '#64748b',
                            }}
                          >
                            {mode === 'AUTO' ? '📅 AUTO (Time)' : '🎯 MANUAL (Num)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Target & Quantity */}
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px'}}>
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Target Goal <span style={{color: '#ef4444'}}>*</span></label>
                        <input
                          type="number"
                          value={formData.progressTarget}
                          onChange={(e) => handleInputChange('progressTarget', parseInt(e.target.value) || 100)}
                          style={{width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0'}}
                        />
                        <p style={{fontSize: '11px', color: '#64748b', marginTop: '4px'}}>Promise (e.g. 5000 views)</p>
                      </div>
                      <div>
                        <label style={{display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px'}}>Quantity Scope</label>
                        <input
                          type="number"
                          value={formData.quantity || ''}
                          onChange={(e) => handleInputChange('quantity', e.target.value)}
                          placeholder="e.g. 5"
                          style={{width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #e2e8f0'}}
                        />
                        <p style={{fontSize: '11px', color: '#64748b', marginTop: '4px'}}>Scope (e.g. 5 posts)</p>
                      </div>
                    </div>

                    {/* Milestones */}
                    <div style={{marginBottom: '20px'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
                        <label style={{fontSize: '13px', fontWeight: '600', color: '#0f172a'}}>Default Milestones</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newMilestone = { name: 'New Milestone', percentage: 50, color: '#6366f1' };
                            handleInputChange('milestones', [...formData.milestones, newMilestone]);
                          }}
                          style={{padding: '6px 12px', fontSize: '11px', fontWeight: '600', color: '#6366f1', backgroundColor: '#eff6ff', border: '1px solid #6366f1', borderRadius: '6px', cursor: 'pointer'}}
                        >
                          + Add Milestone
                        </button>
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {formData.milestones.map((milestone, index) => (
                          <div key={index} style={{display: 'flex', gap: '8px', alignItems: 'center', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                            <input
                              type="text"
                              value={milestone.name}
                              onChange={(e) => {
                                const updated = [...formData.milestones];
                                updated[index].name = e.target.value;
                                handleInputChange('milestones', updated);
                              }}
                              placeholder="Name"
                              style={{flex: 1, padding: '8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px'}}
                            />
                            <input
                              type="number"
                              value={milestone.percentage}
                              onChange={(e) => {
                                const updated = [...formData.milestones];
                                updated[index].percentage = parseInt(e.target.value) || 0;
                                handleInputChange('milestones', updated);
                              }}
                              style={{width: '60px', padding: '8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center'}}
                            />
                            <span style={{fontSize: '12px'}}>%</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = formData.milestones.filter((_, i) => i !== index);
                                handleInputChange('milestones', updated);
                              }}
                              style={{color: '#dc2626', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', padding: '4px'}}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Footer - Sticky */}
            <div style={{
              padding: '20px 28px',
              borderTop: '1px solid #f1f5f9',
              backgroundColor: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '14px',
              boxShadow: '0 -8px 24px rgba(0,0,0,0.06)'
            }}>
              <button
                type="button"
                onClick={() => setShowCreatePanel(false)}
                style={{
                  padding: '16px 28px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#64748b',
                  backgroundColor: 'transparent',
                  border: '2px solid #e2e8f0',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '16px 32px',
                  fontSize: '15px',
                  fontWeight: '700',
                  color: '#fff',
                  background: submitting ? '#94a3b8' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  border: 'none',
                  borderRadius: '14px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: submitting ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
                  transition: 'all 0.2s'
                }}
              >
                {submitting ? (formData.isListedInPlans ? 'Creating Plan...' : 'Creating Task...') : (formData.isListedInPlans ? 'Create Plan' : 'Create Task')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* APPROVAL MODAL */}
      {approvalModal.open && approvalModal.task && (
        <>
          <div 
            onClick={() => !approving && setApprovalModal({ open: false, task: null })}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)', zIndex: 100 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff', borderRadius: '24px', width: '95%', maxWidth: '900px',
            maxHeight: '90vh', overflowY: 'auto', zIndex: 110, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Review & Approve Task</h2>
                <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0 0' }}>Configure the real task details before starting</p>
              </div>
              <button onClick={() => setApprovalModal({ open: false, task: null })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', flex: 1 }}>
              {/* LEFT: READ-ONLY (FROM PLAN) */}
              <div style={{ padding: '32px', backgroundColor: '#f8fafc', borderRight: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>A) READ-ONLY (FROM PLAN)</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Plan Name & Icon</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                      <span style={{ fontSize: '24px' }}>{approvalModal.task.icon || '📝'}</span>
                      <strong style={{ fontSize: '16px', color: '#1e293b' }}>{approvalModal.task.title}</strong>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Plan Description</label>
                    <p style={{ fontSize: '14px', color: '#475569', marginTop: '6px', lineHeight: 1.5 }}>{approvalModal.task.description || 'No description'}</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Progress Mode</label>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>{approvalModal.task.progressMode}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Target</label>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>{approvalModal.task.progressTarget || 100}</p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Quantity</label>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>{approvalModal.task.quantity || 'N/A'}</p>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Auto Cap</label>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>{approvalModal.task.autoCompletionCap || 100}%</p>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Milestones</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {approvalModal.task.milestones && approvalModal.task.milestones.length > 0 ? (
                        approvalModal.task.milestones.map((m, i) => (
                          <span key={i} style={{ 
                            fontSize: '11px', fontWeight: '600', padding: '4px 10px', 
                            backgroundColor: '#eef2ff', color: '#6366f1', borderRadius: '6px', 
                            border: '1px solid #e0e7ff' 
                          }}>
                            {m.percentage}%: {m.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '13px', color: '#94a3b8' }}>No milestones defined</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Wallet Paid Amount</label>
                    <p style={{ fontSize: '20px', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>₹{approvalModal.task.creditsUsed || approvalModal.task.creditCost}</p>
                  </div>

                  {approvalModal.task.featureImage && (
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Feature Image</label>
                      <img src={approvalModal.task.featureImage} style={{ width: '100%', borderRadius: '12px', marginTop: '8px', border: '1px solid #e2e8f0' }} alt="Feature" />
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: EDITABLE (REAL TASK SETUP) */}
              <div style={{ padding: '32px' }}>
                <h3 style={{ fontSize: '12px', fontWeight: '700', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px' }}>B) EDITABLE (REAL TASK SETUP)</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Final Title */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Final Task Title</label>
                    <input 
                      type="text" 
                      value={approvalFormData.title} 
                      onChange={(e) => setApprovalFormData(p => ({...p, title: e.target.value}))}
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Full Task Description</label>
                    <textarea 
                      value={approvalFormData.description} 
                      onChange={(e) => setApprovalFormData(p => ({...p, description: e.target.value}))}
                      rows={3}
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', resize: 'vertical' }}
                    />
                  </div>

                  {/* Dates */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Start Date</label>
                      <input 
                        type="date" 
                        value={approvalFormData.startDate} 
                        onChange={(e) => setApprovalFormData(p => ({...p, startDate: e.target.value}))}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>End Date</label>
                      <input 
                        type="date" 
                        value={approvalFormData.endDate} 
                        onChange={(e) => setApprovalFormData(p => ({...p, endDate: e.target.value}))}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Priority</label>
                    <select 
                      value={approvalFormData.priority} 
                      onChange={(e) => setApprovalFormData(p => ({...p, priority: e.target.value}))}
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>

                  {/* Notes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Public Notes</label>
                      <textarea 
                        value={approvalFormData.publicNotes} 
                        onChange={(e) => setApprovalFormData(p => ({...p, publicNotes: e.target.value}))}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Internal Notes</label>
                      <textarea 
                        value={approvalFormData.internalNotes} 
                        onChange={(e) => setApprovalFormData(p => ({...p, internalNotes: e.target.value}))}
                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                      />
                    </div>
                  </div>

                  {/* Special Instructions */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>Special Instructions</label>
                    <textarea 
                      value={approvalFormData.specialInstructions} 
                      onChange={(e) => setApprovalFormData(p => ({...p, specialInstructions: e.target.value}))}
                      placeholder="Optional text for client..."
                      style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: '24px 32px', borderTop: '1px solid #f1f5f9', backgroundColor: '#fff', display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
              <button 
                onClick={handleApproveTask}
                disabled={approving}
                style={{ 
                  padding: '12px 32px', backgroundColor: '#6366f1', color: '#fff', borderRadius: '12px', border: 'none', 
                  fontWeight: '700', cursor: approving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                  flex: 1, maxWidth: '300px'
                }}
              >
                {approving ? 'Starting Task...' : 'Approve & Start Task'}
              </button>
              <button disabled style={{ padding: '12px 24px', backgroundColor: '#f1f5f9', color: '#94a3b8', borderRadius: '12px', border: 'none', fontWeight: '600', cursor: 'not-allowed' }}>Hold</button>
              <button disabled style={{ padding: '12px 24px', backgroundColor: '#f1f5f9', color: '#94a3b8', borderRadius: '12px', border: 'none', fontWeight: '600', cursor: 'not-allowed' }}>Reject</button>
            </div>
          </div>
        </>
      )}

      {/* Status Change Modal */}
      {statusModal.open && statusModal.task && (
        <>
          {/* Backdrop */}
          <div 
            onClick={() => setStatusModal({ open: false, task: null })}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15,23,42,0.6)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              zIndex: 80,
              animation: 'fadeIn 0.2s ease'
            }}
          />
          
          {/* Modal */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            padding: '32px',
            width: '90%',
            maxWidth: '400px',
            zIndex: 90,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            animation: 'fadeIn 0.25s ease'
          }}>
            <h3 style={{fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0'}}>Change Task Status</h3>
            <p style={{fontSize: '14px', color: '#64748b', margin: '0 0 24px 0', lineHeight: '1.5'}}>
              <strong style={{color: '#334155'}}>{statusModal.task.title}</strong>
            </p>
            
            <div style={{marginBottom: '16px'}}>
              <p style={{fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'}}>Current Status</p>
              <span style={{
                display: 'inline-block',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '600',
                backgroundColor: statusModal.task.status === 'PENDING' ? '#fef3c7' : statusModal.task.status === 'ACTIVE' ? '#dbeafe' : '#f3f4f6',
                color: statusModal.task.status === 'PENDING' ? '#92400e' : statusModal.task.status === 'ACTIVE' ? '#1d4ed8' : '#6b7280'
              }}>
                {statusModal.task.status}
              </span>
            </div>
            
            <p style={{fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px'}}>Change To</p>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px'}}>
              {(() => {
                const transitions = {
                  'PENDING': ['ACTIVE', 'CANCELLED'],
                  'ACTIVE': ['COMPLETED', 'CANCELLED'],
                  'COMPLETED': [],
                  'CANCELLED': []
                };
                const allowed = transitions[statusModal.task.status] || [];
                
                if (allowed.length === 0) {
                  return <p style={{fontSize: '14px', color: '#94a3b8', fontStyle: 'italic'}}>No transitions available</p>;
                }
                
                return allowed.map(status => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(statusModal.task.id || statusModal.task._id, status)}
                    disabled={changingStatus}
                    style={{
                      padding: '14px 20px',
                      backgroundColor: status === 'ACTIVE' ? '#dbeafe' : status === 'COMPLETED' ? '#dcfce7' : status === 'CANCELLED' ? '#f3f4f6' : '#f8fafc',
                      color: status === 'ACTIVE' ? '#1d4ed8' : status === 'COMPLETED' ? '#15803d' : status === 'CANCELLED' ? '#6b7280' : '#334155',
                      fontSize: '14px',
                      fontWeight: '600',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: changingStatus ? 'not-allowed' : 'pointer',
                      opacity: changingStatus ? 0.6 : 1,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>{status === 'ACTIVE' ? 'Start Task' : status === 'COMPLETED' ? 'Mark Complete' : 'Cancel Task'}</span>
                    <span style={{fontSize: '12px', opacity: 0.7}}>{status}</span>
                  </button>
                ));
              })()}
            </div>
            
            <button
              onClick={() => setStatusModal({ open: false, task: null })}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: 'transparent',
                color: '#64748b',
                fontSize: '14px',
                fontWeight: '600',
                borderRadius: '12px',
                border: '2px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: #e2e8f0;
          border-radius: 10px;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(99,102,241,0.4);
        }
      `}</style>
    </div>
  );
};

export default Tasks;