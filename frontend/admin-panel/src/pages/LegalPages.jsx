import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Header from '../components/Header';

const LegalPages = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [contactData, setContactData] = useState({
    agencyName: '',
    supportEmail: '',
    businessEmail: '',
    officeAddress: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
    businessHours: '',
    responseTime: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    fetchPages();
  }, []);

  const fetchPages = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/legal-pages');
      setPages(res.data.pages || []);
    } catch (err) {
      showToast('Failed to load pages', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleSelectPage = async (page) => {
    setSelectedPage(page);
    setEditMode(false);
    
    if (page.slug === 'contact-us') {
      // Parse existing content to extract values
      await loadContactData(page);
    }
  };

  const loadContactData = async (page) => {
    // Also fetch agency info for defaults
    try {
      const settingsRes = await api.get('/admin/settings');
      const settings = settingsRes.data || {};
      
      // Parse content to extract existing values (basic extraction)
      const content = page.content || '';
      
      setContactData({
        agencyName: settings.agencyName || 'Go Viral Ads',
        supportEmail: settings.supportEmail || 'support@goviralads.com',
        businessEmail: extractEmail(content, 'business') || 'business@goviralads.com',
        officeAddress: extractBetween(content, '<strong>', '</strong>') || '',
        city: extractBetween(content, 'City', ',') || '',
        state: extractBetween(content, ',', 'ZIP') || '',
        zip: extractBetween(content, 'State,', '</strong>') || '',
        country: extractAfter(content, 'Country') || 'India',
        phone: settings.phoneNumber || '',
        businessHours: extractSection(content, 'Business Hours') || 'Monday - Friday: 10:00 AM - 7:00 PM (IST)',
        responseTime: extractSection(content, 'Response Time') || 'We aim to respond to all inquiries within 24-48 business hours.',
      });
    } catch (err) {
      console.error('Failed to load contact data', err);
    }
  };

  const extractEmail = (content, type) => {
    const regex = new RegExp(`${type}[@a-zA-Z0-9._-]+`, 'gi');
    const match = content.match(regex);
    return match ? match[0] : '';
  };

  const extractBetween = (content, start, end) => {
    const regex = new RegExp(`${start}([^${end}]+)${end}`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const extractAfter = (content, marker) => {
    const idx = content.indexOf(marker);
    if (idx === -1) return '';
    const after = content.substring(idx + marker.length);
    const match = after.match(/<p>([^<]+)<\/p>/);
    return match ? match[1].trim() : '';
  };

  const extractSection = (content, heading) => {
    const regex = new RegExp(`<h3>${heading}</h3>\\s*<p>([^<]+)</p>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const generateContactContent = () => {
    return `<h2>Contact Us</h2>
<p><strong>${contactData.agencyName}</strong> (goviralads.com)</p>

<h3>Get in Touch</h3>
<p>We are here to help. If you have any questions, concerns, or feedback, please reach out to us using the information below.</p>

<h3>Technical Support</h3>
<p>For technical support, account issues, or service-related inquiries:</p>
<p>Email: ${contactData.supportEmail}</p>

<h3>Business Inquiries</h3>
<p>For partnerships, collaborations, or business opportunities:</p>
<p>Email: ${contactData.businessEmail}</p>

<h3>Registered Office</h3>
<p>${contactData.officeAddress}</p>
<p>${contactData.city}, ${contactData.state} ${contactData.zip}</p>
<p>${contactData.country}</p>

${contactData.phone ? `<h3>Phone</h3>
<p>${contactData.phone}</p>` : ''}

<h3>Business Hours</h3>
<p>${contactData.businessHours}</p>

<h3>Response Time</h3>
<p>${contactData.responseTime}</p>

<h3>Support Through Platform</h3>
<p>Logged-in users can also raise support tickets directly through the ${contactData.agencyName} platform for faster resolution.</p>`;
  };

  const handleSaveContact = async () => {
    try {
      setSaving(true);
      
      // Update the legal page content
      const content = generateContactContent();
      await api.put('/admin/legal-pages/contact-us', {
        title: 'Contact Us',
        content,
        metaDescription: `Contact ${contactData.agencyName} - Get in touch with our support team for help and inquiries.`,
      });

      // Also update settings with key fields
      await api.patch('/admin/settings', {
        agencyName: contactData.agencyName,
        supportEmail: contactData.supportEmail,
        phoneNumber: contactData.phone,
        agencyAddress: `${contactData.officeAddress}, ${contactData.city}, ${contactData.state} ${contactData.zip}, ${contactData.country}`,
      });

      showToast('Contact page updated successfully');
      setEditMode(false);
      fetchPages();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getPageTitle = (slug) => {
    const titles = {
      'privacy-policy': 'Privacy Policy',
      'terms-of-service': 'Terms of Service',
      'refund-policy': 'Refund Policy',
      'contact-us': 'Contact Us',
      'about': 'About Us',
    };
    return titles[slug] || slug;
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Content Management</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Manage legal pages and contact information</p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b' }}>Loading pages...</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
            {/* Sidebar - Page List */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', height: 'fit-content' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#64748b', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pages</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {pages.map(page => (
                  <button
                    key={page.slug}
                    onClick={() => handleSelectPage(page)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: selectedPage?.slug === page.slug ? '#eef2ff' : 'transparent',
                      color: selectedPage?.slug === page.slug ? '#4f46e5' : '#334155',
                      fontSize: '14px',
                      fontWeight: selectedPage?.slug === page.slug ? '600' : '500',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    {getPageTitle(page.slug)}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minHeight: '500px' }}>
              {!selectedPage ? (
                <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                  <p>Select a page to edit</p>
                </div>
              ) : selectedPage.slug === 'contact-us' ? (
                /* Contact Page Editor */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>Contact Page Settings</h2>
                    {!editMode ? (
                      <button
                        onClick={() => setEditMode(true)}
                        style={{
                          padding: '10px 20px',
                          borderRadius: '10px',
                          border: 'none',
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setEditMode(false)}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveContact}
                          disabled={saving}
                          style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                          }}
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!editMode ? (
                    /* View Mode */
                    <div style={{ display: 'grid', gap: '16px' }}>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Agency Name</div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.agencyName}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Support Email</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.supportEmail}</div>
                        </div>
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Business Email</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.businessEmail}</div>
                        </div>
                      </div>
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Office Address</div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>
                          {contactData.officeAddress}<br />
                          {contactData.city}, {contactData.state} {contactData.zip}<br />
                          {contactData.country}
                        </div>
                      </div>
                      {contactData.phone && (
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Phone</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.phone}</div>
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Business Hours</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.businessHours}</div>
                        </div>
                        <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Response Time</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{contactData.responseTime}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Edit Mode */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Agency Name</label>
                        <input
                          type="text"
                          value={contactData.agencyName}
                          onChange={e => setContactData({ ...contactData, agencyName: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Technical Support Email</label>
                          <input
                            type="email"
                            value={contactData.supportEmail}
                            onChange={e => setContactData({ ...contactData, supportEmail: e.target.value })}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Business Email</label>
                          <input
                            type="email"
                            value={contactData.businessEmail}
                            onChange={e => setContactData({ ...contactData, businessEmail: e.target.value })}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Office Address</label>
                        <input
                          type="text"
                          value={contactData.officeAddress}
                          onChange={e => setContactData({ ...contactData, officeAddress: e.target.value })}
                          placeholder="Street address"
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>City</label>
                          <input
                            type="text"
                            value={contactData.city}
                            onChange={e => setContactData({ ...contactData, city: e.target.value })}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>State</label>
                          <input
                            type="text"
                            value={contactData.state}
                            onChange={e => setContactData({ ...contactData, state: e.target.value })}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>ZIP Code</label>
                          <input
                            type="text"
                            value={contactData.zip}
                            onChange={e => setContactData({ ...contactData, zip: e.target.value })}
                            style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                            onFocus={e => e.target.style.borderColor = '#6366f1'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                          />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Country</label>
                        <input
                          type="text"
                          value={contactData.country}
                          onChange={e => setContactData({ ...contactData, country: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Phone Number</label>
                        <input
                          type="tel"
                          value={contactData.phone}
                          onChange={e => setContactData({ ...contactData, phone: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Business Hours</label>
                        <textarea
                          value={contactData.businessHours}
                          onChange={e => setContactData({ ...contactData, businessHours: e.target.value })}
                          rows={2}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Response Time</label>
                        <input
                          type="text"
                          value={contactData.responseTime}
                          onChange={e => setContactData({ ...contactData, responseTime: e.target.value })}
                          style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '2px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                          onFocus={e => e.target.style.borderColor = '#6366f1'}
                          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Other Pages - Show content preview */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: 0 }}>{selectedPage.title}</h2>
                  </div>
                  <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', fontSize: '14px', color: '#64748b' }}>
                    <p>Content editing for {selectedPage.title} is available via the API.</p>
                    <p>Use <code style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>PUT /admin/legal-pages/{selectedPage.slug}</code> to update.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toast */}
        {toast.show && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '12px 20px',
            borderRadius: '10px',
            backgroundColor: toast.type === 'error' ? '#dc2626' : '#16a34a',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            animation: 'slideIn 0.3s ease',
          }}>
            {toast.message}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </>
  );
};

export default LegalPages;
