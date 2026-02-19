'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import StatsCard from '@/components/stats-card';

interface ServiceInfo {
  name: string;
  displayName: string;
  status: 'running' | 'stopped' | 'restarting' | 'unknown';
  cpu: number;
  memory: number;
  lastHealthCheck: string | null;
}

interface HealthStatus {
  totalServices: number;
  servicesUp: number;
  servicesDown: number;
  activeSecrets: number;
  lastSecretRotation: string | null;
  openAlerts: number;
  mode: 'production' | 'development';
}

const SERVICE_NAMES = [
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

const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  postgres: 'PostgreSQL',
  redis: 'Redis',
  rabbitmq: 'RabbitMQ',
  registry: 'Registry',
  gateway: 'Gateway',
  bap: 'BAP Client',
  bpp: 'BPP Provider',
  admin: 'Admin Panel',
  docs: 'Documentation',
  vault: 'Secret Vault',
  orchestrator: 'Orchestrator',
  'health-monitor': 'Health Monitor',
  'log-aggregator': 'Log Aggregator',
  'simulation-engine': 'Simulation Engine',
  'mock-server': 'Mock Server',
};

function StatusDot({ status }: { status: string }) {
  const dotClass =
    status === 'running'
      ? 'status-dot-up'
      : status === 'stopped'
      ? 'status-dot-down'
      : status === 'restarting'
      ? 'status-dot-pending'
      : 'status-dot w-2.5 h-2.5 rounded-full bg-ash-600';

  return <span className={`inline-block ${dotClass}`} />;
}

function UsageBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-surface-raised rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function ControlPanelPage() {
  const { data: session } = useSession();
  const isSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';

  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState<string | null>(null);
  const [mode, setMode] = useState<'production' | 'development'>('development');

  const fetchServices = useCallback(async () => {
    try {
      const [servicesRes, healthRes] = await Promise.all([
        fetch('/api/orchestrator/services'),
        fetch('/api/health-monitor/status'),
      ]);

      if (servicesRes.ok) {
        const data = await servicesRes.json();
        if (Array.isArray(data)) {
          setServices(data);
        } else {
          // If API returns empty or unexpected shape, create default entries
          setServices(
            SERVICE_NAMES.map((name) => ({
              name,
              displayName: SERVICE_DISPLAY_NAMES[name] || name,
              status: 'unknown' as const,
              cpu: 0,
              memory: 0,
              lastHealthCheck: null,
            })),
          );
        }
      } else {
        // Populate with default data on API failure
        setServices(
          SERVICE_NAMES.map((name) => ({
            name,
            displayName: SERVICE_DISPLAY_NAMES[name] || name,
            status: 'unknown' as const,
            cpu: 0,
            memory: 0,
            lastHealthCheck: null,
          })),
        );
      }

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setHealthStatus(healthData);
        if (healthData.mode) {
          setMode(healthData.mode);
        }
      }

      setError(null);
    } catch (err) {
      setError('Failed to fetch service data. Retrying...');
      // Still populate default services on error
      if (services.length === 0) {
        setServices(
          SERVICE_NAMES.map((name) => ({
            name,
            displayName: SERVICE_DISPLAY_NAMES[name] || name,
            status: 'unknown' as const,
            cpu: 0,
            memory: 0,
            lastHealthCheck: null,
          })),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [services.length]);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  async function handleServiceAction(serviceName: string, action: 'start' | 'stop' | 'restart') {
    if (!isSuperAdmin) return;
    setActionInProgress(`${serviceName}-${action}`);
    try {
      const res = await fetch(`/api/orchestrator/services/${serviceName}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action} ${serviceName}`);
      }
      await fetchServices();
    } catch {
      alert(`Failed to ${action} ${serviceName}`);
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleBulkAction(action: 'start-all' | 'stop-all' | 'restart-all') {
    if (!isSuperAdmin) return;
    const labels: Record<string, string> = {
      'start-all': 'start all services',
      'stop-all': 'stop all services',
      'restart-all': 'restart all services',
    };
    if (!window.confirm(`Are you sure you want to ${labels[action]}?`)) return;

    setBulkActionInProgress(action);
    try {
      const res = await fetch(`/api/orchestrator/services/bulk/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${labels[action]}`);
      }
      await fetchServices();
    } catch {
      alert(`Failed to ${labels[action]}`);
    } finally {
      setBulkActionInProgress(null);
    }
  }

  async function handleModeSwitch() {
    if (!isSuperAdmin) return;
    const newMode = mode === 'production' ? 'development' : 'production';
    const confirmMsg =
      newMode === 'production'
        ? 'Switch to Production mode? This will apply production configurations.'
        : 'Switch to Development mode? This will apply development configurations.';
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch('/api/orchestrator/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setMode(newMode);
      } else {
        alert('Failed to switch mode');
      }
    } catch {
      alert('Failed to switch mode');
    }
  }

  const servicesUp = services.filter((s) => s.status === 'running').length;
  const servicesDown = services.filter((s) => s.status === 'stopped' || s.status === 'unknown').length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title">
            <span className="text-gradient-saffron">Super Admin Control Panel</span>
          </h1>
          <p className="page-subtitle">Manage and monitor all platform services</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-ash-500">
            <Spinner />
            <span>Loading service status...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">
            <span className="text-gradient-saffron">Super Admin Control Panel</span>
          </h1>
          <p className="page-subtitle">
            Manage and monitor all platform services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={
              mode === 'production'
                ? {
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }
                : {
                    background: 'rgba(255, 107, 53, 0.12)',
                    color: '#FF8C42',
                    border: '1px solid rgba(255, 107, 53, 0.2)',
                  }
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                mode === 'production' ? 'bg-ember-500' : 'bg-saffron-500'
              }`}
            />
            {mode === 'production' ? 'PRODUCTION' : 'DEVELOPMENT'}
          </span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#F87171',
          }}
        >
          {error}
        </div>
      )}

      {/* System Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Total Services"
          value={`${servicesUp}/${services.length} up`}
          color="saffron"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          }
        />
        <StatsCard
          label="Active Secrets"
          value={healthStatus?.activeSecrets ?? 0}
          color="gold"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />
        <StatsCard
          label="Open Alerts"
          value={healthStatus?.openAlerts ?? 0}
          color="ember"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
        />
        <StatsCard
          label="Current Mode"
          value={mode === 'production' ? 'Production' : 'Development'}
          color="teal"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="card-header">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleBulkAction('start-all')}
            disabled={!isSuperAdmin || bulkActionInProgress !== null}
            className="btn-success"
          >
            {bulkActionInProgress === 'start-all' ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Starting All...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
                Start All Services
              </span>
            )}
          </button>
          <button
            onClick={() => handleBulkAction('stop-all')}
            disabled={!isSuperAdmin || bulkActionInProgress !== null}
            className="btn-danger"
          >
            {bulkActionInProgress === 'stop-all' ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Stopping All...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                Stop All Services
              </span>
            )}
          </button>
          <button
            onClick={() => handleBulkAction('restart-all')}
            disabled={!isSuperAdmin || bulkActionInProgress !== null}
            className="btn-warning"
          >
            {bulkActionInProgress === 'restart-all' ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Restarting All...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restart All
              </span>
            )}
          </button>
          <button
            onClick={handleModeSwitch}
            disabled={!isSuperAdmin}
            className={mode === 'production' ? 'btn-primary' : 'btn-secondary'}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {mode === 'production' ? 'Switch to Development Mode' : 'Switch to Production Mode'}
            </span>
          </button>
        </div>
        {!isSuperAdmin && (
          <p className="text-xs text-gold-400 mt-3">
            You need SUPER_ADMIN privileges to perform service actions.
          </p>
        )}
      </div>

      {/* Service Control Grid */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 font-display tracking-tight">Service Control Grid</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {services.map((service) => {
            const displayName = SERVICE_DISPLAY_NAMES[service.name] || service.displayName || service.name;
            const isActionPending =
              actionInProgress?.startsWith(service.name + '-') ?? false;

            return (
              <div key={service.name} className="card">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={service.status} />
                    <div>
                      <h4 className="font-semibold text-white">{displayName}</h4>
                      <p className="text-xs text-ash-600">{service.name}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      service.status === 'running'
                        ? 'badge-green'
                        : service.status === 'stopped'
                        ? 'badge-red'
                        : service.status === 'restarting'
                        ? 'badge-yellow'
                        : 'badge-gray'
                    }`}
                  >
                    {service.status.toUpperCase()}
                  </span>
                </div>

                {/* Usage Bars */}
                <div className="space-y-3 mb-4">
                  <div>
                    <div className="flex justify-between text-xs text-ash-500 mb-1">
                      <span>CPU</span>
                      <span>{service.cpu}%</span>
                    </div>
                    <UsageBar
                      value={service.cpu}
                      color={
                        service.cpu > 80
                          ? 'bg-ember-500'
                          : service.cpu > 60
                          ? 'bg-gold-500'
                          : 'bg-saffron-500'
                      }
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-ash-500 mb-1">
                      <span>Memory</span>
                      <span>{service.memory}%</span>
                    </div>
                    <UsageBar
                      value={service.memory}
                      color={
                        service.memory > 80
                          ? 'bg-ember-500'
                          : service.memory > 60
                          ? 'bg-gold-500'
                          : 'bg-teal-500'
                      }
                    />
                  </div>
                </div>

                {/* Last Health Check */}
                <div className="text-xs text-ash-600 mb-4">
                  Last health check:{' '}
                  {service.lastHealthCheck
                    ? new Date(service.lastHealthCheck).toLocaleTimeString()
                    : 'Never'}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-3 border-t border-surface-border">
                  <button
                    onClick={() => handleServiceAction(service.name, 'start')}
                    disabled={!isSuperAdmin || isActionPending || service.status === 'running'}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: 'rgba(46, 196, 182, 0.1)',
                      color: '#2EC4B6',
                    }}
                    onMouseEnter={(e) => {
                      if (!(e.currentTarget as HTMLButtonElement).disabled) {
                        e.currentTarget.style.background = 'rgba(46, 196, 182, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(46, 196, 182, 0.1)';
                    }}
                  >
                    {actionInProgress === `${service.name}-start` ? (
                      <Spinner />
                    ) : (
                      'Start'
                    )}
                  </button>
                  <button
                    onClick={() => handleServiceAction(service.name, 'stop')}
                    disabled={!isSuperAdmin || isActionPending || service.status === 'stopped'}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#F87171',
                    }}
                    onMouseEnter={(e) => {
                      if (!(e.currentTarget as HTMLButtonElement).disabled) {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                    }}
                  >
                    {actionInProgress === `${service.name}-stop` ? (
                      <Spinner />
                    ) : (
                      'Stop'
                    )}
                  </button>
                  <button
                    onClick={() => handleServiceAction(service.name, 'restart')}
                    disabled={!isSuperAdmin || isActionPending}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#FBBF24',
                    }}
                    onMouseEnter={(e) => {
                      if (!(e.currentTarget as HTMLButtonElement).disabled) {
                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)';
                    }}
                  >
                    {actionInProgress === `${service.name}-restart` ? (
                      <Spinner />
                    ) : (
                      'Restart'
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
