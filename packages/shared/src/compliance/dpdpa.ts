/**
 * DPDPA 2023 (Digital Personal Data Protection Act) Compliance Module
 *
 * Sections covered:
 * - Section 4: Consent management (already built in consent_records)
 * - Section 5: Notice before consent
 * - Section 6: Legitimate uses without consent
 * - Section 8: Data principal rights (access, correction, erasure, nomination)
 * - Section 9: Data fiduciary obligations
 * - Section 11: Cross-border data transfer restrictions
 * - Section 12: Data breach notification (72-hour rule)
 */

import { createLogger } from "../utils/logger.js";

const logger = createLogger("dpdpa-compliance");

// -------------------------------------------------------------------------
// Data Breach Notification (Section 12)
// Must notify CERT-In within 72 hours of detection.
// -------------------------------------------------------------------------

export interface DpdpaDataBreachReport {
  id: string;
  detectedAt: string;
  notifiedCertInAt?: string;
  notifiedPrincipalsAt?: string;
  description: string;
  affectedRecords: number;
  dataCategories: string[];
  remedialActions: string[];
  status: "DETECTED" | "INVESTIGATING" | "NOTIFIED" | "RESOLVED";
}

// -------------------------------------------------------------------------
// Data Principal Rights Requests (Section 8)
// -------------------------------------------------------------------------

export interface DpdpaDataPrincipalRequest {
  requestId: string;
  principalId: string; // phone or email
  requestType:
    | "ACCESS"
    | "CORRECTION"
    | "ERASURE"
    | "NOMINATION"
    | "GRIEVANCE";
  details: string;
  requestedAt: string;
  respondedAt?: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  responseDeadline: string; // Must respond within timeframe set by Data Protection Board
}

// -------------------------------------------------------------------------
// Consent Notice (Section 5)
// Must be provided in clear, plain language before collecting data.
// -------------------------------------------------------------------------

export interface ConsentNoticeParams {
  dataFiduciary: string;
  purposes: string[];
  dataCategories: string[];
  retentionPeriod: string;
  contactDetails: string;
  grievanceOfficerName: string;
  grievanceOfficerEmail: string;
}

/**
 * Generate a consent notice per DPDPA Section 5.
 * Returns a structured object suitable for rendering to the data principal.
 */
export function generateConsentNotice(params: ConsentNoticeParams): string {
  return JSON.stringify({
    fiduciary: params.dataFiduciary,
    purposes: params.purposes,
    data_collected: params.dataCategories,
    retention: params.retentionPeriod,
    rights: [
      "You can access your personal data at any time",
      "You can request correction of inaccurate data",
      "You can request erasure of your data",
      "You can withdraw consent at any time",
      "You can nominate a person to exercise rights on your behalf",
      "You can file a grievance with our Grievance Officer",
    ],
    grievance_officer: {
      name: params.grievanceOfficerName,
      email: params.grievanceOfficerEmail,
    },
    contact: params.contactDetails,
    governing_law: "Digital Personal Data Protection Act, 2023 (India)",
  });
}

// -------------------------------------------------------------------------
// Legitimate Uses Without Consent (Section 6)
// -------------------------------------------------------------------------

/**
 * Purposes for which personal data may be processed without explicit consent
 * under DPDPA Section 6 (voluntary provision, state function, legal obligation,
 * medical emergency, employment).
 */
export const LEGITIMATE_USE_PURPOSES = [
  "VOLUNTARY_PROVISION", // Data principal voluntarily provides data for specified purpose
  "STATE_FUNCTION",      // Necessary for state to provide benefit/service/license/permit
  "LEGAL_OBLIGATION",    // Compliance with any law or court order
  "MEDICAL_EMERGENCY",   // Response to medical emergency involving threat to life
  "EMPLOYMENT",          // Processing necessary for employment-related purposes
] as const;

export type LegitimateUsePurpose = (typeof LEGITIMATE_USE_PURPOSES)[number];

/**
 * Check if a processing purpose qualifies as a legitimate use without consent.
 */
export function isLegitimateUse(purpose: string): boolean {
  return LEGITIMATE_USE_PURPOSES.includes(purpose as LegitimateUsePurpose);
}

