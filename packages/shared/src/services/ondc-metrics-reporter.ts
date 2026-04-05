import { request } from "undici";
import { createLogger } from "../utils/logger.js";
import type { MetricsCollector } from "./metrics-collector.js";

const logger = createLogger("ondc-metrics-reporter");

/**
 * Reports metrics to ONDC's network observability endpoint.
 * ONDC requires periodic metrics submission from all NPs.
 */
export class OndcMetricsReporter {
  private reportingUrl: string;
  private subscriberId: string;
  private subscriberType: string;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(config: {
    reportingUrl: string; // ONDC observability endpoint
    subscriberId: string;
    subscriberType: "BAP" | "BPP" | "BG";
    reportIntervalMs?: number;
  }) {
    this.reportingUrl = config.reportingUrl;
    this.subscriberId = config.subscriberId;
    this.subscriberType = config.subscriberType;
  }

  /**
   * Start periodic reporting.
   */
  start(collector: MetricsCollector, intervalMs: number = 300000): void {
    // Report every 5 minutes by default
    this.intervalId = setInterval(async () => {
      try {
        await this.report(collector);
      } catch (err) {
        logger.error({ err }, "Failed to report metrics to ONDC");
      }
    }, intervalMs);

    logger.info({ intervalMs, subscriberId: this.subscriberId }, "ONDC metrics reporter started");
  }

  /**
   * Stop periodic reporting.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info("ONDC metrics reporter stopped");
    }
  }

  /**
   * Send metrics report to ONDC.
   */
  async report(collector: MetricsCollector): Promise<void> {
    const metrics = collector.getMetrics();
    const report = {
      subscriber_id: this.subscriberId,
      subscriber_type: this.subscriberType,
      timestamp: new Date().toISOString(),
      metrics,
    };

    if (!this.reportingUrl) {
      logger.debug("ONDC_METRICS_URL not configured, skipping metrics report");
      return;
    }

    try {
      const { statusCode } = await request(this.reportingUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
        headersTimeout: 10000,
        bodyTimeout: 10000,
      });

      if (statusCode >= 200 && statusCode < 300) {
        logger.info({ actionCount: Object.keys(metrics).length }, "Metrics reported to ONDC");
      } else {
        logger.warn({ statusCode }, "ONDC metrics endpoint returned non-2xx");
      }
    } catch (err) {
      logger.error({ err }, "Failed to post metrics to ONDC");
    }
  }
}
