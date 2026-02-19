import { NextResponse } from 'next/server';
import { sql, gte } from 'drizzle-orm';
import db from '@/lib/db';
import { transactions } from '@ondc/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Domain transactions over time (last 30 days)
    const domainTxRows = await db
      .select({
        date: sql<string>`to_char(created_at, 'Mon DD')`,
        domain: transactions.domain,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(gte(transactions.created_at, thirtyDaysAgo))
      .groupBy(sql`to_char(created_at, 'Mon DD'), created_at::date, ${transactions.domain}`)
      .orderBy(sql`created_at::date`);

    // Pivot domain data
    const domainsSet = new Set<string>();
    const dateMap = new Map<string, Record<string, any>>();

    for (const row of domainTxRows) {
      const domain = row.domain ?? 'unknown';
      domainsSet.add(domain);
      if (!dateMap.has(row.date)) {
        dateMap.set(row.date, { date: row.date });
      }
      dateMap.get(row.date)![domain] = row.count;
    }

    const domainsList = Array.from(domainsSet);
    const domainTransactions = {
      data: Array.from(dateMap.values()),
      domains: domainsList,
    };

    // Conversion funnel
    const funnelActions = ['search', 'on_search', 'select', 'on_select', 'init', 'on_init', 'confirm', 'on_confirm'];
    const funnelRows = await db
      .select({
        action: transactions.action,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(gte(transactions.created_at, thirtyDaysAgo))
      .groupBy(transactions.action);

    const funnelMap = new Map(funnelRows.map((r) => [r.action, r.count]));
    const funnel = funnelActions.map((action) => ({
      action,
      count: funnelMap.get(action) ?? 0,
    }));

    // Average latency by action
    const latencyRows = await db
      .select({
        action: transactions.action,
        avg_latency: sql<number>`round(avg(latency_ms))::int`,
      })
      .from(transactions)
      .where(gte(transactions.created_at, thirtyDaysAgo))
      .groupBy(transactions.action)
      .orderBy(sql`avg(latency_ms) DESC`)
      .limit(10);

    // Top participants by volume
    const topBaps = await db
      .select({
        subscriber_id: transactions.bap_id,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(gte(transactions.created_at, thirtyDaysAgo))
      .groupBy(transactions.bap_id)
      .orderBy(sql`count(*) DESC`)
      .limit(10);

    const topParticipants = topBaps
      .filter((r) => r.subscriber_id)
      .map((r) => ({
        subscriber_id: r.subscriber_id!,
        count: r.count,
      }));

    return NextResponse.json({
      domainTransactions,
      funnel,
      latency: latencyRows,
      topParticipants,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
