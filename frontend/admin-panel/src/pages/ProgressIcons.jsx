import React, { useState, useRef } from 'react';
import Header from '../components/Header';
import api from '../services/api';
import { useIconLibrary } from '../context/IconLibraryContext';

const ProgressIcons = () => {
  const { icons, loading, refresh } = useIconLibrary();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [iconName, setIconName] = useState('');
  const fileInputRef = useRef(null);

  // Show toast message
  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Handle file selection and upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('error', 'Invalid file type. Only PNG, SVG, JPG, WebP allowed.');
      return;
    }

    // Validate file size (max 500KB for icons)
    if (file.size > 500 * 1024) {
      showToast('error', 'File too large. Max 500KB for icons.');
      return;
    }

    // Validate icon name
    const name = iconName.trim();
    if (!name) {
      showToast('error', 'Please enter an icon name first.');
      return;
    }

    setUploading(true);

    try {
      // Create FormData for upload
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', name);

      const response = await api.post('/admin/progress-icons/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        showToast('success', 'Icon uploaded successfully!');
        setIconName('');
        refresh(); // Refresh icon library
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('error', err.response?.data?.error || 'Failed to upload icon');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle delete
  const handleDelete = async (iconId) => {
    setDeleting(iconId);
    setShowDeleteModal(null);

    try {
      const response = await api.delete(`/admin/progress-icons/${iconId}`);
      
      if (response.data.success) {
        showToast('success', 'Icon deleted successfully');
        refresh();
      }
    } catch (err) {
      console.error('Delete error:', err);
      showToast('error', err.response?.data?.error || 'Failed to delete icon');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header />
      
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '16px 24px', borderRadius: '12px',
          backgroundColor: toast.type === 'success' ? '#dcfce7' : '#fef2f2',
          color: toast.type === 'success' ? '#15803d' : '#dc2626',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: '10px',
          fontWeight: '600', fontSize: '14px'
        }}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          {toast.message}
        </div>
      )}

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', margin: '0 0 8px 0' }}>
            Progress Icons Library
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
            Upload and manage custom icons for task progress bars
          </p>
        </div>

        {/* Upload Section */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '20px', padding: '28px',
          marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #f1f5f9'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 20px 0' }}>
            Upload New Icon
          </h2>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Icon Name Input */}
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                Icon Name
              </label>
              <input
                type="text"
                value={iconName}
                onChange={(e) => setIconName(e.target.value)}
                placeholder="e.g., Custom Campaign"
                style={{
                  width: '100%', padding: '12px 16px', fontSize: '14px',
                  border: '2px solid #e2e8f0', borderRadius: '10px',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* File Input */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.svg,.jpg,.jpeg,.webp"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !iconName.trim()}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: '600',
                  backgroundColor: uploading || !iconName.trim() ? '#e2e8f0' : '#6366f1',
                  color: uploading || !iconName.trim() ? '#94a3b8' : '#fff',
                  border: 'none', borderRadius: '10px', cursor: uploading || !iconName.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                {uploading ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <span>📤</span>
                    Select & Upload
                  </>
                )}
              </button>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px', marginBottom: 0 }}>
            Accepted formats: PNG, SVG, JPG, WebP • Max size: 500KB • Recommended: 64x64px or 128x128px
          </p>
        </div>

        {/* Icons Grid */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '20px', padding: '28px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Your Icons ({icons.length})
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Loading icons...</p>
            </div>
          ) : icons.length === 0 ? (
            <div style={{
              padding: '48px', textAlign: 'center',
              backgroundColor: '#f8fafc', borderRadius: '16px',
              border: '2px dashed #e2e8f0'
            }}>
              <p style={{ fontSize: '48px', margin: '0 0 16px 0' }}>🎨</p>
              <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 8px 0', fontWeight: '600' }}>
                No custom icons yet
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                Upload your first icon to use in task progress bars
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '16px'
            }}>
              {icons.map((icon) => (
                <div
                  key={icon._id}
                  style={{
                    backgroundColor: '#f8fafc', borderRadius: '14px', padding: '20px',
                    textAlign: 'center', position: 'relative',
                    border: '2px solid #e2e8f0', transition: 'all 0.15s ease'
                  }}
                >
                  {/* Delete Button */}
                  <button
                    onClick={() => setShowDeleteModal(icon)}
                    disabled={deleting === icon._id}
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      width: '28px', height: '28px', borderRadius: '8px',
                      backgroundColor: '#fef2f2', color: '#dc2626',
                      border: 'none', cursor: 'pointer', fontSize: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: deleting === icon._id ? 0.5 : 1
                    }}
                  >
                    {deleting === icon._id ? '...' : '✕'}
                  </button>

                  {/* Icon Preview */}
                  <div style={{
                    width: '48px', height: '48px', margin: '0 auto 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#fff', borderRadius: '10px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <img
                      src={icon.url}
                      alt={icon.name}
                      style={{ maxWidth: '36px', maxHeight: '36px', objectFit: 'contain' }}
                    />
                  </div>

                  {/* Icon Name */}
                  <p style={{
                    fontSize: '13px', fontWeight: '600', color: '#334155',
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {icon.name}
                  </p>

                  {/* Created Date */}
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                    {new Date(icon.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#fff', borderRadius: '20px', padding: '32px',
            maxWidth: '400px', width: '90%', textAlign: 'center'
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%',
              backgroundColor: '#fef2f2', margin: '0 auto 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '24px' }}>🗑️</span>
            </div>
            
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px 0' }}>
              Delete Icon?
            </h3>
            
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 8px 0' }}>
              Are you sure you want to delete "{showDeleteModal.name}"?
            </p>
            
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 24px 0' }}>
              Tasks using this icon will fallback to the default flag.
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowDeleteModal(null)}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: '600',
                  backgroundColor: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: '10px', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal._id)}
                style={{
                  padding: '12px 24px', fontSize: '14px', fontWeight: '600',
                  backgroundColor: '#dc2626', color: '#fff',
                  border: 'none', borderRadius: '10px', cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProgressIcons;
