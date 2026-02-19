import { eq } from "drizzle-orm";
import {
  orders,
  orderStateTransitions,
  ratings,
  createLogger,
} from "@ondc/shared";
import type { Database } from "@ondc/shared";

const logger = createLogger("bpp-order-manager");

/**
 * Create or update an order based on the Beckn action.
 */
export async function processOrderAction(
  db: Database,
  action: string,
  context: {
    transaction_id: string;
    bap_id: string;
    bpp_id?: string;
    domain: string;
    city: string;
  },
  message: Record<string, unknown>,
): Promise<{ orderId: string; state: string }> {
  const orderId =
    (message.order as any)?.id ?? context.transaction_id;

  switch (action) {
    case "select": {
      // Check if order exists, if not create it
      const existing = await db
        .select()
        .from(orders)
        .where(eq(orders.order_id, orderId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(orders).values({
          order_id: orderId,
          transaction_id: context.transaction_id,
          bap_id: context.bap_id,
          bpp_id: context.bpp_id ?? "",
          domain: context.domain,
          city: context.city,
          state: "CREATED",
          items: (message.order as any)?.items ?? null,
          provider: (message.order as any)?.provider ?? null,
        });
        await logTransition(
          db,
          orderId,
          null,
          "CREATED",
          action,
          context.bap_id,
        );
      }
      return { orderId, state: "CREATED" };
    }

    case "init": {
      await updateOrderState(
        db,
        orderId,
        "CREATED",
        "CREATED",
        action,
        context.bap_id,
        {
          billing: (message.order as any)?.billing ?? null,
          fulfillments: (message.order as any)?.fulfillments ?? null,
        },
      );
      return { orderId, state: "CREATED" };
    }

    case "confirm": {
      await updateOrderState(
        db,
        orderId,
        "CREATED",
        "ACCEPTED",
        action,
        context.bap_id,
        {
          payment: (message.order as any)?.payment ?? null,
          quote: (message.order as any)?.quote ?? null,
        },
      );
      return { orderId, state: "ACCEPTED" };
    }

    case "cancel": {
      // Cancel can happen from multiple states
      const current = await getCurrentState(db, orderId);
      if (current) {
        await updateOrderState(
          db,
          orderId,
          current,
          "CANCELLED",
          action,
          context.bap_id,
          {
            cancellation_reason_code:
              (message.order as any)?.cancellation?.reason?.code ?? null,
          },
        );
      }
      return { orderId, state: "CANCELLED" };
    }

    case "status":
    case "track":
    case "support": {
      // Read-only actions - just return current state
      const state =
        (await getCurrentState(db, orderId)) ?? "CREATED";
      return { orderId, state };
    }

    case "rating": {
      // Persist the rating to the ratings table
      const state =
        (await getCurrentState(db, orderId)) ?? "CREATED";
      try {
        const ratingValue = (message as any)?.rating_value ??
          (message as any)?.order?.rating?.value;
        const ratingCategory = (message as any)?.rating_category ??
          (message as any)?.order?.rating?.rating_category ?? "ORDER";
        const ratedEntityId = (message as any)?.id ??
          (message as any)?.order?.rating?.id ?? orderId;
        const feedbackForm = (message as any)?.order?.rating?.feedback_form ?? null;
        const feedbackId = (message as any)?.order?.rating?.feedback_id ?? null;

        if (ratingValue !== undefined && ratingValue !== null) {
          const numericRating = parseInt(String(ratingValue), 10);
          if (numericRating >= 1 && numericRating <= 5) {
            await db.insert(ratings).values({
              rating_id: `${context.transaction_id}_${Date.now()}`,
              transaction_id: context.transaction_id,
              order_id: orderId,
              bap_id: context.bap_id,
              bpp_id: context.bpp_id ?? "",
              rating_category: ratingCategory as any,
              rated_entity_id: ratedEntityId,
              value: numericRating,
              feedback_form: feedbackForm,
              feedback_id: feedbackId,
            });
            logger.info(
              { orderId, ratingValue: numericRating, category: ratingCategory },
              "Rating persisted",
            );
          }
        }
      } catch (ratingErr) {
        logger.error({ err: ratingErr, orderId }, "Failed to persist rating");
      }
      return { orderId, state };
    }

    case "update": {
      const current =
        (await getCurrentState(db, orderId)) ?? "IN_PROGRESS";
      const updateType = (message as any)?.update_target;
      const orderData = (message as any)?.order;

      // Handle return requests via update action (ONDC spec)
      const returnRequest = orderData?.fulfillments?.find(
        (f: any) => f?.tags?.some(
          (t: any) => t?.code === "return_request" || t?.descriptor?.code === "return_request",
        ),
      );

      if (returnRequest) {
        // Extract return reason code
        const returnReasonTag = returnRequest.tags?.find(
          (t: any) => t?.code === "return_request" || t?.descriptor?.code === "return_request",
        );
        const returnReasonCode = returnReasonTag?.list?.find(
          (item: any) => item?.code === "reason_id",
        )?.value;

        await updateOrderState(
          db,
          orderId,
          current,
          "RETURNED",
          action,
          context.bap_id,
          {
            cancellation_reason_code: returnReasonCode ?? null,
          },
        );
        logger.info(
          { orderId, returnReasonCode },
          "Return request processed via update action",
        );
        return { orderId, state: "RETURNED" };
      }

      // Handle other updates (fulfillment state changes, item quantity, etc.)
      if (orderData) {
        const updateFields: Record<string, unknown> = {
          updated_at: new Date(),
        };
        if (orderData.fulfillments) updateFields["fulfillments"] = orderData.fulfillments;
        if (orderData.items) updateFields["items"] = orderData.items;
        if (orderData.quote) updateFields["quote"] = orderData.quote;
        if (orderData.payment) updateFields["payment"] = orderData.payment;

        try {
          await db
            .update(orders)
            .set(updateFields as any)
            .where(eq(orders.order_id, orderId));
        } catch (err) {
          logger.error({ err, orderId }, "Failed to apply order update");
        }
      }

      return { orderId, state: current };
    }

    default:
      return { orderId, state: "CREATED" };
  }
}

async function getCurrentState(
  db: Database,
  orderId: string,
): Promise<string | null> {
  const result = await db
    .select({ state: orders.state })
    .from(orders)
    .where(eq(orders.order_id, orderId))
    .limit(1);
  return result[0]?.state ?? null;
}

async function updateOrderState(
  db: Database,
  orderId: string,
  expectedFrom: string,
  toState: string,
  action: string,
  actor: string,
  updates?: Record<string, unknown>,
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      state: toState,
      updated_at: new Date(),
    };
    if (updates) {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== null && value !== undefined) {
          (updateData as any)[key] = value;
        }
      }
    }

    await db
      .update(orders)
      .set(updateData as any)
      .where(eq(orders.order_id, orderId));
    await logTransition(db, orderId, expectedFrom, toState, action, actor);
  } catch (err) {
    logger.error({ err, orderId, toState }, "Failed to update order state");
  }
}

async function logTransition(
  db: Database,
  orderId: string,
  fromState: string | null,
  toState: string,
  action: string,
  actor: string,
): Promise<void> {
  try {
    await db.insert(orderStateTransitions).values({
      order_id: orderId,
      from_state: fromState as any,
      to_state: toState as any,
      action,
      actor,
      created_at: new Date(),
    });
  } catch (err) {
    logger.error({ err, orderId }, "Failed to log state transition");
  }
}
