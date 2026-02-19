'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface LogEntry {
  id: string;
  timestamp: string;
  service: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
}

interface LogStats {
  volumeByService: { service: string; count: number }[];
  errorRateOverTime: { timestamp: string; count: number }[];
  topErrors: { message: string; count: number }[];
}

const ALL_SERVICES = [
  'postgres',
  'redis',
  'rabbitmq',
  'registry',
  'gateway',
  'bap',
  'bpp',
  'admin',
  'docs',
  'vault',
  'orchestrator',
  'health-monitor',
  'log-aggregator',
  'simulation-engine',
  'mock-server',
];

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;

const LEVEL_COLORS: Record<string, string> = {
  debug: 'badge-gray',
  info: 'badge-blue',
  warn: 'badge-yellow',
  error: 'badge-red',
  fatal: 'bg-red-600 text-white inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
};

const SERVICE_COLORS: Record<string, string> = {
  postgres: 'bg-blue-500/20 text-blue-400',
  redis: 'bg-red-500/20 text-red-400',
  rabbitmq: 'bg-orange-500/20 text-orange-400',
  registry: 'bg-purple-500/20 text-purple-400',
  gateway: 'bg-indigo-500/20 text-indigo-400',
  bap: 'bg-green-500/20 text-green-400',
  bpp: 'bg-teal-500/20 text-teal-400',
  admin: 'bg-cyan-500/20 text-cyan-400',
  docs: 'bg-ash-500/20 text-ash-400',
  vault: 'bg-amber-500/20 text-amber-400',
  orchestrator: 'bg-pink-500/20 text-pink-400',
  'health-monitor': 'bg-lime-500/20 text-lime-400',
  'log-aggregator': 'bg-emerald-500/20 text-emerald-400',
  'simulation-engine': 'bg-violet-500/20 text-violet-400',
  'mock-server': 'bg-fuchsia-500/20 text-fuchsia-400',
};

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return ts;
  }
}

