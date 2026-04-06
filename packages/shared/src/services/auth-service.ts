import { randomBytes, createHash } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { users, otpRequests, userSessions } from "../db/schema.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("auth");

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_EXPIRY_DAYS = 30;

export class AuthService {
  constructor(private db: Database) {}

  /**
   * Generate and store OTP for a phone number.
   * Returns the OTP (to be sent via SMS).
   */
  async generateOtp(phone: string): Promise<{ otp: string; expiresAt: Date }> {
    const cleanPhone = phone.replace(/^\+91/, "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      throw new Error("Invalid phone number. Must be 10 digits.");
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.db.insert(otpRequests).values({
      phone: cleanPhone,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    logger.info({ phone: cleanPhone.slice(-4) }, "OTP generated");
    return { otp, expiresAt };
  }

  /**
   * Verify OTP and create/return user session.
   */
  async verifyOtp(phone: string, otp: string): Promise<{
    success: boolean;
    token?: string;
    user?: { id: string; phone: string; name: string | null };
    error?: string;
  }> {
    const cleanPhone = phone.replace(/^\+91/, "").replace(/\D/g, "");
    const otpHash = createHash("sha256").update(otp).digest("hex");
    const now = new Date();

    // Find valid OTP
    const [otpRecord] = await this.db
      .select()
      .from(otpRequests)
      .where(and(
        eq(otpRequests.phone, cleanPhone),
        eq(otpRequests.otp_hash, otpHash),
        eq(otpRequests.verified, false),
        gt(otpRequests.expires_at, now),
      ))
      .limit(1);

    if (!otpRecord) {
      // Check if expired or wrong
      const [anyOtp] = await this.db
        .select()
        .from(otpRequests)
        .where(and(eq(otpRequests.phone, cleanPhone), eq(otpRequests.verified, false)))
        .limit(1);

      if (anyOtp && (anyOtp.attempts ?? 0) >= MAX_OTP_ATTEMPTS) {
        return { success: false, error: "Too many attempts. Request a new OTP." };
      }

      if (anyOtp) {
        await this.db.update(otpRequests)
          .set({ attempts: (anyOtp.attempts ?? 0) + 1 })
          .where(eq(otpRequests.id, anyOtp.id));
      }

      return { success: false, error: "Invalid or expired OTP." };
    }

    // Mark OTP as verified
    await this.db.update(otpRequests)
      .set({ verified: true })
      .where(eq(otpRequests.id, otpRecord.id));

    // Create or get user
    let [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, cleanPhone))
      .limit(1);

    if (!user) {
      const [newUser] = await this.db.insert(users).values({
        phone: cleanPhone,
      }).returning();
      user = newUser!;
    }

    // Create session token
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const sessionExpiry = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await this.db.insert(userSessions).values({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: sessionExpiry,
    });

    logger.info({ userId: user.id, phone: cleanPhone.slice(-4) }, "User authenticated");

    return {
      success: true,
      token,
      user: { id: user.id, phone: user.phone, name: user.name },
    };
  }

  /**
   * Validate a session token.
   */
  async validateSession(token: string): Promise<{
    valid: boolean;
    user?: { id: string; phone: string; name: string | null; email: string | null; preferredLanguage: string | null };
  }> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date();

    const [session] = await this.db
      .select()
      .from(userSessions)
      .where(and(
        eq(userSessions.token_hash, tokenHash),
        gt(userSessions.expires_at, now),
      ))
      .limit(1);

    if (!session) return { valid: false };

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, session.user_id))
      .limit(1);

    if (!user) return { valid: false };

    return {
      valid: true,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferred_language,
      },
    };
  }

  /**
   * Update user profile.
   */
  async updateProfile(userId: string, data: {
    name?: string;
    email?: string;
    preferredLanguage?: string;
    defaultAddress?: unknown;
  }): Promise<void> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };
    if (data.name !== undefined) updateData["name"] = data.name;
    if (data.email !== undefined) updateData["email"] = data.email;
    if (data.preferredLanguage !== undefined) updateData["preferred_language"] = data.preferredLanguage;
    if (data.defaultAddress !== undefined) updateData["default_address"] = data.defaultAddress;

    await this.db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));
  }

  /**
   * Logout: invalidate session.
   */
  async logout(token: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await this.db.delete(userSessions).where(eq(userSessions.token_hash, tokenHash));
  }
}
