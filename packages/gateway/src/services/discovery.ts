import { RegistryClient } from "@ondc/shared";
import type { RegistrySubscriber } from "@ondc/shared";
import { createLogger } from "@ondc/shared";

const logger = createLogger("gateway-discovery");

/**
 * Matching BPP record returned from discovery lookup.
 */
export interface MatchingBPP {
  subscriber_id: string;
  subscriber_url: string;
  signing_public_key: string;
}

/**
 * Discovery service responsible for finding BPPs that match a given
 * domain and city via the ONDC registry.
 *
 * The gateway uses this during search fan-out to determine which BPPs
 * should receive a search request.
 */
export class DiscoveryService {
  private readonly registryClient: RegistryClient;

  constructor(registryClient: RegistryClient) {
    this.registryClient = registryClient;
  }

  /**
   * Find all SUBSCRIBED BPPs matching the given domain and city.
   *
   * Calls the registry /lookup endpoint with domain, city, and type=BPP,
   * then filters to only include subscribers with status "SUBSCRIBED".
   *
   * @param domain - The Beckn domain (e.g. "nic2004:52110").
   * @param city - The city code (e.g. "std:080").
   * @returns Array of matching BPP records with subscriber_id, subscriber_url, and signing_public_key.
   */
  async findMatchingBPPs(domain: string, city: string): Promise<MatchingBPP[]> {
    logger.info({ domain, city }, "Looking up BPPs for domain and city");

    const subscribers: RegistrySubscriber[] = await this.registryClient.lookupByDomainCity(
      domain,
      city,
      "BPP",
    );

    // Filter to only SUBSCRIBED BPPs with a valid subscriber_url
    const matchingBPPs: MatchingBPP[] = subscribers
      .filter((sub) => {
        const isSubscribed = sub.status === "SUBSCRIBED";
        const hasUrl = typeof sub.subscriber_url === "string" && sub.subscriber_url.length > 0;
        const hasKey = typeof sub.signing_public_key === "string" && sub.signing_public_key.length > 0;
        return isSubscribed && hasUrl && hasKey;
      })
      .map((sub) => ({
        subscriber_id: sub.subscriber_id,
        subscriber_url: sub.subscriber_url!,
        signing_public_key: sub.signing_public_key,
      }));

    logger.info(
      { domain, city, totalFound: subscribers.length, matchingCount: matchingBPPs.length },
      "BPP discovery complete",
    );

    return matchingBPPs;
  }
}
