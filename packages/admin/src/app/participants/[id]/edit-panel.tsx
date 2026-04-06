'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EditPanelProps {
  id: string;
  initial: {
    org_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    webhook_url: string | null;
    subscriber_url: string | null;
  };
}

export default function EditPanel({ id, initial }: EditPanelProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    org_name: initial.org_name ?? '',
    contact_email: initial.contact_email ?? '',
    contact_phone: initial.contact_phone ?? '',
    webhook_url: initial.webhook_url ?? '',
    subscriber_url: initial.subscriber_url ?? '',
  });

  function handleCancel() {
    setForm({
      org_name: initial.org_name ?? '',
      contact_email: initial.contact_email ?? '',
      contact_phone: initial.contact_phone ?? '',
      webhook_url: initial.webhook_url ?? '',
      subscriber_url: initial.subscriber_url ?? '',
    });
    setEditing(false);
    setFeedback(null);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/participants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      setFeedback({ type: 'success', message: 'Participant updated.' });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof typeof form; label: string }[] = [
    { key: 'org_name', label: 'Organization Name' },
    { key: 'contact_email', label: 'Contact Email' },
    { key: 'contact_phone', label: 'Contact Phone' },
    { key: 'webhook_url', label: 'Webhook URL' },
    { key: 'subscriber_url', label: 'Subscriber URL' },
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-header !mb-0">Edit Participant</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn-primary text-sm">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleCancel} disabled={saving} className="btn-secondary text-sm">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            feedback.type === 'success'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <dl className="space-y-3">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex justify-between items-center">
            <dt className="text-sm text-ash-500">{label}</dt>
            <dd className="text-sm text-right max-w-[60%]">
              {editing ? (
                <input
                  type="text"
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="input text-sm w-full text-right"
                  disabled={saving}
                />
              ) : (
                <span className="font-medium text-white break-all">{form[key] || '-'}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
