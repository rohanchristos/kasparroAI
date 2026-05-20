import React, { useState, useMemo } from 'react';
import { X, Send, Loader2, AlertTriangle, Eye, Pencil } from 'lucide-react';

/**
 * Compute a simple word-level diff between two strings.
 * Returns an array of { type: 'same'|'added'|'removed', text } segments.
 */
function computeDiff(original, edited) {
  const origWords = original.split(/(\s+)/);
  const editWords = edited.split(/(\s+)/);
  const result = [];
  const maxLen = Math.max(origWords.length, editWords.length);

  for (let i = 0; i < maxLen; i++) {
    const ow = origWords[i] || '';
    const ew = editWords[i] || '';
    if (ow === ew) {
      if (ew) result.push({ type: 'same', text: ew });
    } else {
      if (ow) result.push({ type: 'removed', text: ow });
      if (ew) result.push({ type: 'added', text: ew });
    }
  }
  return result;
}

/**
 * ApproveModal — shows original customer email + AI draft reply.
 *
 * Two modes:
 *   editMode=false  → "Quick Approve" — draft is read-only, just confirm
 *   editMode=true   → "Edit & Approve" — draft is editable with diff view
 *
 * Props:
 *   ticket    — the ticket object
 *   onConfirm — async (ticketId, editedReply?) => void
 *   onClose   — () => void
 *   editMode  — boolean
 */
export default function ApproveModal({ ticket, onConfirm, onClose, editMode = false }) {
  const [reply, setReply] = useState(ticket?.ai_draft_reply || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDiff, setShowDiff] = useState(false);

  const originalReply = ticket?.ai_draft_reply || '';
  const isEdited = reply !== originalReply;
  const charCount = reply.length;

  // Compute edit distance percentage (Levenshtein-approximation via char diff)
  const editPercent = useMemo(() => {
    if (!originalReply) return 0;
    let changes = 0;
    const maxLen = Math.max(reply.length, originalReply.length);
    for (let i = 0; i < maxLen; i++) {
      if (reply[i] !== originalReply[i]) changes++;
    }
    return Math.round((changes / Math.max(originalReply.length, 1)) * 100);
  }, [reply, originalReply]);

  const significantEdit = editPercent > 30;

  // Word-level diff for visual highlighting
  const diffSegments = useMemo(() => {
    if (!isEdited) return [];
    return computeDiff(originalReply, reply);
  }, [originalReply, reply, isEdited]);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Pass editedReply only if actually changed; null = use AI draft as-is
      await onConfirm(ticket.id, isEdited ? reply : null);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to approve. Please try again.'
      );
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !isLoading && onClose()}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {editMode ? (
              <Pencil className="w-5 h-5 text-primary-500" />
            ) : (
              <Send className="w-5 h-5 text-emerald-500" />
            )}
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {editMode ? 'Edit & Approve Reply' : 'Approve Reply'}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────── */}
        <div className="px-6 py-4 max-h-[65vh] overflow-y-auto space-y-4">
          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 animate-fade-in">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* Customer's original email */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Customer Email
            </label>
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  From: <span className="text-gray-900 dark:text-white">{ticket.customer_name}</span> ({ticket.customer_email})
                </p>
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Subject: <span className="text-gray-800 dark:text-gray-200">{ticket.subject}</span>
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
                {ticket.original_email_body}
              </p>
            </div>
          </div>

          {/* AI Draft Reply — editable or read-only */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  AI Draft Reply
                </label>
                {isEdited && (
                  <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                    Edited ({editPercent}% changed)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEdited && editMode && (
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    {showDiff ? 'Hide diff' : 'Show diff'}
                  </button>
                )}
                <span className="text-xs text-gray-400">{charCount} chars</span>
              </div>
            </div>

            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={8}
              className={`input font-mono text-sm leading-relaxed resize-y ${
                !editMode ? 'bg-gray-50 dark:bg-gray-900 cursor-default' : ''
              }`}
              readOnly={!editMode}
              id="approve-reply-input"
              placeholder="AI draft reply…"
            />
          </div>

          {/* Diff view */}
          {showDiff && isEdited && diffSegments.length > 0 && (
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 animate-fade-in">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Changes from AI Draft
              </p>
              <p className="text-sm leading-relaxed font-mono">
                {diffSegments.map((seg, i) => {
                  if (seg.type === 'same') return <span key={i}>{seg.text}</span>;
                  if (seg.type === 'removed') {
                    return (
                      <span key={i} className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 line-through px-0.5 rounded">
                        {seg.text}
                      </span>
                    );
                  }
                  return (
                    <span key={i} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-0.5 rounded">
                      {seg.text}
                    </span>
                  );
                })}
              </p>
            </div>
          )}

          {/* Significant edit warning */}
          {significantEdit && isEdited && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 animate-fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Significant modification detected
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  Reply has been changed by ~{editPercent}% from the AI draft. This will be logged in the audit trail.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div>
            {editMode && isEdited && (
              <button
                onClick={() => setReply(originalReply)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium"
                disabled={isLoading}
              >
                ↩ Reset to AI draft
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="btn-success"
              disabled={isLoading || !reply.trim()}
              id="approve-confirm"
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : (
                <><Send className="w-4 h-4" /> Approve & Send</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
