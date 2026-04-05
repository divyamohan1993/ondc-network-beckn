/**
 * Information Technology Act, 2000 & IT Rules 2021 Compliance
 *
 * Key requirements:
 * - Section 43A: Reasonable security practices for sensitive personal data
 * - Section 72A: Punishment for disclosure of information in breach of contract
 * - IT Rules 2021 Rule 3(1)(d): Grievance redressal mechanism
 * - IT Rules 2021 Rule 4: Due diligence for intermediaries
 * - CERT-In Directions 2022: Mandatory incident reporting (6 hours for critical)
 */

import { createLogger } from "../utils/logger.js";

const logger = createLogger("it-act-compliance");

// -------------------------------------------------------------------------
// Security Incident Classification (CERT-In Directions 2022)
// -------------------------------------------------------------------------

export enum IncidentSeverity {
  CRITICAL = "CRITICAL", // Report within 6 hours
  HIGH = "HIGH",         // Report within 24 hours
  MEDIUM = "MEDIUM",     // Report within 72 hours
  LOW = "LOW",           // Log and monitor
}

export interface ItActSecurityIncident {
  id: string;
  severity: IncidentSeverity;
  type: string; // e.g., "unauthorized_access", "data_breach", "malware", "ddos"
  description: string;
  detectedAt: string;
  reportedAt?: string;
  certInReportId?: string;
  affectedSystems: string[];
  remediation: string[];
  status:
    | "DETECTED"
    | "INVESTIGATING"
    | "MITIGATING"
    | "RESOLVED"
    | "REPORTED";
}

/**
 * CERT-In reportable incident types per Directions of 28 April 2022.
 */
export const CERT_IN_REPORTABLE_INCIDENTS = [
  "targeted_scanning_probing",
  "compromise_of_systems",
  "unauthorized_access",
  "website_defacement",
  "malicious_code_attacks",
  "identity_theft_spoofing_phishing",
  "denial_of_service",
  "data_breach",
  "attacks_on_databases",
  "attacks_on_applications",
  "attacks_on_iot_devices",
  "attacks_on_digital_payment_systems",
  "unauthorized_access_social_media",
  "fake_mobile_apps",
  "data_leaks",
] as const;

export type CertInIncidentType = (typeof CERT_IN_REPORTABLE_INCIDENTS)[number];

/**
 * Get CERT-In reporting deadline based on severity.
 */
export function getCertInReportingDeadline(
  severity: IncidentSeverity,
  detectedAt: Date,
): Date {
  const hours: Record<IncidentSeverity, number> = {
    [IncidentSeverity.CRITICAL]: 6,
    [IncidentSeverity.HIGH]: 24,
    [IncidentSeverity.MEDIUM]: 72,
    [IncidentSeverity.LOW]: 720, // 30 days
  };
  return new Date(detectedAt.getTime() + hours[severity] * 60 * 60 * 1000);
}

/**
 * Check if CERT-In reporting deadline has passed.
 */
export function isCertInReportingOverdue(
  severity: IncidentSeverity,
  detectedAt: Date,
  now: Date = new Date(),
): boolean {
  return now > getCertInReportingDeadline(severity, detectedAt);
}

// -------------------------------------------------------------------------
// Reasonable Security Practices (Section 43A, IS/ISO/IEC 27001)
// -------------------------------------------------------------------------

export interface SecurityPracticesConfig {
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  accessControl: boolean;
  auditLogging: boolean;
  incidentResponse: boolean;
  dataBackup: boolean;
  vulnerabilityManagement: boolean;
  securityAwareness: boolean;
}

/**
 * Reasonable security practices checklist per Section 43A.
 * Returns compliance status against IS/ISO/IEC 27001 baseline.
 */
export function checkSecurityPractices(config: SecurityPracticesConfig): {
  compliant: boolean;
  gaps: string[];
} {
  const gaps: string[] = [];
  if (!config.encryptionAtRest)
    gaps.push("Missing encryption at rest (Section 43A, IS/ISO/IEC 27001)");
  if (!config.encryptionInTransit)
    gaps.push("Missing encryption in transit (TLS 1.3 required)");
  if (!config.accessControl)
    gaps.push("Missing access control mechanisms (role-based, least privilege)");
  if (!config.auditLogging)
    gaps.push("Missing audit logging (CERT-In requires 180-day retention)");
  if (!config.incidentResponse)
    gaps.push("Missing incident response plan (CERT-In Directions 2022)");
  if (!config.dataBackup)
    gaps.push("Missing data backup procedures");
  if (!config.vulnerabilityManagement)
    gaps.push("Missing vulnerability management program");
  if (!config.securityAwareness)
    gaps.push("Missing security awareness program");
  return { compliant: gaps.length === 0, gaps };
}

// -------------------------------------------------------------------------
// Log Retention (CERT-In Directions 2022)
// -------------------------------------------------------------------------

/** Mandatory log retention per CERT-In Directions: minimum 180 days. */
export const LOG_RETENTION_DAYS = 180;

// -------------------------------------------------------------------------
// NTP Synchronization (CERT-In Directions 2022)
// -------------------------------------------------------------------------

/** All systems must synchronize clocks to NTP (IST / UTC+5:30). */
export const NTP_SYNC_REQUIRED = true;

/**
 * NTP servers recommended by CERT-In / NIC India.
 */
export const RECOMMENDED_NTP_SERVERS = [
  "time.nplindia.org",     // National Physical Laboratory
  "samay1.nic.in",         // NIC India
  "samay2.nic.in",         // NIC India
] as const;

// -------------------------------------------------------------------------
// Intermediary Due Diligence (IT Rules 2021, Rule 4)
// -------------------------------------------------------------------------

export interface IntermediaryDueDiligence {
  privacyPolicyPublished: boolean;
  userAgreementPublished: boolean;
  grievanceOfficerAppointed: boolean;
  grievanceOfficerName?: string;
  grievanceOfficerEmail?: string;
  contentRemovalMechanism: boolean;
  cooperatesWithGovt: boolean;
  retainsUserRegistrationInfo: boolean;
}

/**
 * Check intermediary due diligence compliance per IT Rules 2021.
 */
export function checkIntermediaryDueDiligence(
  config: IntermediaryDueDiligence,
): { compliant: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!config.privacyPolicyPublished)
    gaps.push("Rule 3(1)(a): Privacy policy not published");
  if (!config.userAgreementPublished)
    gaps.push("Rule 3(1)(a): User agreement not published");
  if (!config.grievanceOfficerAppointed)
    gaps.push("Rule 3(2): Grievance officer not appointed");
  else {
    if (!config.grievanceOfficerName)
      gaps.push("Rule 3(2): Grievance officer name not disclosed");
    if (!config.grievanceOfficerEmail)
      gaps.push("Rule 3(2): Grievance officer email not disclosed");
  }
  if (!config.contentRemovalMechanism)
    gaps.push("Rule 3(1)(d): No mechanism to receive and process complaints");
  if (!config.cooperatesWithGovt)
    gaps.push("Rule 3(1)(j): Must cooperate with government agencies");
  if (!config.retainsUserRegistrationInfo)
    gaps.push("CERT-In: Must retain user registration info for 5 years after account deletion");
  return { compliant: gaps.length === 0, gaps };
}

// -------------------------------------------------------------------------
// CERT-In Contact
// -------------------------------------------------------------------------

/** Official CERT-In incident reporting email. */
export const CERT_IN_REPORTING_EMAIL = "incident@cert-in.org.in";

/** Official CERT-In website. */
export const CERT_IN_WEBSITE = "https://www.cert-in.org.in";
