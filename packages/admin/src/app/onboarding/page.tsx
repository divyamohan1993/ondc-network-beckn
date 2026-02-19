import { sql, eq, and, ilike } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers, subscriberDomains } from '@ondc/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    search?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;

function statusBadge(status: string) {
  switch (status) {
    case 'INITIATED': return 'badge-yellow';
    case 'UNDER_SUBSCRIPTION': return 'badge-blue';
    case 'SUBSCRIBED': return 'badge-green';
    case 'SUSPENDED': return 'badge-red';
    case 'REVOKED': return 'badge-red';
    default: return 'badge-gray';
  }
}

function typeBadge(type: string) {
  switch (type) {
    case 'BAP': return 'badge-blue';
    case 'BPP': return 'badge-green';
    case 'BG': return 'badge-yellow';
    default: return 'badge-gray';
  }
}

function statusStep(status: string): number {
  switch (status) {
    case 'INITIATED': return 1;
    case 'UNDER_SUBSCRIPTION': return 2;
    case 'SUBSCRIBED': return 3;
    default: return 0;
  }
}

export default async function OnboardingPage({ searchParams: searchParamsPromise }: PageProps) {
  const searchParams = await searchParamsPromise;
  const page = parseInt(searchParams.page ?? '1', 10);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (searchParams.status && searchParams.status !== 'all') {
    conditions.push(eq(subscribers.status, searchParams.status as any));
  }
  if (searchParams.type && searchParams.type !== 'all') {
    conditions.push(eq(subscribers.type, searchParams.type as any));
  }
  if (searchParams.search) {
    conditions.push(ilike(subscribers.subscriber_id, `%${searchParams.search}%`));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count: totalCount }], statusCounts, domainMappings] = await Promise.all([
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
    db
      .select({
        status: subscribers.status,
        count: sql<number>`count(*)::int`,
      })
      .from(subscribers)
      .groupBy(subscribers.status),
    db
      .select({
        subscriber_id: subscriberDomains.subscriber_id,
        domain: subscriberDomains.domain,
        city: subscriberDomains.city,
      })
      .from(subscriberDomains)
      .where(eq(subscriberDomains.is_active, true)),
  ]);

  const totalPages = Math.ceil((totalCount ?? 0) / PAGE_SIZE);

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) {
    if (s.status) statusMap[s.status] = s.count;
  }

  // Group domains by subscriber
  const domainsBySubscriber: Record<string, Array<{ domain: string; city: string | null }>> = {};
  for (const dm of domainMappings) {
    if (!domainsBySubscriber[dm.subscriber_id]) {
      domainsBySubscriber[dm.subscriber_id] = [];
    }
    domainsBySubscriber[dm.subscriber_id].push({ domain: dm.domain, city: dm.city });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title font-display">
          Subscriber <span className="text-gradient-saffron">Onboarding</span>
        </h1>
        <p className="page-subtitle">
          ONDC network participant registration and subscription lifecycle
        </p>
      </div>

      {/* Onboarding funnel stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {['INITIATED', 'UNDER_SUBSCRIPTION', 'SUBSCRIBED', 'SUSPENDED', 'REVOKED'].map((s) => (
          <div key={s} className="card !p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ash-500 mb-1">
              {s.replace('_', ' ')}
            </p>
            <p className="text-xl font-bold text-white">{statusMap[s] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Onboarding flow description */}
      <div className="card">
        <h3 className="card-header">ONDC Subscription Flow</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gold-500/20 text-gold-400 flex items-center justify-center text-xs font-bold">1</div>
            <span className="text-ash-400">Subscribe Request</span>
          </div>
          <div className="text-ash-600">→</div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-saffron-500/20 text-saffron-400 flex items-center justify-center text-xs font-bold">2</div>
            <span className="text-ash-400">Challenge Verification</span>
          </div>
          <div className="text-ash-600">→</div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-saffron-500/20 text-saffron-400 flex items-center justify-center text-xs font-bold">3</div>
            <span className="text-ash-400">on_subscribe Response</span>
          </div>
          <div className="text-ash-600">→</div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">4</div>
            <span className="text-ash-400">SUBSCRIBED</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <form className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Subscriber ID</label>
            <input name="search" defaultValue={searchParams.search ?? ''} className="input" placeholder="Search subscriber" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ash-500 mb-1">Status</label>
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
            <label className="block text-xs font-medium text-ash-500 mb-1">Type</label>
            <select name="type" defaultValue={searchParams.type ?? 'all'} className="select">
              <option value="all">All Types</option>
              <option value="BAP">BAP (Buyer)</option>
              <option value="BPP">BPP (Seller)</option>
              <option value="BG">BG (Gateway)</option>
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
              <th>Domains</th>
              <th>URL</th>
              <th>Key ID</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Valid From</th>
              <th>Valid Until</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sub) => {
              const subDomains = domainsBySubscriber[sub.subscriber_id] ?? [];
              const step = statusStep(sub.status ?? '');

              return (
                <tr key={sub.id}>
                  <td>
                    <Link href={`/participants/${sub.id}`} className="text-saffron-400 hover:underline text-xs">
                      {sub.subscriber_id}
                    </Link>
                  </td>
                  <td>
                    <span className={`${typeBadge(sub.type ?? '')} text-[10px]`}>{sub.type}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {sub.domain && <span className="badge-blue text-[9px]">{sub.domain}</span>}
                      {subDomains.slice(0, 3).map((d, i) => (
                        <span key={i} className="badge-gray text-[9px]">{d.domain}</span>
                      ))}
                      {subDomains.length > 3 && (
                        <span className="text-[9px] text-ash-500">+{subDomains.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-ash-400 max-w-[150px] truncate" title={sub.subscriber_url}>
                    {sub.subscriber_url}
                  </td>
                  <td className="font-mono text-[10px] text-ash-500">{sub.unique_key_id}</td>
                  <td>
                    <span className={`${statusBadge(sub.status ?? '')} text-[10px]`}>{sub.status}</span>
                  </td>
                  <td>
                    {/* Progress bar */}
                    <div className="flex gap-1 items-center">
                      {[1, 2, 3].map((s) => (
                        <div
                          key={s}
                          className={`h-1.5 w-5 rounded-full ${
                            s <= step
                              ? step === 3
                                ? 'bg-teal-400'
                                : 'bg-saffron-400'
                              : 'bg-surface-raised'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="text-xs text-ash-500">
                    {sub.valid_from ? new Date(sub.valid_from).toLocaleDateString() : '-'}
                  </td>
                  <td className="text-xs text-ash-500">
                    {sub.valid_until ? new Date(sub.valid_until).toLocaleDateString() : '-'}
                  </td>
                  <td className="text-xs text-ash-500">
                    {sub.created_at ? new Date(sub.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-8 text-ash-600">No subscribers found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-ash-500">
            Showing {offset + 1} to {Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} subscribers
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/onboarding?${new URLSearchParams({ ...searchParams, page: String(page - 1) }).toString()}`}
                className="btn-secondary text-xs"
              >
                Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/onboarding?${new URLSearchParams({ ...searchParams, page: String(page + 1) }).toString()}`}
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
