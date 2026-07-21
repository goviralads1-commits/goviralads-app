import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { colors, radius, shadows, spacing, typography } from '../styles';

const LegalPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agencyInfo, setAgencyInfo] = useState(null);

  useEffect(() => {
    fetchPage();
    fetchAgencyInfo();
  }, [slug]);

  const fetchAgencyInfo = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) return;
      const response = await fetch(`${API_URL}/public/agency-info`);
      if (response.ok) {
        setAgencyInfo(await response.json());
      }
    } catch (err) {
      // Silent fail
    }
  };

  const fetchPage = async () => {
    setLoading(true);
    setError(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) {
        throw new Error('VITE_API_URL not defined');
      }
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

  // Replace TaskFlowPro placeholder content with dynamic agency info values
  const processedContent = (() => {
    let content = page?.content || '';
    if (agencyInfo && content) {
      if (agencyInfo.agencyName) {
        content = content.replace(/TaskFlowPro/gi, agencyInfo.agencyName);
      }
      if (agencyInfo.supportEmail) {
        content = content.replace(/[a-zA-Z0-9._%+-]+@taskflowpro\.com/gi, agencyInfo.supportEmail);
      }
      if (agencyInfo.agencyAddress) {
        content = content.replace(/\[Your Business Address\]/gi, agencyInfo.agencyAddress);
        content = content.replace(/\[Your Address\]/gi, agencyInfo.agencyAddress);
        content = content.replace(/\[Address\]/gi, agencyInfo.agencyAddress);
      }
      if (agencyInfo.phoneNumber) {
        content = content.replace(/\[Your Phone[^\]]*\]/gi, agencyInfo.phoneNumber);
        content = content.replace(/\[Phone[^\]]*\]/gi, agencyInfo.phoneNumber);
      }
      if (agencyInfo.whatsappNumber) {
        content = content.replace(/\[Your WhatsApp[^\]]*\]/gi, agencyInfo.whatsappNumber);
        content = content.replace(/\[WhatsApp[^\]]*\]/gi, agencyInfo.whatsappNumber);
      }
      if (agencyInfo.websiteUrl) {
        content = content.replace(/https?:\/\/[^\s"'<]*taskflowpro\.com[^\s"'<]*/gi, agencyInfo.websiteUrl);
      }
      // Clean up any remaining bracket placeholders
      content = content.replace(/\[Your [^\]]*\]/gi, '');
      content = content.replace(/\[Placeholder[^\]]*\]/gi, '');
      // Replace [CONFIRM: ...] placeholders from seeded legal page content
      if (agencyInfo.agencyAddress) {
        content = content.replace(/\[CONFIRM:\s*Registered Business Address\]/gi, agencyInfo.agencyAddress);
        content = content.replace(/\[CONFIRM:\s*City,\s*State,\s*PIN Code\]/gi, '');
        content = content.replace(/\[CONFIRM:\s*Country\]/gi, '');
      }
      if (agencyInfo.phoneNumber) {
        content = content.replace(/\[CONFIRM:\s*Contact Phone Number\]/gi, agencyInfo.phoneNumber);
      }
      // Remove any remaining [CONFIRM: ...] placeholders that have no value
      content = content.replace(/\[CONFIRM:[^\]]*\]/gi, '');
    }
    return content;
  })();

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
            dangerouslySetInnerHTML={{ __html: processedContent }}
          />
          
          {page?.lastUpdated && (
            <p style={styles.lastUpdated}>
              Last updated: {new Date(page.lastUpdated).toLocaleDateString()}
            </p>
          )}
        </article>

        {slug === 'contact-us' && agencyInfo && (
          <div style={{ marginTop: spacing[6], padding: spacing[6], background: colors.background.tertiary, borderRadius: radius.xl }}>
            <h3 style={{ margin: '0 0 16px', fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, fontFamily: typography.fontFamily.sans }}>
              {agencyInfo.agencyName || 'Contact Us'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {agencyInfo.agencyAddress && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '18px' }}>📍</span>
                  <span style={{ fontSize: typography.fontSize.base, color: colors.text.secondary, lineHeight: 1.6, fontFamily: typography.fontFamily.sans }}>{agencyInfo.agencyAddress}</span>
                </div>
              )}
              {agencyInfo.supportEmail && (
                <a href={`mailto:${agencyInfo.supportEmail}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', textDecoration: 'none' }}>
                  <span style={{ fontSize: '18px' }}>✉️</span>
                  <span style={{ fontSize: typography.fontSize.base, color: colors.primary[500], fontFamily: typography.fontFamily.sans }}>{agencyInfo.supportEmail}</span>
                </a>
              )}
              {agencyInfo.phoneNumber && (
                <a href={`tel:${agencyInfo.phoneNumber}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', textDecoration: 'none' }}>
                  <span style={{ fontSize: '18px' }}>📞</span>
                  <span style={{ fontSize: typography.fontSize.base, color: colors.primary[500], fontFamily: typography.fontFamily.sans }}>{agencyInfo.phoneNumber}</span>
                </a>
              )}
              {agencyInfo.whatsappNumber && (
                <a href={`https://wa.me/${agencyInfo.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: '10px', alignItems: 'center', textDecoration: 'none' }}>
                  <span style={{ fontSize: '18px' }}>💬</span>
                  <span style={{ fontSize: typography.fontSize.base, color: colors.primary[500], fontFamily: typography.fontFamily.sans }}>{agencyInfo.whatsappNumber}</span>
                </a>
              )}
              {agencyInfo.websiteUrl && (
                <a href={agencyInfo.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', gap: '10px', alignItems: 'center', textDecoration: 'none' }}>
                  <span style={{ fontSize: '18px' }}>🌐</span>
                  <span style={{ fontSize: typography.fontSize.base, color: colors.primary[500], fontFamily: typography.fontFamily.sans }}>{agencyInfo.websiteUrl}</span>
                </a>
              )}
              {agencyInfo.socialLinks && Object.keys(agencyInfo.socialLinks).length > 0 && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                  {agencyInfo.socialLinks.facebook && <a href={agencyInfo.socialLinks.facebook} target="_blank" rel="noopener noreferrer" style={{ fontSize: '24px', textDecoration: 'none' }}>📘</a>}
                  {agencyInfo.socialLinks.instagram && <a href={agencyInfo.socialLinks.instagram} target="_blank" rel="noopener noreferrer" style={{ fontSize: '24px', textDecoration: 'none' }}>📷</a>}
                  {agencyInfo.socialLinks.twitter && <a href={agencyInfo.socialLinks.twitter} target="_blank" rel="noopener noreferrer" style={{ fontSize: '24px', textDecoration: 'none' }}>🐦</a>}
                  {agencyInfo.socialLinks.linkedin && <a href={agencyInfo.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" style={{ fontSize: '24px', textDecoration: 'none' }}>💼</a>}
                  {agencyInfo.socialLinks.youtube && <a href={agencyInfo.socialLinks.youtube} target="_blank" rel="noopener noreferrer" style={{ fontSize: '24px', textDecoration: 'none' }}>▶️</a>}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      <footer style={styles.footer}>
        <div style={styles.footerLinks}>
          <span onClick={() => navigate('/legal/privacy-policy')} style={{ ...styles.footerLink, cursor: 'pointer' }}>Privacy Policy</span>
          <span style={styles.footerSeparator}>•</span>
          <span onClick={() => navigate('/legal/terms-of-service')} style={{ ...styles.footerLink, cursor: 'pointer' }}>Terms</span>
          <span style={styles.footerSeparator}>•</span>
          <span onClick={() => navigate('/legal/contact-us')} style={{ ...styles.footerLink, cursor: 'pointer' }}>Contact</span>
        </div>
        <p style={styles.footerCopyright}>© {new Date().getFullYear()} {agencyInfo?.agencyName || 'Go Viral Ads'}. All rights reserved.</p>
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
