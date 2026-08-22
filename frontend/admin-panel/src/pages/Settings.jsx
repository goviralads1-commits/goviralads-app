import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [formData, setFormData] = useState({
    agencyName: '',
    agencyAddress: '',
    supportEmail: '',
    gstNumber: '',
    logoUrl: '',
    phoneNumber: '',
    websiteUrl: '',
    whatsappNumber: '',
    socialLinks: { facebook: '', instagram: '', twitter: '', linkedin: '', youtube: '' },
    subscriptionReminders: {
      enabled: true,
      beforeExpiry: { enabled: true, days: [7, 3, 1] },
      afterExpiry: { enabled: true, days: [1, 3, 7] },
      inAppEnabled: true,
      emailEnabled: true,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/settings');
      setFormData({
        agencyName: res.data.settings.agencyName || '',
        agencyAddress: res.data.settings.agencyAddress || '',
        supportEmail: res.data.settings.supportEmail || '',
        gstNumber: res.data.settings.gstNumber || '',
        logoUrl: res.data.settings.logoUrl || '',
        phoneNumber: res.data.settings.phoneNumber || '',
        websiteUrl: res.data.settings.websiteUrl || '',
        whatsappNumber: res.data.settings.whatsappNumber || '',
        socialLinks: {
          facebook: res.data.settings.socialLinks?.facebook || '',
          instagram: res.data.settings.socialLinks?.instagram || '',
          twitter: res.data.settings.socialLinks?.twitter || '',
          linkedin: res.data.settings.socialLinks?.linkedin || '',
          youtube: res.data.settings.socialLinks?.youtube || '',
        },
        subscriptionReminders: res.data.settings.subscriptionReminders || {
          enabled: true,
          beforeExpiry: { enabled: true, days: [7, 3, 1] },
          afterExpiry: { enabled: true, days: [1, 3, 7] },
          inAppEnabled: true,
          emailEnabled: true,
        },
      });
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.patch('/admin/settings', formData);
      setToast({ type: 'success', message: 'Settings saved successfully!' });
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSocialChange = (platform, value) => {
    setFormData(prev => ({ ...prev, socialLinks: { ...prev.socialLinks, [platform]: value } }));
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Header />
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Header />
      
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '80px', right: '20px', zIndex: 9999,
          padding: '14px 20px', borderRadius: '12px',
          backgroundColor: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#15803d' : '#dc2626',
          fontWeight: '600', fontSize: '14px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}
      
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>
            Agency Settings
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
            Configure your agency branding for invoices and receipts
          </p>
        </div>

        {/* Settings Form */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '20px', padding: '32px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0'
        }}>
          {/* Agency Name */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              Agency Name *
            </label>
            <input
              type="text"
              value={formData.agencyName}
              onChange={(e) => handleChange('agencyName', e.target.value)}
              placeholder="Your Agency Name"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>
              Appears on all invoices and receipts
            </p>
          </div>

          {/* Agency Address */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              Agency Address
            </label>
            <textarea
              value={formData.agencyAddress}
              onChange={(e) => handleChange('agencyAddress', e.target.value)}
              placeholder="Full address including city, state, pincode"
              rows={3}
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box', resize: 'vertical'
              }}
            />
          </div>

          {/* Two Column Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Support Email */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                Support Email
              </label>
              <input
                type="email"
                value={formData.supportEmail}
                onChange={(e) => handleChange('supportEmail', e.target.value)}
                placeholder="support@youragency.com"
                style={{
                  width: '100%', padding: '14px 16px', fontSize: '14px',
                  border: '2px solid #e2e8f0', borderRadius: '12px',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Phone Number */}
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => handleChange('phoneNumber', e.target.value)}
                placeholder="+91 98765 43210"
                style={{
                  width: '100%', padding: '14px 16px', fontSize: '14px',
                  border: '2px solid #e2e8f0', borderRadius: '12px',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* GST Number */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              GST Number (Optional)
            </label>
            <input
              type="text"
              value={formData.gstNumber}
              onChange={(e) => handleChange('gstNumber', e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase'
              }}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>
              Will be displayed on tax invoices if provided
            </p>
          </div>

          {/* Logo URL */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              Logo URL
            </label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) => handleChange('logoUrl', e.target.value)}
              placeholder="https://yourdomain.com/logo.png"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>
              Recommended size: 200x60 pixels, PNG or JPG format
            </p>
            {formData.logoUrl && (
              <div style={{ marginTop: '12px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Preview:</p>
                <img 
                  src={formData.logoUrl} 
                  alt="Logo preview" 
                  style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>

          {/* Website URL */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              Website URL
            </label>
            <input
              type="url"
              value={formData.websiteUrl}
              onChange={(e) => handleChange('websiteUrl', e.target.value)}
              placeholder="https://youragency.com"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* WhatsApp Number */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
              WhatsApp Number
            </label>
            <input
              type="tel"
              value={formData.whatsappNumber}
              onChange={(e) => handleChange('whatsappNumber', e.target.value)}
              placeholder="+91 98765 43210"
              style={{
                width: '100%', padding: '14px 16px', fontSize: '14px',
                border: '2px solid #e2e8f0', borderRadius: '12px',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Social Links */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '12px' }}>
              Social Media Links
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {[
                { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
                { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
                { key: 'twitter', label: 'Twitter / X', placeholder: 'https://twitter.com/yourhandle' },
                { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/yourcompany' },
                { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
              ].map(social => (
                <div key={social.key}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>
                    {social.label}
                  </label>
                  <input
                    type="url"
                    value={formData.socialLinks[social.key]}
                    onChange={(e) => handleSocialChange(social.key, e.target.value)}
                    placeholder={social.placeholder}
                    style={{
                      width: '100%', padding: '12px 14px', fontSize: '13px',
                      border: '2px solid #e2e8f0', borderRadius: '10px',
                      outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Subscription Reminders */}
          <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: '#faf5ff', borderRadius: '16px', border: '2px solid #e9d5ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#6b21a8', margin: 0 }}>
                ⏳ Subscription Reminders
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: formData.subscriptionReminders.enabled ? '#15803d' : '#94a3b8' }}>
                  {formData.subscriptionReminders.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <input
                  type="checkbox"
                  checked={formData.subscriptionReminders.enabled}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    subscriptionReminders: { ...prev.subscriptionReminders, enabled: e.target.checked }
                  }))}
                  style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                />
              </label>
            </div>

            {formData.subscriptionReminders.enabled && (
              <>
                {/* Before Expiry */}
                <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: '#fff', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Before Expiry</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ fontSize: '12px', color: formData.subscriptionReminders.beforeExpiry.enabled ? '#15803d' : '#94a3b8' }}>
                        {formData.subscriptionReminders.beforeExpiry.enabled ? 'ON' : 'OFF'}
                      </span>
                      <input
                        type="checkbox"
                        checked={formData.subscriptionReminders.beforeExpiry.enabled}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          subscriptionReminders: {
                            ...prev.subscriptionReminders,
                            beforeExpiry: { ...prev.subscriptionReminders.beforeExpiry, enabled: e.target.checked }
                          }
                        }))}
                        style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                  {formData.subscriptionReminders.beforeExpiry.enabled && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                        Reminder Days (comma-separated, e.g. 7,3,1)
                      </label>
                      <input
                        type="text"
                        value={(formData.subscriptionReminders.beforeExpiry.days || []).join(', ')}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const days = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(d => Number.isInteger(d) && d >= 0);
                          setFormData(prev => ({
                            ...prev,
                            subscriptionReminders: {
                              ...prev.subscriptionReminders,
                              beforeExpiry: { ...prev.subscriptionReminders.beforeExpiry, days }
                            }
                          }));
                        }}
                        placeholder="7, 3, 1"
                        style={{
                          width: '100%', padding: '10px 12px', fontSize: '13px',
                          border: '2px solid #e9d5ff', borderRadius: '8px',
                          outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* After Expiry */}
                <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: '#fff', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>After Expiry</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ fontSize: '12px', color: formData.subscriptionReminders.afterExpiry.enabled ? '#15803d' : '#94a3b8' }}>
                        {formData.subscriptionReminders.afterExpiry.enabled ? 'ON' : 'OFF'}
                      </span>
                      <input
                        type="checkbox"
                        checked={formData.subscriptionReminders.afterExpiry.enabled}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          subscriptionReminders: {
                            ...prev.subscriptionReminders,
                            afterExpiry: { ...prev.subscriptionReminders.afterExpiry, enabled: e.target.checked }
                          }
                        }))}
                        style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
                      />
                    </label>
                  </div>
                  {formData.subscriptionReminders.afterExpiry.enabled && (
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                        Reminder Days (comma-separated, e.g. 1,3,7)
                      </label>
                      <input
                        type="text"
                        value={(formData.subscriptionReminders.afterExpiry.days || []).join(', ')}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const days = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(d => Number.isInteger(d) && d >= 0);
                          setFormData(prev => ({
                            ...prev,
                            subscriptionReminders: {
                              ...prev.subscriptionReminders,
                              afterExpiry: { ...prev.subscriptionReminders.afterExpiry, days }
                            }
                          }));
                        }}
                        placeholder="1, 3, 7"
                        style={{
                          width: '100%', padding: '10px 12px', fontSize: '13px',
                          border: '2px solid #e9d5ff', borderRadius: '8px',
                          outline: 'none', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Channel Toggles */}
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.subscriptionReminders.inAppEnabled}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        subscriptionReminders: { ...prev.subscriptionReminders, inAppEnabled: e.target.checked }
                      }))}
                      style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>In-App Notifications</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.subscriptionReminders.emailEnabled}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        subscriptionReminders: { ...prev.subscriptionReminders, emailEnabled: e.target.checked }
                      }))}
                      style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>Email Reminders</span>
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving || !formData.agencyName.trim()}
            style={{
              width: '100%', padding: '16px 24px',
              background: formData.agencyName.trim() ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : '#e2e8f0',
              color: formData.agencyName.trim() ? '#fff' : '#94a3b8',
              fontSize: '15px', fontWeight: '700', borderRadius: '14px', border: 'none',
              cursor: formData.agencyName.trim() && !saving ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: formData.agencyName.trim() ? '0 4px 14px rgba(99, 102, 241, 0.4)' : 'none'
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Info Card */}
        <div style={{
          marginTop: '24px', padding: '20px', backgroundColor: '#eff6ff',
          borderRadius: '16px', border: '1px solid #bfdbfe'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1e40af', margin: '0 0 8px 0' }}>
            💡 Where these settings appear
          </h3>
          <ul style={{ fontSize: '13px', color: '#3b82f6', margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
            <li>Invoice headers and footers</li>
            <li>Payment receipts</li>
            <li>Task completion receipts</li>
            <li>Email notifications (if configured)</li>
          </ul>
        </div>
      </div>
      
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Settings;
