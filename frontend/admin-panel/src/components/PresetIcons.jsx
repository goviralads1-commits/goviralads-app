import React from 'react';

// Import preset SVG icons
import InstagramIcon from '../assets/icons/presets/instagram.svg';
import FacebookIcon from '../assets/icons/presets/facebook.svg';
import YoutubeIcon from '../assets/icons/presets/youtube.svg';
import GoogleIcon from '../assets/icons/presets/google.svg';
import AdsIcon from '../assets/icons/presets/ads.svg';
import SeoIcon from '../assets/icons/presets/seo.svg';
import ScriptIcon from '../assets/icons/presets/script.svg';
import EditingIcon from '../assets/icons/presets/editing.svg';

// Preset icon configuration
export const PRESET_ICONS_CONFIG = {
  instagram: {
    name: 'Instagram',
    component: InstagramIcon,
    color: '#E4405F',
  },
  facebook: {
    name: 'Facebook',
    component: FacebookIcon,
    color: '#1877F2',
  },
  youtube: {
    name: 'YouTube',
    component: YoutubeIcon,
    color: '#FF0000',
  },
  google: {
    name: 'Google',
    component: GoogleIcon,
    color: '#4285F4',
  },
  ads: {
    name: 'Ads',
    component: AdsIcon,
    color: '#F4B400',
  },
  seo: {
    name: 'SEO',
    component: SeoIcon,
    color: '#34A853',
  },
  script: {
    name: 'Script',
    component: ScriptIcon,
    color: '#9333EA',
  },
  editing: {
    name: 'Editing',
    component: EditingIcon,
    color: '#F97316',
  },
};

// Get preset icon component by name
export const getPresetIcon = (iconName) => {
  const config = PRESET_ICONS_CONFIG[iconName];
  return config?.component || null;
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

// Preset Icon Renderer Component
export const PresetIcon = ({ 
  name, 
  size = 20, 
  color = null,
  style = {},
  ...props 
}) => {
  const IconComponent = getPresetIcon(name);
  
  if (!IconComponent) {
    return null;
  }
  
  const iconColor = color || PRESET_ICONS_CONFIG[name]?.color || 'currentColor';
  
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        color: iconColor,
        ...style,
      }}
      {...props}
    >
      <IconComponent 
        width={size} 
        height={size} 
        style={{ display: 'block' }}
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
