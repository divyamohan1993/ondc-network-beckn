import { sql, eq, and, ilike, gte, lte } from 'drizzle-orm';
import db from '@/lib/db';
import { orders } from '@ondc/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    state?: string;
    bap_id?: string;
    bpp_id?: string;
    domain?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

function stateBadge(state: string) {
  switch (state) {
    case 'CREATED':
      return 'badge-blue';
    case 'ACCEPTED':
      return 'badge-green';
    case 'IN_PROGRESS':
      return 'badge-yellow';
    case 'COMPLETED':
      return 'badge-green';
    case 'CANCELLED':
      return 'badge-red';
    case 'RETURNED':
      return 'badge-yellow';
    default:
      return 'badge-gray';
  }
}

export default async function OrdersPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (searchParams.state && searchParams.state !== 'all') {
    conditions.push(eq(orders.state, searchParams.state as any));
  }
  if (searchParams.bap_id) {
    conditions.push(ilike(orders.bap_id, `%${searchParams.bap_id}%`));
  }
  if (searchParams.bpp_id) {
    conditions.push(ilike(orders.bpp_id, `%${searchParams.bpp_id}%`));
  }
  if (searchParams.domain) {
    conditions.push(ilike(orders.domain, `%${searchParams.domain}%`));
  }
  if (searchParams.from) {
    conditions.push(gte(orders.created_at, new Date(searchParams.from)));
  }
  if (searchParams.to) {
    conditions.push(lte(orders.created_at, new Date(searchParams.to)));
  }
  if (searchParams.search) {
    conditions.push(ilike(orders.order_id, `%${searchParams.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }], stateCounts] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(whereClause),
    db
      .select({
        state: orders.state,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.state),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  const stateMap: Record<string, number> = {};
  for (const s of stateCounts) {
    stateMap[s.state] = s.count;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">
          Network <span className="text-gradient-saffron">Orders</span>
        </h1>
        <p className="page-subtitle">
          Track and manage orders across the ONDC network
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {['CREATED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RETURNED'].map((s) => (
          <div key={s} className="card !p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">{s.replace('_', ' ')}</p>
            <p className="text-xl font-bold text-white">{stateMap[s] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Order ID</label>
            <input name="search" defaultValue={searchParams.search ?? ''} className="input" placeholder="Search order ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">State</label>
            <select name="state" defaultValue={searchParams.state ?? 'all'} className="select">
              <option value="all">All States</option>
              <option value="CREATED">Created</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">BAP ID</label>
            <input name="bap_id" defaultValue={searchParams.bap_id ?? ''} className="input" placeholder="BAP ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">BPP ID</label>
            <input name="bpp_id" defaultValue={searchParams.bpp_id ?? ''} className="input" placeholder="BPP ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Domain</label>
            <input name="domain" defaultValue={searchParams.domain ?? ''} className="input" placeholder="e.g. ONDC:RET10" />
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
              <th>Transaction ID</th>
              <th>BAP</th>
              <th>BPP</th>
              <th>Domain</th>
              <th>City</th>
              <th>State</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/orders/${order.id}`} className="text-saffron-400 hover:underline font-mono text-xs">
                    {order.order_id.length > 20 ? `${order.order_id.slice(0, 20)}...` : order.order_id}
                  </Link>
                </td>
                <td className="font-mono text-xs text-ash-400">
                  {order.transaction_id.length > 16 ? `${order.transaction_id.slice(0, 16)}...` : order.transaction_id}
                </td>
                <td className="text-xs">{order.bap_id}</td>
                <td className="text-xs">{order.bpp_id}</td>
                <td><span className="badge-blue text-[10px]">{order.domain}</span></td>
                <td className="text-xs text-ash-400">{order.city}</td>
                <td><span className={`${stateBadge(order.state)} text-[10px]`}>{order.state}</span></td>
                <td className="text-xs text-ash-500">{new Date(order.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-ash-600">No orders found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} orders
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/orders?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/orders?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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
