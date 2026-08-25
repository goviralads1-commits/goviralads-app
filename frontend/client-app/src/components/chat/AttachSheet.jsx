import React from 'react';
import { MEDIA_LIMITS } from './mediaUpload';

// Compact attachment menu (Phase 2A). Bottom-sheet style on mobile,
// small centered card on desktop. Photo = existing Cloudinary flow,
// Video = new direct-to-R2 flow. Rendered only when media is enabled.
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 900,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  backgroundColor: 'rgba(15,23,42,0.35)',
};

const sheetStyle = {
  backgroundColor: '#fff',
  width: '100%',
  maxWidth: '420px',
  borderRadius: '16px 16px 0 0',
  padding: '10px 12px 14px',
  boxShadow: '0 -8px 30px rgba(0,0,0,0.12)',
};

const optionStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '12px 14px',
  borderRadius: '12px',
  border: 'none',
  backgroundColor: '#f8fafc',
  cursor: 'pointer',
  textAlign: 'left',
  marginBottom: '8px',
};

const iconWrapStyle = {
  width: '38px',
  height: '38px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const AttachSheet = ({ onClose, onPickPhoto, onPickVideo }) => (
  <div style={overlayStyle} onClick={onClose}>
    <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
      <div style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: '#e2e8f0', margin: '2px auto 10px' }} />
      <button style={optionStyle} onClick={onPickPhoto}>
        <span style={{ ...iconWrapStyle, backgroundColor: '#dcfce7' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="13" r="4" /></svg>
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Photo</span>
          <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Existing image upload</span>
        </span>
      </button>
      <button style={{ ...optionStyle, marginBottom: 0 }} onClick={onPickVideo}>
        <span style={{ ...iconWrapStyle, backgroundColor: '#e0e7ff' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="M16 10l6-3v10l-6-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Video</span>
          <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>MP4/WebM · max {MEDIA_LIMITS.videoMB} MB · kept 10 days</span>
        </span>
      </button>
    </div>
  </div>
);

export default AttachSheet;
