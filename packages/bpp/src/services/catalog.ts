import type { Redis } from "ioredis";
import { createLogger } from "@ondc/shared";
import type { Catalog, Provider, Item, SearchIntent } from "@ondc/shared";

const logger = createLogger("bpp-catalog");

/** Redis key prefix for catalog storage. */
const CATALOG_PREFIX = "ondc:bpp:catalog:";

/** Redis key prefix for catalog TTL metadata. */
const CATALOG_TTL_PREFIX = "ondc:bpp:catalog:ttl:";

/** Redis key prefix for catalog storage timestamps. */
const CATALOG_TS_PREFIX = "ondc:bpp:catalog:timestamp:";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredCatalog {
  provider: Provider;
  items: Item[];
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Catalog Service
// ---------------------------------------------------------------------------

/**
 * Store a seller's catalog data in Redis.
 *
 * @param subscriberId - The BPP subscriber ID or provider ID used as the key.
 * @param catalog - The catalog data (provider + items).
 * @param redis - Redis client.
 * @param ttl - Optional catalog TTL as ISO 8601 duration (e.g. "PT1H"). Defaults to "PT1H".
 */
export async function storeCatalog(
  subscriberId: string,
  catalog: StoredCatalog,
  redis: Redis,
  ttl: string = "PT1H",
): Promise<void> {
  const key = `${CATALOG_PREFIX}${subscriberId}`;
  const now = new Date().toISOString();

  // Stamp each item with an updated_at timestamp for incremental search support
  const itemsWithTimestamps = catalog.items.map((item) => ({
    ...item,
    time: {
      ...item.time,
      timestamp: item.time?.timestamp ?? now,
    },
  }));

  const data: StoredCatalog = {
    ...catalog,
    items: itemsWithTimestamps,
    updatedAt: now,
  };

  const ttlMs = parseCatalogTtl(ttl);

  await redis.set(key, JSON.stringify(data));
  await redis.set(`${CATALOG_TTL_PREFIX}${subscriberId}`, ttl);
  await redis.set(`${CATALOG_TS_PREFIX}${subscriberId}`, now);

  // Set Redis key expiry based on TTL (with 2x buffer to allow grace period)
  await redis.pexpire(key, ttlMs * 2);
  await redis.pexpire(`${CATALOG_TTL_PREFIX}${subscriberId}`, ttlMs * 2);
  await redis.pexpire(`${CATALOG_TS_PREFIX}${subscriberId}`, ttlMs * 2);

  logger.info(
    { subscriberId, itemCount: catalog.items.length, ttl },
    "Catalog stored",
  );
}

/**
 * Retrieve a seller's catalog data from Redis.
 *
 * @param subscriberId - The BPP subscriber ID or provider ID.
 * @param redis - Redis client.
 * @returns The stored catalog, or null if not found.
 */
export async function getCatalog(
  subscriberId: string,
  redis: Redis,
): Promise<StoredCatalog | null> {
  const key = `${CATALOG_PREFIX}${subscriberId}`;

  try {
    const raw = await redis.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredCatalog;
  } catch (err) {
    logger.error({ err, subscriberId }, "Error reading catalog from Redis");
    return null;
  }
}

/**
 * Update a specific item within the stored catalog.
 *
 * @param subscriberId - The BPP subscriber ID or provider ID.
 * @param itemId - The ID of the item to update.
 * @param updates - Partial item updates (price, quantity, descriptor, etc.).
 * @param redis - Redis client.
 * @returns True if the item was found and updated, false otherwise.
 */
export async function updateItem(
  subscriberId: string,
  itemId: string,
  updates: Partial<Item>,
  redis: Redis,
): Promise<boolean> {
  const catalog = await getCatalog(subscriberId, redis);
  if (!catalog) {
    logger.warn({ subscriberId, itemId }, "Catalog not found for item update");
    return false;
  }

  const itemIndex = catalog.items.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) {
    logger.warn({ subscriberId, itemId }, "Item not found in catalog");
    return false;
  }

  // Merge updates into the existing item and stamp with updated_at timestamp
  const now = new Date().toISOString();
  catalog.items[itemIndex] = {
    ...catalog.items[itemIndex],
    ...updates,
    time: {
      ...catalog.items[itemIndex].time,
      ...updates.time,
      timestamp: now,
    },
  };

  // Preserve existing TTL when re-storing after item update
  const existingTtl = await redis.get(`${CATALOG_TTL_PREFIX}${subscriberId}`) ?? "PT1H";
  await storeCatalog(subscriberId, catalog, redis, existingTtl);
  logger.info({ subscriberId, itemId }, "Item updated in catalog");
  return true;
}

