import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * useAnalytics — fetches comprehensive dashboard analytics.
 * Uses the enhanced /tickets/analytics/summary endpoint.
 */
export default function useAnalytics() {
  const [data, setData] = useState({
    overview: {
      total: 0, pending: 0, auto_resolved: 0, approved: 0,
      rejected: 0, escalated: 0, avg_resolution_time_minutes: 0,
      auto_resolve_rate: 0, manager_approval_rate: 0,
    },
    trends: { last_7_days: [] },
    categories: {},
    sentiments: {},
    urgency: {},
    llm_usage: {},
    top_issues: [],
    yesterday_total: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/tickets/analytics/summary');
      const d = res.data;
      setData({
        overview: d.overview || d.counts || data.overview,
        trends: d.trends || { last_7_days: d.daily_trend || [] },
        categories: d.categories || {},
        sentiments: d.sentiments || {},
        urgency: d.urgency || {},
        llm_usage: d.llm_usage || {},
        top_issues: d.top_issues || [],
        yesterday_total: d.yesterday_total || 0,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return { data, isLoading, error, refetch: fetchAnalytics };
}
