import React, { useState } from 'react';
import { X, XCircle, Loader2 } from 'lucide-react';

const REASONS = [
  { value: 'wrong_tone', label: 'Wrong tone' },
  { value: 'incorrect_info', label: 'Incorrect information' },
  { value: 'missing_details', label: 'Missing details' },
  { value: 'too_aggressive', label: 'Too aggressive' },
  { value: 'policy_violation', label: 'Policy violation' },
  { value: 'other', label: 'Other' },
];

/**
 * RejectModal — reject a ticket with a categorized reason + optional notes.
 *
 * Props:
 *   ticket    — the ticket object
 *   onConfirm — async (ticketId, fullReason) => void
 *   onClose   — () => void
 */
export default function RejectModal({ ticket, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedLabel = REASONS.find((r) => r.value === reason)?.label || '';
  const fullReason = notes.trim()
    ? `${selectedLabel}: ${notes.trim()}`
    : selectedLabel;

  const handleSubmit = async () => {
    if (!reason) return;
    setIsLoading(true);
    setError('');
    try {
      await onConfirm(ticket.id, fullReason);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to reject ticket. Please try again.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Reject Ticket</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 animate-fade-in">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* Ticket info */}
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Rejecting ticket from</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {ticket?.customer_name || ticket?.customer_email}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
              {ticket?.subject}
            </p>
          </div>

          {/* Reason dropdown */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input"
              id="reject-reason"
            >
              <option value="">Select a reason…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Notes textarea */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Additional Notes
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Provide additional context for why this draft was rejected…"
              className="input resize-y"
              id="reject-notes"
            />
          </div>

          {/* Preview of full reason */}
          {reason && (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic">
              Will be logged as: "{fullReason}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-danger"
            disabled={isLoading || !reason}
            id="reject-confirm"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Rejecting…</>
            ) : (
              <><XCircle className="w-4 h-4" /> Reject Ticket</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
