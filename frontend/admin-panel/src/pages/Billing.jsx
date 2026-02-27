import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Billing = () => {
  const [activeTab, setActiveTab] = useState('invoices');
  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ clientId: '', status: '', dateFrom: '', dateTo: '' });
  const [clients, setClients] = useState([]);

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.clientId) params.append('clientId', filters.clientId);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      
      const res = await api.get(`/admin/billing/invoices?${params.toString()}`);
      setInvoices(res.data.invoices || []);
    } catch (err) {
      showToast('Failed to fetch invoices', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch receipts
  const fetchReceipts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.clientId) params.append('clientId', filters.clientId);
      if (filters.status) params.append('status', filters.status);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      
      const res = await api.get(`/admin/billing/receipts?${params.toString()}`);
      setReceipts(res.data.receipts || []);
    } catch (err) {
      showToast('Failed to fetch receipts', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Fetch billing config
  const fetchConfig = async () => {
    try {
      setConfigLoading(true);
      const res = await api.get('/admin/billing/config');
      setConfig(res.data.config);
    } catch (err) {
      showToast('Failed to fetch billing config', 'error');
    } finally {
      setConfigLoading(false);
    }
  };

  // Fetch clients for filter
  const fetchClients = async () => {
    try {
      const res = await api.get('/admin/users?role=CLIENT&limit=100');
      setClients(res.data.users || []);
    } catch (err) {
      // Silent fail
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (activeTab === 'invoices') fetchInvoices();
    else if (activeTab === 'receipts') fetchReceipts();
    else if (activeTab === 'settings') fetchConfig();
  }, [activeTab, fetchInvoices, fetchReceipts]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Toggle download permission
  const handleToggleDownload = async (type, id, currentValue) => {
    try {
      const endpoint = type === 'invoice' 
        ? `/admin/billing/invoices/${id}/download-toggle`
        : `/admin/billing/receipts/${id}/download-toggle`;
      
      await api.patch(endpoint, { isDownloadableByClient: !currentValue });
      showToast(`Download ${!currentValue ? 'enabled' : 'disabled'} for client`);
      
      if (type === 'invoice') fetchInvoices();
      else fetchReceipts();
    } catch (err) {
      showToast('Failed to update permission', 'error');
    }
  };

  // Download PDF
  const handleDownloadPDF = async (type, id, number) => {
    try {
      const endpoint = type === 'invoice' 
        ? `/admin/billing/invoices/${id}/pdf`
        : `/admin/billing/receipts/${id}/pdf`;
      
      const res = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast('Failed to download PDF', 'error');
    }
  };

  // Save config
  const handleSaveConfig = async () => {
    try {
      setConfigLoading(true);
      await api.patch('/admin/billing/config', config);
      showToast('Billing settings saved');
    } catch (err) {
      showToast('Failed to save settings', 'error');
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header title="Billing" />
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>Billing & Invoices</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Manage invoices, receipts, and billing settings</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { id: 'invoices', label: 'Invoices', icon: '🧾' },
            { id: 'receipts', label: 'Receipts', icon: '📄' },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px',
                borderRadius: '12px', border: 'none', cursor: 'pointer',
                backgroundColor: activeTab === tab.id ? '#6366f1' : '#fff',
                color: activeTab === tab.id ? '#fff' : '#64748b',
                fontWeight: '600', fontSize: '14px',
                boxShadow: activeTab === tab.id ? '0 4px 12px rgba(99,102,241,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {/* Filters (for invoices and receipts) */}
        {(activeTab === 'invoices' || activeTab === 'receipts') && (
          <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Client</label>
                <select
                  value={filters.clientId}
                  onChange={e => setFilters({ ...filters, clientId: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">All Clients</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.identifier}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>Status</label>
                <select
                  value={filters.status}
                  onChange={e => setFilters({ ...filters, status: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', backgroundColor: '#fff' }}
                >
                  <option value="">All Status</option>
                  {activeTab === 'invoices' ? (
                    <>
                      <option value="DRAFT">Draft</option>
                      <option value="FINALIZED">Finalized</option>
                      <option value="CANCELLED">Cancelled</option>
                    </>
                  ) : (
                    <>
                      <option value="GENERATED">Generated</option>
                      <option value="CANCELLED">Cancelled</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>From Date</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>To Date</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px' }}
                />
              </div>
              <button
                onClick={() => setFilters({ clientId: '', status: '', dateFrom: '', dateTo: '' })}
                style={{ padding: '10px 16px', borderRadius: '10px', border: '2px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : invoices.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧾</div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>No invoices yet</h3>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Invoices are generated when recharge requests are approved</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Invoice #</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Client</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Amount</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Client Download</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{inv.invoiceNumber}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>{inv.clientName || inv.clientIdentifier}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{inv.clientIdentifier}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>₹{inv.amount?.toLocaleString()}</td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: inv.status === 'FINALIZED' ? '#dcfce7' : inv.status === 'DRAFT' ? '#fef9c3' : '#fee2e2', color: inv.status === 'FINALIZED' ? '#15803d' : inv.status === 'DRAFT' ? '#a16207' : '#dc2626' }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            onClick={() => handleToggleDownload('invoice', inv.id, inv.isDownloadableByClient)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', backgroundColor: inv.isDownloadableByClient ? '#dcfce7' : '#fee2e2', color: inv.isDownloadableByClient ? '#15803d' : '#dc2626' }}
                          >
                            {inv.isDownloadableByClient ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDownloadPDF('invoice', inv.id, inv.invoiceNumber)}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                          >
                            Download PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Receipts Tab */}
        {activeTab === 'receipts' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : receipts.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 8px 0' }}>No receipts yet</h3>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>Receipts are generated when tasks are purchased with wallet credits</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Receipt #</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Client</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Task</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Credits Used</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Client Download</th>
                      <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map(rcp => (
                      <tr key={rcp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{rcp.receiptNumber}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: '#0f172a' }}>{rcp.clientName || rcp.clientIdentifier}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{rcp.clientIdentifier}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '14px', color: '#0f172a', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rcp.taskTitle}</td>
                        <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{rcp.creditsUsed}</td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#64748b' }}>{new Date(rcp.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            onClick={() => handleToggleDownload('receipt', rcp.id, rcp.isDownloadableByClient)}
                            style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', backgroundColor: rcp.isDownloadableByClient ? '#dcfce7' : '#fee2e2', color: rcp.isDownloadableByClient ? '#15803d' : '#dc2626' }}
                          >
                            {rcp.isDownloadableByClient ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDownloadPDF('receipt', rcp.id, rcp.receiptNumber)}
                            style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                          >
                            Download PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 24px 0' }}>Company / Billing Details</h2>
            
            {configLoading && !config ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : config ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Name</label>
                  <input
                    type="text"
                    value={config.companyName || ''}
                    onChange={e => setConfig({ ...config, companyName: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Email</label>
                  <input
                    type="email"
                    value={config.companyEmail || ''}
                    onChange={e => setConfig({ ...config, companyEmail: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Phone</label>
                  <input
                    type="tel"
                    value={config.companyPhone || ''}
                    onChange={e => setConfig({ ...config, companyPhone: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>GST Number</label>
                  <input
                    type="text"
                    value={config.companyGST || ''}
                    onChange={e => setConfig({ ...config, companyGST: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>PAN Number</label>
                  <input
                    type="text"
                    value={config.companyPAN || ''}
                    onChange={e => setConfig({ ...config, companyPAN: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Invoice Prefix</label>
                  <input
                    type="text"
                    value={config.invoicePrefix || ''}
                    onChange={e => setConfig({ ...config, invoicePrefix: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                    placeholder="INV"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Receipt Prefix</label>
                  <input
                    type="text"
                    value={config.receiptPrefix || ''}
                    onChange={e => setConfig({ ...config, receiptPrefix: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                    placeholder="RCP"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Currency Symbol</label>
                  <input
                    type="text"
                    value={config.currencySymbol || ''}
                    onChange={e => setConfig({ ...config, currencySymbol: e.target.value })}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                    placeholder="₹"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Company Address</label>
                  <textarea
                    value={config.companyAddress || ''}
                    onChange={e => setConfig({ ...config, companyAddress: e.target.value })}
                    rows={3}
                    style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button
                    onClick={handleSaveConfig}
                    disabled={configLoading}
                    style={{ padding: '14px 28px', borderRadius: '12px', border: 'none', backgroundColor: '#6366f1', color: '#fff', fontWeight: '700', fontSize: '15px', cursor: 'pointer', opacity: configLoading ? 0.7 : 1 }}
                  >
                    {configLoading ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '14px 24px', borderRadius: '12px', backgroundColor: toast.type === 'success' ? '#dcfce7' : '#fef2f2', color: toast.type === 'success' ? '#15803d' : '#dc2626', fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000 }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
    </div>
  );
};

export default Billing;
