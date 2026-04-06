import { eq, and, sql } from "drizzle-orm";
import { inventory, createLogger } from "@ondc/shared";
import type { Database } from "@ondc/shared";

const logger = createLogger("inventory");

export class InventoryService {
  constructor(private db: Database) {}

  /**
   * Set stock level for an item. Upserts on (provider_id, item_id).
   */
  async setStock(
    providerId: string,
    itemId: string,
    quantity: number,
    options?: {
      sku?: string;
      lowStockThreshold?: number;
      maxQuantityPerOrder?: number;
    },
  ): Promise<void> {
    await this.db
      .insert(inventory)
      .values({
        provider_id: providerId,
        item_id: itemId,
        stock_quantity: quantity,
        sku: options?.sku,
        low_stock_threshold: options?.lowStockThreshold ?? 5,
        max_quantity_per_order: options?.maxQuantityPerOrder ?? 100,
      })
      .onConflictDoUpdate({
        target: [inventory.provider_id, inventory.item_id],
        set: {
          stock_quantity: quantity,
          sku: options?.sku,
          low_stock_threshold: options?.lowStockThreshold,
          max_quantity_per_order: options?.maxQuantityPerOrder,
          updated_at: new Date(),
        },
      });

    logger.info({ providerId, itemId, quantity }, "Stock set");
  }

  /**
   * Check if items are available in requested quantities.
   * Returns list of unavailable items.
   */
  async checkAvailability(
    providerId: string,
    items: { id: string; quantity: number }[],
  ): Promise<{
    available: boolean;
    unavailableItems: { id: string; requested: number; available: number }[];
  }> {
    const unavailable: { id: string; requested: number; available: number }[] =
      [];

    for (const item of items) {
      const [record] = await this.db
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.provider_id, providerId),
            eq(inventory.item_id, item.id),
          ),
        )
        .limit(1);

      if (!record || !record.track_inventory) continue;

      const availableQty = record.stock_quantity - record.reserved_quantity;
      if (availableQty < item.quantity) {
        unavailable.push({
          id: item.id,
          requested: item.quantity,
          available: Math.max(0, availableQty),
        });
      }

      if (item.quantity > (record.max_quantity_per_order ?? 100)) {
        unavailable.push({
          id: item.id,
          requested: item.quantity,
          available: record.max_quantity_per_order ?? 100,
        });
      }
    }

    return { available: unavailable.length === 0, unavailableItems: unavailable };
  }

  /**
   * Reserve stock during select/init (before payment).
   * Atomically checks availability and reserves.
   */
  async reserveStock(
    providerId: string,
    items: { id: string; quantity: number }[],
  ): Promise<boolean> {
    for (const item of items) {
      const result = await this.db
        .update(inventory)
        .set({
          reserved_quantity: sql`${inventory.reserved_quantity} + ${item.quantity}`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(inventory.provider_id, providerId),
            eq(inventory.item_id, item.id),
            sql`${inventory.stock_quantity} - ${inventory.reserved_quantity} >= ${item.quantity}`,
          ),
        )
        .returning({ id: inventory.id });

      if (result.length === 0) {
        logger.warn(
          { providerId, itemId: item.id, quantity: item.quantity },
          "Stock reservation failed, insufficient stock",
        );
        // Rollback previous reservations in this batch
        for (const prev of items) {
          if (prev.id === item.id) break;
          await this.releaseReservation(providerId, prev.id, prev.quantity);
        }
        return false;
      }
    }

    logger.info(
      { providerId, itemCount: items.length },
      "Stock reserved",
    );
    return true;
  }

  /**
   * Confirm stock: convert reservation to actual stock decrement on order confirm.
   */
  async confirmStock(
    providerId: string,
    items: { id: string; quantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      await this.db
        .update(inventory)
        .set({
          stock_quantity: sql`${inventory.stock_quantity} - ${item.quantity}`,
          reserved_quantity: sql`${inventory.reserved_quantity} - ${item.quantity}`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(inventory.provider_id, providerId),
            eq(inventory.item_id, item.id),
          ),
        );
    }
    logger.info(
      { providerId, itemCount: items.length },
      "Stock confirmed (decremented)",
    );
  }

  /**
   * Release reservation on cancel before confirm, or reservation expiry.
   */
  async releaseReservation(
    providerId: string,
    itemId: string,
    quantity: number,
  ): Promise<void> {
    await this.db
      .update(inventory)
      .set({
        reserved_quantity: sql`GREATEST(0, ${inventory.reserved_quantity} - ${quantity})`,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(inventory.provider_id, providerId),
          eq(inventory.item_id, itemId),
        ),
      );
  }

  /**
   * Restore stock on cancellation/return after confirm.
   */
  async restoreStock(
    providerId: string,
    items: { id: string; quantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      await this.db
        .update(inventory)
        .set({
          stock_quantity: sql`${inventory.stock_quantity} + ${item.quantity}`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(inventory.provider_id, providerId),
            eq(inventory.item_id, item.id),
          ),
        );
    }
    logger.info(
      { providerId, itemCount: items.length },
      "Stock restored (cancel/return)",
    );
  }

  /**
   * Get low-stock items for a provider.
   */
  async getLowStockItems(providerId: string) {
    return this.db
      .select()
      .from(inventory)
      .where(
        and(
          eq(inventory.provider_id, providerId),
          sql`${inventory.stock_quantity} <= ${inventory.low_stock_threshold}`,
        ),
      );
  }

  /**
   * Get stock status for items.
   */
  async getStock(providerId: string, itemIds?: string[]) {
    if (itemIds && itemIds.length > 0) {
      return this.db
        .select()
        .from(inventory)
        .where(
          and(
            eq(inventory.provider_id, providerId),
            sql`${inventory.item_id} = ANY(${itemIds})`,
          ),
        );
    }
    return this.db
      .select()
      .from(inventory)
      .where(eq(inventory.provider_id, providerId));
  }
}
