import React, { useState, useEffect } from 'react';
import { colors, radius, shadows, spacing, typography } from '../styles';

const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if user has already consented
    const hasConsented = localStorage.getItem('cookieConsent');
    if (!hasConsented) {
      // Show banner after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setIsLoading(true);
    localStorage.setItem('cookieConsent', 'accepted');
    localStorage.setItem('cookieConsentDate', new Date().toISOString());
    setTimeout(() => {
      setIsVisible(false);
      setIsLoading(false);
    }, 300);
  };

  const handleDecline = () => {
    setIsLoading(true);
    localStorage.setItem('cookieConsent', 'declined');
    localStorage.setItem('cookieConsentDate', new Date().toISOString());
    setTimeout(() => {
      setIsVisible(false);
      setIsLoading(false);
    }, 300);
  };

  if (!isVisible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.iconContainer}>
            <span style={styles.icon}>🍪</span>
          </div>
          <div style={styles.textContainer}>
            <h3 style={styles.title}>We use cookies</h3>
            <p style={styles.description}>
              We use cookies and similar technologies to enhance your experience, analyze traffic, 
              and for security purposes. By clicking "Accept", you consent to our use of cookies.
            </p>
            <div style={styles.links}>
              <a href="/legal/privacy-policy" style={styles.link}>Privacy Policy</a>
              <span style={styles.separator}>•</span>
              <a href="/legal/terms-of-service" style={styles.link}>Terms of Service</a>
            </div>
          </div>
        </div>
        <div style={styles.actions}>
          <button
            onClick={handleDecline}
            disabled={isLoading}
            style={styles.declineButton}
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={isLoading}
            style={styles.acceptButton}
          >
            {isLoading ? 'Processing...' : 'Accept All'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: spacing[4],
    paddingBottom: `calc(${spacing[4]} + env(safe-area-inset-bottom))`,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.5))',
    animation: 'slideUp 0.3s ease-out',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    background: colors.background.secondary,
    borderRadius: radius.xl,
    boxShadow: shadows.xl,
    overflow: 'hidden',
  },
  content: {
    display: 'flex',
    gap: spacing[4],
    padding: spacing[5],
    paddingBottom: spacing[3],
  },
  iconContainer: {
    flexShrink: 0,
    width: '48px',
    height: '48px',
    background: `linear-gradient(135deg, ${colors.warning.light}, ${colors.warning.main})`,
    borderRadius: radius.lg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: '24px',
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    margin: 0,
    marginBottom: spacing[2],
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    fontFamily: typography.fontFamily.sans,
  },
  description: {
    margin: 0,
    marginBottom: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed,
    fontFamily: typography.fontFamily.sans,
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing[2],
  },
  link: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    textDecoration: 'none',
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  separator: {
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
  },
  actions: {
    display: 'flex',
    gap: spacing[3],
    padding: spacing[4],
    paddingTop: 0,
    borderTop: 'none',
  },
  declineButton: {
    flex: 1,
    height: '44px',
    padding: `0 ${spacing[4]}`,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: radius.button,
    background: 'transparent',
    color: colors.text.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  acceptButton: {
    flex: 2,
    height: '44px',
    padding: `0 ${spacing[4]}`,
    border: 'none',
    borderRadius: radius.button,
    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    cursor: 'pointer',
    boxShadow: `0 4px 12px ${colors.primary[500]}40`,
    transition: 'all 0.2s ease',
  },
};

// Add keyframes for animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
if (!document.querySelector('#cookie-consent-styles')) {
  styleSheet.id = 'cookie-consent-styles';
  document.head.appendChild(styleSheet);
}

export default CookieConsent;
