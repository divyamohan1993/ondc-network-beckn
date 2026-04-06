'use client';

import { useEffect, useState, useCallback } from 'react';
import CopyButton from './copy-button';

interface Credentials {
  id: string;
  unique_key_id: string;
  env_blob: Record<string, string>;
  is_active: boolean;
  created_at: string;
}

interface CredentialsPanelProps {
  id: string;
}

export default function CredentialsPanel({ id }: CredentialsPanelProps) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/participants/${id}/credentials`);
      if (!res.ok) throw new Error('Failed to fetch credentials');
      const data = await res.json();
      const creds = Array.isArray(data.credentials) ? data.credentials[0] ?? null : data.credentials;
      setCredentials(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch credentials');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  async function generateCredentials() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/admin/api/participants/${id}/credentials`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate credentials');
      const data = await res.json();
      const creds = Array.isArray(data.credentials) ? data.credentials[0] ?? null : data.credentials;
      setCredentials(creds);
      setConfirmRegen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate credentials');
    } finally {
      setGenerating(false);
    }
  }

  function envString(blob: Record<string, string>): string {
    return Object.entries(blob)
      .map(([k, v]) => `${k}="${v}"`)
      .join('\n');
  }

  function downloadEnv(blob: Record<string, string>) {
    const content = envString(blob);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = '.env';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyAll(blob: Record<string, string>) {
    await navigator.clipboard.writeText(envString(blob));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="card">
        <h3 className="card-header">Credentials</h3>
        <div className="flex items-center gap-2 text-ash-500 text-sm py-4">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading credentials...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h3 className="card-header">Credentials</h3>
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!credentials) {
    return (
      <div className="card">
        <h3 className="card-header">Credentials</h3>
        <p className="text-ash-500 text-sm mb-4">
          No credentials on file. This participant was registered before credential tracking.
        </p>
        <button onClick={generateCredentials} disabled={generating} className="btn-primary text-sm">
          {generating ? 'Generating...' : 'Generate Credentials'}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-header !mb-0">Credentials</h3>
        <div className="flex items-center gap-2 text-xs text-ash-500">
          <span>Created {new Date(credentials.created_at).toLocaleDateString()}</span>
          <span className={credentials.is_active ? 'badge-green' : 'badge-red'}>
            {credentials.is_active ? 'Active' : 'Revoked'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs text-ash-500 font-medium mb-1 block">Environment Variables</label>
        <pre className="bg-white/5 border border-white/10 rounded-lg p-4 text-xs font-mono text-ash-300 overflow-x-auto whitespace-pre-wrap break-all">
          {envString(credentials.env_blob)}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => downloadEnv(credentials.env_blob)} className="btn-secondary text-sm">
          Download .env
        </button>
        <button onClick={() => copyAll(credentials.env_blob)} className="btn-secondary text-sm">
          {copied ? 'Copied!' : 'Copy All'}
        </button>
        {!confirmRegen ? (
          <button onClick={() => setConfirmRegen(true)} className="btn-secondary text-sm text-amber-400 border-amber-500/20">
            Regenerate Keys
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">This will break existing integrations. Continue?</span>
            <button onClick={generateCredentials} disabled={generating} className="text-xs px-2.5 py-1 rounded-lg font-medium bg-red-500/10 text-red-400">
              {generating ? 'Regenerating...' : 'Yes, Regenerate'}
            </button>
            <button onClick={() => setConfirmRegen(false)} className="text-xs px-2.5 py-1 rounded-lg font-medium bg-white/10 text-ash-400">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