// -------------------------------------------------------------------------
// Cross-Border Data Transfer (Section 11)
// -------------------------------------------------------------------------

/**
 * Check if cross-border data transfer is allowed.
 * DPDPA Section 11: Transfer allowed to countries notified by Central Government.
 * India data must stay in India unless the destination is whitelisted.
 */
export function isTransferAllowed(destinationCountry: string): boolean {
  // As of April 2026, the Central Government has not notified restricted countries.
  // Default: allow transfer but log for audit trail.
  // When restrictions are notified, add country codes here.
  const RESTRICTED_COUNTRIES: string[] = [];
  const isRestricted = RESTRICTED_COUNTRIES.includes(
    destinationCountry.toUpperCase(),
  );
  if (isRestricted) {
    logger.warn(
      { destinationCountry },
      "Cross-border data transfer blocked by DPDPA Section 11",
    );
  } else {
    logger.info(
      { destinationCountry },
      "Cross-border transfer audit log: destination not restricted",
    );
  }
  return !isRestricted;
}

// -------------------------------------------------------------------------
// Breach Notification Deadline (Section 12)
// -------------------------------------------------------------------------

/** CERT-In must be notified within 72 hours of breach detection. */
export const BREACH_NOTIFICATION_HOURS = 72;

/**
 * Calculate breach notification deadline (72 hours from detection).
 */
export function getBreachNotificationDeadline(detectedAt: Date): Date {
  return new Date(
    detectedAt.getTime() + BREACH_NOTIFICATION_HOURS * 60 * 60 * 1000,
  );
}

/**
 * Check if a breach notification is overdue.
 */
export function isBreachNotificationOverdue(
  detectedAt: Date,
  now: Date = new Date(),
): boolean {
  return now > getBreachNotificationDeadline(detectedAt);
}

// -------------------------------------------------------------------------
// Data Fiduciary Obligations (Section 9)
// -------------------------------------------------------------------------

/**
 * Data fiduciary obligation checklist per DPDPA Section 9.
 * Returns compliance gaps.
 */
export function checkFiduciaryObligations(config: {
  consentManagementImplemented: boolean;
  dataPurposeLimitation: boolean;
  dataMinimization: boolean;
  storageRetentionLimits: boolean;
  securitySafeguards: boolean;
  breachNotificationProcess: boolean;
  grievanceRedressalMechanism: boolean;
  dataProtectionOfficerAppointed: boolean;
}): { compliant: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!config.consentManagementImplemented)
    gaps.push("Section 4/5: Consent management not implemented");
  if (!config.dataPurposeLimitation)
    gaps.push("Section 9(3): Data must only be processed for consented purpose");
  if (!config.dataMinimization)
    gaps.push("Section 9(4): Only collect data necessary for stated purpose");
  if (!config.storageRetentionLimits)
    gaps.push("Section 9(6): Data must be erased when purpose is fulfilled");
  if (!config.securitySafeguards)
    gaps.push("Section 9(7): Reasonable security safeguards required");
  if (!config.breachNotificationProcess)
    gaps.push("Section 12: Breach notification process to CERT-In required");
  if (!config.grievanceRedressalMechanism)
    gaps.push("Section 13: Grievance redressal mechanism required");
  if (!config.dataProtectionOfficerAppointed)
    gaps.push("Section 10: Significant data fiduciary must appoint DPO");
  return { compliant: gaps.length === 0, gaps };
}

// -------------------------------------------------------------------------
// Response Deadlines
// -------------------------------------------------------------------------

/**
 * Maximum days to respond to a data principal rights request.
 * The Data Protection Board may specify exact timelines; using 30 days as
 * the standard reasonable timeframe until formal notification.
 */
export const DATA_PRINCIPAL_RESPONSE_DAYS = 30;

/**
 * Calculate the response deadline for a data principal request.
 */
export function getDataPrincipalResponseDeadline(requestedAt: Date): Date {
  const deadline = new Date(requestedAt);
  deadline.setDate(deadline.getDate() + DATA_PRINCIPAL_RESPONSE_DAYS);
  return deadline;
}
