// ---------------------------------------------------------------------------
// IGM (Issue & Grievance Management) Protocol Types
// ---------------------------------------------------------------------------
// Ref: ONDC IGM specification for issue lifecycle management
// ---------------------------------------------------------------------------

import type { BecknContext, Descriptor, Tag } from "./types.js";

// ---------------------------------------------------------------------------
// Action Enums
// ---------------------------------------------------------------------------

/**
 * IGM request actions.
 */
export enum IgmAction {
  issue = "issue",
  issue_status = "issue_status",
}

/**
 * IGM callback actions.
 */
export enum IgmCallbackAction {
  on_issue = "on_issue",
  on_issue_status = "on_issue_status",
}

// ---------------------------------------------------------------------------
// Issue Categories & Sub-categories
// ---------------------------------------------------------------------------

/**
 * Top-level issue category.
 */
export enum IssueCategory {
  ORDER = "ORDER",
  ITEM = "ITEM",
  FULFILLMENT = "FULFILLMENT",
  AGENT = "AGENT",
}

/**
 * Issue sub-category codes.
 *
 *   ORD01 - Order delay
 *   ORD02 - Order not received
 *   ITM01 - Quality issue
 *   ITM02 - Wrong item
 *   FLM01 - Delivery issue
 *   FLM02 - Packaging issue
 *   AGT01 - Agent behavior
 */
export enum IssueSubCategory {
  ORD01 = "ORD01",
  ORD02 = "ORD02",
  ITM01 = "ITM01",
  ITM02 = "ITM02",
  FLM01 = "FLM01",
  FLM02 = "FLM02",
  AGT01 = "AGT01",
}

/**
 * Mapping from sub-category code to its parent category and description.
 */
export const ISSUE_SUB_CATEGORY_META: Readonly<
  Record<IssueSubCategory, { category: IssueCategory; description: string }>
> = {
  [IssueSubCategory.ORD01]: { category: IssueCategory.ORDER, description: "Order delay" },
  [IssueSubCategory.ORD02]: { category: IssueCategory.ORDER, description: "Order not received" },
  [IssueSubCategory.ITM01]: { category: IssueCategory.ITEM, description: "Quality issue" },
  [IssueSubCategory.ITM02]: { category: IssueCategory.ITEM, description: "Wrong item" },
  [IssueSubCategory.FLM01]: { category: IssueCategory.FULFILLMENT, description: "Delivery issue" },
  [IssueSubCategory.FLM02]: { category: IssueCategory.FULFILLMENT, description: "Packaging issue" },
  [IssueSubCategory.AGT01]: { category: IssueCategory.AGENT, description: "Agent behavior" },
};

// ---------------------------------------------------------------------------
// Issue Status & Respondent Actions
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of an issue.
 */
export enum IssueStatus {
  OPEN = "OPEN",
  ESCALATED = "ESCALATED",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

/**
 * Actions that a respondent can take on an issue.
 */
export enum RespondentAction {
  PROCESSING = "PROCESSING",
  CASCADED = "CASCADED",
  RESOLVED = "RESOLVED",
  NEED_MORE_INFO = "NEED-MORE-INFO",
}

/**
 * Who raised the issue.
 */
export enum IssueSource {
  CONSUMER = "CONSUMER",
  SELLER = "SELLER",
  INTERFACING_NP = "INTERFACING-NP",
}

// ---------------------------------------------------------------------------
// Expected Response / Resolution Time
// ---------------------------------------------------------------------------

/**
 * Standard expected response and resolution times (ISO 8601 durations).
 *
 * These are indicative defaults based on ONDC IGM guidelines:
 *   - Expected response time: PT1H (1 hour)
 *   - Expected resolution time: PT2D (2 days / 48 hours)
 */
export const IGM_SLA = {
  /** Maximum time for initial acknowledgement of an issue (ISO 8601 duration). */
  EXPECTED_RESPONSE_TIME: "PT1H",
  /** Maximum time for full resolution of an issue (ISO 8601 duration). */
  EXPECTED_RESOLUTION_TIME: "PT2D",
} as const;

// ---------------------------------------------------------------------------
// Core Types
// ---------------------------------------------------------------------------

/**
 * Complainant information.
 */
export interface Complainant {
  person?: { name?: string };
  contact?: { phone?: string; email?: string };
}

/**
 * A single respondent entry in the issue resolution chain.
 */
export interface RespondentInfo {
  respondent_action: RespondentAction;
  short_desc?: string;
  updated_at: string;
  updated_by?: {
    org?: { name?: string };
    contact?: { phone?: string; email?: string };
    person?: { name?: string };
  };
  cascaded_to?: string;
}

/**
 * Resolution details when an issue is resolved.
 */
export interface IssueResolution {
  short_desc?: string;
  long_desc?: string;
  action_triggered?: string;
  refund_amount?: string;
}

/**
 * The core issue object used in `issue` and `on_issue` payloads.
 */
export interface Issue {
  id: string;
  category: IssueCategory;
  sub_category: IssueSubCategory;
  complainant_info?: Complainant;
  order_details?: {
    id?: string;
    state?: string;
    items?: Array<{ id?: string; quantity?: number }>;
    fulfillments?: Array<{ id?: string; state?: string }>;
    provider_id?: string;
  };
  description?: Descriptor;
  source?: {
    network_participant_id?: string;
    type?: IssueSource;
  };
  expected_response_time?: {
    duration: string;
  };
  expected_resolution_time?: {
    duration: string;
  };
  status: IssueStatus;
  issue_type?: string;
  issue_actions?: {
    complainant_actions?: Array<{
      complainant_action: string;
      short_desc?: string;
      updated_at: string;
      updated_by?: {
        org?: { name?: string };
        contact?: { phone?: string; email?: string };
        person?: { name?: string };
      };
    }>;
    respondent_actions?: RespondentInfo[];
  };
  resolution?: IssueResolution;
  resolution_provider?: {
    respondent_info?: {
      type?: string;
      organization?: {
        org?: { name?: string };
        contact?: { phone?: string; email?: string };
        person?: { name?: string };
      };
      resolution_support?: {
        chat_link?: string;
        contact?: { phone?: string; email?: string };
        gros?: Array<{
          person?: { name?: string };
          contact?: { phone?: string; email?: string };
          gro_type?: string;
        }>;
      };
    };
  };
  rating?: string;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

// ---------------------------------------------------------------------------
// Request / Response payloads
// ---------------------------------------------------------------------------

/**
 * Payload for the `issue` action.
 */
export interface IssueRequest {
  context: BecknContext;
  message: {
    issue: Issue;
  };
}

/**
 * Payload for the `on_issue` callback action.
 */
export interface OnIssueRequest {
  context: BecknContext;
  message: {
    issue: Issue;
  };
}

/**
 * Payload for the `issue_status` action.
 */
export interface IssueStatusRequest {
  context: BecknContext;
  message: {
    issue_id: string;
  };
}

/**
 * Payload for the `on_issue_status` callback action.
 */
export interface OnIssueStatusRequest {
  context: BecknContext;
  message: {
    issue: Issue;
  };
}
