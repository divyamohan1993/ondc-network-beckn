import Link from 'next/link';
import { formatDate } from '@/lib/format';

interface IssueCardProps {
  issueId: string;
  category: string;
  description: string;
  status: 'open' | 'resolved' | 'closed' | 'escalated';
  createdAt: string;
  locale: string;
  translations: {
    issue_id: string;
    respond: string;
    open: string;
    resolved: string;
    closed: string;
    escalated: string;
  };
}

const statusBadgeMap: Record<string, string> = {
  open: 'badge-yellow',
  resolved: 'badge-green',
  closed: 'badge-gray',
  escalated: 'badge-red',
};

export default function IssueCard({
  issueId,
  category,
  description,
  status,
  createdAt,
  locale,
  translations: t,
}: IssueCardProps) {
  const statusLabel = t[status] || status;
  const badge = statusBadgeMap[status] || 'badge-gray';

  return (
    <article className="card" aria-label={`${t.issue_id}: ${issueId}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-ash-500 font-mono">{issueId}</p>
          <p className="text-sm font-semibold text-white mt-1">{category}</p>
        </div>
        <span className={badge}>{statusLabel}</span>
      </div>
      <p className="text-xs text-ash-400 mb-4 line-clamp-2">{description}</p>
      <div className="flex items-center justify-between">
        <time className="text-xs text-ash-500" dateTime={createdAt}>{formatDate(createdAt, locale)}</time>
        {status === 'open' && (
          <Link href={`/issues/${issueId}`} className="btn-primary text-xs">
            {t.respond}
          </Link>
        )}
      </div>
    </article>
  );
}
