'use client';

import { useEffect, useState, useCallback } from 'react';
import StatsCard from '@/components/stats-card';

type AlertSeverity = 'critical' | 'warning' | 'info';
type AlertStatus = 'open' | 'acknowledged' | 'resolved';

interface Alert {
  id: string;
  severity: AlertSeverity;
  service: string;
  message: string;
  createdAt: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

interface AlertSummary {
  openCritical: number;
  openWarnings: number;
  openInfo: number;
  acknowledged: number;
  resolvedToday: number;
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  if (severity === 'critical') {
    return (
      <div className="w-8 h-8 bg-ember-500/20 rounded-lg flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-ember-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (severity === 'warning') {
    return (
      <div className="w-8 h-8 bg-gold-500/20 rounded-lg flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDays}d ago`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | AlertSeverity>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | AlertStatus>('all');

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/health-monitor/alerts');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAlerts(data);
          // Compute summary from data
          const openCritical = data.filter((a: Alert) => a.status === 'open' && a.severity === 'critical').length;
          const openWarnings = data.filter((a: Alert) => a.status === 'open' && a.severity === 'warning').length;
          const openInfo = data.filter((a: Alert) => a.status === 'open' && a.severity === 'info').length;
          const acknowledged = data.filter((a: Alert) => a.status === 'acknowledged').length;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const resolvedToday = data.filter(
            (a: Alert) => a.status === 'resolved' && a.resolvedAt && new Date(a.resolvedAt) >= today,
          ).length;
          setSummary({ openCritical, openWarnings, openInfo, acknowledged, resolvedToday });
        } else if (data.alerts) {
          setAlerts(data.alerts);
          if (data.summary) {
            setSummary(data.summary);
          }
        }
      }
    } catch {
      // Silently retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  async function acknowledgeAlert(alertId: string) {
    setAcknowledging(alertId);
    try {
      const res = await fetch('/api/health-monitor/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, action: 'acknowledge' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to acknowledge alert');
      }
      await fetchAlerts();
    } catch {
      alert('Failed to acknowledge alert');
    } finally {
      setAcknowledging(null);
    }
  }

  async function resolveAlert(alertId: string) {
    try {
      const res = await fetch('/api/health-monitor/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, action: 'resolve' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to resolve alert');
      }
      await fetchAlerts();
    } catch {
      alert('Failed to resolve alert');
    }
  }

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  function statusBadge(status: AlertStatus) {
    const map: Record<string, string> = {
      open: 'badge-red',
      acknowledged: 'badge-yellow',
      resolved: 'badge-green',
    };
    return map[status] ?? 'badge-gray';
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title font-display"><span className="text-gradient-saffron">Alerts</span></h1>
          <p className="page-subtitle">Monitor and manage system alerts</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-ash-500">
            <Spinner />
            <span>Loading alerts...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Alerts</span></h1>
        <p className="page-subtitle">Monitor and manage system alerts</p>
      </div>

      {/* Alert Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Open Alerts"
          value={(summary?.openCritical ?? 0) + (summary?.openWarnings ?? 0) + (summary?.openInfo ?? 0)}
          color="gold"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          }
        />
        <div className="rounded-xl p-6 bg-ember-500/10 border border-ember-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ash-500">Critical</p>
              <p className="mt-2 text-3xl font-bold text-ember-400">{summary?.openCritical ?? 0}</p>
            </div>
            <div className="w-12 h-12 bg-ember-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        <StatsCard
          label="Acknowledged"
          value={summary?.acknowledged ?? 0}
          color="saffron"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatsCard
          label="Resolved Today"
          value={summary?.resolvedToday ?? 0}
          color="teal"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <div>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as 'all' | AlertSeverity)}
            className="select text-sm"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | AlertStatus)}
            className="select text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <span className="text-sm text-ash-500">
          {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Alert List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="card text-center py-12">
            <svg className="w-12 h-12 text-ash-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-ash-600 text-sm">No alerts matching current filters</p>
          </div>
        ) : (
          filteredAlerts.map((alertItem) => (
            <div
              key={alertItem.id}
              className={`card transition-colors ${
                alertItem.severity === 'critical' && alertItem.status === 'open'
                  ? 'border-ember-500/30 bg-ember-500/5'
                  : alertItem.severity === 'warning' && alertItem.status === 'open'
                  ? 'border-gold-500/30 bg-gold-500/5'
                  : alertItem.status === 'resolved'
                  ? 'border-teal-500/20 bg-teal-500/5 opacity-75'
                  : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <SeverityIcon severity={alertItem.severity} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="badge-blue text-xs">{alertItem.service}</span>
                        <span className={statusBadge(alertItem.status)}>
                          {alertItem.status.toUpperCase()}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            alertItem.severity === 'critical'
                              ? 'bg-ember-500/20 text-ember-400'
                              : alertItem.severity === 'warning'
                              ? 'bg-gold-500/20 text-gold-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}
                        >
                          {alertItem.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-white font-medium">{alertItem.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-ash-600">
                        <span>Created {timeAgo(alertItem.createdAt)}</span>
                        <span>{new Date(alertItem.createdAt).toLocaleString()}</span>
                        {alertItem.acknowledgedBy && (
                          <span>Acknowledged by {alertItem.acknowledgedBy}</span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {alertItem.status === 'open' && (
                        <button
                          onClick={() => acknowledgeAlert(alertItem.id)}
                          disabled={acknowledging === alertItem.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gold-400 bg-gold-500/10 rounded-lg hover:bg-gold-500/20 transition-colors disabled:opacity-40"
                        >
                          {acknowledging === alertItem.id ? (
                            <Spinner />
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Acknowledge
                            </>
                          )}
                        </button>
                      )}
                      {(alertItem.status === 'open' || alertItem.status === 'acknowledged') && (
                        <button
                          onClick={() => resolveAlert(alertItem.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
