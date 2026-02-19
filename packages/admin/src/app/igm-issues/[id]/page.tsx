import { eq } from 'drizzle-orm';
import db from '@/lib/db';
import { issues } from '@ondc/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

function statusBadge(status: string) {
  switch (status) {
    case 'OPEN': return 'badge-yellow';
    case 'ESCALATED': return 'badge-red';
    case 'RESOLVED': return 'badge-green';
    case 'CLOSED': return 'badge-gray';
    default: return 'badge-gray';
  }
}

function categoryBadge(category: string) {
  switch (category) {
    case 'ORDER': return 'badge-blue';
    case 'ITEM': return 'badge-yellow';
    case 'FULFILLMENT': return 'badge-green';
    case 'AGENT': return 'badge-gray';
    default: return 'badge-gray';
  }
}

export default async function IgmIssueDetailPage({ params }: PageProps) {
  const [issue] = await db
    .select()
    .from(issues)
    .where(eq(issues.id, params.id))
    .limit(1);

  if (!issue) {
    notFound();
  }

  const respondentActions = (issue.respondent_actions ?? []) as Array<{
    respondent_action?: string;
    short_desc?: string;
    updated_at?: string;
    updated_by?: { org?: { name?: string } };
  }>;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-ash-500">
        <Link href="/igm-issues" className="hover:text-saffron-400 transition-colors">IGM Issues</Link>
        <span>/</span>
        <span className="text-white font-mono text-xs">{issue.issue_id}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title font-display">
            Issue <span className="text-gradient-saffron">Details</span>
          </h1>
          <p className="page-subtitle font-mono">{issue.issue_id}</p>
        </div>
        <span className={`${statusBadge(issue.status)} text-sm`}>{issue.status}</span>
      </div>

      {/* Issue Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="card-header">Issue Information</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Issue ID</dt>
              <dd className="text-white font-mono text-xs">{issue.issue_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Transaction ID</dt>
              <dd className="text-white font-mono text-xs">{issue.transaction_id}</dd>
            </div>
            {issue.order_id && (
              <div className="flex justify-between">
                <dt className="text-ash-500 text-sm">Order ID</dt>
                <dd className="text-white font-mono text-xs">{issue.order_id}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Category</dt>
              <dd><span className={`${categoryBadge(issue.category)} text-[10px]`}>{issue.category}</span></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Sub-Category</dt>
              <dd className="text-white text-sm">{issue.sub_category}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Created</dt>
              <dd className="text-white text-sm">{new Date(issue.created_at).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Updated</dt>
              <dd className="text-white text-sm">{new Date(issue.updated_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h3 className="card-header">Participants & SLAs</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">BAP ID (Complainant)</dt>
              <dd className="text-white text-xs">{issue.bap_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">BPP ID (Respondent)</dt>
              <dd className="text-white text-xs">{issue.bpp_id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Expected Response By</dt>
              <dd className={`text-sm ${issue.expected_response_time && new Date(issue.expected_response_time) < new Date() ? 'text-ember-400 font-bold' : 'text-white'}`}>
                {issue.expected_response_time
                  ? new Date(issue.expected_response_time).toLocaleString()
                  : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ash-500 text-sm">Expected Resolution By</dt>
              <dd className={`text-sm ${issue.expected_resolution_time && new Date(issue.expected_resolution_time) < new Date() ? 'text-ember-400 font-bold' : 'text-white'}`}>
                {issue.expected_resolution_time
                  ? new Date(issue.expected_resolution_time).toLocaleString()
                  : '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Description */}
      <div className="card">
        <h3 className="card-header">Description</h3>
        <p className="text-white text-sm font-medium mb-2">{issue.short_desc}</p>
        {issue.long_desc && (
          <p className="text-ash-400 text-sm">{issue.long_desc}</p>
        )}
      </div>

      {/* Complainant Info */}
      {issue.complainant_info && (
        <div className="card">
          <h3 className="card-header">Complainant Information</h3>
          <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
            {JSON.stringify(issue.complainant_info, null, 2)}
          </pre>
        </div>
      )}

      {/* Respondent Actions Timeline */}
      <div className="card">
        <h3 className="card-header">Respondent Actions</h3>
        {respondentActions.length > 0 ? (
          <div className="space-y-4">
            {respondentActions.map((action, i) => (
              <div key={i} className="flex gap-4 pl-4 border-l-2 border-surface-border">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge-blue text-[10px]">{action.respondent_action ?? 'ACTION'}</span>
                    {action.updated_by?.org?.name && (
                      <span className="text-xs text-ash-500">by {action.updated_by.org.name}</span>
                    )}
                  </div>
                  <p className="text-sm text-ash-300">{action.short_desc ?? 'No description'}</p>
                  {action.updated_at && (
                    <p className="text-[11px] text-ash-600 mt-1">
                      {new Date(action.updated_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ash-600 text-sm py-4">No respondent actions recorded</p>
        )}
      </div>

      {/* Resolution */}
      {issue.resolution && (
        <div className="card">
          <h3 className="card-header">Resolution</h3>
          <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
            {JSON.stringify(issue.resolution, null, 2)}
          </pre>
        </div>
      )}

      {/* Resolution Provider */}
      {issue.resolution_provider && (
        <div className="card">
          <h3 className="card-header">Resolution Provider</h3>
          <pre className="text-xs text-ash-300 overflow-auto max-h-48 font-mono bg-surface-raised/50 rounded-lg p-3">
            {JSON.stringify(issue.resolution_provider, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
