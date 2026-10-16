import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import config from '../config.js';
import { useAuth } from './AuthContext.jsx';

const UsageContext = createContext(null);

export const UsageProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const refreshUsage = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!isAuthenticated || !token) {
      setUsage(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/usage/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error(`Unable to load usage (${response.status})`);
      }

      const nextUsage = await response.json();
      if (requestId === requestIdRef.current) setUsage(nextUsage);
      return nextUsage;
    } catch {
      if (requestId === requestIdRef.current) {
        setError('暂时无法加载额度信息，请稍后重试。');
      }
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (isAuthenticated && token) {
      refreshUsage();
    } else {
      requestIdRef.current += 1;
      setUsage(null);
      setError(null);
      setLoading(false);
    }
  }, [isAuthenticated, token, refreshUsage]);

  return (
    <UsageContext.Provider value={{ usage, loading, error, refreshUsage }}>
      {children}
    </UsageContext.Provider>
  );
};

// This module intentionally colocates its provider and hook, matching AuthContext.
// eslint-disable-next-line react-refresh/only-export-components
export const useUsage = () => {
  const context = useContext(UsageContext);
  if (!context) throw new Error('useUsage must be used within a UsageProvider');
  return context;
};

export default UsageContext;
