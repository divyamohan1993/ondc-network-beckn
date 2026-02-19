import { request as httpRequest } from "undici";
import type { Redis } from "ioredis";
import { createLogger } from "@ondc/shared";

const logger = createLogger("bap-webhook");

/** Redis key prefix for webhook registrations. */
const WEBHOOK_PREFIX = "ondc:bap:webhook:";

export interface WebhookRegistration {
  url: string;
  events: string[];
}

/**
 * Register a webhook URL for a subscriber (buyer app).
 * The buyer app will receive callback notifications at this URL.
 *
 * @param subscriberId - The buyer app's subscriber ID.
 * @param url - The webhook URL to POST callback data to.
 * @param events - Array of event names to subscribe to (e.g. ["on_search", "on_select"]).
 * @param redis - Redis client for storing webhook registrations.
 */
export async function registerWebhook(
  subscriberId: string,
  url: string,
  events: string[],
  redis: Redis,
): Promise<void> {
  const key = `${WEBHOOK_PREFIX}${subscriberId}`;
  const registration: WebhookRegistration = { url, events };

  await redis.set(key, JSON.stringify(registration));
  logger.info({ subscriberId, url, events }, "Webhook registered");
}

/**
 * Look up the registered webhook for a subscriber and POST event data to it.
 *
 * @param subscriberId - The buyer app's subscriber ID.
 * @param event - The event name (e.g. "on_search", "on_confirm").
 * @param data - The callback payload to forward.
 * @param redis - Redis client for looking up webhook registrations.
 */
export async function notifyWebhook(
  subscriberId: string,
  event: string,
  data: unknown,
  redis: Redis,
): Promise<void> {
  const key = `${WEBHOOK_PREFIX}${subscriberId}`;

  try {
    const raw = await redis.get(key);
    if (!raw) {
      logger.debug({ subscriberId, event }, "No webhook registered for subscriber");
      return;
    }

    const registration = JSON.parse(raw) as WebhookRegistration;

    // Check if the subscriber is interested in this event
    if (
      registration.events.length > 0 &&
      !registration.events.includes(event) &&
      !registration.events.includes("*")
    ) {
      logger.debug(
        { subscriberId, event, registeredEvents: registration.events },
        "Event not in subscriber's registered events",
      );
      return;
    }

    logger.info(
      { subscriberId, event, webhookUrl: registration.url },
      "Sending webhook notification",
    );

    const { statusCode } = await httpRequest(registration.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });

    if (statusCode >= 400) {
      logger.warn(
        { subscriberId, event, webhookUrl: registration.url, statusCode },
        "Webhook delivery returned error status",
      );
    } else {
      logger.info(
        { subscriberId, event, statusCode },
        "Webhook notification delivered",
      );
    }
  } catch (err) {
    logger.error(
      { err, subscriberId, event },
      "Failed to deliver webhook notification",
    );
  }
}
