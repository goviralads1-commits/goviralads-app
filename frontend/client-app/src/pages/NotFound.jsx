import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '24px',
        padding: '48px 40px',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #f1f5f9'
      }}>
        {/* 404 Icon */}
        <div style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 28px',
          boxShadow: '0 8px 24px rgba(99,102,241,0.15)'
        }}>
          <span style={{ fontSize: '48px' }}>🔍</span>
        </div>

        {/* Error Code */}
        <p style={{
          fontSize: '64px',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 8px'
        }}>
          404
        </p>

        {/* Title */}
        <h1 style={{
          fontSize: '22px',
          fontWeight: '700',
          color: '#0f172a',
          margin: '0 0 12px'
        }}>
          Page Not Found
        </h1>

        {/* Description */}
        <p style={{
          fontSize: '15px',
          color: '#64748b',
          margin: '0 0 32px',
          lineHeight: 1.6
        }}>
          The page you're looking for doesn't exist or has been moved to a new location.
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '700',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
          >
            Go Back
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            style={{
              width: '100%',
              padding: '14px 24px',
              backgroundColor: '#f1f5f9',
              color: '#475569',
              fontSize: '15px',
              fontWeight: '600',
              borderRadius: '14px',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
