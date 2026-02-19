import { NextRequest, NextResponse } from 'next/server';
import { eq, ilike, and, sql, desc, asc } from 'drizzle-orm';
import db from '@/lib/db';
import { subscribers } from '@ondc/shared';
import { requireRole, unauthorized } from '@/lib/api-helpers';

/**
 * GET /api/participants
 *
 * List all registered network participants (subscribers) with filtering,
 * pagination, and sorting. Required by ONDC admin portal for participant
 * management and compliance monitoring.
 *
 * Query params:
 *   - status: Filter by subscriber status (INITIATED|UNDER_SUBSCRIPTION|SUBSCRIBED|SUSPENDED|REVOKED)
 *   - type: Filter by subscriber type (BAP|BPP|BG|LBAP|LBPP)
 *   - domain: Filter by domain code (e.g. ONDC:RET10)
 *   - search: Search by subscriber_id or subscriber_url (case-insensitive)
 *   - page: Page number (default 1)
 *   - limit: Items per page (default 50, max 200)
 *   - sort: Sort field (created_at|updated_at|subscriber_id|status) default created_at
 *   - order: Sort order (asc|desc) default desc
 */
export async function GET(request: NextRequest) {
  const session = await requireRole('ADMIN');
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const domain = searchParams.get('domain');
    const search = searchParams.get('search');
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));
    const sortField = searchParams.get('sort') ?? 'created_at';
    const sortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    // Build filter conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(subscribers.status, status as any));
    }
    if (type) {
      conditions.push(eq(subscribers.type, type as any));
    }
    if (domain) {
      conditions.push(eq(subscribers.domain, domain));
    }
    if (search) {
      conditions.push(
        sql`(${subscribers.subscriber_id} ILIKE ${`%${search}%`} OR ${subscribers.subscriber_url} ILIKE ${`%${search}%`})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get sort column
    const sortColumns: Record<string, any> = {
      created_at: subscribers.created_at,
      updated_at: subscribers.updated_at,
      subscriber_id: subscribers.subscriber_id,
      status: subscribers.status,
    };
    const sortCol = sortColumns[sortField] ?? subscribers.created_at;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Execute count and data queries in parallel
    const [countResult, data] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(subscribers)
        .where(whereClause),
      db
        .select({
          id: subscribers.id,
          subscriber_id: subscribers.subscriber_id,
          subscriber_url: subscribers.subscriber_url,
          type: subscribers.type,
          domain: subscribers.domain,
          city: subscribers.city,
          unique_key_id: subscribers.unique_key_id,
          status: subscribers.status,
          valid_from: subscribers.valid_from,
          valid_until: subscribers.valid_until,
          is_simulated: subscribers.is_simulated,
          created_at: subscribers.created_at,
          updated_at: subscribers.updated_at,
        })
        .from(subscribers)
        .where(whereClause)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset((page - 1) * limit),
    ]);

    const total = countResult[0]?.count ?? 0;

    return NextResponse.json({
      participants: data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch participants' },
      { status: 500 },
    );
  }
}
