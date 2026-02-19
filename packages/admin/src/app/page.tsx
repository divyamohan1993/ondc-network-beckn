import { eq, sql, gte, and } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers, transactions, domains } from '@ondc/shared';
import StatsCard from '@/components/stats-card';
import { TransactionVolumeChart } from '@/components/charts';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [bapCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.type, 'BAP'));

  const [bppCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.type, 'BPP'));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [txToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .where(gte(transactions.created_at, today));

  const [activeDomains] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(domains)
    .where(eq(domains.is_active, true));

  return {
    baps: bapCount?.count ?? 0,
    bpps: bppCount?.count ?? 0,
    transactionsToday: txToday?.count ?? 0,
    activeDomains: activeDomains?.count ?? 0,
  };
}

async function getTransactionVolume() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rows = await db
    .select({
      date: sql<string>`to_char(created_at, 'Mon DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(gte(transactions.created_at, sevenDaysAgo))
    .groupBy(sql`to_char(created_at, 'Mon DD'), created_at::date`)
    .orderBy(sql`created_at::date`);

  return rows;
}

async function getRecentTransactions() {
  const rows = await db
    .select({
      id: transactions.id,
      transaction_id: transactions.transaction_id,
      action: transactions.action,
      bap_id: transactions.bap_id,
      bpp_id: transactions.bpp_id,
      domain: transactions.domain,
      status: transactions.status,
      latency_ms: transactions.latency_ms,
      created_at: transactions.created_at,
    })
    .from(transactions)
    .orderBy(sql`created_at DESC`)
    .limit(10);

  return rows;
}

function statusBadge(status: string | null) {
  const map: Record<string, string> = {
    ACK: 'badge-green',
    CALLBACK_RECEIVED: 'badge-green',
    SENT: 'badge-blue',
    NACK: 'badge-red',
    ERROR: 'badge-red',
    TIMEOUT: 'badge-yellow',
  };
  return map[status ?? ''] ?? 'badge-gray';
}

export default async function DashboardPage() {
  const [stats, volumeData, recentTx] = await Promise.all([
    getStats(),
    getTransactionVolume(),
    getRecentTransactions(),
  ]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="page-title">
            Network <span className="text-gradient-saffron">Dashboard</span>
          </h1>
          <p className="page-subtitle">Real-time overview of the ONDC Beckn network</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ash-500">
          <span className="status-dot-up" />
          <span>Network Active</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-up" style={{ animationFillMode: 'backwards' }}>
        <StatsCard
          label="Buyer Platforms (BAP)"
          value={stats.baps}
          color="saffron"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          }
        />
        <StatsCard
          label="Seller Platforms (BPP)"
          value={stats.bpps}
          color="teal"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
            </svg>
          }
        />
        <StatsCard
          label="Transactions Today"
          value={stats.transactionsToday}
          color="gold"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          }
        />
        <StatsCard
          label="Active Domains"
          value={stats.activeDomains}
          color="ember"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          }
        />
      </div>

      {/* Transaction Volume Chart */}
      <div className="animate-fade-up delay-200" style={{ animationFillMode: 'backwards' }}>
        <TransactionVolumeChart data={volumeData} />
      </div>

      {/* Recent Transactions Table */}
      <div className="card animate-fade-up delay-400" style={{ animationFillMode: 'backwards' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="card-header mb-0">Recent Transactions</h3>
          <a href="/transactions" className="text-[13px] text-saffron-400 hover:text-saffron-300 font-medium transition-colors">
            View all &rarr;
          </a>
        </div>
        <div className="overflow-x-auto -mx-6 -mb-6 rounded-b-2xl">
          <table className="table">
            <thead>
              <tr>
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
              {recentTx.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-mono text-xs text-saffron-400/70">{tx.transaction_id?.slice(0, 12)}...</td>
                  <td>
                    <span className="font-semibold text-white">{tx.action}</span>
                  </td>
                  <td className="text-xs text-ash-400">{tx.bap_id ?? '-'}</td>
                  <td className="text-xs text-ash-400">{tx.bpp_id ?? '-'}</td>
                  <td className="text-ash-400">{tx.domain ?? '-'}</td>
                  <td>
                    <span className={statusBadge(tx.status)}>{tx.status}</span>
                  </td>
                  <td className="font-mono text-xs">
                    {tx.latency_ms ? (
                      <span className={tx.latency_ms > 5000 ? 'text-ember-400' : tx.latency_ms > 2000 ? 'text-gold-400' : 'text-teal-400'}>
                        {tx.latency_ms}ms
                      </span>
                    ) : (
                      <span className="text-ash-600">-</span>
                    )}
                  </td>
                  <td className="text-xs text-ash-500">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
              {recentTx.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-ash-600">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-ash-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      <span>No transactions found. Run a simulation to generate traffic.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