/**
 * Build a Beckn on_search response from the stored catalog, optionally
 * filtered by the search intent.
 *
 * Enhanced with:
 * - Catalog TTL management (Gap 16): Includes `exp` field in response and
 *   rejects serving expired catalogs.
 * - Incremental catalog search (Gap 20): Supports filtering items by
 *   `last_updated` timestamp via `catalog_inc` tag in the search intent.
 *
 * @param subscriberId - The BPP subscriber ID.
 * @param searchIntent - The search intent from the incoming search request.
 * @param redis - Redis client.
 * @returns A Beckn Catalog object suitable for the on_search message.
 */
export async function buildOnSearchResponse(
  subscriberId: string,
  searchIntent: SearchIntent | undefined,
  redis: Redis,
): Promise<Catalog | null> {
  const storedCatalog = await getCatalog(subscriberId, redis);
  if (!storedCatalog) {
    logger.warn({ subscriberId }, "No catalog found for on_search response");
    return null;
  }

  // ---- Gap 16: Catalog TTL check ----
  const catalogTtl = await redis.get(`${CATALOG_TTL_PREFIX}${subscriberId}`) ?? "PT1H";
  const catalogTimestamp = await redis.get(`${CATALOG_TS_PREFIX}${subscriberId}`);
  const ttlMs = parseCatalogTtl(catalogTtl);

  if (catalogTimestamp) {
    const storedAt = new Date(catalogTimestamp);
    if (Date.now() - storedAt.getTime() > ttlMs) {
      logger.warn({ subscriberId, storedAt: catalogTimestamp, ttl: catalogTtl }, "Catalog has expired");
      // Return a minimal catalog indicating expiry so consumers know to refresh
      return {
        "bpp/descriptor": storedCatalog.provider.descriptor,
        "bpp/providers": [],
        exp: catalogTimestamp, // already past
      };
    }
  }

  let filteredItems = [...storedCatalog.items];

  // Apply search intent filtering if provided
  if (searchIntent) {
    // Filter by item descriptor name (search query)
    if (searchIntent.descriptor?.name) {
      const query = searchIntent.descriptor.name.toLowerCase();
      filteredItems = filteredItems.filter((item) => {
        const name = item.descriptor?.name?.toLowerCase() ?? "";
        const shortDesc = item.descriptor?.short_desc?.toLowerCase() ?? "";
        return name.includes(query) || shortDesc.includes(query);
      });
    }

    // Filter by category
    if (searchIntent.category?.id) {
      filteredItems = filteredItems.filter(
        (item) => item.category_id === searchIntent.category?.id,
      );
    }

    // Filter by provider
    if (searchIntent.provider?.id) {
      // If searching for a specific provider and ours doesn't match, return empty
      if (searchIntent.provider.id !== storedCatalog.provider.id) {
        filteredItems = [];
      }
    }

    // Filter by fulfillment type
    if (searchIntent.fulfillment?.type) {
      const reqType = searchIntent.fulfillment.type;
      filteredItems = filteredItems.filter((item) => {
        // Items without a fulfillment constraint match any type
        if (!item.fulfillment_id) return true;
        // Check if the provider's fulfillments include the requested type
        const providerFulfillments = storedCatalog.provider.fulfillments;
        if (Array.isArray(providerFulfillments)) {
          const matchingFulfillment = providerFulfillments.find(
            (f: any) => f.id === item.fulfillment_id,
          );
          return matchingFulfillment?.type === reqType;
        }
        return true;
      });
    }

    // Filter by price range (ONDC: item.price.value filtering)
    if (searchIntent.item?.price) {
      const priceFilter = searchIntent.item.price;
      const minPrice = priceFilter.minimum_value
        ? parseFloat(priceFilter.minimum_value)
        : undefined;
      const maxPrice = priceFilter.maximum_value
        ? parseFloat(priceFilter.maximum_value)
        : undefined;

      if (minPrice !== undefined || maxPrice !== undefined) {
        filteredItems = filteredItems.filter((item) => {
          const itemPrice = parseFloat(item.price?.value ?? "0");
          if (isNaN(itemPrice)) return true;
          if (minPrice !== undefined && itemPrice < minPrice) return false;
          if (maxPrice !== undefined && itemPrice > maxPrice) return false;
          return true;
        });
      }
    }

    // Filter by item tags (e.g. veg_nonveg, brand)
    if (searchIntent.tags && searchIntent.tags.length > 0) {
      for (const searchTag of searchIntent.tags) {
        if (searchTag.code === "catalog_inc") continue; // Handled separately below
        const tagCode = searchTag.code;
        const tagValues = searchTag.list?.map((l) => l.value?.toLowerCase()) ?? [];

        if (tagCode && tagValues.length > 0) {
          filteredItems = filteredItems.filter((item) => {
            const itemTags = item.tags ?? [];
            return itemTags.some((t: any) => {
              if (t.code === tagCode) {
                const itemTagValues = t.list?.map((l: any) => l.value?.toLowerCase()) ?? [];
                return tagValues.some((v) => v && itemTagValues.includes(v));
              }
              return false;
            });
          });
        }
      }
    }

    // ---- Gap 20: Incremental catalog search ----
    // Support filtering items by last_updated timestamp via catalog_inc tag
    const catalogIncTag = searchIntent.tags?.find((t) => t.code === "catalog_inc");
    const lastUpdatedFilter = catalogIncTag?.list?.find(
      (l) => l.code === "timestamp",
    )?.value;

    if (lastUpdatedFilter) {
      const filterDate = new Date(lastUpdatedFilter);
      if (!Number.isNaN(filterDate.getTime())) {
        filteredItems = filteredItems.filter((item) => {
          const itemTimestamp = item.time?.timestamp;
          // Include items that either have no timestamp (unknown update time)
          // or were updated after the filter date
          return !itemTimestamp || new Date(itemTimestamp) > filterDate;
        });
        logger.info(
          { subscriberId, lastUpdatedFilter, matchCount: filteredItems.length },
          "Applied incremental catalog filter",
        );
      } else {
        logger.warn(
          { subscriberId, lastUpdatedFilter },
          "Invalid catalog_inc timestamp filter, ignoring",
        );
      }
    }
  }

  // Build the Beckn Catalog
  const catalog: Catalog = {
    "bpp/descriptor": storedCatalog.provider.descriptor,
    "bpp/providers": [
      {
        ...storedCatalog.provider,
        items: filteredItems,
      },
    ],
    // Gap 16: Include catalog expiry in response (ISO 8601 timestamp)
    exp: new Date(Date.now() + ttlMs).toISOString(),
  };

  // If incremental search was requested, filter out providers with no matching items
  const catalogIncTag = searchIntent?.tags?.find((t) => t.code === "catalog_inc");
  if (catalogIncTag) {
    catalog["bpp/providers"] = catalog["bpp/providers"]?.filter(
      (provider) => (provider.items?.length ?? 0) > 0,
    );
    // If no providers have matching items, return null (nothing new)
    if (!catalog["bpp/providers"]?.length) {
      return null;
    }
  }

  return catalog;
}

