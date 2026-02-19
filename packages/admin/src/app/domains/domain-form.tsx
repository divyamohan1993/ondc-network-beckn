'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DomainForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const data = {
      code: form.get('code'),
      name: form.get('name'),
      description: form.get('description'),
    };

    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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
        <h3 className="text-lg font-semibold text-white">Create New Domain</h3>
        <button
          onClick={() => setOpen(!open)}
          className="btn-primary text-sm"
        >
          {open ? 'Cancel' : '+ New Domain'}
        </button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/10 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Code</label>
              <input name="code" required className="input" placeholder="e.g. ONDC:RET10" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Name</label>
              <input name="name" required className="input" placeholder="e.g. Grocery" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Description</label>
              <input name="description" className="input" placeholder="Description (optional)" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creating...' : 'Create Domain'}
          </button>
        </form>
      )}
    </div>
  );
}
