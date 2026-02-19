import { sql, eq, and, ilike, gte, lte } from 'drizzle-orm';
import db from '@/lib/db';
import { issues } from '@ondc/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    bap_id?: string;
    bpp_id?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

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

export default async function IgmIssuesPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (searchParams.status && searchParams.status !== 'all') {
    conditions.push(eq(issues.status, searchParams.status as any));
  }
  if (searchParams.category && searchParams.category !== 'all') {
    conditions.push(eq(issues.category, searchParams.category as any));
  }
  if (searchParams.bap_id) {
    conditions.push(ilike(issues.bap_id, `%${searchParams.bap_id}%`));
  }
  if (searchParams.bpp_id) {
    conditions.push(ilike(issues.bpp_id, `%${searchParams.bpp_id}%`));
  }
  if (searchParams.from) {
    conditions.push(gte(issues.created_at, new Date(searchParams.from)));
  }
  if (searchParams.to) {
    conditions.push(lte(issues.created_at, new Date(searchParams.to)));
  }
  if (searchParams.search) {
    conditions.push(ilike(issues.issue_id, `%${searchParams.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }], statusCounts] = await Promise.all([
    db
      .select()
      .from(issues)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(whereClause),
    db
      .select({
        status: issues.status,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .groupBy(issues.status),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) {
    statusMap[s.status] = s.count;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">
          IGM <span className="text-gradient-saffron">Issues</span>
        </h1>
        <p className="page-subtitle">
          Issue & Grievance Management across the ONDC network
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['OPEN', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((s) => (
          <div key={s} className="card !p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">{s}</p>
            <p className="text-xl font-bold text-white">{statusMap[s] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Issue ID</label>
            <input name="search" defaultValue={searchParams.search ?? ''} className="input" placeholder="Search issue ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Status</label>
            <select name="status" defaultValue={searchParams.status ?? 'all'} className="select">
              <option value="all">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="ESCALATED">Escalated</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Category</label>
            <select name="category" defaultValue={searchParams.category ?? 'all'} className="select">
              <option value="all">All Categories</option>
              <option value="ORDER">Order</option>
              <option value="ITEM">Item</option>
              <option value="FULFILLMENT">Fulfillment</option>
              <option value="AGENT">Agent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">BAP ID</label>
            <input name="bap_id" defaultValue={searchParams.bap_id ?? ''} className="input" placeholder="BAP" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">BPP ID</label>
            <input name="bpp_id" defaultValue={searchParams.bpp_id ?? ''} className="input" placeholder="BPP" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">From</label>
            <input type="date" name="from" defaultValue={searchParams.from ?? ''} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">To</label>
            <input type="date" name="to" defaultValue={searchParams.to ?? ''} className="input" />
          </div>
          <button type="submit" className="btn-primary">Filter</button>
        </form>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Issue ID</th>
              <th>Category</th>
              <th>Sub-Category</th>
              <th>Description</th>
              <th>BAP</th>
              <th>BPP</th>
              <th>Status</th>
              <th>SLA Response</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => (
              <tr key={issue.id}>
                <td>
                  <Link href={`/igm-issues/${issue.id}`} className="text-saffron-400 hover:underline font-mono text-xs">
                    {issue.issue_id.length > 16 ? `${issue.issue_id.slice(0, 16)}...` : issue.issue_id}
                  </Link>
                </td>
                <td><span className={`${categoryBadge(issue.category)} text-[10px]`}>{issue.category}</span></td>
                <td className="text-xs text-ash-400">{issue.sub_category}</td>
                <td className="text-xs max-w-[200px] truncate" title={issue.short_desc}>{issue.short_desc}</td>
                <td className="text-xs">{issue.bap_id}</td>
                <td className="text-xs">{issue.bpp_id}</td>
                <td><span className={`${statusBadge(issue.status)} text-[10px]`}>{issue.status}</span></td>
                <td className="text-xs text-ash-500">
                  {issue.expected_response_time
                    ? new Date(issue.expected_response_time).toLocaleString()
                    : '-'}
                </td>
                <td className="text-xs text-ash-500">{new Date(issue.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-ash-600">No IGM issues found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} issues
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/igm-issues?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/igm-issues?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Next
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
