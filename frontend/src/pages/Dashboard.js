import React from 'react';
import useAnalytics from '../hooks/useAnalytics';
import {
  Ticket, Bot, CheckCircle, Clock, TrendingUp, TrendingDown,
  RefreshCw, AlertTriangle, Zap,
} from 'lucide-react';

/**
 * Dashboard — summary overview with KPI stats, AI performance, and status breakdown.
 */
export default function Dashboard() {
  const { data, isLoading, error, refetch } = useAnalytics();
  const { overview, yesterday_total } = data;

  const delta = (overview.total || 0) - (yesterday_total || 0);
  const deltaPositive = delta >= 0;

  const stats = [
    {
      label: 'Total Tickets',
      value: overview.total,
      icon: Ticket,
      bg: 'bg-primary-50 dark:bg-primary-900/20',
      text: 'text-primary-600 dark:text-primary-400',
      delta,
    },
    {
      label: 'Auto-Resolved',
      value: overview.auto_resolved,
      icon: Bot,
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Approved & Sent',
      value: overview.approved,
      icon: CheckCircle,
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Pending Review',
      value: overview.pending,
      icon: Clock,
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      pulse: overview.pending > 0,
    },
  ];

  const autoResolveRate = overview.auto_resolve_rate || 0;
  const approvalRate = overview.manager_approval_rate || 0;
  const avgTime = overview.avg_resolution_time_minutes || 0;

  if (error && !isLoading) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Failed to Load Dashboard</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
        <button onClick={refetch} className="btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Overview of your support operations
          </p>
        </div>
        <button onClick={refetch} className="btn-ghost text-sm" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-5">
              <div className="skeleton h-10 w-10 rounded-xl mb-3" />
              <div className="skeleton h-8 w-16 mb-2" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.text}`} />
                </div>
                {stat.delta !== undefined && (
                  <div className={`flex items-center gap-0.5 text-xs font-semibold ${
                    deltaPositive ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {deltaPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {deltaPositive ? '+' : ''}{stat.delta} today
                  </div>
                )}
                {stat.pulse && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                  </span>
                )}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI Performance + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* AI Performance */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">AI Performance</h2>
          </div>
          <div className="space-y-5">
            {/* Auto-resolve rate */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-gray-600 dark:text-gray-400">Auto-resolve rate</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{autoResolveRate}%</span>
              </div>
              <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(autoResolveRate, 100)}%` }}
                />
              </div>
            </div>
            {/* Approval rate */}
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-gray-600 dark:text-gray-400">Manager approval rate</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{approvalRate}%</span>
              </div>
              <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(approvalRate, 100)}%` }}
                />
              </div>
            </div>
            {/* Avg resolution time */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Avg resolution time</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {avgTime}<span className="text-xs font-normal text-gray-400 ml-1">min</span>
              </span>
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">Status Breakdown</h2>
          <div className="space-y-3">
            {[
              { label: 'Pending', count: overview.pending, color: 'bg-amber-500' },
              { label: 'Auto-Resolved', count: overview.auto_resolved, color: 'bg-emerald-500' },
              { label: 'Approved', count: overview.approved, color: 'bg-blue-500' },
              { label: 'Rejected', count: overview.rejected, color: 'bg-red-500' },
              { label: 'Escalated', count: overview.escalated, color: 'bg-purple-500' },
            ].map((item) => {
              const total = overview.total || 1;
              const pct = Math.round(((item.count || 0) / total) * 100);
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.count || 0}</span>
                      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href="/tickets?status=pending" className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors text-center">
            <Clock className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{overview.pending} Pending</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Review now</p>
          </a>
          <a href="/analytics" className="p-4 rounded-xl bg-primary-50 dark:bg-primary-900/10 hover:bg-primary-100 dark:hover:bg-primary-900/20 transition-colors text-center">
            <TrendingUp className="w-6 h-6 text-primary-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Analytics</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">View charts</p>
          </a>
          <a href="/audit" className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors text-center">
            <CheckCircle className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Audit Log</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Review actions</p>
          </a>
        </div>
      </div>
    </div>
  );
}
