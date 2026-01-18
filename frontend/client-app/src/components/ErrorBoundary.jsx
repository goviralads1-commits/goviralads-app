import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log error for debugging (can be sent to error tracking service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check for auth-related errors
    if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('token')) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }

  handleRetry = () => {
    this.setState(prev => ({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: prev.retryCount + 1 
    }));
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
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
            padding: '40px',
            maxWidth: '420px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            border: '1px solid #f1f5f9'
          }}>
            {/* Error Icon */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(239,68,68,0.15)'
            }}>
              <span style={{ fontSize: '36px' }}>⚠️</span>
            </div>

            {/* Title */}
            <h1 style={{
              fontSize: '22px',
              fontWeight: '800',
              color: '#0f172a',
              margin: '0 0 12px'
            }}>
              Something went wrong
            </h1>

            {/* Description */}
            <p style={{
              fontSize: '15px',
              color: '#64748b',
              margin: '0 0 28px',
              lineHeight: 1.6
            }}>
              We encountered an unexpected error. This might be a temporary issue.
              {this.state.retryCount > 0 && (
                <span style={{ display: 'block', marginTop: '8px', color: '#f59e0b', fontWeight: '600' }}>
                  Retry attempts: {this.state.retryCount}
                </span>
              )}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={this.handleRetry}
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
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)';
                }}
              >
                Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  fontSize: '15px',
                  fontWeight: '600',
                  borderRadius: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              >
                Go to Dashboard
              </button>

              {this.state.retryCount >= 2 && (
                <button
                  onClick={this.handleLogout}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '15px',
                    fontWeight: '600',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Sign Out & Try Again
                </button>
              )}
            </div>

            {/* Error Details (collapsible) */}
            {this.state.error && (
              <details style={{ marginTop: '24px', textAlign: 'left' }}>
                <summary style={{
                  fontSize: '13px',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  Technical Details
                </summary>
                <pre style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#64748b',
                  overflow: 'auto',
                  maxHeight: '120px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack && (
                    <span style={{ display: 'block', marginTop: '8px', opacity: 0.7 }}>
                      {this.state.errorInfo.componentStack.slice(0, 300)}...
                    </span>
                  )}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
