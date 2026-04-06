import { eq, and } from "drizzle-orm";
import type { Database } from "@ondc/shared/db";
import { productVariants } from "@ondc/shared";
import { createLogger } from "@ondc/shared";

const logger = createLogger("variants");

export interface VariantGroup {
  group: string;
  values: {
    value: string;
    variantItemId: string;
    price?: number;
    mrp?: number;
    sku?: string;
    stockQuantity: number;
    isActive: boolean;
  }[];
}

export class VariantService {
  constructor(private db: Database) {}

  async createVariant(params: {
    providerId: string;
    parentItemId: string;
    variantGroup: string;
    variantValue: string;
    price?: number;
    mrp?: number;
    sku?: string;
    stockQuantity?: number;
  }): Promise<string> {
    const variantItemId = `${params.parentItemId}-${params.variantGroup}-${params.variantValue}`
      .toLowerCase()
      .replace(/\s+/g, "-");

    await this.db
      .insert(productVariants)
      .values({
        provider_id: params.providerId,
        parent_item_id: params.parentItemId,
        variant_item_id: variantItemId,
        variant_group: params.variantGroup,
        variant_value: params.variantValue,
        price: params.price != null ? String(params.price) : null,
        mrp: params.mrp != null ? String(params.mrp) : null,
        sku: params.sku ?? null,
        stock_quantity: params.stockQuantity ?? 0,
      })
      .onConflictDoUpdate({
        target: productVariants.variant_item_id,
        set: {
          variant_group: params.variantGroup,
          variant_value: params.variantValue,
          price: params.price != null ? String(params.price) : undefined,
          mrp: params.mrp != null ? String(params.mrp) : undefined,
          sku: params.sku,
          stock_quantity: params.stockQuantity,
          updated_at: new Date(),
        },
      });

    logger.info(
      { variantItemId, parentItemId: params.parentItemId, group: params.variantGroup },
      "Variant created/updated",
    );

    return variantItemId;
  }

  async getVariants(parentItemId: string): Promise<VariantGroup[]> {
    const rows = await this.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.parent_item_id, parentItemId));

    const groups = new Map<string, VariantGroup>();
    for (const row of rows) {
      if (!groups.has(row.variant_group)) {
        groups.set(row.variant_group, { group: row.variant_group, values: [] });
      }
      groups.get(row.variant_group)!.values.push({
        value: row.variant_value,
        variantItemId: row.variant_item_id,
        price: row.price ? Number(row.price) : undefined,
        mrp: row.mrp ? Number(row.mrp) : undefined,
        sku: row.sku ?? undefined,
        stockQuantity: row.stock_quantity ?? 0,
        isActive: row.is_active ?? true,
      });
    }

    return Array.from(groups.values());
  }

  async deleteVariant(variantItemId: string): Promise<void> {
    await this.db
      .update(productVariants)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(productVariants.variant_item_id, variantItemId));

    logger.info({ variantItemId }, "Variant soft-deleted");
  }

  async getVariantsByProvider(providerId: string) {
    return this.db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.provider_id, providerId),
          eq(productVariants.is_active, true),
        ),
      );
  }
}
