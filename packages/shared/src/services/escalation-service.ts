import { eq, and, lt } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { escalationTimers } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("escalation-service");

/**
 * IGM Escalation levels:
 * Level 1: NP-level resolution (interfacing app) -- 2 hour SLA for acknowledgment, 24h for resolution
 * Level 2: Cascaded to counterparty NP -- 24h SLA
 * Level 3: ONDC mediation / ODR -- 48h SLA
 */
const ESCALATION_CONFIG = {
  1: {
    acknowledgmentSlaMs: 2 * 60 * 60 * 1000,
    resolutionSlaMs: 24 * 60 * 60 * 1000,
    label: "NP-level resolution",
  },
  2: {
    acknowledgmentSlaMs: 2 * 60 * 60 * 1000,
    resolutionSlaMs: 24 * 60 * 60 * 1000,
    label: "Cascaded to counterparty NP",
  },
  3: {
    acknowledgmentSlaMs: 4 * 60 * 60 * 1000,
    resolutionSlaMs: 48 * 60 * 60 * 1000,
    label: "ONDC mediation / ODR",
  },
} as const;

export class EscalationService {
  constructor(
    private db: Database,
    private onEscalation?: (issueId: string, newLevel: number, deadline: Date) => Promise<void>,
  ) {}

  /**
   * Create an escalation timer when an issue is raised.
   * Starts at Level 1.
   */
  async createTimer(issueId: string): Promise<void> {
    const now = new Date();
    const config = ESCALATION_CONFIG[1];
    const deadline = new Date(now.getTime() + config.resolutionSlaMs);

    await this.db.insert(escalationTimers).values({
      issue_id: issueId,
      current_level: 1,
      escalation_deadline: deadline,
    });

    logger.info({ issueId, level: 1, deadline }, "Escalation timer created");
  }

  /**
   * Mark an issue as acknowledged at the current level.
   */
  async markAcknowledged(issueId: string): Promise<void> {
    await this.db
      .update(escalationTimers)
      .set({
        acknowledged: true,
        acknowledged_at: new Date(),
      })
      .where(
        and(
          eq(escalationTimers.issue_id, issueId),
          eq(escalationTimers.resolved, false),
          eq(escalationTimers.escalated, false),
        ),
      );

    logger.info({ issueId }, "Issue acknowledged");
  }

  /**
   * Mark an issue as resolved.
   */
  async markResolved(issueId: string): Promise<void> {
    await this.db
      .update(escalationTimers)
      .set({
        resolved: true,
        resolved_at: new Date(),
      })
      .where(
        and(
          eq(escalationTimers.issue_id, issueId),
          eq(escalationTimers.resolved, false),
        ),
      );

    logger.info({ issueId }, "Issue resolved, timer stopped");
  }

  /**
   * Escalate an issue to the next level.
   */
  async escalate(issueId: string): Promise<{ newLevel: number; deadline: Date } | null> {
    const [timer] = await this.db
      .select()
      .from(escalationTimers)
      .where(
        and(
          eq(escalationTimers.issue_id, issueId),
          eq(escalationTimers.resolved, false),
          eq(escalationTimers.escalated, false),
        ),
      )
      .limit(1);

    if (!timer) return null;

    const currentLevel = timer.current_level as 1 | 2 | 3;
    if (currentLevel >= 3) {
      logger.warn({ issueId }, "Issue already at maximum escalation level");
      return null;
    }

    // Mark current timer as escalated
    await this.db
      .update(escalationTimers)
      .set({ escalated: true, escalated_at: new Date() })
      .where(eq(escalationTimers.id, timer.id));

    // Create new timer at next level
    const newLevel = (currentLevel + 1) as 2 | 3;
    const config = ESCALATION_CONFIG[newLevel];
    const now = new Date();
    const deadline = new Date(now.getTime() + config.resolutionSlaMs);

    await this.db.insert(escalationTimers).values({
      issue_id: issueId,
      current_level: newLevel,
      escalation_deadline: deadline,
    });

    logger.info({ issueId, newLevel, deadline, label: config.label }, "Issue escalated");
    return { newLevel, deadline };
  }

  /**
   * Check for expired timers and auto-escalate.
   * Should be called periodically (e.g., every minute).
   */
  async checkAndAutoEscalate(): Promise<{ escalated: string[]; maxLevel: string[] }> {
    const now = new Date();
    const expired = await this.db
      .select()
      .from(escalationTimers)
      .where(
        and(
          eq(escalationTimers.resolved, false),
          eq(escalationTimers.escalated, false),
          lt(escalationTimers.escalation_deadline, now),
        ),
      );

    const escalated: string[] = [];
    const maxLevel: string[] = [];

    for (const timer of expired) {
      if ((timer.current_level as number) >= 3) {
        maxLevel.push(timer.issue_id);
        logger.error(
          { issueId: timer.issue_id },
          "Issue at max escalation level and still unresolved, requires manual intervention",
        );
      } else {
        const result = await this.escalate(timer.issue_id);
        if (result) {
          escalated.push(timer.issue_id);
          if (this.onEscalation) {
            try {
              await this.onEscalation(timer.issue_id, result.newLevel, result.deadline);
            } catch (cbErr) {
              logger.error({ err: cbErr, issueId: timer.issue_id }, "Escalation callback failed");
            }
          }
        }
      }
    }

    if (escalated.length > 0 || maxLevel.length > 0) {
      logger.info(
        { escalatedCount: escalated.length, maxLevelCount: maxLevel.length },
        "Auto-escalation check completed",
      );
    }

    return { escalated, maxLevel };
  }

  /**
   * Get current escalation status for an issue.
   */
  async getStatus(issueId: string) {
    return this.db
      .select()
      .from(escalationTimers)
      .where(eq(escalationTimers.issue_id, issueId))
      .orderBy(escalationTimers.current_level);
  }
}
