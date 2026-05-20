import React from 'react';
import useAnalytics from '../hooks/useAnalytics';
import {
  RefreshCw, TrendingUp, TrendingDown, Clock, Bot, Ticket, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';

/* ── Colors ──────────────────────────────────────────────── */
const CATEGORY_COLORS = [
  '#6366F1', '#EF4444', '#F59E0B', '#10B981',
  '#8B5CF6', '#06B6D4', '#EC4899', '#64748B',
];
const SENTIMENT_COLORS = {
  angry: '#EF4444', frustrated: '#F97316',
  neutral: '#94A3B8', positive: '#10B981',
};
const SENTIMENT_EMOJI = {
  angry: '😡', frustrated: '😤', neutral: '😐', positive: '😊',
};

/* ── Custom Tooltip ──────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 px-3 py-2 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-xs">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

/* ── Skeleton Card ───────────────────────────────────────── */
const SkeletonCard = () => (
  <div className="glass-card p-5">
    <div className="skeleton h-4 w-24 mb-3" />
    <div className="skeleton h-8 w-16 mb-2" />
    <div className="skeleton h-3 w-32" />
  </div>
);

const SkeletonChart = ({ height = 'h-72' }) => (
  <div className="glass-card p-6">
    <div className="skeleton h-5 w-48 mb-4" />
    <div className={`skeleton w-full ${height} rounded-lg`} />
  </div>
);

/**
 * AnalyticsPage — comprehensive dashboard with KPI cards, area chart,
 * donut, bar charts, and LLM usage comparison.
 */
export default function AnalyticsPage() {
  const { data, isLoading, error, refetch } = useAnalytics();
  const { overview, trends, categories, sentiments, llm_usage, top_issues, yesterday_total } = data;

  /* ── KPI deltas ──────────────────────────────────────── */
  const todayTotal = overview.total || 0;
  const delta = todayTotal - (yesterday_total || 0);
  const deltaPositive = delta >= 0;

  /* ── Chart data transforms ─────────────────────────── */
  const trendData = (trends.last_7_days || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    Total: d.total || 0,
    'Auto-Resolved': d.auto_resolved || 0,
    Approved: d.approved || 0,
  }));

  const categoryData = Object.entries(categories).map(([name, value], i) => ({
    name: name.replace('_', ' '),
    value: parseInt(value),
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
  const categoryTotal = categoryData.reduce((s, c) => s + c.value, 0);

  const sentimentData = Object.entries(sentiments).map(([name, count]) => ({
    name: `${SENTIMENT_EMOJI[name] || ''} ${name}`,
    count: parseInt(count),
    fill: SENTIMENT_COLORS[name] || '#94A3B8',
  }));

  const llmData = Object.entries(llm_usage).map(([provider, count]) => ({
    provider,
    count: parseInt(count),
  }));
  const llmTotal = llmData.reduce((s, l) => s + l.count, 0);

  /* ── Error state ─────────────────────────────────────── */
  if (error && !isLoading) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Failed to Load Analytics</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
        <button onClick={refetch} className="btn-primary">Retry</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            AI performance & ticket insights
          </p>
        </div>
        <button onClick={refetch} className="btn-ghost text-sm" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Tickets */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary-500" />
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold ${
                deltaPositive ? 'text-emerald-500' : 'text-red-500'
              }`}>
                {deltaPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {deltaPositive ? '+' : ''}{delta}
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.total}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Tickets</p>
          </div>

          {/* Auto-Resolve Rate */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-500" />
              </div>
              <TrendingUp className="w-3 h-3 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.auto_resolve_rate || 0}%
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Auto-Resolve Rate</p>
          </div>

          {/* Avg Resolution Time */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {overview.avg_resolution_time_minutes || 0}
              <span className="text-sm font-normal text-gray-400 ml-1">min</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg Resolution Time</p>
          </div>

          {/* Pending Now */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              {overview.pending > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{overview.pending}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pending Right Now</p>
          </div>
        </div>
      )}

      {/* ── Charts Grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Area Chart — 7-Day Trend (full width) */}
        {isLoading ? <SkeletonChart /> : (
          <div className="glass-card p-6 lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Ticket Volume — Last 7 Days
            </h2>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAuto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone" dataKey="Total" stroke="#6366F1" strokeWidth={2.5}
                    fill="url(#gradTotal)" dot={{ r: 4, fill: '#6366F1' }}
                  />
                  <Area
                    type="monotone" dataKey="Auto-Resolved" stroke="#10B981" strokeWidth={2}
                    fill="url(#gradAuto)" dot={{ r: 3, fill: '#10B981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                Not enough data yet — trends will appear after a few days
              </div>
            )}
          </div>
        )}

        {/* Donut Chart — Category Breakdown */}
        {isLoading ? <SkeletonChart /> : (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Category Breakdown
            </h2>
            {categoryData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={categoryData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                      paddingAngle={3} animationDuration={800}
                    >
                      {categoryData.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    {/* Center label */}
                    <text
                      x="50%" y="47%" textAnchor="middle"
                      className="fill-gray-900 dark:fill-white text-2xl font-bold"
                    >
                      {categoryTotal}
                    </text>
                    <text
                      x="50%" y="55%" textAnchor="middle"
                      className="fill-gray-400 text-xs"
                    >
                      total
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {categoryData.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-gray-600 dark:text-gray-400 truncate">{c.name}</span>
                      <span className="font-semibold text-gray-900 dark:text-white ml-auto">{c.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                No category data yet
              </div>
            )}
          </div>
        )}

        {/* Bar Chart — Sentiment Distribution */}
        {isLoading ? <SkeletonChart /> : (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Sentiment Distribution
            </h2>
            {sentimentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sentimentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Tickets" radius={[8, 8, 0, 0]} animationDuration={800}>
                    {sentimentData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                No sentiment data yet
              </div>
            )}
          </div>
        )}

        {/* Horizontal Bar — LLM Usage */}
        {isLoading ? <SkeletonChart height="h-40" /> : (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              LLM Provider Usage
            </h2>
            {llmData.length > 0 ? (
              <div className="space-y-4">
                {llmData.map((l) => {
                  const pct = llmTotal > 0 ? Math.round((l.count / llmTotal) * 100) : 0;
                  const getProviderStyles = (provider) => {
                    if (provider === 'grok') return { letter: 'G', badge: 'bg-grok/20 text-grok-light', bar: 'bg-gradient-to-r from-grok to-purple-400' };
                    if (provider === 'openrouter') return { letter: 'R', badge: 'bg-openrouter/20 text-openrouter-light', bar: 'bg-gradient-to-r from-openrouter to-blue-400' };
                    return { letter: 'O', badge: 'bg-openai/20 text-openai-light', bar: 'bg-gradient-to-r from-openai to-emerald-400' };
                  };
                  const styles = getProviderStyles(l.provider);
                  
                  return (
                    <div key={l.provider}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${styles.badge}`}>
                            {styles.letter}
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                            {l.provider}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">{l.count}</span>
                          <span className="text-xs text-gray-400">{pct}%</span>
                        </div>
                      </div>
                      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${styles.bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                No LLM usage data
              </div>
            )}
          </div>
        )}

        {/* Top Issues Table */}
        {isLoading ? <SkeletonChart height="h-48" /> : (
          <div className="glass-card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Top Issues
            </h2>
            {(top_issues || []).length > 0 ? (
              <div className="space-y-3">
                {top_issues.map((issue, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-md bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                        {(issue.category || '').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {issue.count} tickets
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        ~{issue.avg_resolution_time || 0}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
                Not enough data yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
