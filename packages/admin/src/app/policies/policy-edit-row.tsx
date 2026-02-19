'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PolicyEditRowProps {
  policy: {
    id: string;
    key: string;
    value: unknown;
    domain: string | null;
    description: string | null;
    updated_at: Date | null;
  };
}

export default function PolicyEditRow({ policy }: PolicyEditRowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(JSON.stringify(policy.value));
  const [description, setDescription] = useState(policy.description ?? '');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);

    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Keep as string
    }

    try {
      const res = await fetch(`/api/policies/${policy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: parsedValue, description }),
      });

      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <tr>
        <td className="font-mono font-medium">{policy.key}</td>
        <td>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input text-xs font-mono"
          />
        </td>
        <td>
          <span className={policy.domain ? 'badge-blue' : 'badge-gray'}>
            {policy.domain ?? 'Global'}
          </span>
        </td>
        <td>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input text-xs"
          />
        </td>
        <td className="text-xs text-ash-500">
          {policy.updated_at ? new Date(policy.updated_at).toLocaleString() : '-'}
        </td>
        <td>
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={loading}
              className="text-xs px-2 py-1 rounded bg-teal-500/10 text-teal-400 hover:bg-teal-500/20"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-2 py-1 rounded bg-surface-raised/40 text-ash-400 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="font-mono font-medium">{policy.key}</td>
      <td>
        <code className="text-xs bg-white/10 px-2 py-1 rounded font-mono">
          {JSON.stringify(policy.value)}
        </code>
      </td>
      <td>
        <span className={policy.domain ? 'badge-blue' : 'badge-gray'}>
          {policy.domain ?? 'Global'}
        </span>
      </td>
      <td className="text-ash-500 text-sm">{policy.description ?? '-'}</td>
      <td className="text-xs text-ash-500">
        {policy.updated_at ? new Date(policy.updated_at).toLocaleString() : '-'}
      </td>
      <td>
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-2 py-1 rounded bg-saffron-500/10 text-saffron-400 hover:bg-saffron-500/20"
        >
          Edit
        </button>
      </td>
    </tr>
  );
}
