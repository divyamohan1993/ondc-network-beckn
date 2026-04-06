'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface CityOption {
  code: string;
  name: string;
  state: string | null;
}

interface DomainOption {
  code: string;
  name: string;
}

interface Credentials {
  subscriber_id: string;
  subscriber_url: string;
  unique_key_id: string;
  type: string;
  type_label: string;
  org_name: string;
  generated_at: string;
  signing_private_key: string;
  signing_public_key: string;
  encryption_private_key: string;
  encryption_public_key: string;
  registry_url: string;
  gateway_url: string;
  site_verification_id: string;
  env_vars: Record<string, string>;
  subscribe_result: Record<string, unknown>;
}

interface FormData {
  org_name: string;
  participant_type: string;
  domains: string[];
  subscriber_id: string;
  subscriber_url: string;
  cities: string[];
  gst_number: string;
  pan_number: string;
  signatory_name: string;
  email: string;
  phone: string;
}

const INITIAL_FORM: FormData = {
  org_name: '',
  participant_type: '',
  domains: [],
  subscriber_id: '',
  subscriber_url: '',
  cities: [],
  gst_number: '',
  pan_number: '',
  signatory_name: '',
  email: '',
  phone: '',
};

const ENV_SECTIONS: Array<{ title: string; icon: 'identity' | 'keys' | 'network'; keys: string[] }> = [
  {
    title: 'Identity',
    icon: 'identity',
    keys: ['_ID', '_URI', '_UNIQUE_KEY_ID'],
  },
  {
    title: 'Cryptographic Keys',
    icon: 'keys',
    keys: ['_PRIVATE_KEY', '_PUBLIC_KEY', '_ENCRYPTION_PRIVATE_KEY', '_ENCRYPTION_PUBLIC_KEY'],
  },
  {
    title: 'Network Configuration',
    icon: 'network',
    keys: ['REGISTRY_URL', 'GATEWAY_URL', 'BECKN_CORE_VERSION', 'BECKN_COUNTRY', 'BECKN_TTL', 'ONDC_DOMAIN', 'ONDC_CITY'],
  },
];

function categorizeEnvVar(key: string): 'identity' | 'keys' | 'network' {
  if (key.endsWith('_ID') || key.endsWith('_URI') || key.endsWith('_UNIQUE_KEY_ID')) return 'identity';
  if (key.includes('KEY')) return 'keys';
  return 'network';
}

function envComment(key: string, typeLabel: string): string {
  if (key.endsWith('_ID') && !key.includes('KEY') && !key.includes('VERIFICATION')) return `${typeLabel} subscriber identifier`;
  if (key.endsWith('_URI')) return `${typeLabel} callback URL for ONDC network`;
  if (key.endsWith('_UNIQUE_KEY_ID')) return 'Unique key ID registered with ONDC registry';
  if (key.endsWith('_ENCRYPTION_PRIVATE_KEY')) return 'X25519 encryption private key (KEEP SECRET)';
  if (key.endsWith('_ENCRYPTION_PUBLIC_KEY')) return 'X25519 encryption public key';
  if (key.endsWith('_PRIVATE_KEY')) return 'Ed25519 signing private key (KEEP SECRET)';
  if (key.endsWith('_PUBLIC_KEY')) return 'Ed25519 signing public key';
  if (key === 'REGISTRY_URL') return 'ONDC Registry endpoint';
  if (key === 'GATEWAY_URL') return 'ONDC Gateway endpoint';
  if (key === 'BECKN_CORE_VERSION') return 'Beckn protocol version';
  if (key === 'BECKN_COUNTRY') return 'Country code (IND)';
  if (key === 'BECKN_TTL') return 'Message time-to-live';
  if (key === 'ONDC_DOMAIN') return 'ONDC domain(s)';
  if (key === 'ONDC_CITY') return 'ONDC city code(s)';
  return '';
}

