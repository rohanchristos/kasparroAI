import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * useAuditLogs — paginated audit log retrieval with filters.
 */
export default function useAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFiltersState] = useState({
    action: '', ticket_id: '', start_date: '', end_date: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async (overrideFilters, page = 1) => {
    setIsLoading(true);
    setError(null);
    const f = overrideFilters || filters;
    try {
      const params = { page, limit: 25 };
      if (f.action) params.action = f.action;
      if (f.ticket_id) params.ticket_id = f.ticket_id;
      if (f.start_date) params.start_date = f.start_date;
      if (f.end_date) params.end_date = f.end_date;

      const res = await api.get('/audit', { params });
      setLogs(res.data.logs || []);
      setPagination(res.data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchLogs(filters, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilters = useCallback((newFilters) => {
    setFiltersState(newFilters);
    fetchLogs(newFilters, 1);
  }, [fetchLogs]);

  const setPage = useCallback((page) => {
    fetchLogs(filters, page);
  }, [filters, fetchLogs]);

  const exportCSV = useCallback(async () => {
    const params = {};
    if (filters.action) params.action = filters.action;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;

    const res = await api.get('/audit/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kasparro_audit_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filters]);

  return { logs, pagination, filters, isLoading, error, setFilters, setPage, exportCSV };
}