// ---------------------------------------------------------------------------
// Catalog TTL Helpers (Gap 16)
// ---------------------------------------------------------------------------

/**
 * Parse an ISO 8601 duration string (e.g. "PT1H", "PT30M", "PT1H30M15S")
 * to milliseconds. Only supports the "PTnHnMnS" subset commonly used by ONDC.
 *
 * Falls back to 3600000 (1 hour) if the format is not recognized.
 */
export function parseCatalogTtl(ttl: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(ttl);
  if (!match) {
    logger.warn({ ttl }, "Unrecognized TTL format, defaulting to 1 hour");
    return 3_600_000; // Default 1 hour
  }
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Check whether a catalog for the given subscriber has expired.
 *
 * @returns `true` if the catalog is expired or has no timestamp metadata.
 */
export async function isCatalogExpired(
  subscriberId: string,
  redis: Redis,
): Promise<boolean> {
  const catalogTtl = await redis.get(`${CATALOG_TTL_PREFIX}${subscriberId}`) ?? "PT1H";
  const catalogTimestamp = await redis.get(`${CATALOG_TS_PREFIX}${subscriberId}`);
  if (!catalogTimestamp) {
    return true;
  }
  const storedAt = new Date(catalogTimestamp);
  const ttlMs = parseCatalogTtl(catalogTtl);
  return Date.now() - storedAt.getTime() > ttlMs;
}

// ---------------------------------------------------------------------------
// ONDC Incremental Catalog Support (Gap 6)
// ---------------------------------------------------------------------------

export type CatalogIncMode = "start" | "end" | "inc";

export interface CatalogUpdate {
  /** Type of incremental update */
  type: "item_add" | "item_remove" | "item_update" | "price_update" | "availability_update";
  /** Item ID being updated */
  itemId: string;
  /** Updated item data (for add/update operations) */
  item?: Partial<Item>;
  /** Timestamp of the update */
  timestamp: string;
}

/** Redis key for tracking incremental catalog updates per provider */
const CATALOG_INC_PREFIX = "ondc:bpp:catalog_inc:";

/**
 * Record an incremental catalog update for a provider.
 * These updates are queued in Redis and sent as catalog_inc on_search responses.
 */
export async function recordCatalogUpdate(
  subscriberId: string,
  update: CatalogUpdate,
  redis: Redis,
): Promise<void> {
  const key = `${CATALOG_INC_PREFIX}${subscriberId}`;

  // Store updates as a Redis list (most recent at end)
  await redis.rpush(key, JSON.stringify(update));

  // Keep at most 1000 pending updates
  await redis.ltrim(key, -1000, -1);

  logger.info(
    { subscriberId, type: update.type, itemId: update.itemId },
    "Incremental catalog update recorded",
  );

  // Also apply the update to the stored catalog
  const catalog = await getCatalog(subscriberId, redis);
  if (catalog) {
    applyCatalogUpdate(catalog, update);
    await storeCatalog(subscriberId, catalog, redis);
  }
}

/**
 * Apply a single incremental update to the in-memory catalog.
 */
function applyCatalogUpdate(catalog: StoredCatalog, update: CatalogUpdate): void {
  switch (update.type) {
    case "item_add": {
      if (update.item) {
        catalog.items.push({ id: update.itemId, ...update.item } as Item);
      }
      break;
    }
    case "item_remove": {
      catalog.items = catalog.items.filter((item) => item.id !== update.itemId);
      break;
    }
    case "item_update":
    case "price_update":
    case "availability_update": {
      const index = catalog.items.findIndex((item) => item.id === update.itemId);
      if (index !== -1 && update.item) {
        catalog.items[index] = { ...catalog.items[index], ...update.item };
      }
      break;
    }
  }
}

/**
 * Get pending incremental catalog updates since last sync.
 */
export async function getPendingCatalogUpdates(
  subscriberId: string,
  redis: Redis,
  limit = 100,
): Promise<CatalogUpdate[]> {
  const key = `${CATALOG_INC_PREFIX}${subscriberId}`;
  const raw = await redis.lrange(key, 0, limit - 1);

  return raw.map((entry) => JSON.parse(entry) as CatalogUpdate);
}

/**
 * Clear pending incremental catalog updates (after successful sync).
 */
export async function clearPendingCatalogUpdates(
  subscriberId: string,
  redis: Redis,
): Promise<void> {
  const key = `${CATALOG_INC_PREFIX}${subscriberId}`;
  await redis.del(key);
  logger.info({ subscriberId }, "Pending catalog updates cleared");
}

/**
 * Build an incremental on_search response containing only the changes.
 *
 * Per ONDC spec, the response includes a `tags` array with:
 * - `catalog_inc` tag with `mode` = "inc" for incremental updates
 * - `catalog_inc` tag with `mode` = "start"/"end" for full refresh boundaries
 *
 * @param subscriberId - The BPP subscriber ID.
 * @param redis - Redis client.
 * @returns An incremental catalog object or null if no pending updates.
 */
export async function buildIncrementalCatalogResponse(
  subscriberId: string,
  redis: Redis,
): Promise<{
  catalog: Catalog;
  tags: Array<{ code: string; list: Array<{ code: string; value: string }> }>;
} | null> {
  const updates = await getPendingCatalogUpdates(subscriberId, redis);
  if (updates.length === 0) {
    return null;
  }

  const catalog = await getCatalog(subscriberId, redis);
  if (!catalog) {
    return null;
  }

  // Collect updated item IDs
  const updatedItemIds = new Set(updates.map((u) => u.itemId));
  const removedItemIds = new Set(
    updates.filter((u) => u.type === "item_remove").map((u) => u.itemId),
  );

  // Build incremental provider with only changed items
  const changedItems = catalog.items.filter((item) =>
    item.id && updatedItemIds.has(item.id) && !removedItemIds.has(item.id),
  );

  const incrementalCatalog: Catalog = {
    "bpp/descriptor": catalog.provider.descriptor,
    "bpp/providers": [
      {
        ...catalog.provider,
        items: changedItems,
        tags: [
          {
            code: "catalog_inc",
            list: [
              { code: "mode", value: "inc" },
              { code: "type", value: updates.map((u) => u.type).join(",") },
            ],
          },
        ],
      },
    ],
    exp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr expiry
  };

  const tags = [
    {
      code: "catalog_inc",
      list: [
        { code: "mode", value: "inc" as string },
        { code: "timestamp", value: new Date().toISOString() },
      ],
    },
  ];

  // Clear pending updates after building response
  await clearPendingCatalogUpdates(subscriberId, redis);

  logger.info(
    { subscriberId, updateCount: updates.length, itemCount: changedItems.length },
    "Built incremental catalog response",
  );

  return { catalog: incrementalCatalog, tags };
}
