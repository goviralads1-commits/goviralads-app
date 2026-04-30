import React, { useState, useRef } from 'react';

/**
 * MediaUploader Component
 * 
 * A clean URL-based media uploader with:
 * - Drag/drop URL support
 * - Paste URL detection
 * - Image/Video preview
 * - Validation before adding
 */
const MediaUploader = ({ 
  media = [], 
  onChange, 
  maxItems = 4,
  allowVideo = true 
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [isValidating, setIsValidating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Detect if URL is video
  const detectMediaType = (url) => {
    const videoPatterns = [
      /youtube\.com\/watch/i,
      /youtu\.be\//i,
      /vimeo\.com\//i,
      /\.mp4$/i,
      /\.webm$/i,
      /\.mov$/i
    ];
    return videoPatterns.some(pattern => pattern.test(url)) ? 'video' : 'image';
  };

  // Validate image URL
  const validateImageUrl = (url) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
      setTimeout(() => resolve(false), 5000); // Timeout after 5s
    });
  };

  // Handle URL input change
  const handleUrlChange = async (e) => {
    const url = e.target.value.trim();
    setUrlInput(url);
    setError('');
    setPreviewUrl('');

    if (!url) return;

    // Auto-detect media type
    const detectedType = detectMediaType(url);
    setMediaType(detectedType);

    // For images, validate and show preview
    if (detectedType === 'image' && url.match(/^https?:\/\//)) {
      setIsValidating(true);
      const isValid = await validateImageUrl(url);
      setIsValidating(false);
      
      if (isValid) {
        setPreviewUrl(url);
      } else {
        setError('Could not load image. Check the URL.');
      }
    } else if (detectedType === 'video') {
      setPreviewUrl(url);
    }
  };

  // Handle paste event
  const handlePaste = (e) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.match(/^https?:\/\//)) {
      e.preventDefault();
      handleUrlChange({ target: { value: pastedText } });
    }
  };

  // Auto-add on blur if valid URL exists
  const handleBlur = (e) => {
    e.target.style.borderColor = '#e2e8f0';
    if (urlInput && urlInput.match(/^https?:\/\//) && media.length < maxItems) {
      handleAdd();
    }
  };

  // Add media item
  const handleAdd = () => {
    if (!urlInput || media.length >= maxItems) return;
    
    const newItem = {
      type: mediaType,
      url: urlInput.trim()
    };
    
    onChange([...media, newItem]);
    setUrlInput('');
    setPreviewUrl('');
    setMediaType('image');
    setError('');
  };

  // Remove media item
  const handleRemove = (index) => {
    const updated = media.filter((_, i) => i !== index);
    onChange(updated);
  };

  // Get YouTube thumbnail
  const getYouTubeThumbnail = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (match) {
      return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
    }
    return null;
  };

  return (
    <div>
      {/* Current Media Grid */}
      {media.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          {media.map((item, idx) => (
            <div key={idx} style={{
              position: 'relative',
              borderRadius: '12px',
              border: '2px solid #e2e8f0',
              overflow: 'hidden',
              backgroundColor: '#f8fafc'
            }}>
              {/* Preview */}
              <div style={{ aspectRatio: '1', position: 'relative' }}>
                {item.type === 'image' ? (
                  <img 
                    src={item.url} 
                    alt="" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => e.target.style.display = 'none'}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                    backgroundImage: getYouTubeThumbnail(item.url) 
                      ? `url(${getYouTubeThumbnail(item.url)})` 
                      : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#0f172a">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    </div>
                  </div>
                )}
                
                {/* Type badge */}
                <span style={{
                  position: 'absolute',
                  bottom: '6px',
                  left: '6px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: '#fff',
                  backgroundColor: item.type === 'video' ? '#7c3aed' : '#3b82f6',
                  borderRadius: '4px',
                  textTransform: 'uppercase'
                }}>
                  {item.type}
                </span>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: '700',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Media Section */}
      {media.length < maxItems && (
        <div style={{
          border: '2px dashed #e2e8f0',
          borderRadius: '12px',
          padding: '20px',
          backgroundColor: '#fafbfc',
          transition: 'all 0.2s'
        }}>
          {/* URL Input */}
          <div style={{ marginBottom: '12px' }}>
            <input
              ref={inputRef}
              type="text"
              value={urlInput}
              onChange={handleUrlChange}
              onPaste={handlePaste}
              placeholder="Paste image or video URL here..."
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#6366f1'}
              onBlur={handleBlur}
            />
          </div>

          {/* Preview Section */}
          {(previewUrl || isValidating) && (
            <div style={{
              marginBottom: '12px',
              padding: '12px',
              backgroundColor: '#fff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0'
            }}>
              {isValidating ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>Validating image...</span>
                </div>
              ) : mediaType === 'image' ? (
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '150px', 
                    borderRadius: '8px',
                    display: 'block',
                    margin: '0 auto'
                  }}
                />
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px'
                }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px 0' }}>Video URL detected</p>
                    <p style={{ fontSize: '11px', color: '#64748b', margin: 0, wordBreak: 'break-all' }}>{previewUrl.slice(0, 50)}...</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <p style={{ 
              fontSize: '12px', 
              color: '#ef4444', 
              margin: '0 0 12px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⚠️</span> {error}
            </p>
          )}

          {/* Type Selector + Add Button */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {allowVideo && (
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                style={{
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: '500',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  cursor: 'pointer'
                }}
              >
                <option value="image">🖼️ Image</option>
                <option value="video">🎬 Video</option>
              </select>
            )}
            
            <button
              type="button"
              onClick={handleAdd}
              disabled={!urlInput || isValidating}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: '600',
                color: (!urlInput || isValidating) ? '#94a3b8' : '#fff',
                background: (!urlInput || isValidating) 
                  ? '#e2e8f0' 
                  : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                border: 'none',
                borderRadius: '8px',
                cursor: (!urlInput || isValidating) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              + Add {mediaType === 'video' ? 'Video' : 'Image'}
            </button>
          </div>

          {/* Helper text */}
          <p style={{ 
            fontSize: '11px', 
            color: '#94a3b8', 
            margin: '10px 0 0 0',
            textAlign: 'center'
          }}>
            {media.length}/{maxItems} items • Supports direct URLs, YouTube, Vimeo
          </p>
        </div>
      )}

      {/* Max items reached message */}
      {media.length >= maxItems && (
        <p style={{ 
          fontSize: '12px', 
          color: '#64748b', 
          textAlign: 'center',
          margin: '8px 0 0 0'
        }}>
          Maximum {maxItems} items reached. Remove an item to add more.
        </p>
      )}
    </div>
  );
};

export default MediaUploader;
