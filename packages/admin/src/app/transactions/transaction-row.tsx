'use client';

import { useState } from 'react';

interface TransactionRowProps {
  tx: {
    id: string;
    transaction_id: string;
    action: string;
    bap_id: string | null;
    bpp_id: string | null;
    domain: string | null;
    status: string | null;
    latency_ms: number | null;
    request_body: unknown;
    response_body: unknown;
    is_simulated: boolean | null;
    created_at: Date | null;
  };
}

function statusBadge(status: string | null) {
  const map: Record<string, string> = {
    ACK: 'badge-green',
    CALLBACK_RECEIVED: 'badge-green',
    SENT: 'badge-blue',
    NACK: 'badge-red',
    ERROR: 'badge-red',
    TIMEOUT: 'badge-yellow',
  };
  return map[status ?? ''] ?? 'badge-gray';
}

export default function TransactionRow({ tx }: TransactionRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="w-8">
          <svg
            className={`w-4 h-4 text-ash-600 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="font-mono text-xs">
          {tx.transaction_id.slice(0, 16)}...
          {tx.is_simulated && <span className="ml-1 text-ash-600 italic">sim</span>}
        </td>
        <td className="font-medium">{tx.action}</td>
        <td className="text-xs">{tx.bap_id ?? '-'}</td>
        <td className="text-xs">{tx.bpp_id ?? '-'}</td>
        <td>{tx.domain ?? '-'}</td>
        <td>
          <span className={statusBadge(tx.status)}>{tx.status}</span>
        </td>
        <td>{tx.latency_ms ? `${tx.latency_ms}ms` : '-'}</td>
        <td className="text-xs text-ash-500">
          {tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-surface-raised/40 p-0">
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-ash-500 uppercase mb-2">Request Body</h4>
                  <pre className="bg-surface-raised border border-surface-border rounded-lg p-4 text-xs overflow-auto max-h-64 font-mono">
                    {tx.request_body
                      ? JSON.stringify(tx.request_body, null, 2)
                      : 'No request body'}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-ash-500 uppercase mb-2">Response Body</h4>
                  <pre className="bg-surface-raised border border-surface-border rounded-lg p-4 text-xs overflow-auto max-h-64 font-mono">
                    {tx.response_body
                      ? JSON.stringify(tx.response_body, null, 2)
                      : 'No response body'}
                  </pre>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
