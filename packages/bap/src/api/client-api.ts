import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  BecknAction,
  buildContext,
  ack,
  nack,
  transactions,
  createLogger,
} from "@ondc/shared";
import type { BecknRequest } from "@ondc/shared";
import { eq, desc } from "drizzle-orm";
import { BecknClient } from "../services/beckn-client.js";
import { registerWebhook } from "../services/webhook.js";

const logger = createLogger("bap-client-api");

// ---------------------------------------------------------------------------
// Request body types for the simplified API
// ---------------------------------------------------------------------------

interface SearchBody {
  domain: string;
  city: string;
  query?: string;
  provider?: { id?: string; descriptor?: { name?: string } };
  item?: { descriptor?: { name?: string } };
  fulfillment?: { type?: string };
}

interface SelectBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  provider_id: string;
  items: Array<{ id: string; quantity?: { count?: number } }>;
}

interface InitBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  billing: {
    name?: string;
    phone?: string;
    email?: string;
    address?: {
      door?: string;
      name?: string;
      building?: string;
      street?: string;
      locality?: string;
      city?: string;
      state?: string;
      country?: string;
      area_code?: string;
    };
  };
  fulfillment?: {
    id?: string;
    type?: string;
    end?: {
      location?: {
        gps?: string;
        address?: {
          door?: string;
          name?: string;
          building?: string;
          street?: string;
          locality?: string;
          city?: string;
          state?: string;
          country?: string;
          area_code?: string;
        };
      };
      contact?: { phone?: string; email?: string };
    };
  };
}

interface ConfirmBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  payment?: {
    type?: string;
    status?: string;
    params?: {
      transaction_id?: string;
      amount?: string;
      currency?: string;
    };
  };
}

interface StatusBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
}

interface TrackBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
}

interface CancelBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
  reason?: { id?: string; descriptor?: { name?: string; short_desc?: string } };
}

interface UpdateBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
  update_target?: string;
  order?: {
    items?: Array<{ id: string; quantity?: { count?: number } }>;
    fulfillments?: Array<{
      id?: string;
      type?: string;
      end?: {
        location?: { gps?: string; address?: Record<string, string> };
        contact?: { phone?: string; email?: string };
      };
    }>;
    payment?: Record<string, unknown>;
  };
}

interface RatingBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  ratings: Array<{
    id?: string;
    rating_category?: string;
    value?: number;
    feedback_form?: Array<{ question?: string; answer?: string }>;
    feedback_id?: string;
  }>;
}

interface SupportBody {
  transaction_id: string;
  bpp_id: string;
  bpp_uri: string;
  domain?: string;
  order_id?: string;
  support?: {
    ref_id?: string;
    callback_phone?: string;
    phone?: string;
    email?: string;
  };
}

interface WebhookBody {
  url: string;
  events: string[];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Simplified REST API for buyer applications.
 *
 * Provides an easier interface than raw Beckn protocol messages.
 * Builds full Beckn context, signs, and dispatches requests.
 */
export const registerClientApi: FastifyPluginAsync = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const becknClient = new BecknClient();

