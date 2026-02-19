'use client';

import { useState } from 'react';

interface AuditRowProps {
  log: {
    id: string;
    actor: string;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    details: unknown;
    ip_address: string | null;
    created_at: Date | null;
  };
}

export default function AuditRow({ log }: AuditRowProps) {
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
        <td className="font-medium">{log.actor}</td>
        <td>
          <span className="badge-blue">{log.action}</span>
        </td>
        <td>{log.resource_type ?? '-'}</td>
        <td className="font-mono text-xs">{log.resource_id ?? '-'}</td>
        <td className="text-xs text-ash-500">{log.ip_address ?? '-'}</td>
        <td className="text-xs text-ash-500">
          {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-surface-raised/40 p-0">
            <div className="p-4">
              <h4 className="text-xs font-semibold text-ash-500 uppercase mb-2">Details</h4>
              <pre className="bg-surface-raised border border-surface-border rounded-lg p-4 text-xs overflow-auto max-h-64 font-mono">
                {log.details
                  ? JSON.stringify(log.details, null, 2)
                  : 'No details available'}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
