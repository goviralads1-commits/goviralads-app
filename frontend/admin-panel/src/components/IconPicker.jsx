import React, { useState, useRef, useEffect } from 'react';

const ICON_CATEGORIES = {
  'Work': ['📝', '📋', '📊', '📈', '📉', '📁', '📂', '🗂️', '📌', '📍', '✏️', '🖊️', '📐', '📏', '🔧', '🔨', '⚙️', '🛠️', '💼', '🎯', '✅', '❌', '⏰', '📅'],
  'Finance': ['💰', '💵', '💳', '🏦', '💎', '📈', '📉', '💹', '🧾', '🪙', '💲', '🤑', '💸', '📊', '🎰', '🏧'],
  'Status': ['🚀', '⭐', '🌟', '✨', '🔥', '💡', '⚡', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '👑', '💯', '✔️', '❗', '❓', '🔴', '🟢', '🟡', '🔵'],
  'Objects': ['📱', '💻', '🖥️', '⌨️', '🖱️', '📷', '📹', '🎥', '📺', '📻', '🎧', '🎤', '🔔', '📢', '📣', '🔑', '🔐', '🔒', '📦', '🎁', '🛒', '🛍️', '📮', '✉️'],
  'Symbols': ['♻️', '🔄', '🔁', '🔃', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '🔙', '🔚', '🔛', '🔜', '🔝', '⏸️', '⏹️', '⏺️', '⏭️', '⏮️', '▶️', '◀️'],
  'People': ['👤', '👥', '👨‍💻', '👩‍💻', '👨‍💼', '👩‍💼', '🧑‍🤝‍🧑', '🤝', '👋', '✋', '🤚', '👍', '👎', '👏', '🙌', '🤲'],
  'Nature': ['🌍', '🌎', '🌏', '🌐', '🌈', '☀️', '🌙', '⭐', '🌊', '🔥', '💧', '🌱', '🌲', '🌳', '🍀', '🌸']
};

const IconPicker = ({ value, onChange, defaultIcon = '📝' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('Work');
  const [searchQuery, setSearchQuery] = useState('');
  const [customInput, setCustomInput] = useState('');
  const pickerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (icon) => {
    onChange(icon);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      onChange(customInput.trim());
      setCustomInput('');
      setIsOpen(false);
    }
  };

  // Filter icons by search
  const getFilteredIcons = () => {
    if (!searchQuery) {
      return ICON_CATEGORIES[activeCategory] || [];
    }
    // Search across all categories
    const allIcons = Object.values(ICON_CATEGORIES).flat();
    return [...new Set(allIcons)];
  };

  const currentIcon = value || defaultIcon;

  return (
    <div ref={pickerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '600',
          color: '#6366f1',
          backgroundColor: '#ffffff',
          border: '2px solid #6366f1',
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
      >
        <span style={{ fontSize: '20px' }}>{currentIcon}</span>
        <span>Change Icon</span>
        <span style={{ fontSize: '10px', marginLeft: '4px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Picker */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: '0',
          width: '320px',
          maxWidth: '90vw',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          zIndex: 1000,
          overflow: 'hidden',
          border: '1px solid #e5e7eb'
        }}>
          {/* Header with Search */}
          <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
            <input
              type="text"
              placeholder="Search icons or enter custom..."
              value={searchQuery || customInput}
              onChange={(e) => {
                const val = e.target.value;
                if (val.length <= 2) {
                  setCustomInput(val);
                  setSearchQuery('');
                } else {
                  setSearchQuery(val);
                  setCustomInput('');
                }
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: '14px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {customInput && (
              <button
                type="button"
                onClick={handleCustomSubmit}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#fff',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Use "{customInput}" as icon
              </button>
            )}
          </div>

          {/* Category Tabs */}
          {!searchQuery && (
            <div style={{
              display: 'flex',
              gap: '4px',
              padding: '8px 12px',
              borderBottom: '1px solid #f3f4f6',
              overflowX: 'auto',
              scrollbarWidth: 'none'
            }}>
              {Object.keys(ICON_CATEGORIES).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: activeCategory === cat ? '700' : '500',
                    color: activeCategory === cat ? '#6366f1' : '#6b7280',
                    backgroundColor: activeCategory === cat ? '#eef2ff' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Icon Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '4px',
            padding: '12px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {getFilteredIcons().map((icon, idx) => (
              <button
                key={`${icon}-${idx}`}
                type="button"
                onClick={() => handleSelect(icon)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  backgroundColor: icon === currentIcon ? '#eef2ff' : '#f9fafb',
                  border: icon === currentIcon ? '2px solid #6366f1' : '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#eef2ff';
                  e.target.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = icon === currentIcon ? '#eef2ff' : '#f9fafb';
                  e.target.style.transform = 'scale(1)';
                }}
              >
                {icon}
              </button>
            ))}
          </div>

          {/* Footer with current selection */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #f3f4f6',
            backgroundColor: '#f9fafb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Current: <span style={{ fontSize: '18px' }}>{currentIcon}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IconPicker;
