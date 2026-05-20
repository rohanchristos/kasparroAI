import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import useLLMProvider from '../hooks/useLLMProvider';
import useDarkMode from '../hooks/useDarkMode';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Sun, Moon, Check, X, Loader2, RefreshCw, Shield, Bell, Key, Server,
} from 'lucide-react';

/* ── Health status component ──────────────────────────────── */
function HealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit/health');
      setHealth(res.data);
    } catch {
      setHealth({ status: 'error', services: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const services = [
    { key: 'nodejs', label: 'Node.js API', icon: '🟢' },
    { key: 'fastapi', label: 'FastAPI Agent', icon: '🤖' },
    { key: 'postgres', label: 'PostgreSQL', icon: '🐘' },
    { key: 'redis', label: 'Redis Cache', icon: '⚡' },
  ];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-primary-500" />
          API Health Status
        </h3>
        <button onClick={fetchHealth} className="btn-ghost text-xs px-2 py-1" disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="space-y-3">
        {services.map((svc) => {
          const info = health?.services?.[svc.key];
          const connected = info?.status === 'connected';
          return (
            <div key={svc.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2.5">
                <span className="text-sm">{svc.icon}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{svc.label}</span>
              </div>
              {loading ? (
                <div className="skeleton h-5 w-20 rounded-full" />
              ) : (
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  connected
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {connected ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {connected ? 'Connected' : 'Disconnected'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {health?.timestamp && (
        <p className="text-[10px] text-gray-400 mt-3 text-right">
          Last checked: {new Date(health.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

/**
 * SettingsPage — LLM provider, appearance, notifications, password, health.
 */
export default function SettingsPage() {
  const { user } = useAuth();
  const { providers, currentProvider, updateProvider, isLoading: llmLoading } = useLLMProvider();
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProviderSwitch = async (id) => {
    if (id === currentProvider) return;
    const result = await updateProvider(id);
    if (result?.success) {
      toast.success(`Switched to ${providers.find(p => p.id === id)?.name || id}`);
    } else {
      toast.error(result?.error || 'Failed to switch');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setPasswordLoading(true);
    try {
      await api.patch('/auth/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your account and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── LLM Provider ──────────────────────────────── */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-primary-500" />
            LLM Provider
          </h3>
          <div className="space-y-3">
            {providers.map((p) => {
              const getProviderStyles = (id) => {
                if (id === 'grok') return { border: 'border-grok bg-grok/5', badge: 'bg-grok/20 text-grok-light', letter: 'G' };
                if (id === 'openrouter') return { border: 'border-openrouter bg-openrouter/5', badge: 'bg-openrouter/20 text-openrouter-light', letter: 'C' };
                return { border: 'border-openai bg-openai/5', badge: 'bg-openai/20 text-openai-light', letter: 'O' };
              };
              const styles = getProviderStyles(p.id);

              return (
              <button
                key={p.id}
                onClick={() => handleProviderSwitch(p.id)}
                disabled={llmLoading}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  p.id === currentProvider
                    ? styles.border
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${styles.badge}`}>
                  {styles.letter}
                </div>
                <div className="text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-white">{p.name}</span>
                    <span className={`badge text-[9px] ${
                      p.is_free ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>{p.is_free ? 'FREE' : 'PAID'}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.description}</p>
                </div>
                {p.id === currentProvider && <Check className="w-5 h-5 text-emerald-500" />}
              </button>
            )})}
          </div>
        </div>

        {/* ── Appearance ────────────────────────────────── */}
        <div className="space-y-6">
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              {isDarkMode ? <Moon className="w-4 h-4 text-primary-500" /> : <Sun className="w-4 h-4 text-amber-500" />}
              Appearance
            </h3>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isDarkMode ? 'Currently using dark theme' : 'Currently using light theme'}
                </p>
              </div>
              <button
                onClick={toggleDarkMode}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isDarkMode ? 'bg-primary-500' : 'bg-gray-300'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  isDarkMode ? 'translate-x-6' : ''
                }`} />
              </button>
            </div>
          </div>

          {/* ── Notifications ────────────────────────────── */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-primary-500" />
              Notifications
            </h3>
            {['New pending tickets', 'Ticket auto-resolved', 'Email send failures'].map((label) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                <input type="checkbox" defaultChecked className="w-4 h-4 rounded accent-primary-500" />
              </div>
            ))}
          </div>
        </div>

        {/* ── Change Password ────────────────────────────── */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-primary-500" />
            Change Password
          </h3>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                className="input" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="input" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="input" placeholder="••••••••" />
            </div>
            <button type="submit" className="btn-primary text-sm w-full" disabled={passwordLoading || !currentPassword || !newPassword}>
              {passwordLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : 'Update Password'}
            </button>
          </form>
        </div>

        {/* ── Health Status ──────────────────────────────── */}
        <HealthPanel />
      </div>

      {/* Account info */}
      <div className="mt-6 glass-card p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Account Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Name</p>
            <p className="font-medium text-gray-900 dark:text-white">{user?.full_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Email</p>
            <p className="font-medium text-gray-900 dark:text-white">{user?.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Role</p>
            <p className="font-medium text-gray-900 dark:text-white capitalize">{user?.role || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
