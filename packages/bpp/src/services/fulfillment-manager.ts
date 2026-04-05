import { eq, and } from "drizzle-orm";
import {
  fulfillments,
  fulfillmentStateTransitions,
  FulfillmentState,
  isValidFulfillmentTransition,
  isFulfillmentState,
  createLogger,
  SettlementService,
  NocsTxnStatus,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";

const logger = createLogger("bpp-fulfillment-manager");

/**
 * Create a fulfillment record for an order. Called on confirm.
 */
export async function createFulfillment(
  db: Database,
  orderId: string,
  fulfillmentId: string,
  opts: {
    type?: string;
    routing_type?: "P2P" | "P2H2P";
    provider_id?: string;
    estimated_delivery?: Date;
  } = {},
): Promise<{ id: string; state: string }> {
  const existing = await db
    .select()
    .from(fulfillments)
    .where(
      and(
        eq(fulfillments.order_id, orderId),
        eq(fulfillments.fulfillment_id, fulfillmentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    logger.info(
      { orderId, fulfillmentId },
      "Fulfillment already exists, returning current state",
    );
    return { id: existing[0].id, state: existing[0].state ?? FulfillmentState.Pending };
  }

  const [row] = await db
    .insert(fulfillments)
    .values({
      order_id: orderId,
      fulfillment_id: fulfillmentId,
      type: opts.type ?? "Delivery",
      routing_type: (opts.routing_type ?? "P2P") as any,
      state: FulfillmentState.Pending as any,
      provider_id: opts.provider_id ?? null,
      estimated_delivery: opts.estimated_delivery ?? null,
    })
    .returning({ id: fulfillments.id });

  await logFulfillmentTransition(
    db,
    row.id,
    null,
    FulfillmentState.Pending,
    "system",
  );

  logger.info(
    { orderId, fulfillmentId, id: row.id },
    "Fulfillment created",
  );

  return { id: row.id, state: FulfillmentState.Pending };
}

/**
 * Update fulfillment state with transition validation.
 */
export async function updateFulfillmentState(
  db: Database,
  orderId: string,
  fulfillmentId: string,
  newState: string,
  triggeredBy: string,
  updates?: {
    agent_name?: string;
    agent_phone?: string;
    vehicle_registration?: string;
    tracking_url?: string;
    actual_delivery?: Date;
  },
): Promise<{ id: string; state: string }> {
  if (!isFulfillmentState(newState)) {
    throw new Error(`Invalid fulfillment state: ${newState}`);
  }

  const rows = await db
    .select()
    .from(fulfillments)
    .where(
      and(
        eq(fulfillments.order_id, orderId),
        eq(fulfillments.fulfillment_id, fulfillmentId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `Fulfillment not found: order=${orderId}, fulfillment=${fulfillmentId}`,
    );
  }

  const current = rows[0];
  const currentState = current.state as FulfillmentState;
  const routingType = (current.routing_type ?? "P2P") as "P2P" | "P2H2P";

  if (!isValidFulfillmentTransition(currentState, newState as FulfillmentState, routingType)) {
    throw new Error(
      `Invalid fulfillment transition: ${currentState} -> ${newState} (routing: ${routingType})`,
    );
  }

  const updateData: Record<string, unknown> = {
    state: newState,
    updated_at: new Date(),
  };

  if (updates) {
    if (updates.agent_name !== undefined) updateData.agent_name = updates.agent_name;
    if (updates.agent_phone !== undefined) updateData.agent_phone = updates.agent_phone;
    if (updates.vehicle_registration !== undefined) updateData.vehicle_registration = updates.vehicle_registration;
    if (updates.tracking_url !== undefined) updateData.tracking_url = updates.tracking_url;
    if (updates.actual_delivery !== undefined) updateData.actual_delivery = updates.actual_delivery;
  }

  await db
    .update(fulfillments)
    .set(updateData as any)
    .where(eq(fulfillments.id, current.id));

  await logFulfillmentTransition(
    db,
    current.id,
    currentState,
    newState as FulfillmentState,
    triggeredBy,
  );

  logger.info(
    { orderId, fulfillmentId, from: currentState, to: newState },
    "Fulfillment state updated",
  );

  // When delivery completes, mark settlement as PENDING (ready for settlement)
  if (newState === FulfillmentState.OrderDelivered) {
    try {
      const settlementService = new SettlementService(db);
      await settlementService.updateSettlementStatus(orderId, NocsTxnStatus.Pending);
      logger.info({ orderId }, "Settlement marked PENDING after delivery");
    } catch (settlementErr) {
      logger.error(
        { err: settlementErr, orderId },
        "Failed to update settlement on delivery",
      );
    }
  }

  return { id: current.id, state: newState };
}

/**
 * Get all fulfillments for an order.
 */
export async function getFulfillmentsByOrderId(
  db: Database,
  orderId: string,
): Promise<Array<{
  id: string;
  fulfillment_id: string;
  type: string | null;
  routing_type: string | null;
  state: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  vehicle_registration: string | null;
  tracking_url: string | null;
  estimated_delivery: Date | null;
  actual_delivery: Date | null;
}>> {
  return db
    .select()
    .from(fulfillments)
    .where(eq(fulfillments.order_id, orderId));
}

async function logFulfillmentTransition(
  db: Database,
  fulfillmentDbId: string,
  fromState: FulfillmentState | null,
  toState: FulfillmentState,
  triggeredBy: string,
): Promise<void> {
  try {
    await db.insert(fulfillmentStateTransitions).values({
      fulfillment_id: fulfillmentDbId,
      from_state: fromState as any,
      to_state: toState as any,
      triggered_by: triggeredBy,
      timestamp: new Date(),
    });
  } catch (err) {
    logger.error(
      { err, fulfillmentDbId, fromState, toState },
      "Failed to log fulfillment state transition",
    );
  }
}
