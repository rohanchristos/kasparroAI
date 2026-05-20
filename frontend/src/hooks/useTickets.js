import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const POLL_INTERVAL = 30000; // 30 seconds

/**
 * useTickets — manages ticket list, filters, pagination, and all
 * ticket actions (approve/reject/regenerate) with optimistic updates.
 *
 * Optimistic update strategy:
 *   - approve/reject: immediately update the ticket in local state
 *   - on API error: rollback to previous state
 */
export default function useTickets() {
  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFiltersState] = useState({
    status: '', category: '', urgency: '', sentiment: '', search: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const intervalRef = useRef(null);
  const filtersRef = useRef(filters);
  const pageRef = useRef(1);

  // Keep refs in sync for polling
  filtersRef.current = filters;
  pageRef.current = pagination.page;

  // ── Fetch tickets with current filters ────────────────────

  const fetchTickets = useCallback(async (overrideFilters, page) => {
    const f = overrideFilters || filtersRef.current;
    const p = page || pageRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const params = { page: p, limit: 10 };
      if (f.status) params.status = f.status;
      if (f.category) params.category = f.category;
      if (f.urgency) params.urgency = f.urgency;
      if (f.sentiment) params.sentiment = f.sentiment;
      if (f.search) params.customer_email = f.search;

      const res = await api.get('/tickets', { params });
      setTickets(res.data.tickets || []);
      setPagination(res.data.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load tickets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Fetch pending count ───────────────────────────────────

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await api.get('/tickets', { params: { status: 'pending', limit: 1 } });
      setPendingCount(res.data.pagination?.total || 0);
    } catch {}
  }, []);

  // ── Initial fetch + polling ───────────────────────────────

  useEffect(() => {
    fetchTickets(filters, 1);
    fetchPendingCount();
    intervalRef.current = setInterval(() => {
      fetchTickets();
      fetchPendingCount();
    }, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Set filters (resets to page 1) ────────────────────────

  const setFilters = useCallback((newFilters) => {
    setFiltersState(newFilters);
    fetchTickets(newFilters, 1);
  }, [fetchTickets]);

  // ── Set page ──────────────────────────────────────────────

  const setPage = useCallback((page) => {
    fetchTickets(filtersRef.current, page);
  }, [fetchTickets]);

  // ── APPROVE — optimistic update ───────────────────────────

  const approveTicket = useCallback(async (id, editedReply) => {
    // Save snapshot for rollback
    const prevTickets = [...tickets];
    const prevPending = pendingCount;

    // Optimistic: mark as "sent" and remove from pending
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'sent' } : t))
    );
    setPendingCount((c) => Math.max(0, c - 1));

    try {
      const res = await api.patch(`/tickets/${id}/approve`, {
        edited_reply: editedReply || null,
      });
      // Replace with server response (authoritative)
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? res.data.ticket : t))
      );
      return res.data;
    } catch (err) {
      // Rollback
      setTickets(prevTickets);
      setPendingCount(prevPending);
      throw err;
    }
  }, [tickets, pendingCount]);

  // ── REJECT — optimistic update ────────────────────────────

  const rejectTicket = useCallback(async (id, reason) => {
    const prevTickets = [...tickets];
    const prevPending = pendingCount;

    // Optimistic: mark as "rejected"
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'rejected' } : t))
    );
    setPendingCount((c) => Math.max(0, c - 1));

    try {
      const res = await api.patch(`/tickets/${id}/reject`, { reason });
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? res.data.ticket : t))
      );
      return res.data;
    } catch (err) {
      setTickets(prevTickets);
      setPendingCount(prevPending);
      throw err;
    }
  }, [tickets, pendingCount]);

  // ── REGENERATE — update card in place ─────────────────────

  const regenerateTicket = useCallback(async (id) => {
    const res = await api.patch(`/tickets/${id}/regenerate`);
    // Replace ticket in list with updated version (new draft + confidence)
    const updated = res.data.ticket;
    if (updated) {
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? updated : t))
      );
    }
    return res.data;
  }, []);

  return {
    tickets,
    pagination,
    filters,
    isLoading,
    error,
    pendingCount,
    setFilters,
    setPage,
    fetchTickets,
    approveTicket,
    rejectTicket,
    regenerateTicket,
  };
}
