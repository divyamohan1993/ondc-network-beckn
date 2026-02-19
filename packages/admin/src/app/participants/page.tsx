import { sql, eq, and, ilike } from 'drizzle-orm';
import Link from 'next/link';
import db from '@/lib/db';
import { subscribers } from '@ondc/shared';
import ParticipantActions from './actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    type?: string;
    domain?: string;
    status?: string;
    simulated?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 20;

function statusBadge(status: string | null) {
  const map: Record<string, string> = {
    SUBSCRIBED: 'badge-green',
    INITIATED: 'badge-blue',
    UNDER_SUBSCRIPTION: 'badge-yellow',
    SUSPENDED: 'badge-red',
    REVOKED: 'badge-gray',
  };
  return map[status ?? ''] ?? 'badge-gray';
}

export default async function ParticipantsPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  // Build filters
  const conditions = [];
  if (searchParams.type && searchParams.type !== 'all') {
    conditions.push(eq(subscribers.type, searchParams.type as any));
  }
  if (searchParams.domain) {
    conditions.push(ilike(subscribers.domain, `%${searchParams.domain}%`));
  }
  if (searchParams.status && searchParams.status !== 'all') {
    conditions.push(eq(subscribers.status, searchParams.status as any));
  }
  if (searchParams.simulated === 'true') {
    conditions.push(eq(subscribers.is_simulated, true));
  } else if (searchParams.simulated === 'false') {
    conditions.push(eq(subscribers.is_simulated, false));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(whereClause),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">
          Network <span className="text-gradient-saffron">Participants</span>
        </h1>
        <p className="page-subtitle">Manage network participants (BAPs, BPPs, BGs)</p>
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Type</label>
            <select name="type" defaultValue={searchParams.type ?? 'all'} className="select">
              <option value="all">All Types</option>
              <option value="BAP">BAP</option>
              <option value="BPP">BPP</option>
              <option value="BG">BG</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Domain</label>
            <input name="domain" defaultValue={searchParams.domain ?? ''} className="input" placeholder="e.g. ONDC:RET10" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Status</label>
            <select name="status" defaultValue={searchParams.status ?? 'all'} className="select">
              <option value="all">All Statuses</option>
              <option value="INITIATED">Initiated</option>
              <option value="UNDER_SUBSCRIPTION">Under Subscription</option>
              <option value="SUBSCRIBED">Subscribed</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="REVOKED">Revoked</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-2">Data</label>
            <select name="simulated" defaultValue={searchParams.simulated ?? ''} className="select">
              <option value="">All</option>
              <option value="false">Real Only</option>
              <option value="true">Simulated Only</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">Filter</button>
        </form>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Subscriber ID</th>
              <th>Type</th>
              <th>Domain</th>
              <th>City</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/participants/${row.id}`} className="text-saffron-400 hover:text-saffron-300 font-medium transition-colors">
                    {row.subscriber_id}
                  </Link>
                  {row.is_simulated && (
                    <span className="ml-2 text-[10px] text-ash-600 italic uppercase tracking-wide">simulated</span>
                  )}
                </td>
                <td>
                  <span className="badge-blue">{row.type}</span>
                </td>
                <td className="text-ash-400">{row.domain ?? '-'}</td>
                <td className="text-ash-400">{row.city ?? '-'}</td>
                <td>
                  <span className={statusBadge(row.status)}>{row.status}</span>
                </td>
                <td className="text-xs text-ash-500">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                </td>
                <td>
                  <ParticipantActions id={row.id} currentStatus={row.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-ash-600">
                  No participants found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} participants
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ pathname: '/participants', query: { ...searchParams, page: String(page - 1) } }}
                className="btn-secondary text-xs"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/participants', query: { ...searchParams, page: String(page + 1) } }}
                className="btn-secondary text-xs"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
