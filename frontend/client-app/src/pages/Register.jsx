import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState({ appName: 'Go Viral Ads', logoUrl: '', accentColor: '#6366f1' });

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await api.get('/public/branding');
        if (res.data) {
          setBranding({
            appName: res.data.appName || 'Go Viral Ads',
            logoUrl: res.data.logoUrl || '',
            accentColor: res.data.accentColor || '#6366f1',
          });
        }
      } catch (err) {
        // Silent fail - use defaults
      }
    };
    fetchBranding();
  }, []);

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!formData.name.trim()) {
      setError('Full name is required');
      return;
    }
    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: formData.name.trim(),
        company: formData.company.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password,
      });

      setSuccess(res.data.message || 'Registration successful! Your account is awaiting admin approval.');
      setFormData({ name: '', company: '', email: '', phone: '', password: '', confirmPassword: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const accentColor = branding.accentColor || '#6366f1';

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, #22c55e10 0%, #f8fafc 50%, ${accentColor}10 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt="Logo"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                objectFit: 'cover',
                margin: '0 auto 20px',
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)'
              }}
            />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              background: `linear-gradient(135deg, ${accentColor} 0%, #8b5cf6 100%)`,
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.25)'
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8.5" cy="7" r="4" />
                <path d="M20 8v6M23 11h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <h1 style={{
            fontSize: '28px',
            fontWeight: '800',
            color: '#0f172a',
            margin: '0 0 8px 0',
            letterSpacing: '-0.025em'
          }}>
            Create Account
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
            Register for {branding.appName || 'Go Viral Ads'}
          </p>
        </div>

        {/* Register Card */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
          border: '1px solid #f1f5f9'
        }}>
          {/* Success Message */}
          {success && (
            <div style={{
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
              <p style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600', margin: '0 0 8px' }}>Registration Successful!</p>
              <p style={{ fontSize: '13px', color: '#15803d', margin: 0, lineHeight: 1.5 }}>{success}</p>
              <Link to="/login" style={{
                display: 'inline-block',
                marginTop: '16px',
                padding: '10px 24px',
                backgroundColor: '#16a34a',
                color: '#fff',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: '600'
              }}>
                Go to Login
              </Link>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: '14px', color: '#dc2626', fontWeight: '500' }}>{error}</span>
            </div>
          )}

          {!success && (
            <form onSubmit={handleSubmit}>
              {/* Full Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleChange('name')}
                  required
                  placeholder="John Doe"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Company Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={handleChange('company')}
                  placeholder="Your Company Pvt Ltd"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Email */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleChange('email')}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Phone */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                  placeholder="+91 98765 43210"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Password *
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={handleChange('password')}
                  required
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  style={{
                    width: '100%', padding: '14px 16px', fontSize: '15px',
                    border: '2px solid #e2e8f0', borderRadius: '12px',
                    outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = accentColor; e.target.style.backgroundColor = '#fff'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '16px 24px',
                  backgroundColor: loading ? '#a5b4fc' : accentColor,
                  color: '#fff', fontSize: '15px', fontWeight: '600',
                  border: 'none', borderRadius: '12px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  boxShadow: loading ? 'none' : `0 4px 12px ${accentColor}40`
                }}
              >
                {loading && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                )}
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>

        {/* Login Link */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#64748b', marginTop: '20px' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: accentColor, fontWeight: '600', textDecoration: 'none' }}>
            Sign In
          </Link>
        </p>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '16px',
          marginTop: '16px', fontSize: '12px'
        }}>
          <a href="/legal/privacy-policy" style={{ color: '#94a3b8', textDecoration: 'none' }}>Privacy Policy</a>
          <span style={{ color: '#cbd5e1' }}>•</span>
          <a href="/legal/terms-of-service" style={{ color: '#94a3b8', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Register;
