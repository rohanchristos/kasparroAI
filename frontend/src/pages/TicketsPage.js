import React, { useState } from 'react';
import useTickets from '../hooks/useTickets';
import FilterBar from '../components/FilterBar';
import TicketCard from '../components/TicketCard';
import ApproveModal from '../components/ApproveModal';
import RejectModal from '../components/RejectModal';
import { Inbox, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * TicketsPage — main ticket management view.
 *
 * Integrates all 4 flows:
 *   1. Approve (AI draft as-is)
 *   2. Edit & Approve (manager edits draft)
 *   3. Reject (reason + notes)
 *   4. Regenerate (new AI draft in place)
 */
export default function TicketsPage() {
  const {
    tickets, pagination, filters, isLoading, error,
    setFilters, setPage, approveTicket, rejectTicket, regenerateTicket,
  } = useTickets();

  // Modal state
  const [approveModal, setApproveModal] = useState(null);  // { ticket, editMode }
  const [rejectModal, setRejectModal] = useState(null);    // ticket object

  // ── FLOW 1 & 2: Approve / Edit & Approve ─────────────────

  const handleApprove = async (ticketId, editedReply) => {
    try {
      await approveTicket(ticketId, editedReply);
      toast.success(
        editedReply
          ? 'Edited reply approved & sent to customer ✅'
          : 'Reply sent to customer ✅',
        { duration: 4000 }
      );
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to approve ticket';
      const isEmailError = err.response?.data?.code === 'EMAIL_SEND_FAILED' ||
                           err.response?.status === 502;

      // Show error toast with retry option for email failures
      toast.error(
        (t) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{message}</span>
            {isEmailError && (
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  handleApprove(ticketId, editedReply);
                }}
                className="text-xs text-red-200 underline hover:text-white self-start mt-1"
              >
                ↻ Retry sending
              </button>
            )}
          </div>
        ),
        { duration: isEmailError ? 8000 : 4000 }
      );
      throw err; // Re-throw so modal stays open
    }
  };

  // ── FLOW 3: Reject ────────────────────────────────────────

  const handleReject = async (ticketId, reason) => {
    try {
      await rejectTicket(ticketId, reason);
      toast.success('Ticket rejected', { duration: 3000 });
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to reject ticket';
      toast.error(message, { duration: 4000 });
      throw err;
    }
  };

  // ── FLOW 4: Regenerate ────────────────────────────────────

  const handleRegenerate = async (ticketId) => {
    try {
      const result = await regenerateTicket(ticketId);
      const confidence = result.ticket?.ai_confidence_score;
      toast.success(
        `New draft generated${confidence ? ` (${Math.round(confidence * 100)}% confidence)` : ''} 🔄`,
        { duration: 3000 }
      );
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to regenerate draft';
      toast.error(
        (t) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{message}</span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                handleRegenerate(ticketId);
              }}
              className="text-xs text-red-200 underline hover:text-white self-start mt-1"
            >
              ↻ Retry
            </button>
          </div>
        ),
        { duration: 6000 }
      );
    }
  };

  // ── Clear filters ─────────────────────────────────────────

  const clearFilters = () => {
    setFilters({ status: '', category: '', urgency: '', sentiment: '', search: '' });
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tickets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {pagination.total} total ticket{pagination.total !== 1 ? 's' : ''}
            {isLoading && tickets.length > 0 && (
              <span className="ml-2 text-primary-500">
                <Loader2 className="w-3 h-3 inline animate-spin" /> updating…
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        isLoading={isLoading}
      />

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-6 animate-fade-in">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading skeletons — only on first load */}
      {isLoading && tickets.length === 0 && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card p-5">
              <div className="flex justify-between mb-3">
                <div>
                  <div className="skeleton h-4 w-40 mb-2" />
                  <div className="skeleton h-3 w-52" />
                </div>
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="flex gap-2 mb-3">
                <div className="skeleton h-5 w-14 rounded-full" />
                <div className="skeleton h-5 w-20 rounded-full" />
                <div className="skeleton h-5 w-18 rounded-full" />
              </div>
              <div className="skeleton h-4 w-3/4 mb-2" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-2/3 mb-4" />
              <div className="flex gap-2">
                <div className="skeleton h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tickets.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
            No tickets found
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filters.status || filters.category || filters.urgency || filters.sentiment
              ? 'Try adjusting your filters'
              : 'All clear! No tickets to review.'}
          </p>
        </div>
      )}

      {/* Ticket list */}
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            onApprove={(t) => setApproveModal({ ticket: t, editMode: false })}
            onEditApprove={(t) => setApproveModal({ ticket: t, editMode: true })}
            onReject={(t) => setRejectModal(t)}
            onRegenerate={handleRegenerate}
          />
        ))}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} tickets
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(pagination.page - 1)}
              disabled={pagination.page <= 1 || isLoading}
              className="btn-ghost text-sm px-3 py-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            {/* Page numbers */}
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    p === pagination.page
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages || isLoading}
              className="btn-ghost text-sm px-3 py-1.5"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────── */}

      {approveModal && (
        <ApproveModal
          ticket={approveModal.ticket}
          editMode={approveModal.editMode}
          onConfirm={handleApprove}
          onClose={() => setApproveModal(null)}
        />
      )}

      {rejectModal && (
        <RejectModal
          ticket={rejectModal}
          onConfirm={handleReject}
          onClose={() => setRejectModal(null)}
        />
      )}
    </div>
  );
}
