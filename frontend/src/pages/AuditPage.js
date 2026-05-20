import React from 'react';
import useAuditLogs from '../hooks/useAuditLogs';
import { formatDistanceToNow } from 'date-fns';
import {
  Download, ChevronLeft, ChevronRight, FileText,
  Check, X, Pencil, RotateCcw, Send, AlertTriangle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* Action icon mapping */
const ACTION_ICONS = {
  approved: { icon: Check, color: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30' },
  rejected: { icon: X, color: 'text-red-500 bg-red-100 dark:bg-red-900/30' },
  edited: { icon: Pencil, color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30' },
  regenerated: { icon: RotateCcw, color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30' },
  sent: { icon: Send, color: 'text-primary-500 bg-primary-100 dark:bg-primary-900/30' },
  email_failed: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30' },
};

const ACTIONS = [
  'approved', 'rejected', 'edited', 'regenerated', 'sent', 'email_failed',
];

/**
 * AuditPage — searchable, filterable audit trail table with CSV export.
 */
export default function AuditPage() {
  const {
    logs, pagination, filters, isLoading, error,
    setFilters, setPage, exportCSV,
  } = useAuditLogs();

  const handleExport = async () => {
    try {
      await exportCSV();
      toast.success('Audit log exported');
    } catch {
      toast.error('Failed to export');
    }
  };

  const update = (key, value) => setFilters({ ...filters, [key]: value });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {pagination.total} entries
          </p>
        </div>
        <button onClick={handleExport} className="btn-primary text-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action</label>
            <select value={filters.action || ''} onChange={(e) => update('action', e.target.value)}
              className="input text-sm py-2">
              <option value="">All Actions</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>{a.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" value={filters.start_date || ''}
              onChange={(e) => update('start_date', e.target.value)} className="input text-sm py-2" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" value={filters.end_date || ''}
              onChange={(e) => update('end_date', e.target.value)} className="input text-sm py-2" />
          </div>
          {(filters.action || filters.start_date || filters.end_date) && (
            <button
              onClick={() => setFilters({ action: '', ticket_id: '', start_date: '', end_date: '' })}
              className="btn-ghost text-xs px-3 py-2"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-6">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && logs.length === 0 && (
        <div className="glass-card p-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className="skeleton w-8 h-8 rounded-lg" />
              <div className="flex-1">
                <div className="skeleton h-4 w-48 mb-1.5" />
                <div className="skeleton h-3 w-32" />
              </div>
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && logs.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No audit entries found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Actions will appear here as tickets are processed.
          </p>
        </div>
      )}

      {/* Table */}
      {logs.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ticket</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">By</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actionInfo = ACTION_ICONS[log.action] || {
                    icon: FileText, color: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
                  };
                  const ActionIcon = actionInfo.icon;
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400" title={new Date(log.created_at).toLocaleString()}>
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {log.ticket_subject || '—'}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{log.customer_email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${actionInfo.color}`}>
                          <ActionIcon className="w-3 h-3" />
                          {log.action?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {log.performed_by_name || 'System'}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[250px]">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={log.notes}>
                          {log.notes || '—'}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isLoading}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPage(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && logs.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-primary-500 text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-1.5 animate-fade-in">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading…
        </div>
      )}
    </div>
  );
}
