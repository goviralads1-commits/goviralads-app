import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const IconLibraryContext = createContext(null);

export const IconLibraryProvider = ({ children }) => {
  const [icons, setIcons] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchIcons = useCallback(async () => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/admin/progress-icons');
      if (response.data.success) {
        setIcons(response.data.icons || []);
        setLoaded(true);
      }
    } catch (err) {
      console.error('[IconLibrary] Failed to load icons:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Load once on mount
  useEffect(() => {
    if (!loaded && !loading) {
      fetchIcons();
    }
  }, [loaded, loading, fetchIcons]);

  // Refresh function - call after upload/delete
  const refresh = useCallback(() => {
    setLoaded(false);
    fetchIcons();
  }, [fetchIcons]);

  // Get icon by ID
  const getIconById = useCallback((iconId) => {
    return icons.find(icon => icon._id === iconId) || null;
  }, [icons]);

  // Resolve URL for custom icon
  const resolveCustomIconUrl = useCallback((iconId) => {
    const icon = getIconById(iconId);
    return icon?.url || null;
  }, [getIconById]);

  const value = {
    icons,
    loaded,
    loading,
    error,
    refresh,
    getIconById,
    resolveCustomIconUrl,
  };

  return (
    <IconLibraryContext.Provider value={value}>
      {children}
    </IconLibraryContext.Provider>
  );
};

export const useIconLibrary = () => {
  const context = useContext(IconLibraryContext);
  // Return safe defaults if context not available (prevents crash)
  if (!context) {
    console.warn('[IconLibrary] Context not available, using safe defaults');
    return {
      icons: [],
      loaded: false,
      loading: false,
      error: null,
      refresh: () => {},
      getIconById: () => null,
      resolveCustomIconUrl: () => null,
    };
  }
  return context;
};

export default IconLibraryContext;
