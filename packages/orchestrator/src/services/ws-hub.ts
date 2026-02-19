import type { FastifyInstance } from "fastify";
import type { WebSocket } from "@fastify/websocket";
import { createLogger } from "@ondc/shared";

const logger = createLogger("ws-hub");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WsEventType =
  | "agent:status"
  | "agent:health"
  | "agent:stats"
  | "service:started"
  | "service:stopped"
  | "service:restarted"
  | "rotation:completed"
  | "simulation:progress"
  | "teardown:progress"
  | "log:entry";

export interface WsEvent {
  type: WsEventType;
  timestamp: string;
  data: unknown;
}

interface TrackedClient {
  socket: WebSocket;
  id: string;
  connectedAt: number;
  lastPong: number;
}

// ---------------------------------------------------------------------------
// WebSocket Hub
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL_MS = 15_000;
const STALE_TIMEOUT_MS = 60_000;

export class WsHub {
  private clients: Map<string, TrackedClient> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private clientCounter = 0;

  /**
   * Register the WebSocket route on the Fastify instance.
   * Must be called after @fastify/websocket is registered.
   */
  register(fastify: FastifyInstance): void {
    fastify.get("/ws", { websocket: true }, (socket, _request) => {
      const clientId = `ws-${++this.clientCounter}-${Date.now()}`;
      const now = Date.now();

      const tracked: TrackedClient = {
        socket,
        id: clientId,
        connectedAt: now,
        lastPong: now,
      };

      this.clients.set(clientId, tracked);
      logger.info({ clientId, totalClients: this.clients.size }, "WebSocket client connected");

      // Send welcome message
      this.sendToClient(tracked, {
        type: "agent:status" as WsEventType,
        timestamp: new Date().toISOString(),
        data: {
          message: "Connected to orchestrator WebSocket hub",
          clientId,
        },
      });

      // Handle pong responses
      socket.on("pong", () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPong = Date.now();
        }
      });

      // Handle incoming messages (for future client-to-server commands)
      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const message = JSON.parse(raw.toString());
          logger.debug({ clientId, message }, "Received WS message from client");

          // Handle ping from client
          if (message.type === "ping") {
            this.sendToClient(tracked, {
              type: "agent:status" as WsEventType,
              timestamp: new Date().toISOString(),
              data: { pong: true },
            });
          }
        } catch {
          // Ignore non-JSON messages
        }
      });

      // Handle disconnect
      socket.on("close", () => {
        this.clients.delete(clientId);
        logger.info(
          { clientId, totalClients: this.clients.size },
          "WebSocket client disconnected",
        );
      });

      // Handle errors
      socket.on("error", (err: Error) => {
        logger.error({ err, clientId }, "WebSocket client error");
        this.clients.delete(clientId);
      });
    });

    // Start heartbeat loop
    this.startHeartbeat();

    logger.info("WebSocket hub registered at /ws");
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(type: WsEventType, data: unknown): void {
    const event: WsEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    const payload = JSON.stringify(event);
    let sent = 0;

    for (const client of this.clients.values()) {
      try {
        if (client.socket.readyState === 1) {
          // OPEN
          client.socket.send(payload);
          sent++;
        }
      } catch (err) {
        logger.debug({ err, clientId: client.id }, "Failed to send to client");
      }
    }

    logger.debug({ type, clients: sent }, "Broadcast event");
  }

  /**
   * Send an event to a specific client.
   */
  private sendToClient(client: TrackedClient, event: WsEvent): void {
    try {
      if (client.socket.readyState === 1) {
        client.socket.send(JSON.stringify(event));
      }
    } catch (err) {
      logger.debug({ err, clientId: client.id }, "Failed to send to client");
    }
  }

  /**
   * Start the heartbeat ping loop to detect stale clients.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, client] of this.clients) {
        // Check if client is stale (no pong within timeout)
        if (now - client.lastPong > STALE_TIMEOUT_MS) {
          logger.info({ clientId: id }, "Disconnecting stale WebSocket client");
          try {
            client.socket.close(1000, "Stale connection");
          } catch {
            // Ignore close errors
          }
          this.clients.delete(id);
          continue;
        }

        // Send ping
        try {
          if (client.socket.readyState === 1) {
            client.socket.ping();
          }
        } catch {
          // If ping fails, remove client
          this.clients.delete(id);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Clean up: close all connections and stop heartbeat.
   */
  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [id, client] of this.clients) {
      try {
        client.socket.close(1001, "Server shutting down");
      } catch {
        // Ignore
      }
      this.clients.delete(id);
    }

    logger.info("WebSocket hub closed");
  }
}
