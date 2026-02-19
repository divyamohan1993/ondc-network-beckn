import { sql, and, eq, ilike, gte, lte } from 'drizzle-orm';
import db from '@/lib/db';
import { auditLogs } from '@ondc/shared';
import AuditRow from './audit-row';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    actor?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

const PAGE_SIZE = 25;

export default async function AuditPage({ searchParams }: PageProps) {
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (searchParams.actor) {
    conditions.push(ilike(auditLogs.actor, `%${searchParams.actor}%`));
  }
  if (searchParams.action) {
    conditions.push(ilike(auditLogs.action, `%${searchParams.action}%`));
  }
  if (searchParams.from) {
    conditions.push(gte(auditLogs.created_at, new Date(searchParams.from)));
  }
  if (searchParams.to) {
    conditions.push(lte(auditLogs.created_at, new Date(searchParams.to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">Audit <span className="text-gradient-saffron">Logs</span></h1>
        <p className="page-subtitle">Track all administrative actions</p>
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Actor</label>
            <input name="actor" defaultValue={searchParams.actor ?? ''} className="input" placeholder="Actor name or email" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Action</label>
            <input name="action" defaultValue={searchParams.action ?? ''} className="input" placeholder="Action type" />
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
              <th></th>
              <th>Actor</th>
              <th>Action</th>
              <th>Resource Type</th>
              <th>Resource ID</th>
              <th>IP Address</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => (
              <AuditRow key={log.id} log={log} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-ash-600">
                  No audit logs found
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
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} logs
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/audit?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/audit?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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
