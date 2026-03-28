import React from 'react';

// Import preset SVG icons (Vite imports as URLs)
import instagramIconUrl from '../assets/icons/presets/instagram.svg';
import facebookIconUrl from '../assets/icons/presets/facebook.svg';
import youtubeIconUrl from '../assets/icons/presets/youtube.svg';
import googleIconUrl from '../assets/icons/presets/google.svg';
import adsIconUrl from '../assets/icons/presets/ads.svg';
import seoIconUrl from '../assets/icons/presets/seo.svg';
import scriptIconUrl from '../assets/icons/presets/script.svg';
import editingIconUrl from '../assets/icons/presets/editing.svg';

// Preset icon configuration (using URLs)
export const PRESET_ICONS_CONFIG = {
  instagram: { name: 'Instagram', url: instagramIconUrl, color: '#E4405F' },
  facebook: { name: 'Facebook', url: facebookIconUrl, color: '#1877F2' },
  youtube: { name: 'YouTube', url: youtubeIconUrl, color: '#FF0000' },
  google: { name: 'Google', url: googleIconUrl, color: '#4285F4' },
  ads: { name: 'Ads', url: adsIconUrl, color: '#F4B400' },
  seo: { name: 'SEO', url: seoIconUrl, color: '#34A853' },
  script: { name: 'Script', url: scriptIconUrl, color: '#9333EA' },
  editing: { name: 'Editing', url: editingIconUrl, color: '#F97316' },
};

// Get preset icon URL by name
export const getPresetIconUrl = (iconName) => {
  const config = PRESET_ICONS_CONFIG[iconName];
  return config?.url || null;
};

// Check if preset exists
export const isValidPreset = (iconName) => {
  return iconName in PRESET_ICONS_CONFIG;
};

// Preset Icon Renderer Component (renders as img)
export const PresetIcon = ({ 
  name, 
  size = 20, 
  color = null,
  style = {},
  ...props 
}) => {
  const iconUrl = getPresetIconUrl(name);
  
  if (!iconUrl) {
    return null;
  }
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        ...style,
      }}
      {...props}
    >
      <img 
        src={iconUrl} 
        alt={name}
        width={size} 
        height={size} 
        style={{ display: 'block', objectFit: 'contain' }}
      />
    </span>
  );
};

// Default Flag Icon (used as fallback)
export const DefaultFlagIcon = ({ size = 20, color = '#3b82f6', style = {}, ...props }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      color,
      ...style,
    }}
    {...props}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
      <line x1="4" y1="22" x2="4" y2="15"></line>
    </svg>
  </span>
);

export default PresetIcon;
