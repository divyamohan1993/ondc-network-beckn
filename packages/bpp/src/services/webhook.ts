import { request as httpRequest } from "undici";
import type { Redis } from "ioredis";
import { createLogger } from "@ondc/shared";

const logger = createLogger("bpp-webhook");

/** Redis key prefix for webhook registrations. */
const WEBHOOK_PREFIX = "ondc:bpp:webhook:";

/** Max retry attempts for webhook delivery. */
const MAX_RETRIES = 3;

/** Base delay between retries in ms. Actual delay = BASE_RETRY_DELAY * 2^attempt. */
const BASE_RETRY_DELAY = 1000;

export interface WebhookRegistration {
  url: string;
  events: string[];
}

/**
 * Register a webhook URL for a subscriber (seller app).
 * The seller app will receive action notifications at this URL.
 *
 * @param subscriberId - The seller app's subscriber ID.
 * @param url - The webhook URL to POST action data to.
 * @param events - Array of event names to subscribe to (e.g. ["search", "select"]).
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
 * Deliver a webhook POST with exponential backoff retry.
 * Retries on network errors and 5xx responses. Does not retry 4xx (client errors).
 */
async function deliverWithRetry(
  url: string,
  payload: string,
  subscriberId: string,
  event: string,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { statusCode } = await httpRequest(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
      });

      if (statusCode >= 200 && statusCode < 400) {
        logger.info(
          { subscriberId, event, statusCode, attempt },
          "Webhook notification delivered",
        );
        return;
      }

      if (statusCode >= 400 && statusCode < 500) {
        // Client error from the receiver. Do not retry.
        logger.warn(
          { subscriberId, event, webhookUrl: url, statusCode, attempt },
          "Webhook delivery returned client error, not retrying",
        );
        return;
      }

      // 5xx -- retry
      lastError = new Error(`Webhook returned ${statusCode}`);
      logger.warn(
        { subscriberId, event, webhookUrl: url, statusCode, attempt },
        "Webhook delivery returned server error, will retry",
      );
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, subscriberId, event, webhookUrl: url, attempt },
        "Webhook delivery network error, will retry",
      );
    }

    // Exponential backoff before next attempt
    if (attempt < MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error(
    { err: lastError, subscriberId, event, webhookUrl: url, maxRetries: MAX_RETRIES },
    "Webhook delivery failed after all retries",
  );
}

/**
 * Look up the registered webhook for a subscriber and POST event data to it.
 * Delivery is retried up to MAX_RETRIES times with exponential backoff.
 *
 * @param subscriberId - The seller app's subscriber ID.
 * @param event - The event name (e.g. "search", "confirm").
 * @param data - The action payload to forward.
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

    await deliverWithRetry(
      registration.url,
      JSON.stringify({ event, data }),
      subscriberId,
      event,
    );
  } catch (err) {
    logger.error(
      { err, subscriberId, event },
      "Failed to deliver webhook notification",
    );
  }
}