function buildEnvFileContent(envVars: Record<string, string>, typeLabel: string, orgName: string, generatedAt: string): string {
  const lines: string[] = [
    '# ============================================================',
    `# ONDC Network Credentials - ${orgName}`,
    `# Type: ${typeLabel}`,
    `# Generated: ${generatedAt}`,
    '#',
    '# WARNING: This file contains private keys.',
    '# Store securely and never commit to version control.',
    '# Add .env to your .gitignore file.',
    '# ============================================================',
    '',
  ];

  const identity: [string, string][] = [];
  const keys: [string, string][] = [];
  const network: [string, string][] = [];

  for (const [k, v] of Object.entries(envVars)) {
    const cat = categorizeEnvVar(k);
    if (cat === 'identity') identity.push([k, v]);
    else if (cat === 'keys') keys.push([k, v]);
    else network.push([k, v]);
  }

  if (identity.length) {
    lines.push('# --- Identity ---');
    for (const [k, v] of identity) {
      const c = envComment(k, typeLabel);
      if (c) lines.push(`# ${c}`);
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  if (keys.length) {
    lines.push('# --- Cryptographic Keys ---');
    lines.push('# IMPORTANT: Never share private keys. Rotate immediately if compromised.');
    for (const [k, v] of keys) {
      const c = envComment(k, typeLabel);
      if (c) lines.push(`# ${c}`);
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  if (network.length) {
    lines.push('# --- Network Configuration ---');
    for (const [k, v] of network) {
      const c = envComment(k, typeLabel);
      if (c) lines.push(`# ${c}`);
      lines.push(`${k}=${v}`);
    }
    lines.push('');
  }

  lines.push('# --- Site Verification ---');
  lines.push('# Place ondc-site-verification.html at your subscriber URL root');
  lines.push('# Path: <subscriber_url>/.well-known/ondc-site-verification.html');
  lines.push('');
  lines.push('# --- Next Steps ---');
  lines.push('# 1. Add these env vars to your application');
  lines.push('# 2. Deploy site verification HTML');
  lines.push('# 3. Configure webhook URL at your subscriber URL');
  lines.push('# 4. Test with ONDC sandbox');
  lines.push('# 5. Go live after verification');

  return lines.join('\n');
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-saffron-500/30"
      style={{
        background: copied ? 'rgba(46, 196, 182, 0.12)' : 'rgba(255, 255, 255, 0.04)',
        borderColor: copied ? 'rgba(46, 196, 182, 0.3)' : 'rgba(255, 255, 255, 0.08)',
        color: copied ? '#2EC4B6' : '#94A3B8',
      }}
      title={`Copy ${label || 'value'}`}
      aria-label={`Copy ${label || 'value'} to clipboard`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CredentialRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-surface-border/30 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">{label}</p>
        <p className={`text-sm text-ash-300 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  renderLabel,
  id,
  label,
}: {
  options: Array<{ code: string; name: string; state?: string | null }>;
  selected: string[];
  onChange: (v: string[]) => void;
  renderLabel: (o: { code: string; name: string; state?: string | null }) => string;
  id: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = filter
    ? options.filter((o) => renderLabel(o).toLowerCase().includes(filter.toLowerCase()))
    : options;

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={id} className="block text-xs font-semibold text-ash-400 mb-1.5">
        {label} <span className="text-ember-400">*</span>
      </label>
      <button
        type="button"
        id={id}
        onClick={() => setOpen(!open)}
        className="input text-left w-full flex items-center justify-between gap-2"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={selected.length === 0 ? 'text-ash-600' : 'text-ash-300'}>
          {selected.length === 0 ? `Select ${label.toLowerCase()}` : `${selected.length} selected`}
        </span>
        <svg className={`w-4 h-4 text-ash-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((code) => {
            const opt = options.find((o) => o.code === code);
            return (
              <span key={code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-saffron-500/10 text-saffron-400 border border-saffron-500/20">
                {opt ? opt.code : code}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  className="hover:text-white transition-colors"
                  aria-label={`Remove ${code}`}
                >
                  x
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-surface-border bg-surface-raised shadow-glass" role="listbox" aria-label={label}>
          <div className="sticky top-0 bg-surface-raised p-2 border-b border-surface-border">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="input !py-1.5 !text-xs"
              aria-label={`Filter ${label}`}
            />
          </div>
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-ash-600">No matches found</p>
          )}
          {filtered.map((opt) => (
            <button
              key={opt.code}
              type="button"
              role="option"
              aria-selected={selected.includes(opt.code)}
              onClick={() => toggle(opt.code)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                selected.includes(opt.code)
                  ? 'bg-saffron-500/10 text-saffron-400'
                  : 'text-ash-300 hover:bg-surface-overlay'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                selected.includes(opt.code)
                  ? 'bg-saffron-500 border-saffron-500 text-white'
                  : 'border-ash-600'
              }`}>
                {selected.includes(opt.code) && '\u2713'}
              </span>
              {renderLabel(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EnvVarsSection({ envVars, typeLabel, sectionFilter }: { envVars: Record<string, string>; typeLabel: string; sectionFilter: 'identity' | 'keys' | 'network' }) {
  const entries = Object.entries(envVars).filter(([k]) => categorizeEnvVar(k) === sectionFilter);
  if (!entries.length) return null;

  return (
    <div className="bg-void/60 rounded-xl p-4 border border-surface-border">
      {entries.map(([k, v]) => (
        <CredentialRow key={k} label={k} value={v} />
      ))}
    </div>
  );
}

function CredentialBlock({
  creds,
  prefix,
  siteVerificationHtml,
}: {
  creds: Credentials;
  prefix: string;
  siteVerificationHtml: string;
}) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const url = `${creds.subscriber_url}/.well-known/ondc-site-verification.html`;
      const res = await fetch(url, { mode: 'no-cors' }).catch(() => null);
      if (res) {
        setVerifyResult({ ok: true, msg: 'Request sent. Check that the page is accessible and contains your verification meta tag.' });
      } else {
        setVerifyResult({ ok: false, msg: 'Could not reach the verification URL. Make sure the page is deployed and publicly accessible.' });
      }
    } catch {
      setVerifyResult({ ok: false, msg: 'Verification request failed. Deploy the HTML file first, then try again.' });
    } finally {
      setVerifying(false);
    }
  }, [creds.subscriber_url]);

  const envFileContent = buildEnvFileContent(creds.env_vars, creds.type_label, creds.org_name, creds.generated_at);

  const downloadEnv = useCallback(() => {
    const blob = new Blob([envFileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ondc-${prefix.toLowerCase()}-${creds.subscriber_id.replace(/[^a-zA-Z0-9]/g, '-')}.env`;
    a.click();
    URL.revokeObjectURL(url);
  }, [envFileContent, prefix, creds.subscriber_id]);

  const allEnvText = Object.entries(creds.env_vars).map(([k, v]) => `${k}=${v}`).join('\n');

  return (
    <div className="card-glow">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-white font-display tracking-tight">
            {prefix} Credentials
          </h3>
          <p className="text-xs text-ash-500 mt-1 font-mono">Generated: {creds.generated_at}</p>
        </div>
        <span className="badge-green">SUBSCRIBED</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-raised/60 rounded-xl p-4 border border-surface-border">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ash-500 mb-1">Organization</p>
          <p className="text-sm font-semibold text-white">{creds.org_name}</p>
        </div>
        <div className="bg-surface-raised/60 rounded-xl p-4 border border-surface-border">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ash-500 mb-1">Subscriber ID</p>
          <p className="text-sm font-mono text-saffron-400">{creds.subscriber_id}</p>
        </div>
        <div className="bg-surface-raised/60 rounded-xl p-4 border border-surface-border">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ash-500 mb-1">Type</p>
          <p className="text-sm font-semibold text-white">{creds.type} ({creds.type_label})</p>
        </div>
      </div>

      {/* Identity Section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-saffron-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
          </svg>
          <h4 className="text-sm font-bold text-white">Identity</h4>
        </div>
        <EnvVarsSection envVars={creds.env_vars} typeLabel={creds.type_label} sectionFilter="identity" />
      </div>

      {/* Cryptographic Keys Section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-saffron-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <h4 className="text-sm font-bold text-white">Cryptographic Keys</h4>
        </div>
        <EnvVarsSection envVars={creds.env_vars} typeLabel={creds.type_label} sectionFilter="keys" />
      </div>

      {/* Network Configuration Section */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <h4 className="text-sm font-bold text-white">Network Configuration</h4>
        </div>
        <EnvVarsSection envVars={creds.env_vars} typeLabel={creds.type_label} sectionFilter="network" />
      </div>

      {/* .env File Block */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            <h4 className="text-sm font-bold text-white">Complete .env Configuration</h4>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton value={allEnvText} label="all env vars as .env" />
            <button
              onClick={downloadEnv}
              className="btn-success !py-1.5 !px-3 !text-xs gap-1.5"
              aria-label={`Download ${prefix} .env file`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download .env
            </button>
          </div>
        </div>
        <div className="bg-void/60 rounded-xl p-4 border border-surface-border font-mono text-xs">
          <pre className="text-ash-300 whitespace-pre-wrap break-all leading-relaxed">{Object.entries(creds.env_vars)
            .map(([k, v]) => {
              const comment = envComment(k, creds.type_label);
              return `${k}=${v}${comment ? `    # ${comment}` : ''}`;
            })
            .join('\n')}</pre>
        </div>
      </div>

      {/* Site Verification */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <h4 className="text-sm font-bold text-white">Site Verification</h4>
        </div>
        <div className="bg-surface-raised/40 rounded-xl p-4 border border-surface-border mb-3">
          <p className="text-xs text-ash-400 mb-2">
            Place this HTML file at:
          </p>
          <div className="flex items-center gap-2 mb-3">
            <code className="text-saffron-400 font-mono text-xs break-all flex-1">
              {creds.subscriber_url}/.well-known/ondc-site-verification.html
            </code>
            <CopyButton value={`${creds.subscriber_url}/.well-known/ondc-site-verification.html`} label="verification path" />
          </div>
        </div>
        <div className="bg-void/60 rounded-xl p-4 border border-surface-border">
          <pre className="text-xs text-ash-300 font-mono whitespace-pre-wrap">{siteVerificationHtml}</pre>
          <div className="mt-3 pt-3 border-t border-surface-border/30 flex items-center justify-between">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="btn-secondary !py-1.5 !px-3 !text-xs gap-1.5"
              aria-label="Verify site verification HTML deployment"
            >
              {verifying ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Verifying...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Verify Now
                </>
              )}
            </button>
            <CopyButton value={siteVerificationHtml} label="site verification HTML" />
          </div>
          {verifyResult && (
            <div className={`mt-3 p-3 rounded-lg text-xs ${verifyResult.ok ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' : 'bg-ember-500/10 text-ember-400 border border-ember-500/20'}`} role="status">
              {verifyResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* Integration Guide */}
      <div className="mb-6">
        <button
          onClick={() => setGuideOpen(!guideOpen)}
          className="w-full flex items-center justify-between p-4 bg-surface-raised/40 rounded-xl border border-surface-border hover:bg-surface-raised/60 transition-colors"
          aria-expanded={guideOpen}
          aria-controls={`integration-guide-${prefix}`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <h4 className="text-sm font-bold text-white">Integration Guide</h4>
          </div>
          <svg className={`w-4 h-4 text-ash-500 transition-transform ${guideOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {guideOpen && (
          <div id={`integration-guide-${prefix}`} className="mt-2 bg-surface-raised/40 rounded-xl p-5 border border-surface-border space-y-4 animate-fade-up" style={{ animationFillMode: 'backwards' }}>
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-saffron-500/20 text-saffron-400 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-semibold text-white">Add environment variables</p>
                <p className="text-xs text-ash-400 mt-1">
                  Download the .env file above and add it to your application root. Load variables using your framework&apos;s env support (dotenv, Next.js built-in, etc).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-saffron-500/20 text-saffron-400 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-semibold text-white">Deploy site verification HTML</p>
                <p className="text-xs text-ash-400 mt-1">
                  Copy the HTML above and serve it at <code className="text-saffron-400 font-mono">/.well-known/ondc-site-verification.html</code> on your subscriber domain. This proves domain ownership.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-saffron-500/20 text-saffron-400 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-sm font-semibold text-white">Configure webhook URL</p>
                <p className="text-xs text-ash-400 mt-1">
                  Set up your {prefix === 'BAP' ? 'Buyer App' : 'Seller App'} to receive Beckn protocol callbacks at your subscriber URL. Implement <code className="text-saffron-400 font-mono">/on_search</code>, <code className="text-saffron-400 font-mono">/on_select</code>, <code className="text-saffron-400 font-mono">/on_init</code>, <code className="text-saffron-400 font-mono">/on_confirm</code> endpoints.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">4</span>
              <div>
                <p className="text-sm font-semibold text-white">Test with sandbox</p>
                <p className="text-xs text-ash-400 mt-1">
                  Use the ONDC staging environment to test your integration. Send test search/select/init/confirm flows. Validate request signing and response verification.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">5</span>
              <div>
                <p className="text-sm font-semibold text-white">Go live</p>
                <p className="text-xs text-ash-400 mt-1">
                  Once sandbox testing passes, your participant status will be verified. Switch to production registry and gateway URLs. Monitor your endpoints for uptime.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [cityOptions, setCityOptions] = useState<CityOption[]>([]);
  const [domainOptions, setDomainOptions] = useState<DomainOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [bapCredentials, setBapCredentials] = useState<Credentials | null>(null);
  const [bppCredentials, setBppCredentials] = useState<Credentials | null>(null);
  const [error, setError] = useState<string | null>(null);
  const credentialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/admin/api/onboard')
      .then((r) => r.json())
      .then((data) => {
        setCityOptions(data.cities || []);
        setDomainOptions(data.domains || []);
      })
      .catch(() => {
        setDomainOptions([
          { code: 'ONDC:RET10', name: 'Grocery' },
          { code: 'ONDC:RET11', name: 'F&B' },
          { code: 'ONDC:RET12', name: 'Fashion' },
          { code: 'ONDC:RET13', name: 'BPC' },
          { code: 'ONDC:RET14', name: 'Electronics' },
          { code: 'ONDC:RET15', name: 'Appliances' },
          { code: 'ONDC:RET16', name: 'Home & Kitchen' },
          { code: 'ONDC:RET17', name: 'Toys & Baby' },
          { code: 'ONDC:RET18', name: 'Health & Wellness' },
          { code: 'ONDC:RET19', name: 'Pharma' },
        ]);
        setCityOptions([
          { code: 'std:080', name: 'Bengaluru', state: 'Karnataka' },
          { code: 'std:011', name: 'Delhi', state: 'Delhi' },
          { code: 'std:022', name: 'Mumbai', state: 'Maharashtra' },
          { code: 'std:044', name: 'Chennai', state: 'Tamil Nadu' },
          { code: 'std:033', name: 'Kolkata', state: 'West Bengal' },
          { code: 'std:040', name: 'Hyderabad', state: 'Telangana' },
          { code: 'std:020', name: 'Pune', state: 'Maharashtra' },
          { code: 'std:079', name: 'Ahmedabad', state: 'Gujarat' },
        ]);
      });
  }, []);

  const updateField = useCallback((field: keyof FormData, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (form.participant_type === 'both') {
        const [bapRes, bppRes] = await Promise.all([
          fetch('/admin/api/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, participant_type: 'buyer' }),
          }),
          fetch('/admin/api/onboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, participant_type: 'seller' }),
          }),
        ]);
        const [bapData, bppData] = await Promise.all([bapRes.json(), bppRes.json()]);
        if (!bapData.success) {
          setError(bapData.error || 'BAP registration failed.');
          return;
        }
        if (!bppData.success) {
          setError(bppData.error || 'BPP registration failed.');
          return;
        }
        setBapCredentials(bapData.credentials);
        setBppCredentials(bppData.credentials);
      } else {
        const res = await fetch('/admin/api/onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error || 'Registration failed.');
          return;
        }
        setCredentials(data.credentials);
      }
      setTimeout(() => credentialRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [form]);

  const hasCredentials = credentials || (bapCredentials && bppCredentials);

  const buildSiteVerificationHtml = (creds: Credentials) =>
    `<html>\n<head>\n  <meta name="ondc-site-verification" content="${creds.site_verification_id}" />\n</head>\n<body>ONDC Site Verification Page</body>\n</html>`;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">
          Network Participant <span className="text-gradient-saffron">Onboarding</span>
        </h1>
        <p className="page-subtitle">
          Register as a BAP or BPP on the ONDC network. Get your API credentials and connection URLs.
        </p>
      </div>

      {/* Section 1: Registration Form */}
      {!hasCredentials && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-up" style={{ animationFillMode: 'backwards' }}>
          {/* Organization Details */}
          <div className="card">
            <h3 className="card-header">Organization Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="org_name" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Organization Name <span className="text-ember-400">*</span>
                </label>
                <input
                  id="org_name"
                  type="text"
                  required
                  value={form.org_name}
                  onChange={(e) => updateField('org_name', e.target.value)}
                  className="input"
                  placeholder="Acme Commerce Pvt. Ltd."
                  autoComplete="organization"
                />
              </div>

              <div>
                <label htmlFor="participant_type" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Participant Type <span className="text-ember-400">*</span>
                </label>
                <select
                  id="participant_type"
                  required
                  value={form.participant_type}
                  onChange={(e) => updateField('participant_type', e.target.value)}
                  className="select"
                >
                  <option value="">Select type</option>
                  <option value="buyer">Buyer App (BAP)</option>
                  <option value="seller">Seller App (BPP)</option>
                  <option value="both">Both (BAP + BPP)</option>
                </select>
              </div>

              <div>
                <label htmlFor="gst_number" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  GST Number <span className="text-ember-400">*</span>
                </label>
                <input
                  id="gst_number"
                  type="text"
                  required
                  value={form.gst_number}
                  onChange={(e) => updateField('gst_number', e.target.value.toUpperCase())}
                  className="input font-mono"
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}"
                  title="15-character GSTIN, e.g. 22AAAAA0000A1Z5"
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="pan_number" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  PAN Number <span className="text-ember-400">*</span>
                </label>
                <input
                  id="pan_number"
                  type="text"
                  required
                  value={form.pan_number}
                  onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                  className="input font-mono"
                  placeholder="ABCDE1234F"
                  maxLength={10}
                  pattern="[A-Z]{5}[0-9]{4}[A-Z]"
                  title="10-character PAN, e.g. ABCDE1234F"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          {/* Network Configuration */}
          <div className="card">
            <h3 className="card-header">Network Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="subscriber_id" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Subscriber ID <span className="text-ember-400">*</span>
                </label>
                <input
                  id="subscriber_id"
                  type="text"
                  required
                  value={form.subscriber_id}
                  onChange={(e) => updateField('subscriber_id', e.target.value)}
                  className="input font-mono"
                  placeholder="seller.example.com"
                  autoComplete="off"
                />
                <p className="text-[10px] text-ash-600 mt-1">Your domain identifier on the ONDC network</p>
              </div>

              <div>
                <label htmlFor="subscriber_url" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Subscriber URL <span className="text-ember-400">*</span>
                </label>
                <input
                  id="subscriber_url"
                  type="url"
                  required
                  value={form.subscriber_url}
                  onChange={(e) => updateField('subscriber_url', e.target.value)}
                  className="input font-mono"
                  placeholder="https://seller.example.com"
                  autoComplete="url"
                />
                <p className="text-[10px] text-ash-600 mt-1">ONDC callbacks will be sent to this URL</p>
              </div>

              <MultiSelect
                id="domains"
                label="Domains"
                options={domainOptions}
                selected={form.domains}
                onChange={(v) => updateField('domains', v)}
                renderLabel={(o) => `${o.code} - ${o.name}`}
              />

              <MultiSelect
                id="cities"
                label="Cities"
                options={cityOptions}
                selected={form.cities}
                onChange={(v) => updateField('cities', v)}
                renderLabel={(o) => `${o.name}${o.state ? `, ${o.state}` : ''} (${o.code})`}
              />
            </div>
          </div>

          {/* Contact Information */}
          <div className="card">
            <h3 className="card-header">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label htmlFor="signatory_name" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Authorized Signatory <span className="text-ember-400">*</span>
                </label>
                <input
                  id="signatory_name"
                  type="text"
                  required
                  value={form.signatory_name}
                  onChange={(e) => updateField('signatory_name', e.target.value)}
                  className="input"
                  placeholder="Priya Sharma"
                  autoComplete="name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Email <span className="text-ember-400">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className="input"
                  placeholder="priya@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-xs font-semibold text-ash-400 mb-1.5">
                  Phone <span className="text-ember-400">*</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="input"
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="card !border-ember-500/30" role="alert">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-ember-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-ember-400">Registration Failed</p>
                  <p className="text-xs text-ash-400 mt-0.5">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating credentials...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  Register and Generate Credentials
                </>
              )}
            </button>
            <p className="text-[11px] text-ash-600">
              Ed25519 + X25519 key pairs will be generated on the server
            </p>
          </div>
        </form>
      )}

      {/* Section 2: Credentials Display */}
      {hasCredentials && (
        <div ref={credentialRef} className="space-y-6 animate-fade-up" style={{ animationFillMode: 'backwards' }}>
          {/* Warning Banner */}
          <div className="card !border-ember-500/40" role="alert" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-ember-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-ember-400">Save these credentials now</p>
                <p className="text-xs text-ash-400 mt-1">
                  Private keys cannot be retrieved again for security reasons. Download the .env file and store it in a secure, encrypted location. Never commit credentials to version control.
                </p>
              </div>
            </div>
          </div>

          {/* Single credential block or BAP+BPP dual blocks */}
          {credentials && (
            <CredentialBlock
              creds={credentials}
              prefix={credentials.type === 'BAP' ? 'BAP' : 'BPP'}
              siteVerificationHtml={buildSiteVerificationHtml(credentials)}
            />
          )}

          {bapCredentials && bppCredentials && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <span className="badge-blue">BAP</span>
                <span className="text-xs text-ash-500">Buyer Application Platform</span>
              </div>
              <CredentialBlock
                creds={bapCredentials}
                prefix="BAP"
                siteVerificationHtml={buildSiteVerificationHtml(bapCredentials)}
              />

              <div className="border-t border-surface-border my-8" />

              <div className="flex items-center gap-3 mb-2">
                <span className="badge-green">BPP</span>
                <span className="text-xs text-ash-500">Buyer Provider Platform</span>
              </div>
              <CredentialBlock
                creds={bppCredentials}
                prefix="BPP"
                siteVerificationHtml={buildSiteVerificationHtml(bppCredentials)}
              />
            </>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCredentials(null);
                setBapCredentials(null);
                setBppCredentials(null);
                setForm(INITIAL_FORM);
                setError(null);
              }}
              className="btn-secondary gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Register Another Participant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
