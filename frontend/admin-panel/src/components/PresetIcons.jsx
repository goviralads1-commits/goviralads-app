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
  instagram: {
    name: 'Instagram',
    url: instagramIconUrl,
    color: '#E4405F',
  },
  facebook: {
    name: 'Facebook',
    url: facebookIconUrl,
    color: '#1877F2',
  },
  youtube: {
    name: 'YouTube',
    url: youtubeIconUrl,
    color: '#FF0000',
  },
  google: {
    name: 'Google',
    url: googleIconUrl,
    color: '#4285F4',
  },
  ads: {
    name: 'Ads',
    url: adsIconUrl,
    color: '#F4B400',
  },
  seo: {
    name: 'SEO',
    url: seoIconUrl,
    color: '#34A853',
  },
  script: {
    name: 'Script',
    url: scriptIconUrl,
    color: '#9333EA',
  },
  editing: {
    name: 'Editing',
    url: editingIconUrl,
    color: '#F97316',
  },
};

// Get preset icon URL by name
export const getPresetIconUrl = (iconName) => {
  const config = PRESET_ICONS_CONFIG[iconName];
  return config?.url || null;
};

// Get preset icon name
export const getPresetIconName = (iconName) => {
  return PRESET_ICONS_CONFIG[iconName]?.name || iconName;
};

// Check if preset exists
export const isValidPreset = (iconName) => {
  return iconName in PRESET_ICONS_CONFIG;
};

// Get all preset keys
export const getAllPresetKeys = () => {
  return Object.keys(PRESET_ICONS_CONFIG);
};

// Get preset icon color by name
export const getPresetIconColor = (iconName) => {
  return PRESET_ICONS_CONFIG[iconName]?.color || '#6366f1';
};

// Preset Icon Renderer Component (colored circle + white icon)
export const PresetIcon = ({ 
  name, 
  size = 20, 
  style = {},
  ...props 
}) => {
  const iconUrl = getPresetIconUrl(name);
  const bgColor = getPresetIconColor(name);
  const innerSize = Math.round(size * 0.6); // Icon is 60% of container
  
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
        borderRadius: '50%',
        backgroundColor: bgColor,
        ...style,
      }}
      {...props}
    >
      <img 
        src={iconUrl} 
        alt={name}
        width={innerSize} 
        height={innerSize} 
        style={{ 
          display: 'block', 
          objectFit: 'contain',
          filter: 'brightness(0) invert(1)' // Makes icon white
        }}
      />
    </span>
  );
};

// Default Flag Icon (purple circle + white flag)
export const DefaultFlagIcon = ({ size = 20, style = {}, ...props }) => {
  const innerSize = Math.round(size * 0.6);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: '#6366f1',
        ...style,
      }}
      {...props}
    >
      <svg
        width={innerSize}
        height={innerSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
        <line x1="4" y1="22" x2="4" y2="15"></line>
      </svg>
    </span>
  );
};

export default PresetIcon;
