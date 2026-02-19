'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ParticipantActionsProps {
  id: string;
  currentStatus: string | null;
}

export default function ParticipantActions({ id, currentStatus }: ParticipantActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(newStatus: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/participants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <span className="text-xs text-ash-500">Updating...</span>;
  }

  return (
    <div className="flex gap-1">
      {currentStatus !== 'SUBSCRIBED' && (
        <button
          onClick={() => updateStatus('SUBSCRIBED')}
          className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors"
          style={{ background: 'rgba(46, 196, 182, 0.1)', color: '#2EC4B6' }}
        >
          Approve
        </button>
      )}
      {currentStatus !== 'SUSPENDED' && currentStatus !== 'REVOKED' && (
        <button
          onClick={() => updateStatus('SUSPENDED')}
          className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors"
          style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#FBBF24' }}
        >
          Suspend
        </button>
      )}
      {currentStatus !== 'REVOKED' && (
        <button
          onClick={() => updateStatus('REVOKED')}
          className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors"
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#F87171' }}
        >
          Revoke
        </button>
      )}
    </div>
  );
}
