import type { FastifyInstance } from "fastify";
import {
  AuthService,
  NotificationService,
  NotificationEvent,
  createLogger,
} from "@ondc/shared";
import { createUserAuthMiddleware } from "@ondc/shared/middleware";

const logger = createLogger("auth-routes");

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify.db);
  const userAuth = createUserAuthMiddleware(authService);

  // Attach authService to instance for use in other routes
  (fastify as any).authService = authService;
  (fastify as any).userAuth = userAuth;

  /**
   * POST /auth/send-otp
   * Send OTP to phone number for login/registration.
   */
  fastify.post<{
    Body: { phone: string };
  }>("/auth/send-otp", async (request, reply) => {
    const { phone } = request.body || {};
    if (!phone) {
      return reply.code(400).send({
        error: { code: "INVALID_INPUT", message: "Phone number is required.", details: [] },
      });
    }

    try {
      const { otp, expiresAt } = await authService.generateOtp(phone);

      // Send OTP via SMS through notification service
      const notifications: NotificationService = fastify.notifications;
      await notifications.send({
        event: NotificationEvent.ORDER_CONFIRMED, // reuse event for SMS dispatch
        recipientPhone: phone,
        body: `Your ONDC verification code is ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
        subject: "ONDC OTP Verification",
      });

      logger.info({ phone: phone.slice(-4) }, "OTP sent");

      return reply.code(200).send({
        success: true,
        expiresAt: expiresAt.toISOString(),
        message: "OTP sent to your phone number.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send OTP.";
      logger.error({ err }, "OTP generation failed");
      return reply.code(400).send({
        error: { code: "OTP_FAILED", message, details: [] },
      });
    }
  });

  /**
   * POST /auth/verify-otp
   * Verify OTP and return session token.
   */
  fastify.post<{
    Body: { phone: string; otp: string };
  }>("/auth/verify-otp", async (request, reply) => {
    const { phone, otp } = request.body || {};
    if (!phone || !otp) {
      return reply.code(400).send({
        error: { code: "INVALID_INPUT", message: "Phone and OTP are required.", details: [] },
      });
    }

    const result = await authService.verifyOtp(phone, otp);

    if (!result.success) {
      return reply.code(401).send({
        error: { code: "OTP_INVALID", message: result.error || "Verification failed.", details: [] },
      });
    }

    return reply.code(200).send({
      success: true,
      token: result.token,
      user: result.user,
    });
  });

  /**
   * GET /auth/me
   * Get current user profile. Requires Bearer token.
   */
  fastify.get("/auth/me", {
    preHandler: userAuth,
  }, async (request, reply) => {
    return reply.code(200).send({
      user: request.user,
    });
  });

  /**
   * PUT /auth/profile
   * Update user profile. Requires Bearer token.
   */
  fastify.put<{
    Body: {
      name?: string;
      email?: string;
      preferredLanguage?: string;
      defaultAddress?: unknown;
    };
  }>("/auth/profile", {
    preHandler: userAuth,
  }, async (request, reply) => {
    const user = request.user!;
    const { name, email, preferredLanguage, defaultAddress } = request.body || {};

    await authService.updateProfile(user.id, {
      name,
      email,
      preferredLanguage,
      defaultAddress,
    });

    logger.info({ userId: user.id }, "Profile updated");

    return reply.code(200).send({
      success: true,
      message: "Profile updated.",
    });
  });

  /**
   * POST /auth/logout
   * Invalidate current session.
   */
  fastify.post("/auth/logout", {
    preHandler: userAuth,
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader!.slice(7);
    await authService.logout(token);

    return reply.code(200).send({
      success: true,
      message: "Logged out.",
    });
  });
}
