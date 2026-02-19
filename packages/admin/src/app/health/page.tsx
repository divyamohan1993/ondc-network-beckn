'use client';

import { useEffect, useState, useCallback } from 'react';

interface ServiceHealth {
  name: string;
  url: string;
  status: 'UP' | 'DOWN' | 'CHECKING';
  responseTime?: number;
  uptime?: string;
  lastChecked?: string;
}

const SERVICES: { name: string; url: string }[] = [
  { name: 'Registry', url: process.env.NEXT_PUBLIC_REGISTRY_URL || 'http://localhost:3000' },
  { name: 'Gateway', url: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001' },
  { name: 'BAP', url: process.env.NEXT_PUBLIC_BAP_URL || 'http://localhost:3002' },
  { name: 'BPP', url: process.env.NEXT_PUBLIC_BPP_URL || 'http://localhost:3004' },
  { name: 'Mock Server', url: process.env.NEXT_PUBLIC_MOCK_URL || 'http://localhost:3005' },
];

export default function HealthPage() {
  const [services, setServices] = useState<ServiceHealth[]>(
    SERVICES.map((s) => ({ ...s, status: 'CHECKING' })),
  );
  const [autoRefresh, setAutoRefresh] = useState(true);

  const checkHealth = useCallback(async () => {
    const results = await Promise.all(
      SERVICES.map(async (service) => {
        const start = Date.now();
        try {
          const res = await fetch(`/api/health/check?url=${encodeURIComponent(service.url)}`, {
            signal: AbortSignal.timeout(5000),
          });
          const data = await res.json();
          const responseTime = Date.now() - start;

          return {
            name: service.name,
            url: service.url,
            status: data.ok ? 'UP' : 'DOWN',
            responseTime,
            uptime: data.uptime ?? 'N/A',
            lastChecked: new Date().toLocaleTimeString(),
          } as ServiceHealth;
        } catch {
          return {
            name: service.name,
            url: service.url,
            status: 'DOWN',
            responseTime: Date.now() - start,
            lastChecked: new Date().toLocaleTimeString(),
          } as ServiceHealth;
        }
      }),
    );

    setServices(results);
  }, []);

  useEffect(() => {
    checkHealth();

    if (autoRefresh) {
      const interval = setInterval(checkHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, checkHealth]);

  const upCount = services.filter((s) => s.status === 'UP').length;
  const downCount = services.filter((s) => s.status === 'DOWN').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">
            <span className="text-gradient-saffron">Network Health</span>
          </h1>
          <p className="page-subtitle">
            {upCount} services up, {downCount} services down
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ash-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-surface-border text-saffron-500 focus:ring-saffron-500/20 bg-surface-raised"
            />
            Auto-refresh (30s)
          </label>
          <button onClick={checkHealth} className="btn-secondary text-sm">
            Refresh Now
          </button>
        </div>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <div key={service.name} className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-white">{service.name}</h3>
                <p className="text-xs text-ash-600 mt-0.5">{service.url}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  service.status === 'UP'
                    ? 'badge-green'
                    : service.status === 'DOWN'
                    ? 'badge-red'
                    : 'badge-gray'
                }`}
              >
                <span
                  className={
                    service.status === 'UP'
                      ? 'status-dot-up'
                      : service.status === 'DOWN'
                      ? 'status-dot-down'
                      : 'status-dot-pending'
                  }
                />
                {service.status}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ash-500">Response Time</span>
                <span className="font-medium text-white">
                  {service.responseTime !== undefined ? `${service.responseTime}ms` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ash-500">Uptime</span>
                <span className="font-medium text-white">{service.uptime ?? '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ash-500">Last Checked</span>
                <span className="text-ash-600 text-xs">{service.lastChecked ?? '-'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
