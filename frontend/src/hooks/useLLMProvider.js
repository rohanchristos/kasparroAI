import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * Custom hook for managing LLM provider state.
 *
 * Fetches available providers from the agent service,
 * reads the current user preference, and handles updates.
 */
export default function useLLMProvider() {
  const [providers, setProviders] = useState([]);
  const [currentProvider, setCurrentProvider] = useState('grok');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Load providers + current preference ───────────────────

  const fetchProviders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get provider list from FastAPI via nginx
      const providerRes = await api.get('/agent/providers');
      setProviders(providerRes.data.providers || []);

      // Get current user preference from backend
      const userRes = await api.get('/auth/me');
      const pref = userRes.data.user?.llm_preference || 'grok';
      setCurrentProvider(pref);
    } catch (err) {
      console.error('Failed to fetch LLM providers:', err);
      setError(err.response?.data?.message || 'Failed to load providers');

      // Fallback defaults
      setProviders([
        {
          id: 'grok',
          name: 'Grok 3 Mini',
          model: 'grok-3-mini',
          description: 'Fast and free — powered by xAI',
          is_free: true,
          status: 'unknown',
        },
        {
          id: 'openai',
          name: 'GPT-4o',
          model: 'gpt-4o',
          description: 'Most capable — powered by OpenAI',
          is_free: false,
          status: 'unknown',
        },
        {
          id: 'openrouter',
          name: 'Claude 3.5 Sonnet',
          model: 'anthropic/claude-3.5-sonnet',
          description: 'Flexible and powerful — via OpenRouter',
          is_free: false,
          status: 'unknown',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // ── Update preference ─────────────────────────────────────

  const updateProvider = useCallback(async (provider) => {
    if (provider === currentProvider) return;

    try {
      setIsLoading(true);
      setError(null);

      const res = await api.patch('/auth/llm-preference', {
        provider,
      });

      setCurrentProvider(provider);

      // Update stored user data
      const userData = JSON.parse(
        localStorage.getItem('kasparro_user') || '{}'
      );
      userData.llm_preference = provider;
      localStorage.setItem('kasparro_user', JSON.stringify(userData));

      return { success: true, user: res.data.user };
    } catch (err) {
      console.error('Failed to update LLM preference:', err);
      const msg =
        err.response?.data?.message || 'Failed to update LLM preference';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [currentProvider]);

  return {
    providers,
    currentProvider,
    updateProvider,
    fetchProviders,
    isLoading,
    error,
  };
}
