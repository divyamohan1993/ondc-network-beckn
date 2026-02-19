'use client';

import { useEffect, useState, useCallback } from 'react';

type TeardownType = 'soft' | 'hard' | 'full' | 'factory';

interface TeardownStep {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

interface TeardownOperation {
  id: string;
  type: TeardownType;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentStep: string;
  steps: TeardownStep[];
  startedAt: string;
  completedAt: string | null;
}

interface TeardownHistoryEntry {
  id: string;
  type: TeardownType;
  status: string;
  startedAt: string;
  completedAt: string | null;
  initiatedBy: string;
}

const TEARDOWN_OPTIONS: {
  type: TeardownType;
  title: string;
  description: string;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confirmText: string;
}[] = [
  {
    type: 'soft',
    title: 'Soft Reset',
    description: 'Stop application services, keep data.',
    details: 'Services will be stopped but your data is preserved. Infrastructure containers (database, Redis, RabbitMQ) remain running.',
    severity: 'low',
    confirmText: 'STOP',
  },
  {
    type: 'hard',
    title: 'Hard Reset',
    description: 'Stop everything, remove containers.',
    details: 'All containers will be removed. Data in volumes is preserved. You will need to rebuild and restart all services.',
    severity: 'medium',
    confirmText: 'RESET',
  },
  {
    type: 'full',
    title: 'Full Reset',
    description: 'Nuclear option. Stop everything, delete containers AND volumes.',
    details: 'ALL DATA WILL BE LOST. This removes all containers, images, and volumes. Complete rebuild required.',
    severity: 'critical',
    confirmText: 'CONFIRM',
  },
  {
    type: 'factory',
    title: 'Factory Reset',
    description: 'Reset to initial state - wipe DB, re-seed, restart.',
    details: 'Database will be re-initialized with seed data. All user data will be lost. Services will be restarted with fresh state.',
    severity: 'high',
    confirmText: 'CONFIRM',
  },
];

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') {
    return (
      <div className="w-12 h-12 bg-ember-500/15 rounded-xl flex items-center justify-center">
        <svg className="w-6 h-6 text-ember-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (severity === 'high') {
    return (
      <div className="w-12 h-12 bg-gold-500/15 rounded-xl flex items-center justify-center">
        <svg className="w-6 h-6 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
    );
  }
  if (severity === 'medium') {
    return (
      <div className="w-12 h-12 bg-saffron-500/15 rounded-xl flex items-center justify-center">
        <svg className="w-6 h-6 text-saffron-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-12 h-12 bg-teal-500/15 rounded-xl flex items-center justify-center">
      <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

export default function TeardownPage() {
  const [activeOperation, setActiveOperation] = useState<TeardownOperation | null>(null);
  const [history, setHistory] = useState<TeardownHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [confirmModalType, setConfirmModalType] = useState<TeardownType | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [initiating, setInitiating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/orchestrator/teardown');
      if (res.ok) {
        const data = await res.json();
        if (data.activeOperation) {
          setActiveOperation(data.activeOperation);
        } else {
          setActiveOperation(null);
        }
        if (Array.isArray(data.history)) {
          setHistory(data.history);
        }
      }
    } catch {
      // Silently retry on next interval
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function initiateTeardown(type: TeardownType) {
    setInitiating(true);
    try {
      const res = await fetch('/api/orchestrator/teardown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveOperation(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to initiate teardown');
      }
    } catch {
      alert('Failed to initiate teardown');
    } finally {
      setInitiating(false);
      setConfirmModalType(null);
      setConfirmInput('');
    }
  }

  async function cancelTeardown() {
    if (!activeOperation) return;
    if (!window.confirm('Are you sure you want to cancel the teardown operation?')) return;

    try {
      const res = await fetch(`/api/orchestrator/teardown/${activeOperation.id}/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        setActiveOperation(null);
        await fetchStatus();
      }
    } catch {
      alert('Failed to cancel teardown');
    }
  }

  const currentOption = confirmModalType
    ? TEARDOWN_OPTIONS.find((o) => o.type === confirmModalType)
    : null;

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      completed: 'badge-green',
      in_progress: 'badge-blue',
      failed: 'badge-red',
      cancelled: 'badge-yellow',
    };
    return map[status] ?? 'badge-gray';
  }

  function typeBadge(type: string) {
    const map: Record<string, string> = {
      soft: 'badge-blue',
      hard: 'badge-yellow',
      full: 'badge-red',
      factory: 'badge-yellow',
    };
    return map[type] ?? 'badge-gray';
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="animate-fade-up">
        <h1 className="page-title text-gradient-saffron">Teardown Management</h1>
        <p className="page-subtitle">
          Reset, rebuild, and manage the platform lifecycle
        </p>
      </div>

      {/* Active Operation Progress */}
      {activeOperation && (
        <div className="card border-teal-500/30 bg-teal-500/5 animate-fade-up">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Teardown In Progress
              </h3>
              <p className="text-sm text-ash-500 mt-1">
                {activeOperation.type.charAt(0).toUpperCase() + activeOperation.type.slice(1)} Reset - {activeOperation.currentStep}
              </p>
            </div>
            <button
              onClick={cancelTeardown}
              className="btn-danger text-xs"
            >
              Cancel
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-ash-300 mb-1">
              <span>Progress</span>
              <span>{activeOperation.progress}%</span>
            </div>
            <div className="w-full bg-surface-border rounded-full h-3">
              <div
                className="h-3 rounded-full bg-teal-500 transition-all duration-500"
                style={{ width: `${activeOperation.progress}%` }}
              />
            </div>
          </div>

          {/* Steps Checklist */}
          <div className="space-y-2">
            {activeOperation.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {step.status === 'completed' ? (
                  <svg className="w-4 h-4 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.status === 'running' ? (
                  <svg className="w-4 h-4 text-saffron-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : step.status === 'failed' ? (
                  <svg className="w-4 h-4 text-ember-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <span className="w-4 h-4 rounded-full border-2 border-ash-600 shrink-0" />
                )}
                <span className={step.status === 'completed' ? 'text-ash-600 line-through' : 'text-ash-300'}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teardown Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up delay-200">
        {TEARDOWN_OPTIONS.map((option) => {
          const borderColor =
            option.severity === 'critical'
              ? 'border-ember-500/30 hover:border-ember-500/50'
              : option.severity === 'high'
              ? 'border-gold-500/30 hover:border-gold-500/50'
              : option.severity === 'medium'
              ? 'border-saffron-500/30 hover:border-saffron-500/50'
              : 'border-teal-500/30 hover:border-teal-500/50';

          const buttonClass =
            option.severity === 'critical'
              ? 'btn-danger'
              : option.severity === 'high'
              ? 'btn-warning'
              : option.severity === 'medium'
              ? 'btn-warning'
              : 'btn-primary';

          return (
            <div key={option.type} className={`card transition-colors ${borderColor}`}>
              <div className="flex items-start gap-4 mb-4">
                <SeverityIcon severity={option.severity} />
                <div className="flex-1">
                  <h3 className="font-semibold text-white text-lg">{option.title}</h3>
                  <p className="text-sm text-ash-500 mt-1">{option.description}</p>
                </div>
              </div>

              <p className="text-sm text-ash-300 mb-5 leading-relaxed">{option.details}</p>

              {option.severity === 'critical' && (
                <div className="bg-ember-500/10 border border-ember-500/30 rounded-lg p-3 mb-4">
                  <p className="text-xs text-ember-400 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    WARNING: This action is irreversible. All data will be permanently deleted.
                  </p>
                </div>
              )}

              <button
                onClick={() => setConfirmModalType(option.type)}
                disabled={activeOperation !== null}
                className={`w-full ${buttonClass}`}
              >
                {activeOperation
                  ? 'Operation in progress...'
                  : `Execute ${option.title}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {confirmModalType && currentOption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-raised rounded-2xl border border-surface-border shadow-glass p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <SeverityIcon severity={currentOption.severity} />
              <div>
                <h3 className="font-bold text-white text-lg">
                  Confirm {currentOption.title}
                </h3>
                <p className="text-sm text-ash-500">{currentOption.description}</p>
              </div>
            </div>

            <p className="text-sm text-ash-300 mb-4">{currentOption.details}</p>

            <div className="mb-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2 block">
                Type <span className="font-mono font-bold text-ember-400 normal-case tracking-normal text-sm">{currentOption.confirmText}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={`Type ${currentOption.confirmText} here...`}
                className="input"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmModalType(null);
                  setConfirmInput('');
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => initiateTeardown(confirmModalType)}
                disabled={confirmInput !== currentOption.confirmText || initiating}
                className={`flex-1 ${
                  currentOption.severity === 'critical' || currentOption.severity === 'high'
                    ? 'btn-danger'
                    : 'btn-warning'
                }`}
              >
                {initiating ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Initiating...
                  </span>
                ) : (
                  `Execute ${currentOption.title}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teardown History */}
      <div className="card animate-fade-up delay-200">
        <h3 className="card-header">Teardown History</h3>
        {historyLoading ? (
          <div className="flex items-center justify-center py-8 text-ash-500">
            <span className="flex items-center gap-2">
              <Spinner />
              Loading history...
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 -mb-6">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Initiated By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono text-xs text-ash-300">{entry.id.slice(0, 8)}...</td>
                    <td>
                      <span className={typeBadge(entry.type)}>
                        {entry.type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={statusBadge(entry.status)}>
                        {entry.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="text-xs text-ash-500">
                      {entry.startedAt ? new Date(entry.startedAt).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs text-ash-500">
                      {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : '-'}
                    </td>
                    <td className="text-xs text-ash-300">{entry.initiatedBy || '-'}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-ash-500">
                      No teardown operations recorded
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
