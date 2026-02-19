import { sql, eq, and, ilike, gte, lte } from 'drizzle-orm';
import db from '@/lib/db';
import { settlements } from '@ondc/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    settlement_status?: string;
    recon_status?: string;
    collector?: string;
    receiver?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

function settlementStatusBadge(status: string) {
  switch (status) {
    case 'PAID': return 'badge-green';
    case 'NOT_PAID': return 'badge-red';
    case 'PENDING': return 'badge-yellow';
    default: return 'badge-gray';
  }
}

function reconStatusBadge(status: string | null) {
  if (!status) return 'badge-gray';
  switch (status) {
    case '01_MATCHED': return 'badge-green';
    case '02_UNMATCHED': return 'badge-red';
    case '03_DISPUTED': return 'badge-red';
    case '04_OVERPAID': return 'badge-yellow';
    case '05_UNDERPAID': return 'badge-yellow';
    default: return 'badge-gray';
  }
}

function reconLabel(status: string | null) {
  if (!status) return '-';
  return status.replace(/^\d+_/, '');
}

export default async function SettlementsPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (searchParams.settlement_status && searchParams.settlement_status !== 'all') {
    conditions.push(eq(settlements.settlement_status, searchParams.settlement_status as any));
  }
  if (searchParams.recon_status && searchParams.recon_status !== 'all') {
    conditions.push(eq(settlements.recon_status, searchParams.recon_status as any));
  }
  if (searchParams.collector) {
    conditions.push(ilike(settlements.collector_app_id, `%${searchParams.collector}%`));
  }
  if (searchParams.receiver) {
    conditions.push(ilike(settlements.receiver_app_id, `%${searchParams.receiver}%`));
  }
  if (searchParams.from) {
    conditions.push(gte(settlements.created_at, new Date(searchParams.from)));
  }
  if (searchParams.to) {
    conditions.push(lte(settlements.created_at, new Date(searchParams.to)));
  }
  if (searchParams.search) {
    conditions.push(ilike(settlements.order_id, `%${searchParams.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }], [totals], statusCounts] = await Promise.all([
    db
      .select()
      .from(settlements)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(settlements)
      .where(whereClause),
    db
      .select({
        total_amount: sql<string>`COALESCE(sum(settlement_amount), 0)::text`,
        paid_amount: sql<string>`COALESCE(sum(CASE WHEN settlement_status = 'PAID' THEN settlement_amount ELSE 0 END), 0)::text`,
        pending_amount: sql<string>`COALESCE(sum(CASE WHEN settlement_status = 'PENDING' THEN settlement_amount ELSE 0 END), 0)::text`,
      })
      .from(settlements)
      .where(whereClause),
    db
      .select({
        status: settlements.settlement_status,
        count: sql<number>`count(*)::int`,
      })
      .from(settlements)
      .groupBy(settlements.settlement_status),
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
          RSP <span className="text-gradient-saffron">Settlements</span>
        </h1>
        <p className="page-subtitle">
          Reconciliation & Settlement Protocol data across the ONDC network
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card !p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">Total Settlements</p>
          <p className="text-xl font-bold text-white">{totalCount}</p>
        </div>
        <div className="card !p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">Total Amount</p>
          <p className="text-xl font-bold text-white">
            {totals?.total_amount ? `₹${Number(totals.total_amount).toLocaleString('en-IN')}` : '₹0'}
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-400 mb-1">Paid</p>
          <p className="text-xl font-bold text-teal-400">
            {totals?.paid_amount ? `₹${Number(totals.paid_amount).toLocaleString('en-IN')}` : '₹0'}
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-400 mb-1">Pending</p>
          <p className="text-xl font-bold text-gold-400">
            {totals?.pending_amount ? `₹${Number(totals.pending_amount).toLocaleString('en-IN')}` : '₹0'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Order ID</label>
            <input name="search" defaultValue={searchParams.search ?? ''} className="input" placeholder="Search order ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Settlement Status</label>
            <select name="settlement_status" defaultValue={searchParams.settlement_status ?? 'all'} className="select">
              <option value="all">All</option>
              <option value="PAID">Paid</option>
              <option value="NOT_PAID">Not Paid</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Recon Status</label>
            <select name="recon_status" defaultValue={searchParams.recon_status ?? 'all'} className="select">
              <option value="all">All</option>
              <option value="01_MATCHED">Matched</option>
              <option value="02_UNMATCHED">Unmatched</option>
              <option value="03_DISPUTED">Disputed</option>
              <option value="04_OVERPAID">Overpaid</option>
              <option value="05_UNDERPAID">Underpaid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Collector App</label>
            <input name="collector" defaultValue={searchParams.collector ?? ''} className="input" placeholder="BAP ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Receiver App</label>
            <input name="receiver" defaultValue={searchParams.receiver ?? ''} className="input" placeholder="BPP ID" />
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
              <th>Order ID</th>
              <th>Collector</th>
              <th>Receiver</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Status</th>
              <th>Recon</th>
              <th>Reference</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="font-mono text-xs text-saffron-400">
                  {s.order_id.length > 16 ? `${s.order_id.slice(0, 16)}...` : s.order_id}
                </td>
                <td className="text-xs">{s.collector_app_id}</td>
                <td className="text-xs">{s.receiver_app_id}</td>
                <td className="text-xs text-ash-400">{s.settlement_type}</td>
                <td className="text-sm font-medium text-white">₹{Number(s.settlement_amount).toLocaleString('en-IN')}</td>
                <td className="text-xs text-ash-400">{s.settlement_currency}</td>
                <td>
                  <span className={`${settlementStatusBadge(s.settlement_status)} text-[10px]`}>
                    {s.settlement_status}
                  </span>
                </td>
                <td>
                  <span className={`${reconStatusBadge(s.recon_status)} text-[10px]`}>
                    {reconLabel(s.recon_status)}
                  </span>
                </td>
                <td className="font-mono text-xs text-ash-500">
                  {s.settlement_reference ?? '-'}
                </td>
                <td className="text-xs text-ash-500">{new Date(s.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-ash-600">No settlements found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} settlements
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/settlements?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/settlements?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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