  // -------------------------------------------------------------------------
  // POST /api/search
  // -------------------------------------------------------------------------
  fastify.post<{ Body: SearchBody }>("/search", async (request, reply) => {
    const { domain, city, query, provider, item, fulfillment } = request.body;

    if (!domain || !city) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "domain and city are required."),
      );
    }

    const context = buildContext({
      domain,
      city,
      action: BecknAction.search,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        intent: {
          ...(query
            ? { descriptor: { name: query } }
            : {}),
          ...(provider ? { provider } : {}),
          ...(item ? { item } : {}),
          ...(fulfillment ? { fulfillment } : {}),
        },
      },
    };

    try {
      // Log transaction
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.search,
        bap_id: context.bap_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      // Send to gateway (fire-and-forget, callback will come via /on_search)
      becknClient
        .sendToGateway(
          fastify.config.gatewayUrl,
          BecknAction.search,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: context.transaction_id }, "Search gateway send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/search");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/select
  // -------------------------------------------------------------------------
  fastify.post<{ Body: SelectBody }>("/select", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, provider_id, items } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri || !provider_id || !items?.length) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, bpp_uri, provider_id, and items are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.select,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        order: {
          provider: { id: provider_id },
          items: items.map((i) => ({
            id: i.id,
            quantity: i.quantity ?? { count: 1 },
          })),
        },
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.select,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.select,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Select BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/select");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/init
  // -------------------------------------------------------------------------
  fastify.post<{ Body: InitBody }>("/init", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, billing, fulfillment } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.init,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        order: {
          billing,
          fulfillments: fulfillment ? [fulfillment] : undefined,
        },
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.init,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.init,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Init BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/init");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/confirm
  // -------------------------------------------------------------------------
  fastify.post<{ Body: ConfirmBody }>("/confirm", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, payment } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.confirm,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        order: {
          payment,
        },
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.confirm,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.confirm,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Confirm BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/confirm");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/status
  // -------------------------------------------------------------------------
  fastify.post<{ Body: StatusBody }>("/status", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.status,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {},
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.status,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.status,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Status BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/status");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/track
  // -------------------------------------------------------------------------
  fastify.post<{ Body: TrackBody }>("/track", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, order_id } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.track,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        order_id,
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.track,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.track,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Track BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/track");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/cancel
  // -------------------------------------------------------------------------
  fastify.post<{ Body: CancelBody }>("/cancel", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, order_id, reason } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.cancel,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        order_id,
        cancellation_reason_id: reason?.id,
        descriptor: reason?.descriptor,
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.cancel,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.cancel,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Cancel BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/cancel");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/update
  // -------------------------------------------------------------------------
  fastify.post<{ Body: UpdateBody }>("/update", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, order_id, update_target, order } =
      request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.update,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        update_target: update_target ?? "order",
        order: {
          id: order_id,
          ...order,
        },
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.update,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.update,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Update BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/update");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/rating
  // -------------------------------------------------------------------------
  fastify.post<{ Body: RatingBody }>("/rating", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, ratings } = request.body;

    if (!transaction_id || !bpp_id || !bpp_uri || !ratings?.length) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, bpp_uri, and ratings are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.rating,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        ratings,
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.rating,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.rating,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Rating BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/rating");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/support
  // -------------------------------------------------------------------------
  fastify.post<{ Body: SupportBody }>("/support", async (request, reply) => {
    const { transaction_id, bpp_id, bpp_uri, order_id, support } =
      request.body;

    if (!transaction_id || !bpp_id || !bpp_uri) {
      return reply.code(400).send(
        nack("CONTEXT-ERROR", "10000", "transaction_id, bpp_id, and bpp_uri are required."),
      );
    }

    const context = buildContext({
      domain: request.body.domain ?? "ONDC:RET10",
      action: BecknAction.support,
      bap_id: fastify.config.bapId,
      bap_uri: fastify.config.bapUri,
      bpp_id,
      bpp_uri,
      transaction_id,
    });

    const becknRequest: BecknRequest = {
      context,
      message: {
        ref_id: order_id ?? transaction_id,
        ...(support ?? {}),
      },
    };

    try {
      await fastify.db.insert(transactions).values({
        transaction_id: context.transaction_id,
        message_id: context.message_id,
        action: BecknAction.support,
        bap_id: context.bap_id,
        bpp_id: context.bpp_id,
        domain: context.domain,
        city: context.city,
        request_body: becknRequest,
        status: "SENT",
      });

      becknClient
        .sendToBPP(
          bpp_uri,
          BecknAction.support,
          becknRequest,
          fastify.config.privateKey,
          fastify.config.bapId,
          fastify.config.uniqueKeyId,
        )
        .catch((err) => {
          logger.error({ err, transactionId: transaction_id }, "Support BPP send failed");
        });

      return reply.code(200).send({
        ...ack(),
        context: {
          transaction_id: context.transaction_id,
          message_id: context.message_id,
        },
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/support");
      return reply.code(500).send(
        nack("INTERNAL-ERROR", "20000", "Internal error."),
      );
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/orders/:txn_id
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { txn_id: string } }>(
    "/orders/:txn_id",
    async (request, reply) => {
      const { txn_id } = request.params;

      try {
        const txnRecords = await fastify.db
          .select()
          .from(transactions)
          .where(eq(transactions.transaction_id, txn_id))
          .orderBy(desc(transactions.created_at));

        if (txnRecords.length === 0) {
          return reply.code(404).send({
            error: "Transaction not found",
            transaction_id: txn_id,
          });
        }

        // Derive the latest state from the most recent transaction log
        const latest = txnRecords[0]!;
        const callbackRecord = txnRecords.find((r) =>
          r.action.startsWith("on_"),
        );

        return reply.code(200).send({
          transaction_id: txn_id,
          status: latest.status,
          latest_action: latest.action,
          callback_received: callbackRecord != null,
          callback_data: callbackRecord?.request_body ?? null,
          history: txnRecords.map((r) => ({
            action: r.action,
            status: r.status,
            created_at: r.created_at,
            message_id: r.message_id,
          })),
        });
      } catch (err) {
        logger.error({ err, txn_id }, "Error fetching order status");
        return reply.code(500).send({
          error: "Internal error fetching order status.",
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/webhooks
  // -------------------------------------------------------------------------
  fastify.post<{ Body: WebhookBody }>("/webhooks", async (request, reply) => {
    const { url, events } = request.body;

    if (!url) {
      return reply.code(400).send({
        error: "url is required.",
      });
    }

    try {
      await registerWebhook(
        fastify.config.bapId,
        url,
        events ?? ["*"],
        fastify.redis,
      );

      return reply.code(200).send({
        status: "registered",
        subscriber_id: fastify.config.bapId,
        url,
        events: events ?? ["*"],
      });
    } catch (err) {
      logger.error({ err }, "Error registering webhook");
      return reply.code(500).send({
        error: "Internal error registering webhook.",
      });
    }
  });
};