export default function LogsExplorerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showStats, setShowStats] = useState(false);

  // Filters
  const [filterService, setFilterService] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Applied filters (only update on "Apply")
  const [appliedFilters, setAppliedFilters] = useState({
    service: 'all',
    level: 'all',
    search: '',
    from: '',
    to: '',
  });

  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (appliedFilters.service !== 'all') params.set('service', appliedFilters.service);
      if (appliedFilters.level !== 'all') params.set('level', appliedFilters.level);
      if (appliedFilters.search) params.set('search', appliedFilters.search);
      if (appliedFilters.from) params.set('from', new Date(appliedFilters.from).toISOString());
      if (appliedFilters.to) params.set('to', new Date(appliedFilters.to).toISOString());
      params.set('limit', '200');

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
        } else if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs);
          if (data.stats) {
            setStats(data.stats);
          }
        }
      }
    } catch {
      // Silently retry
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchLogs();
    if (streaming) {
      const interval = setInterval(fetchLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchLogs, streaming]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  function applyFilters() {
    setAppliedFilters({
      service: filterService,
      level: filterLevel,
      search: filterSearch,
      from: filterFrom,
      to: filterTo,
    });
  }

  function clearFilters() {
    setFilterService('all');
    setFilterLevel('all');
    setFilterSearch('');
    setFilterFrom('');
    setFilterTo('');
    setAppliedFilters({
      service: 'all',
      level: 'all',
      search: '',
      from: '',
      to: '',
    });
  }

  // Compute stats from local data if API doesn't provide them
  const computedStats: LogStats = stats || {
    volumeByService: ALL_SERVICES.map((svc) => ({
      service: svc,
      count: logs.filter((l) => l.service === svc).length,
    })).filter((s) => s.count > 0).sort((a, b) => b.count - a.count),
    errorRateOverTime: [],
    topErrors: (() => {
      const errorLogs = logs.filter((l) => l.level === 'error' || l.level === 'fatal');
      const counts: Record<string, number> = {};
      errorLogs.forEach((l) => {
        const key = l.message.slice(0, 80);
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts)
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    })(),
  };

  const maxVolume = Math.max(...computedStats.volumeByService.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title font-display">Logs <span className="text-gradient-saffron">Explorer</span></h1>
          <p className="page-subtitle">
            Real-time log stream and analysis across all services
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="btn-secondary text-sm"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {showStats ? 'Hide Stats' : 'Show Stats'}
            </span>
          </button>
          <button
            onClick={() => setStreaming(!streaming)}
            className={streaming ? 'btn-warning text-sm' : 'btn-success text-sm'}
          >
            <span className="flex items-center gap-2">
              {streaming ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Resume
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-ash-500 mb-1">Service</label>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              className="select"
            >
              <option value="all">All Services</option>
              {ALL_SERVICES.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[120px]">
            <label className="block text-xs font-medium text-ash-500 mb-1">Level</label>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="select"
            >
              <option value="all">All Levels</option>
              {LOG_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-ash-500 mb-1">From</label>
            <input
              type="datetime-local"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="input"
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-ash-500 mb-1">To</label>
            <input
              type="datetime-local"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="input"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-ash-500 mb-1">Search</label>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search log messages..."
              className="input"
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={applyFilters} className="btn-primary text-sm">
              Apply
            </button>
            <button onClick={clearFilters} className="btn-secondary text-sm">
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${showStats ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* Log Stream */}
        <div className={`${showStats ? 'lg:col-span-2' : ''}`}>
          <div className="card p-0">
            {/* Stream Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Log Stream</h3>
                {streaming && (
                  <span className="flex items-center gap-1 text-xs text-teal-400">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                    Live
                  </span>
                )}
                <span className="text-xs text-ash-600">{logs.length} entries</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-ash-500">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded border-white/20 text-saffron-400 focus:ring-saffron-500 bg-transparent"
                />
                Auto-scroll
              </label>
            </div>

            {/* Log Lines */}
            <div
              ref={logContainerRef}
              className="overflow-y-auto font-mono text-xs"
              style={{ height: '500px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center py-20 text-ash-600">
                  <span className="flex items-center gap-2">
                    <Spinner />
                    Loading logs...
                  </span>
                </div>
              ) : logs.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-ash-600">
                  No log entries found for the current filters
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-3 px-4 py-2 hover:bg-white/5 transition-colors ${
                        log.level === 'error' || log.level === 'fatal'
                          ? 'bg-ember-500/5'
                          : log.level === 'warn'
                          ? 'bg-gold-500/5'
                          : ''
                      }`}
                    >
                      {/* Timestamp */}
                      <span className="text-ash-600 whitespace-nowrap shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </span>

                      {/* Service Badge */}
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 ${
                          SERVICE_COLORS[log.service] || 'bg-ash-500/20 text-ash-400'
                        }`}
                      >
                        {log.service}
                      </span>

                      {/* Level Badge */}
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase whitespace-nowrap shrink-0 ${
                          LEVEL_COLORS[log.level] || 'badge-gray'
                        }`}
                      >
                        {log.level}
                      </span>

                      {/* Message */}
                      <span className="text-ash-300 break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Panel */}
        {showStats && (
          <div className="space-y-4">
            {/* Log Volume by Service */}
            <div className="card">
              <h4 className="text-sm font-semibold text-white mb-3">Log Volume by Service</h4>
              <div className="space-y-2">
                {computedStats.volumeByService.length === 0 ? (
                  <p className="text-xs text-ash-600">No data</p>
                ) : (
                  computedStats.volumeByService.map((item) => (
                    <div key={item.service}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-ash-500 truncate">{item.service}</span>
                        <span className="text-ash-300 font-medium">{item.count}</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-saffron-500 transition-all duration-300"
                          style={{ width: `${(item.count / maxVolume) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Error Rate */}
            <div className="card">
              <h4 className="text-sm font-semibold text-white mb-3">Error Rate</h4>
              {computedStats.errorRateOverTime.length > 0 ? (
                <div className="space-y-1">
                  {computedStats.errorRateOverTime.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-ash-500">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-ember-400 font-medium">{item.count} errors</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-xs text-ash-600">
                    {logs.filter((l) => l.level === 'error' || l.level === 'fatal').length} errors in current view
                  </p>
                </div>
              )}
            </div>

            {/* Top Errors */}
            <div className="card">
              <h4 className="text-sm font-semibold text-white mb-3">Top Error Messages</h4>
              {computedStats.topErrors.length === 0 ? (
                <p className="text-xs text-ash-600 text-center py-4">No errors found</p>
              ) : (
                <div className="space-y-2">
                  {computedStats.topErrors.map((item, idx) => (
                    <div key={idx} className="bg-ember-500/10 rounded-lg p-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-ember-300 font-mono break-all leading-relaxed">
                          {item.message}
                        </p>
                        <span className="badge-red shrink-0">{item.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
