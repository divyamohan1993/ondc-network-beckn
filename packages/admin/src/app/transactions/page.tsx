import { sql, eq, and, ilike, gte, lte } from 'drizzle-orm';
import db from '@/lib/db';
import { transactions } from '@ondc/shared';
import TransactionRow from './transaction-row';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    domain?: string;
    action?: string;
    status?: string;
    from?: string;
    to?: string;
    simulated?: string;
    search?: string;
    page?: string;
  };
}

const PAGE_SIZE = 25;

export default async function TransactionsPage({ searchParams }: PageProps) {
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  // Build conditions
  const conditions = [];
  if (searchParams.domain) {
    conditions.push(ilike(transactions.domain, `%${searchParams.domain}%`));
  }
  if (searchParams.action) {
    conditions.push(eq(transactions.action, searchParams.action));
  }
  if (searchParams.status && searchParams.status !== 'all') {
    conditions.push(eq(transactions.status, searchParams.status as any));
  }
  if (searchParams.from) {
    conditions.push(gte(transactions.created_at, new Date(searchParams.from)));
  }
  if (searchParams.to) {
    conditions.push(lte(transactions.created_at, new Date(searchParams.to)));
  }
  if (searchParams.simulated === 'true') {
    conditions.push(eq(transactions.is_simulated, true));
  } else if (searchParams.simulated === 'false') {
    conditions.push(eq(transactions.is_simulated, false));
  }
  if (searchParams.search) {
    conditions.push(ilike(transactions.transaction_id, `%${searchParams.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }]] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(whereClause)
      .orderBy(sql`created_at DESC`)
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(whereClause),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display"><span className="text-gradient-saffron">Transactions</span></h1>
        <p className="page-subtitle">View and search network transaction logs</p>
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Search TX ID</label>
            <input name="search" defaultValue={searchParams.search ?? ''} className="input" placeholder="Transaction ID" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Domain</label>
            <input name="domain" defaultValue={searchParams.domain ?? ''} className="input" placeholder="Domain" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Action</label>
            <select name="action" defaultValue={searchParams.action ?? ''} className="select">
              <option value="">All Actions</option>
              <option value="search">search</option>
              <option value="on_search">on_search</option>
              <option value="select">select</option>
              <option value="on_select">on_select</option>
              <option value="init">init</option>
              <option value="on_init">on_init</option>
              <option value="confirm">confirm</option>
              <option value="on_confirm">on_confirm</option>
              <option value="status">status</option>
              <option value="on_status">on_status</option>
              <option value="cancel">cancel</option>
              <option value="on_cancel">on_cancel</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Status</label>
            <select name="status" defaultValue={searchParams.status ?? 'all'} className="select">
              <option value="all">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="ACK">ACK</option>
              <option value="NACK">NACK</option>
              <option value="CALLBACK_RECEIVED">Callback Received</option>
              <option value="TIMEOUT">Timeout</option>
              <option value="ERROR">Error</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">From</label>
            <input type="date" name="from" defaultValue={searchParams.from ?? ''} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">To</label>
            <input type="date" name="to" defaultValue={searchParams.to ?? ''} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Data</label>
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
              <th></th>
              <th>Transaction ID</th>
              <th>Action</th>
              <th>BAP</th>
              <th>BPP</th>
              <th>Domain</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-ash-600">
                  No transactions found
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
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} transactions
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/transactions?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/transactions?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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
