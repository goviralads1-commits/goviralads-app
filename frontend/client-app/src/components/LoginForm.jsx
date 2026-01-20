import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/authService';
import api from '../services/api';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState({ appName: 'TaskFlow Pro', tagline: 'Your productivity partner', logoUrl: '', accentColor: '#6366f1' });
  const navigate = useNavigate();

  useEffect(() => {
    // Try to fetch public branding settings
    const fetchBranding = async () => {
      try {
        const res = await api.get('/public/branding');
        if (res.data) {
          setBranding({
            appName: res.data.appName || 'TaskFlow Pro',
            tagline: res.data.tagline || 'Your productivity partner',
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('[CLIENT LOGIN] ========== Starting login ==========');
    console.log('[CLIENT LOGIN] Email:', email);
    console.log('[CLIENT LOGIN] Password length:', password.length);
    console.log('[CLIENT LOGIN] User agent:', navigator.userAgent);
    console.log('[CLIENT LOGIN] Online:', navigator.onLine);

    try {
      console.log('[CLIENT LOGIN] Calling login service...');
      const { user } = await login(email, password);
      
      console.log('[CLIENT LOGIN] Login response received');
      console.log('[CLIENT LOGIN] User role:', user.role);
      
      // Validate role - CLIENT panel requires CLIENT role
      if (user.role !== 'CLIENT') {
        console.log('[CLIENT LOGIN] ❌ Access denied - not CLIENT role');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setError('Access denied. Client credentials required.');
        return;
      }
      
      console.log('[CLIENT LOGIN] ✓✓✓ Success - redirecting to dashboard');
      navigate('/dashboard');
    } catch (err) {
      console.error('[CLIENT LOGIN] ❌ Error:', err.message);
      console.error('[CLIENT LOGIN] Error details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log('[CLIENT LOGIN] ==========================================');
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
      <div style={{
        width: '100%',
        maxWidth: '400px'
      }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
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
                boxShadow: '0 8px 24px rgba(34, 197, 94, 0.25)'
              }}
            />
          ) : (
            <div style={{
              width: '64px',
              height: '64px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 24px rgba(34, 197, 94, 0.25)'
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
            Welcome Back
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748b',
            margin: 0
          }}>
            {branding.tagline || 'Sign in to your portal'}
          </p>
        </div>

        {/* Login Card */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          padding: '32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
          border: '1px solid #f1f5f9'
        }}>
          <form onSubmit={handleSubmit}>
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

            {/* Email Field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  fontSize: '15px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '12px',
                  outline: 'none',
                  backgroundColor: '#f8fafc',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6366f1';
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0';
                  e.target.style.backgroundColor = '#f8fafc';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '14px 48px 14px 16px',
                    fontSize: '15px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    outline: 'none',
                    backgroundColor: '#f8fafc',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#6366f1';
                    e.target.style.backgroundColor = '#fff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.backgroundColor = '#f8fafc';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#6366f1'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px 24px',
                backgroundColor: loading ? '#a5b4fc' : '#6366f1',
                color: '#fff',
                fontSize: '15px',
                fontWeight: '600',
                border: 'none',
                borderRadius: '12px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.25)'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#6366f1';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {loading && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              )}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer Text */}
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#94a3b8',
          marginTop: '24px'
        }}>
          {branding.appName || 'TaskFlow Pro'} • Client Portal
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default LoginForm;
