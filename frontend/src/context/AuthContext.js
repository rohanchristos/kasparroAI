import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

/**
 * AuthProvider — manages user authentication state.
 * Stores JWT token + user in localStorage for persistence.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('kasparro_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('kasparro_token'));
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!token && !!user;

  // Verify token on mount
  useEffect(() => {
    if (token && !user) {
      setLoading(true);
      api.get('/auth/me')
        .then((res) => {
          setUser(res.data.user || res.data);
          localStorage.setItem('kasparro_user', JSON.stringify(res.data.user || res.data));
        })
        .catch(() => {
          setToken(null);
          setUser(null);
          localStorage.removeItem('kasparro_token');
          localStorage.removeItem('kasparro_user');
        })
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token: jwt, user: userData } = res.data;
      setToken(jwt);
      setUser(userData);
      localStorage.setItem('kasparro_token', jwt);
      localStorage.setItem('kasparro_user', JSON.stringify(userData));
      return userData;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch {}
    setToken(null);
    setUser(null);
    localStorage.removeItem('kasparro_token');
    localStorage.removeItem('kasparro_user');
  }, []);

  const updateLlmPreference = useCallback(async (provider) => {
    const res = await api.patch('/auth/llm-preference', { provider });
    const updated = res.data.user;
    setUser((prev) => ({ ...prev, llm_preference: updated.llm_preference }));
    const stored = JSON.parse(localStorage.getItem('kasparro_user') || '{}');
    stored.llm_preference = updated.llm_preference;
    localStorage.setItem('kasparro_user', JSON.stringify(stored));
    return updated;
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateLlmPreference, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
