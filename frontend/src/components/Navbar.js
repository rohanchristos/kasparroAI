import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import useDarkMode from '../hooks/useDarkMode';
import useLLMProvider from '../hooks/useLLMProvider';
import { Menu, Sun, Moon, LogOut, ChevronDown, Check } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Navbar — top bar with hamburger, LLM selector, dark mode toggle, and user menu.
 */
export default function Navbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { providers, currentProvider, updateProvider, isLoading: llmLoading } = useLLMProvider();

  const [llmOpen, setLlmOpen] = useState(false);
  const llmRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (llmRef.current && !llmRef.current.contains(e.target)) setLlmOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleProviderSwitch = async (id) => {
    if (id === currentProvider) return;
    setLlmOpen(false);
    const result = await updateProvider(id);
    if (result?.success) {
      const name = providers.find((p) => p.id === id)?.name || id;
      toast.success(`Switched to ${name}`);
    } else {
      toast.error(result?.error || 'Failed to switch');
    }
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'KA';

  const providerColor = currentProvider === 'grok' ? 'bg-grok' : currentProvider === 'openrouter' ? 'bg-openrouter' : 'bg-openai';
  const currentInfo = providers.find((p) => p.id === currentProvider);

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-4 lg:px-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
      {/* Left: hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* LLM Provider Selector */}
        <div className="relative" ref={llmRef}>
          <button
            onClick={() => setLlmOpen(!llmOpen)}
            disabled={llmLoading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
              currentProvider === 'grok'
                ? 'border-grok/30 hover:border-grok/50 hover:shadow-[0_0_12px_rgba(124,58,237,0.15)]'
                : currentProvider === 'openrouter'
                  ? 'border-openrouter/30 hover:border-openrouter/50 hover:shadow-[0_0_12px_rgba(37,99,235,0.15)]'
                  : 'border-openai/30 hover:border-openai/50 hover:shadow-[0_0_12px_rgba(5,150,105,0.15)]'
            } bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300`}
            id="llm-selector-trigger"
          >
            <span className={`w-2 h-2 rounded-full ${providerColor}`} />
            <span className="hidden sm:inline">{currentInfo?.name || currentProvider}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${llmOpen ? 'rotate-180' : ''}`} />
          </button>

          {llmOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
              <div className="px-3 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                LLM Provider
              </div>
              {providers.map((p) => {
                const getStyles = (id) => {
                  if (id === 'grok') return { bg: 'bg-grok/10', badge: 'bg-grok/20 text-grok-light', letter: 'G' };
                  if (id === 'openrouter') return { bg: 'bg-openrouter/10', badge: 'bg-openrouter/20 text-openrouter-light', letter: 'C' };
                  return { bg: 'bg-openai/10', badge: 'bg-openai/20 text-openai-light', letter: 'O' };
                };
                const s = getStyles(p.id);
                return (
                <button
                  key={p.id}
                  onClick={() => handleProviderSwitch(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    p.id === currentProvider ? s.bg : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                  id={`llm-option-${p.id}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${s.badge}`}>
                    {s.letter}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900 dark:text-white">{p.name}</span>
                      <span className={`px-1.5 py-px rounded-full text-[9px] font-bold uppercase ${
                        p.is_free ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {p.is_free ? 'FREE' : 'PAID'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {p.description}
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${
                    p.status === 'connected' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-red-500'
                  }`} />
                  {p.id === currentProvider && <Check className="w-4 h-4 text-emerald-500" />}
                </button>
              );})}
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Toggle dark mode"
          id="dark-mode-toggle"
        >
          {isDarkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-grok flex items-center justify-center">
            <span className="text-xs font-bold text-white">{initials}</span>
          </div>
          <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300">
            {user?.full_name || 'Manager'}
          </span>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            aria-label="Logout"
            id="logout-btn"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
