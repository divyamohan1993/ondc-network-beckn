import { eq, and, ilike, sql, type SQL } from "drizzle-orm";
import { subscribers, type Database } from "@ondc/shared/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubscriberFilters {
  subscriber_id?: string;
  type?: "BAP" | "BPP" | "BG";
  domain?: string;
  city?: string;
  status?: "INITIATED" | "UNDER_SUBSCRIPTION" | "SUBSCRIBED" | "SUSPENDED" | "REVOKED";
  is_simulated?: boolean;
  search?: string;
}

export interface CreateSubscriberData {
  subscriber_id: string;
  subscriber_url: string;
  type?: "BAP" | "BPP" | "BG";
  domain?: string;
  city?: string;
  signing_public_key: string;
  encr_public_key?: string;
  unique_key_id: string;
  status?: "INITIATED" | "UNDER_SUBSCRIPTION" | "SUBSCRIBED" | "SUSPENDED" | "REVOKED";
  is_simulated?: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Find a subscriber by their subscriber_id.
 */
export async function findBySubscriberId(
  db: Database,
  subscriberId: string,
) {
  const results = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.subscriber_id, subscriberId))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find a subscriber by their internal UUID id.
 */
export async function findById(db: Database, id: string) {
  const results = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find all subscribers matching the given filters, with optional pagination.
 */
export async function findAll(
  db: Database,
  filters: SubscriberFilters = {},
  pagination: PaginationOptions = {},
) {
  const conditions: SQL[] = [];

  if (filters.subscriber_id) {
    conditions.push(eq(subscribers.subscriber_id, filters.subscriber_id));
  }
  if (filters.type) {
    conditions.push(eq(subscribers.type, filters.type));
  }
  if (filters.domain) {
    conditions.push(eq(subscribers.domain, filters.domain));
  }
  if (filters.city) {
    conditions.push(eq(subscribers.city, filters.city));
  }
  if (filters.status) {
    conditions.push(eq(subscribers.status, filters.status));
  }
  if (filters.is_simulated !== undefined) {
    conditions.push(eq(subscribers.is_simulated, filters.is_simulated));
  }
  if (filters.search) {
    conditions.push(
      ilike(subscribers.subscriber_id, `%${filters.search}%`),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const page = Math.max(1, pagination.page ?? 1);
  const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
  const offset = (page - 1) * limit;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(subscribers.created_at),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Create or upsert a subscriber record.
 * On conflict with subscriber_id, updates the existing record.
 */
export async function upsert(db: Database, data: CreateSubscriberData) {
  const result = await db
    .insert(subscribers)
    .values({
      subscriber_id: data.subscriber_id,
      subscriber_url: data.subscriber_url,
      type: data.type,
      domain: data.domain,
      city: data.city,
      signing_public_key: data.signing_public_key,
      encr_public_key: data.encr_public_key,
      unique_key_id: data.unique_key_id,
      status: data.status ?? "INITIATED",
      is_simulated: data.is_simulated ?? false,
    })
    .onConflictDoUpdate({
      target: subscribers.subscriber_id,
      set: {
        subscriber_url: data.subscriber_url,
        type: data.type,
        domain: data.domain,
        city: data.city,
        signing_public_key: data.signing_public_key,
        encr_public_key: data.encr_public_key,
        unique_key_id: data.unique_key_id,
        status: data.status ?? "INITIATED",
        updated_at: new Date(),
      },
    })
    .returning();

  return result[0]!;
}

/**
 * Update a subscriber's status by internal UUID.
 */
export async function updateStatus(
  db: Database,
  id: string,
  status: "INITIATED" | "UNDER_SUBSCRIPTION" | "SUBSCRIBED" | "SUSPENDED" | "REVOKED",
  extra?: { valid_from?: Date; valid_until?: Date },
) {
  const result = await db
    .update(subscribers)
    .set({
      status,
      updated_at: new Date(),
      ...(extra?.valid_from ? { valid_from: extra.valid_from } : {}),
      ...(extra?.valid_until ? { valid_until: extra.valid_until } : {}),
    })
    .where(eq(subscribers.id, id))
    .returning();

  return result[0] ?? null;
}

/**
 * Update a subscriber's status by subscriber_id string.
 */
export async function updateStatusBySubscriberId(
  db: Database,
  subscriberId: string,
  status: "INITIATED" | "UNDER_SUBSCRIPTION" | "SUBSCRIBED" | "SUSPENDED" | "REVOKED",
  extra?: { valid_from?: Date; valid_until?: Date },
) {
  const result = await db
    .update(subscribers)
    .set({
      status,
      updated_at: new Date(),
      ...(extra?.valid_from ? { valid_from: extra.valid_from } : {}),
      ...(extra?.valid_until ? { valid_until: extra.valid_until } : {}),
    })
    .where(eq(subscribers.subscriber_id, subscriberId))
    .returning();

  return result[0] ?? null;
}

/**
 * Delete a subscriber by internal UUID.
 */
export async function deleteSubscriber(db: Database, id: string) {
  const result = await db
    .delete(subscribers)
    .where(eq(subscribers.id, id))
    .returning();

  return result[0] ?? null;
}
