import React from 'react';

/**
 * FilterBar — ticket list filter controls.
 *
 * Props:
 *   filters    — { status, category, urgency, sentiment, search }
 *   onChange   — (newFilters) => void
 *   onClear    — () => void
 *   isLoading  — boolean
 */
export default function FilterBar({ filters, onChange, onClear, isLoading }) {
  const update = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.status || filters.category || filters.urgency ||
    filters.sentiment || filters.search;

  return (
    <div className="glass-card p-4 mb-6 animate-fade-in">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Status */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Status
          </label>
          <select
            value={filters.status || ''}
            onChange={(e) => update('status', e.target.value)}
            className="input text-sm py-2"
            id="filter-status"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="auto_resolved">Auto-Resolved</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
            <option value="rejected">Rejected</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>

        {/* Category */}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Category
          </label>
          <select
            value={filters.category || ''}
            onChange={(e) => update('category', e.target.value)}
            className="input text-sm py-2"
            id="filter-category"
          >
            <option value="">All Categories</option>
            <option value="refund">Refund</option>
            <option value="tracking">Tracking</option>
            <option value="damaged_product">Damaged Product</option>
            <option value="wrong_item">Wrong Item</option>
            <option value="complaint">Complaint</option>
            <option value="faq">FAQ</option>
            <option value="policy">Policy</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Urgency */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Urgency
          </label>
          <select
            value={filters.urgency || ''}
            onChange={(e) => update('urgency', e.target.value)}
            className="input text-sm py-2"
            id="filter-urgency"
          >
            <option value="">All</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🟢 Low</option>
          </select>
        </div>

        {/* Sentiment */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Sentiment
          </label>
          <select
            value={filters.sentiment || ''}
            onChange={(e) => update('sentiment', e.target.value)}
            className="input text-sm py-2"
            id="filter-sentiment"
          >
            <option value="">All</option>
            <option value="angry">😡 Angry</option>
            <option value="frustrated">😤 Frustrated</option>
            <option value="neutral">😐 Neutral</option>
            <option value="positive">😊 Positive</option>
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            Search
          </label>
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => update('search', e.target.value)}
            placeholder="Customer email…"
            className="input text-sm py-2"
            id="filter-search"
          />
        </div>

        {/* Clear button */}
        {hasActiveFilters && (
          <button
            onClick={onClear}
            disabled={isLoading}
            className="btn-ghost text-xs px-3 py-2 whitespace-nowrap"
            id="filter-clear"
          >
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  );
}
