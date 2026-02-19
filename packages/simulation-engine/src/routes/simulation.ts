import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { SimulationEngine } from "../services/engine.js";
import type { SimulationProfile, SimulationConfig, StartSimulationRequest } from "../types.js";

// ---------------------------------------------------------------------------
// Route parameter / body types
// ---------------------------------------------------------------------------

interface SimulationParams {
  id: string;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all simulation routes on the Fastify instance.
 */
export function registerSimulationRoutes(
  fastify: FastifyInstance,
  engine: SimulationEngine,
): void {
  // -------------------------------------------------------------------------
  // GET /simulations/profiles - List available simulation profiles
  // -------------------------------------------------------------------------
  fastify.get(
    "/simulations/profiles",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const profiles = engine.getProfiles();
      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        profiles,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /simulations/start - Start a simulation
  // -------------------------------------------------------------------------
  fastify.post<{ Body: StartSimulationRequest }>(
    "/simulations/start",
    async (
      request: FastifyRequest<{ Body: StartSimulationRequest }>,
      reply: FastifyReply,
    ) => {
      const { profile, config } = request.body ?? {};

      // Validate profile if provided
      const validProfiles: SimulationProfile[] = [
        "smoke-test",
        "load-test",
        "endurance",
        "custom",
      ];
      if (profile && !validProfiles.includes(profile)) {
        return reply.code(400).send({
          error: "Bad request",
          message: `Invalid profile: ${profile}. Valid profiles: ${validProfiles.join(", ")}`,
        });
      }

      // Validate custom config values if provided
      if (config) {
        if (config.numBaps !== undefined && config.numBaps < 1) {
          return reply.code(400).send({
            error: "Bad request",
            message: "numBaps must be at least 1",
          });
        }
        if (config.numBpps !== undefined && config.numBpps < 1) {
          return reply.code(400).send({
            error: "Bad request",
            message: "numBpps must be at least 1",
          });
        }
        if (config.numOrders !== undefined && config.numOrders < 0) {
          return reply.code(400).send({
            error: "Bad request",
            message: "numOrders must be non-negative",
          });
        }
        if (config.concurrency !== undefined && config.concurrency < 1) {
          return reply.code(400).send({
            error: "Bad request",
            message: "concurrency must be at least 1",
          });
        }
      }

      try {
        const run = await engine.startSimulation(profile, config);
        return reply.code(201).send({
          message: "Simulation started",
          simulation: run,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({
          error: "Failed to start simulation",
          message: errorMessage,
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /simulations - List all simulations
  // -------------------------------------------------------------------------
  fastify.get(
    "/simulations",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const simulations = await engine.listSimulations();
      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        count: simulations.length,
        simulations,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /simulations/:id - Get simulation details and results
  // -------------------------------------------------------------------------
  fastify.get<{ Params: SimulationParams }>(
    "/simulations/:id",
    async (
      request: FastifyRequest<{ Params: SimulationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const simulation = await engine.getSimulation(id);

      if (!simulation) {
        return reply.code(404).send({
          error: "Not found",
          message: `Simulation not found: ${id}`,
        });
      }

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        simulation,
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /simulations/:id/progress - Get real-time progress
  // -------------------------------------------------------------------------
  fastify.get<{ Params: SimulationParams }>(
    "/simulations/:id/progress",
    async (
      request: FastifyRequest<{ Params: SimulationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const progress = engine.getProgress(id);

      if (!progress) {
        return reply.code(404).send({
          error: "Not found",
          message: `No active simulation found: ${id}. It may have already completed.`,
        });
      }

      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        progress,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /simulations/:id/pause - Pause a running simulation
  // -------------------------------------------------------------------------
  fastify.post<{ Params: SimulationParams }>(
    "/simulations/:id/pause",
    async (
      request: FastifyRequest<{ Params: SimulationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const simulation = await engine.pauseSimulation(id);

      if (!simulation) {
        return reply.code(404).send({
          error: "Not found",
          message: `No active simulation found: ${id}`,
        });
      }

      return reply.code(200).send({
        message: "Simulation paused",
        simulation,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /simulations/:id/resume - Resume a paused simulation
  // -------------------------------------------------------------------------
  fastify.post<{ Params: SimulationParams }>(
    "/simulations/:id/resume",
    async (
      request: FastifyRequest<{ Params: SimulationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const simulation = await engine.resumeSimulation(id);

      if (!simulation) {
        return reply.code(404).send({
          error: "Not found",
          message: `No active simulation found: ${id}`,
        });
      }

      return reply.code(200).send({
        message: "Simulation resumed",
        simulation,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /simulations/:id/cancel - Cancel a running simulation
  // -------------------------------------------------------------------------
  fastify.post<{ Params: SimulationParams }>(
    "/simulations/:id/cancel",
    async (
      request: FastifyRequest<{ Params: SimulationParams }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const simulation = await engine.cancelSimulation(id);

      if (!simulation) {
        return reply.code(404).send({
          error: "Not found",
          message: `No active simulation found: ${id}`,
        });
      }

      return reply.code(200).send({
        message: "Simulation cancelled",
        simulation,
      });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /simulations/data - Delete all simulated data
  // -------------------------------------------------------------------------
  fastify.delete(
    "/simulations/data",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await engine.deleteSimulatedData();
        return reply.code(200).send({
          message: "Simulated data deleted",
          ...result,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({
          error: "Failed to delete simulated data",
          message: errorMessage,
        });
      }
    },
  );
}
