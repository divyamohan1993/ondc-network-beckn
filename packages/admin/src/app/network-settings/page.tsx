'use client';

import { useEffect, useState, useCallback } from 'react';

interface NetworkSettings {
  // Identity (read-only, from env)
  domain: string;
  registryUrl: string;
  gatewayUrl: string;
  // Protocol (read-only)
  becknCoreVersion: string;
  country: string;
  defaultCity: string;
  // Editable policies
  signatureTtl: number;
  maxResponseTime: number;
  rateLimitMax: number;
  rateLimitWindow: number;
  dedupTtl: number;
  // Security (read-only display)
  dnsVerification: boolean;
  certValidation: boolean;
}

const defaultSettings: NetworkSettings = {
  domain: '',
  registryUrl: '',
  gatewayUrl: '',
  becknCoreVersion: '',
  country: '',
  defaultCity: '',
  signatureTtl: 300,
  maxResponseTime: 30000,
  rateLimitMax: 100,
  rateLimitWindow: 60,
  dedupTtl: 300,
  dnsVerification: true,
  certValidation: true,
};

export default function NetworkSettingsPage() {
  const [settings, setSettings] = useState<NetworkSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable form values
  const [rateLimitMax, setRateLimitMax] = useState(100);
  const [rateLimitWindow, setRateLimitWindow] = useState(60);
  const [dedupTtl, setDedupTtl] = useState(300);
  const [maxResponseTime, setMaxResponseTime] = useState(30000);
  const [signatureTtl, setSignatureTtl] = useState(300);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/admin/api/network-settings');
      if (!res.ok) throw new Error('Failed to fetch network settings');
      const data = await res.json();
      const s = { ...defaultSettings, ...data };
      setSettings(s);
      setRateLimitMax(s.rateLimitMax);
      setRateLimitWindow(s.rateLimitWindow);
      setDedupTtl(s.dedupTtl);
      setMaxResponseTime(s.maxResponseTime);
      setSignatureTtl(s.signatureTtl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/admin/api/network-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rateLimitMax,
          rateLimitWindow,
          dedupTtl,
          maxResponseTime,
          signatureTtl,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? data.error ?? 'Failed to save settings');
      }

      setSuccess('Settings saved successfully');
      await fetchSettings();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="page-title">
            Network <span className="text-gradient-saffron">Settings</span>
          </h1>
          <p className="page-subtitle">Configure ONDC network parameters and policies</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-ash-500">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading network settings...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">
          Network <span className="text-gradient-saffron">Settings</span>
        </h1>
        <p className="page-subtitle">Configure ONDC network parameters and policies</p>
      </div>

      {/* Status messages */}
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
      {success && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: 'rgba(46, 196, 182, 0.1)',
            border: '1px solid rgba(46, 196, 182, 0.2)',
            color: '#2EC4B6',
          }}
        >
          {success}
        </div>
      )}

      {/* Network Identity (read-only) */}
      <div className="card">
        <h3 className="card-header">Network Identity</h3>
        <p className="text-xs text-ash-600 mb-4">These values are configured via environment variables and cannot be changed from the UI.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Domain</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed">{settings.domain || 'Not configured'}</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Registry URL</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed truncate">{settings.registryUrl || 'Not configured'}</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Gateway URL</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed truncate">{settings.gatewayUrl || 'Not configured'}</div>
          </div>
        </div>
      </div>

      {/* Protocol Settings (read-only) */}
      <div className="card">
        <h3 className="card-header">Protocol</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Beckn Core Version</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed">{settings.becknCoreVersion || 'Not configured'}</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Country</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed">{settings.country || 'Not configured'}</div>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Default City</label>
            <div className="input w-full bg-surface-raised text-ash-400 cursor-not-allowed">{settings.defaultCity || 'Not configured'}</div>
          </div>
        </div>
      </div>

      {/* Security (read-only) */}
      <div className="card">
        <h3 className="card-header">Security</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash-300">DNS Verification</span>
            <span className={settings.dnsVerification ? 'badge-green' : 'badge-red'}>
              {settings.dnsVerification ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash-300">Certificate Validation</span>
            <span className={settings.certValidation ? 'badge-green' : 'badge-red'}>
              {settings.certValidation ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Editable Network Policies */}
      <form onSubmit={handleSave}>
        <div className="card">
          <h3 className="card-header">Network Policies</h3>
          <p className="text-xs text-ash-600 mb-4">These values control rate limiting, deduplication, and response timeouts.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                Rate Limit Max
              </label>
              <input
                type="number"
                value={rateLimitMax}
                onChange={(e) => setRateLimitMax(parseInt(e.target.value, 10) || 0)}
                className="input w-full"
                min={1}
                required
              />
              <p className="text-[10px] text-ash-600 mt-1">Max requests per window</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                Rate Limit Window
              </label>
              <input
                type="number"
                value={rateLimitWindow}
                onChange={(e) => setRateLimitWindow(parseInt(e.target.value, 10) || 0)}
                className="input w-full"
                min={1}
                required
              />
              <p className="text-[10px] text-ash-600 mt-1">Window duration in seconds</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                Dedup TTL
              </label>
              <input
                type="number"
                value={dedupTtl}
                onChange={(e) => setDedupTtl(parseInt(e.target.value, 10) || 0)}
                className="input w-full"
                min={1}
                required
              />
              <p className="text-[10px] text-ash-600 mt-1">Deduplication TTL in seconds</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                Max Response Time
              </label>
              <input
                type="number"
                value={maxResponseTime}
                onChange={(e) => setMaxResponseTime(parseInt(e.target.value, 10) || 0)}
                className="input w-full"
                min={1000}
                step={1000}
                required
              />
              <p className="text-[10px] text-ash-600 mt-1">Maximum response time in ms</p>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">
                Signature TTL
              </label>
              <input
                type="number"
                value={signatureTtl}
                onChange={(e) => setSignatureTtl(parseInt(e.target.value, 10) || 0)}
                className="input w-full"
                min={1}
                required
              />
              <p className="text-[10px] text-ash-600 mt-1">Signature validity in seconds</p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-surface-border">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
