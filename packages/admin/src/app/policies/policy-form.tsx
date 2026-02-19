'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PolicyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const data = {
      key: form.get('key'),
      value: form.get('value'),
      domain: form.get('domain') || null,
      description: form.get('description') || null,
    };

    // Try parsing value as JSON
    let parsedValue = data.value;
    try {
      parsedValue = JSON.parse(data.value as string);
    } catch {
      // Keep as string
    }

    try {
      const res = await fetch('/api/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, value: parsedValue }),
      });

      if (res.ok) {
        setOpen(false);
        router.refresh();
        (e.target as HTMLFormElement).reset();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Create New Policy</h3>
        <button
          onClick={() => setOpen(!open)}
          className="btn-primary text-sm"
        >
          {open ? 'Cancel' : '+ New Policy'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Key</label>
              <input name="key" required className="input" placeholder="e.g. max_latency_ms" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Domain (leave empty for global)</label>
              <input name="domain" className="input" placeholder="e.g. ONDC:RET10 or empty" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Value (JSON or string)</label>
              <input name="value" required className="input" placeholder='e.g. 5000 or {"threshold": 100}' />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Description</label>
              <input name="description" className="input" placeholder="Policy description" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creating...' : 'Create Policy'}
          </button>
        </form>
      )}
    </div>
  );
}
