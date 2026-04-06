'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getMessages } from '@/lib/i18n';
import ActionButton from '@/components/ActionButton';

function getLocale(): string {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  return match?.[1] || 'en';
}

export default function IssueDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [locale, setLocale] = useState('en');
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setLocale(getLocale());
  }, []);

  const t = getMessages(locale);

  async function handleSubmit() {
    if (!response.trim()) return;
    // Will submit to IGM API when implemented
    setSubmitted(true);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/issues" className="text-sm text-saffron-400 hover:underline">&larr; {t.app.back}</Link>

      <div>
        <h1 className="page-title">{t.issues.issue_id}</h1>
        <p className="page-subtitle font-mono">{id}</p>
      </div>

      <div className="card">
        <h2 className="card-header">{t.issues.respond}</h2>

        {submitted ? (
          <div className="badge-green text-sm" role="status" aria-live="polite">
            {t.issues.response_sent}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="issue-response" className="block text-xs font-bold uppercase tracking-widest text-ash-500 mb-1.5">
                {t.issues.description}
              </label>
              <textarea
                id="issue-response"
                className="input min-h-[120px] resize-y"
                rows={4}
                placeholder={t.issues.response_placeholder}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
            </div>
            <ActionButton variant="primary" onClick={handleSubmit}>
              {t.issues.submit_response}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
