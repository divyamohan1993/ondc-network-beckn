'use client';

import { useEffect, useState, useCallback } from 'react';

interface Secret {
  name: string;
  service: string;
  version: number;
  status: 'active' | 'rotated' | 'revoked' | 'expired';
  lastRotated: string | null;
  autoRotation: boolean;
  rotationInterval: string | null;
}

interface RotationStatus {
  nextScheduledRotation: string | null;
  autoRotationCount: number;
  manualCount: number;
  lastRotationTimestamp: string | null;
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
  'vault',
  'orchestrator',
];

const ROTATION_INTERVALS = [
  { value: 'none', label: 'No rotation' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function generatePassword(length: number = 32): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
  let password = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  return password;
}

export default function VaultManagementPage() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [rotationStatus, setRotationStatus] = useState<RotationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSecret, setEditingSecret] = useState<string | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState<string | null>(null);
  const [rotatingAll, setRotatingAll] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formService, setFormService] = useState(ALL_SERVICES[0]);
  const [formRotationInterval, setFormRotationInterval] = useState('none');
  const [formSaving, setFormSaving] = useState(false);
  const [showValue, setShowValue] = useState(false);

  const fetchSecrets = useCallback(async () => {
    try {
      const [secretsRes, rotationRes] = await Promise.all([
        fetch('/api/vault/secrets'),
        fetch('/api/vault/rotation'),
      ]);

      if (secretsRes.ok) {
        const data = await secretsRes.json();
        if (Array.isArray(data)) {
          setSecrets(data);
        }
      }

      if (rotationRes.ok) {
        const data = await rotationRes.json();
        setRotationStatus(data);
      }
    } catch {
      // Silently retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSecrets();
    const interval = setInterval(fetchSecrets, 10000);
    return () => clearInterval(interval);
  }, [fetchSecrets]);

  function openAddModal() {
    setEditingSecret(null);
    setFormName('');
    setFormValue('');
    setFormService(ALL_SERVICES[0]);
    setFormRotationInterval('none');
    setShowValue(false);
    setShowModal(true);
  }

  function openEditModal(secret: Secret) {
    setEditingSecret(secret.name);
    setFormName(secret.name);
    setFormValue('');
    setFormService(secret.service);
    setFormRotationInterval(secret.rotationInterval || 'none');
    setShowValue(false);
    setShowModal(true);
  }

  async function handleSaveSecret() {
    if (!formName.trim()) {
      alert('Secret name is required');
      return;
    }
    if (!editingSecret && !formValue.trim()) {
      alert('Secret value is required');
      return;
    }

    setFormSaving(true);
    try {
      const body: Record<string, string> = {
        name: formName,
        service: formService,
        rotationInterval: formRotationInterval,
      };
      if (formValue) {
        body.value = formValue;
      }

      const res = await fetch('/api/vault/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowModal(false);
        await fetchSecrets();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save secret');
      }
    } catch {
      alert('Failed to save secret');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleRotateSecret(name: string) {
    setRotatingSecret(name);
    try {
      const res = await fetch(`/api/vault/secrets/${encodeURIComponent(name)}/rotate`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to rotate secret: ${name}`);
      }
      await fetchSecrets();
    } catch {
      alert(`Failed to rotate secret: ${name}`);
    } finally {
      setRotatingSecret(null);
    }
  }

  async function handleRevokeSecret(name: string) {
    if (!window.confirm(`Are you sure you want to revoke the secret "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/vault/secrets/${encodeURIComponent(name)}/revoke`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to revoke secret: ${name}`);
      }
      await fetchSecrets();
    } catch {
      alert(`Failed to revoke secret: ${name}`);
    }
  }

  async function handleRotateAll() {
    if (!window.confirm('Rotate all secrets? This will generate new values for all active secrets with auto-rotation enabled.')) {
      return;
    }

    setRotatingAll(true);
    try {
      const res = await fetch('/api/vault/secrets/rotate-all', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to rotate all secrets');
      }
      await fetchSecrets();
    } catch {
      alert('Failed to rotate all secrets');
    } finally {
      setRotatingAll(false);
    }
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      active: 'badge-green',
      rotated: 'badge-blue',
      revoked: 'badge-red',
      expired: 'badge-yellow',
    };
    return map[status] ?? 'badge-gray';
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="page-title text-gradient-saffron">Vault Management</h1>
          <p className="page-subtitle">Manage secrets, keys, and rotation policies</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-ash-500">
            <Spinner />
            <span>Loading vault data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="animate-fade-up">
        <h1 className="page-title text-gradient-saffron">Vault Management</h1>
        <p className="page-subtitle">Manage secrets, keys, and rotation policies</p>
      </div>

      {/* Rotation Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up delay-200">
        <div className="card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Next Scheduled Rotation</p>
          <p className="mt-2 text-lg font-bold text-white">
            {rotationStatus?.nextScheduledRotation
              ? new Date(rotationStatus.nextScheduledRotation).toLocaleString()
              : 'Not scheduled'}
          </p>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Auto-Rotation Enabled</p>
          <p className="mt-2 text-lg font-bold text-saffron-400">
            {rotationStatus?.autoRotationCount ?? 0} secrets
          </p>
        </div>
        <div className="card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Manual Rotation</p>
          <p className="mt-2 text-lg font-bold text-ash-300">
            {rotationStatus?.manualCount ?? 0} secrets
          </p>
        </div>
        <div className="card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Last Rotation</p>
              <p className="mt-2 text-lg font-bold text-teal-400">
                {rotationStatus?.lastRotationTimestamp
                  ? new Date(rotationStatus.lastRotationTimestamp).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Secrets Table */}
      <div className="card animate-fade-up delay-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Secrets</h3>
          <div className="flex gap-2">
            <button
              onClick={handleRotateAll}
              disabled={rotatingAll}
              className="btn-warning text-sm"
            >
              {rotatingAll ? (
                <span className="flex items-center gap-2">
                  <Spinner />
                  Rotating All...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Rotate All
                </span>
              )}
            </button>
            <button onClick={openAddModal} className="btn-primary text-sm">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Secret
              </span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Service</th>
                <th>Version</th>
                <th>Status</th>
                <th>Auto-Rotation</th>
                <th>Last Rotated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {secrets.map((secret) => (
                <tr key={secret.name}>
                  <td>
                    <span className="font-mono text-sm font-medium text-white">{secret.name}</span>
                  </td>
                  <td>
                    <span className="badge-blue">{secret.service}</span>
                  </td>
                  <td className="text-ash-500">v{secret.version}</td>
                  <td>
                    <span className={statusBadge(secret.status)}>
                      {secret.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {secret.autoRotation ? (
                      <span className="flex items-center gap-1 text-teal-400 text-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {secret.rotationInterval}
                      </span>
                    ) : (
                      <span className="text-ash-500 text-sm">Manual</span>
                    )}
                  </td>
                  <td className="text-xs text-ash-500">
                    {secret.lastRotated
                      ? new Date(secret.lastRotated).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRotateSecret(secret.name)}
                        disabled={rotatingSecret === secret.name || secret.status === 'revoked'}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-saffron-400 bg-saffron-500/10 rounded hover:bg-saffron-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Rotate"
                      >
                        {rotatingSecret === secret.name ? (
                          <Spinner />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => openEditModal(secret)}
                        disabled={secret.status === 'revoked'}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-ash-400 bg-surface-raised rounded hover:bg-surface-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Edit"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRevokeSecret(secret.name)}
                        disabled={secret.status === 'revoked'}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-ember-400 bg-ember-500/10 rounded hover:bg-ember-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Revoke"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {secrets.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-ash-500">
                    No secrets found. Click &quot;Add Secret&quot; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Secret Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-raised rounded-2xl border border-surface-border shadow-glass p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingSecret ? `Edit Secret: ${editingSecret}` : 'Add New Secret'}
            </h3>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2 block">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., DATABASE_PASSWORD"
                  className="input"
                  disabled={!!editingSecret}
                />
              </div>

              {/* Value */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2 block">
                  Value {editingSecret && <span className="text-ash-600 font-normal normal-case tracking-normal text-xs">(leave empty to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showValue ? 'text' : 'password'}
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="Enter secret value..."
                    className="input pr-24"
                  />
                  <div className="absolute right-1 top-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowValue(!showValue)}
                      className="px-2 py-1 text-xs text-ash-500 hover:text-ash-300 transition-colors"
                      title={showValue ? 'Hide' : 'Show'}
                    >
                      {showValue ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormValue(generatePassword())}
                      className="px-2 py-1 text-xs bg-surface-border text-ash-400 rounded hover:bg-ash-500/20 transition-colors font-medium"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              {/* Service */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2 block">Service</label>
                <select
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="select"
                >
                  {ALL_SERVICES.map((svc) => (
                    <option key={svc} value={svc}>
                      {svc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Rotation Interval */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2 block">Rotation Interval</label>
                <select
                  value={formRotationInterval}
                  onChange={(e) => setFormRotationInterval(e.target.value)}
                  className="select"
                >
                  {ROTATION_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSecret}
                disabled={formSaving}
                className="btn-primary flex-1"
              >
                {formSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Saving...
                  </span>
                ) : editingSecret ? (
                  'Update Secret'
                ) : (
                  'Create Secret'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
