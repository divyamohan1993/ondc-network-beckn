import { request } from "undici";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("push-notifications");

const FCM_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send";

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export class PushNotificationService {
  private projectId: string;
  private serviceAccountKey: Record<string, unknown> | null = null;
  private accessToken?: string;
  private tokenExpiry: number = 0;

  constructor(config: {
    projectId: string;
    serviceAccountKeyJson: string;
  }) {
    this.projectId = config.projectId;
    try {
      this.serviceAccountKey = JSON.parse(config.serviceAccountKeyJson);
    } catch {
      logger.warn("FCM service account key not valid JSON, push notifications disabled");
    }
  }

  /**
   * Get OAuth2 access token for FCM v1 API.
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.serviceAccountKey) {
      throw new Error("FCM service account key not configured");
    }

    // Use Google Auth Library if available, otherwise fail gracefully
    try {
      // Dynamic import: google-auth-library is an optional peer dependency
      const mod = await (Function('return import("google-auth-library")')() as Promise<any>);
      const GoogleAuth = mod.GoogleAuth;
      const auth = new GoogleAuth({
        credentials: this.serviceAccountKey,
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const tokenStr = tokenResponse?.token;
      if (!tokenStr) {
        throw new Error("Failed to obtain FCM access token");
      }
      this.accessToken = tokenStr;
      this.tokenExpiry = Date.now() + 3500000; // ~58 minutes
      return tokenStr;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
        logger.warn("google-auth-library not installed, push notifications disabled. Install with: pnpm add google-auth-library");
        throw new Error("google-auth-library required for FCM");
      }
      throw err;
    }
  }

  /**
   * Send push notification to a device token.
   */
  async sendToDevice(deviceToken: string, notification: PushNotification): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      const url = FCM_URL.replace("{project_id}", this.projectId);

      const message = {
        message: {
          token: deviceToken,
          notification: {
            title: notification.title,
            body: notification.body,
            image: notification.imageUrl,
          },
          data: notification.data,
          android: {
            priority: "high" as const,
            notification: {
              click_action: "OPEN_ORDER",
              channel_id: "ondc_orders",
            },
          },
          webpush: {
            notification: {
              icon: "/icon-192.png",
              badge: "/badge-72.png",
            },
          },
        },
      };

      const res = await request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(message),
      });

      if (res.statusCode === 200) {
        logger.info({ deviceToken: deviceToken.slice(-8) }, "Push notification sent");
        return true;
      }

      const body = await res.body.text();
      logger.error({ statusCode: res.statusCode, body }, "FCM send failed");
      return false;
    } catch (err) {
      logger.error({ err }, "Push notification error");
      return false;
    }
  }

  /**
   * Send to multiple device tokens.
   */
  async sendToDevices(deviceTokens: string[], notification: PushNotification): Promise<{ success: number; failure: number }> {
    let success = 0;
    let failure = 0;

    // FCM v1 doesn't support batch, send individually
    await Promise.allSettled(
      deviceTokens.map(async (token) => {
        const ok = await this.sendToDevice(token, notification);
        if (ok) success++;
        else failure++;
      })
    );

    return { success, failure };
  }
}
