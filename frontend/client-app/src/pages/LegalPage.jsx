import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { colors, radius, shadows, spacing, typography } from '../styles';

const LegalPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPage();
  }, [slug]);

  const fetchPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_URL}/public/legal/${slug}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Page not found');
        } else {
          setError('Failed to load page');
        }
        return;
      }
      
      const data = await response.json();
      setPage(data);
    } catch (err) {
      setError('Failed to load page. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <span style={styles.errorIcon}>📄</span>
          <h2 style={styles.errorTitle}>{error}</h2>
          <button onClick={() => navigate('/')} style={styles.backButton}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={() => navigate(-1)} style={styles.backBtn}>
          <span>←</span>
        </button>
        <h1 style={styles.headerTitle}>{page?.title}</h1>
        <div style={{ width: 44 }} />
      </header>
      
      <main style={styles.main}>
        <article style={styles.article}>
          <div 
            style={styles.content}
            dangerouslySetInnerHTML={{ __html: page?.content || '' }}
          />
          
          {page?.lastUpdated && (
            <p style={styles.lastUpdated}>
              Last updated: {new Date(page.lastUpdated).toLocaleDateString()}
            </p>
          )}
        </article>
      </main>
      
      <footer style={styles.footer}>
        <div style={styles.footerLinks}>
          <a href="/legal/privacy-policy" style={styles.footerLink}>Privacy Policy</a>
          <span style={styles.footerSeparator}>•</span>
          <a href="/legal/terms-of-service" style={styles.footerLink}>Terms</a>
          <span style={styles.footerSeparator}>•</span>
          <a href="/legal/contact-us" style={styles.footerLink}>Contact</a>
        </div>
        <p style={styles.footerCopyright}>© {new Date().getFullYear()} TaskFlow Pro. All rights reserved.</p>
      </footer>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: colors.background.primary,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing[3]} ${spacing[4]}`,
    paddingTop: `calc(${spacing[3]} + env(safe-area-inset-top))`,
    background: colors.background.secondary,
    borderBottom: `1px solid ${colors.border.primary}`,
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  backBtn: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.background.tertiary,
    border: 'none',
    borderRadius: radius.lg,
    cursor: 'pointer',
    fontSize: '20px',
    color: colors.text.primary,
  },
  headerTitle: {
    margin: 0,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    fontFamily: typography.fontFamily.sans,
  },
  main: {
    flex: 1,
    padding: spacing[4],
    maxWidth: '800px',
    width: '100%',
    margin: '0 auto',
  },
  article: {
    background: colors.background.secondary,
    borderRadius: radius.xl,
    padding: spacing[6],
    boxShadow: shadows.card,
  },
  content: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    fontFamily: typography.fontFamily.sans,
  },
  lastUpdated: {
    marginTop: spacing[6],
    paddingTop: spacing[4],
    borderTop: `1px solid ${colors.border.primary}`,
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  loadingContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: `3px solid ${colors.border.primary}`,
    borderTopColor: colors.primary[500],
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.sans,
  },
  errorContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    padding: spacing[6],
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: '64px',
    marginBottom: spacing[2],
  },
  errorTitle: {
    margin: 0,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    fontFamily: typography.fontFamily.sans,
  },
  backButton: {
    marginTop: spacing[4],
    padding: `${spacing[3]} ${spacing[6]}`,
    background: `linear-gradient(135deg, ${colors.primary[500]}, ${colors.primary[600]})`,
    color: '#fff',
    border: 'none',
    borderRadius: radius.button,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    cursor: 'pointer',
    fontFamily: typography.fontFamily.sans,
  },
  footer: {
    padding: spacing[6],
    paddingBottom: `calc(${spacing[6]} + env(safe-area-inset-bottom))`,
    textAlign: 'center',
    background: colors.background.secondary,
    borderTop: `1px solid ${colors.border.primary}`,
  },
  footerLinks: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[3],
  },
  footerLink: {
    color: colors.text.secondary,
    textDecoration: 'none',
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
  },
  footerSeparator: {
    color: colors.text.tertiary,
  },
  footerCopyright: {
    margin: 0,
    color: colors.text.tertiary,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
  },
};

// Add spinner animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
if (!document.querySelector('#legal-page-styles')) {
  styleSheet.id = 'legal-page-styles';
  document.head.appendChild(styleSheet);
}

export default LegalPage;
