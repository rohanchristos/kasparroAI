import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChevronDown, ChevronUp, Check, X, Pencil, RotateCcw, Bot } from 'lucide-react';

/* ── Badge helpers ───────────────────────────────────────── */

const urgencyStyles = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const sentimentConfig = {
  angry: { emoji: '😡', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  frustrated: { emoji: '😤', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  neutral: { emoji: '😐', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400' },
  positive: { emoji: '😊', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  auto_resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sent: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  escalated: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

/**
 * TicketCard — displays a single ticket with all metadata,
 * collapsible AI draft, confidence bar, and action buttons.
 */
export default function TicketCard({
  ticket,
  onApprove,
  onEditApprove,
  onReject,
  onRegenerate,
}) {
  const [showDraft, setShowDraft] = useState(false);
  const [regenerating, setRegenerate] = useState(false);

  const isAutoResolved = ticket.status === 'auto_resolved';
  const isPending = ticket.status === 'pending';
  const timeAgo = ticket.created_at
    ? formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })
    : '';

  const confidence = ticket.ai_confidence_score ?? 0;
  const confidencePercent = Math.round(confidence * 100);
  const confidenceColor =
    confidence >= 0.8 ? 'bg-emerald-500' :
    confidence >= 0.6 ? 'bg-amber-500' : 'bg-red-500';

  const sentimentInfo = sentimentConfig[ticket.sentiment] || sentimentConfig.neutral;
  const llmUsed = ticket.llm_provider_used || 'grok';

  const handleRegenerate = async () => {
    setRegenerate(true);
    try { await onRegenerate(ticket.id); } finally { setRegenerate(false); }
  };

  return (
    <div
      className={`glass-card overflow-hidden transition-all duration-200 hover:shadow-md animate-slide-up ${
        isAutoResolved ? 'border-l-4 border-l-emerald-500' : ''
      }`}
      id={`ticket-${ticket.id}`}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {ticket.customer_name || 'Unknown Customer'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {ticket.customer_email}
            </p>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
            {timeAgo}
          </span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ticket.urgency && (
            <span className={`badge ${urgencyStyles[ticket.urgency] || ''}`}>
              {ticket.urgency?.toUpperCase()}
            </span>
          )}
          {ticket.sentiment && (
            <span className={`badge ${sentimentInfo.color}`}>
              {sentimentInfo.emoji} {ticket.sentiment}
            </span>
          )}
          {ticket.category && (
            <span className="badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {ticket.category?.replace('_', ' ')}
            </span>
          )}
          <span className={`badge ${statusStyles[ticket.status] || ''}`}>
            {ticket.status?.replace('_', ' ')}
          </span>
          {isAutoResolved && (
            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Bot className="w-3 h-3 mr-0.5" /> Auto-resolved
            </span>
          )}
        </div>

        {/* Subject */}
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
          {ticket.subject}
        </h4>

        {/* Email preview */}
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3">
          {ticket.original_email_body}
        </p>

        {/* Confidence + LLM row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                AI Confidence
              </span>
              <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                {confidencePercent}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${confidenceColor}`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
          </div>
          <span className={`badge text-[10px] ${
            llmUsed === 'grok'
              ? 'bg-grok/10 text-grok-light'
              : llmUsed === 'openrouter'
                ? 'bg-openrouter/10 text-openrouter-light'
                : 'bg-openai/10 text-openai-light'
          }`}>
            {llmUsed === 'grok' ? 'Grok' : llmUsed === 'openrouter' ? 'Claude' : 'OpenAI'}
          </span>
        </div>

        {/* AI Draft toggle */}
        {ticket.ai_draft_reply && (
          <div className="mb-3">
            <button
              onClick={() => setShowDraft(!showDraft)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
            >
              {showDraft ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showDraft ? 'Hide' : 'Show'} AI Draft Reply
            </button>
            {showDraft && (
              <div className="mt-2 p-3 rounded-lg bg-primary-50/50 dark:bg-primary-900/10 border border-primary-200/50 dark:border-primary-800/30 animate-fade-in">
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {ticket.ai_draft_reply}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons — only for pending tickets */}
        {isPending && (
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => onApprove(ticket)} className="btn-success text-xs px-3 py-1.5" id={`approve-${ticket.id}`}>
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={() => onEditApprove(ticket)} className="btn-primary text-xs px-3 py-1.5" id={`edit-${ticket.id}`}>
              <Pencil className="w-3.5 h-3.5" /> Edit & Approve
            </button>
            <button onClick={() => onReject(ticket)} className="btn-danger text-xs px-3 py-1.5" id={`reject-${ticket.id}`}>
              <X className="w-3.5 h-3.5" /> Reject
            </button>
            <button onClick={handleRegenerate} disabled={regenerating} className="btn-ghost text-xs px-3 py-1.5" id={`regen-${ticket.id}`}>
              <RotateCcw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
