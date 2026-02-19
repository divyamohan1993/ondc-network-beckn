'use client';

import { useEffect, useState } from 'react';

interface SimulationRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  config: {
    baps?: number;
    bpps?: number;
    orders?: number;
    domains?: string[];
  };
  stats: Record<string, any> | null;
  status: string;
}

export default function SimulationPage() {
  const [baps, setBaps] = useState(2);
  const [bpps, setBpps] = useState(3);
  const [orders, setOrders] = useState(10);
  const [selectedDomains, setSelectedDomains] = useState<string[]>(['ONDC:RET10']);
  const [liveMode, setLiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const allDomains = [
    'ONDC:RET10',
    'ONDC:RET11',
    'ONDC:RET12',
    'ONDC:RET13',
    'ONDC:RET14',
    'ONDC:NTS10',
    'ONDC:TRV10',
    'ONDC:FIS10',
  ];

  function toggleDomain(domain: string) {
    setSelectedDomains((prev) =>
      prev.includes(domain)
        ? prev.filter((d) => d !== domain)
        : [...prev, domain],
    );
  }

  async function fetchRuns() {
    try {
      const res = await fetch('/api/simulation/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch {
      // ignore
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    fetchRuns();
  }, []);

  async function startSimulation() {
    setLoading(true);
    try {
      const res = await fetch('/api/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baps,
          bpps,
          orders,
          domains: selectedDomains,
          live: liveMode,
        }),
      });

      if (res.ok) {
        await fetchRuns();
      }
    } finally {
      setLoading(false);
    }
  }

  async function resetSimulatedData() {
    if (!confirm('This will delete ALL simulated data. Are you sure?')) return;

    setResetLoading(true);
    try {
      await fetch('/api/simulation/reset', { method: 'POST' });
      await fetchRuns();
    } finally {
      setResetLoading(false);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      RUNNING: 'badge-blue',
      COMPLETED: 'badge-green',
      FAILED: 'badge-red',
    };
    return map[status] ?? 'badge-gray';
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Simulation</span></h1>
        <p className="page-subtitle">Run network simulations and manage simulated data</p>
      </div>

      {/* Control Panel */}
      <div className="card">
        <h3 className="card-header">Simulation Control Panel</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* BAPs Count */}
          <div>
            <label className="block text-sm font-medium text-ash-300 mb-2">Number of BAPs</label>
            <input
              type="number"
              min={1}
              max={50}
              value={baps}
              onChange={(e) => setBaps(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>

          {/* BPPs Count */}
          <div>
            <label className="block text-sm font-medium text-ash-300 mb-2">Number of BPPs</label>
            <input
              type="number"
              min={1}
              max={50}
              value={bpps}
              onChange={(e) => setBpps(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>

          {/* Orders Count */}
          <div>
            <label className="block text-sm font-medium text-ash-300 mb-2">Number of Orders</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={orders}
              onChange={(e) => setOrders(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>
        </div>

        {/* Domain Checkboxes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-ash-300 mb-2">Domains</label>
          <div className="flex flex-wrap gap-3">
            {allDomains.map((domain) => (
              <label
                key={domain}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedDomains.includes(domain)
                    ? 'bg-saffron-500/10 border-saffron-500/30 text-saffron-400'
                    : 'bg-white/5 border-white/10 text-ash-300 hover:bg-white/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedDomains.includes(domain)}
                  onChange={() => toggleDomain(domain)}
                  className="rounded border-white/20 text-saffron-400 focus:ring-saffron-500 bg-transparent"
                />
                <span className="text-sm">{domain}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Live Mode Toggle */}
        <div className="mb-6">
          <label className="flex items-center gap-3">
            <button
              onClick={() => setLiveMode(!liveMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                liveMode ? 'bg-saffron-500' : 'bg-ash-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  liveMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-ash-300">
              Live Simulation Mode
              <span className="text-xs text-ash-600 ml-1">(continuous traffic generation)</span>
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={startSimulation}
            disabled={loading || selectedDomains.length === 0}
            className="btn-primary"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running Simulation...
              </span>
            ) : (
              'Start Simulation'
            )}
          </button>
          <button
            onClick={resetSimulatedData}
            disabled={resetLoading}
            className="btn-danger"
          >
            {resetLoading ? 'Resetting...' : 'Reset Simulated Data'}
          </button>
        </div>
      </div>

      {/* Simulation History */}
      <div className="card">
        <h3 className="card-header">Simulation Run History</h3>
        {runsLoading ? (
          <div className="flex items-center justify-center py-8 text-ash-600">
            Loading...
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -mb-6">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Config</th>
                  <th>Status</th>
                  <th>Stats</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="font-mono text-xs">{run.id.slice(0, 8)}...</td>
                    <td className="text-xs text-ash-500">
                      {run.started_at ? new Date(run.started_at).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs text-ash-500">
                      {run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}
                    </td>
                    <td>
                      <span className="text-xs">
                        {run.config?.baps ?? 0} BAPs, {run.config?.bpps ?? 0} BPPs, {run.config?.orders ?? 0} orders
                      </span>
                    </td>
                    <td>
                      <span className={statusBadge(run.status)}>{run.status}</span>
                    </td>
                    <td>
                      {run.stats ? (
                        <code className="text-xs bg-white/10 px-2 py-1 rounded font-mono text-ash-300">
                          {JSON.stringify(run.stats).slice(0, 50)}
                          {JSON.stringify(run.stats).length > 50 ? '...' : ''}
                        </code>
                      ) : (
                        <span className="text-ash-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-ash-600">
                      No simulation runs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
