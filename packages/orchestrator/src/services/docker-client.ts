import http from "node:http";
import { createLogger } from "@ondc/shared";

const logger = createLogger("docker-client");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerPort {
  IP: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface ContainerNetwork {
  IPAddress: string;
  Gateway: string;
  MacAddress: string;
}

export interface ContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports: ContainerPort[];
  Labels: Record<string, string>;
  NetworkSettings: {
    Networks: Record<string, ContainerNetwork>;
  };
}

export interface ContainerMount {
  Type: string;
  Source: string;
  Destination: string;
  Mode: string;
  RW: boolean;
}

export interface ContainerDetail {
  Id: string;
  Name: string;
  Created: string;
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string;
  };
  Config: {
    Image: string;
    Env: string[];
    Labels: Record<string, string>;
    Hostname: string;
  };
  NetworkSettings: {
    Networks: Record<string, ContainerNetwork>;
  };
  Mounts: ContainerMount[];
  RestartCount: number;
}

export interface CpuStats {
  cpu_usage: {
    total_usage: number;
    percpu_usage?: number[];
    usage_in_kernelmode: number;
    usage_in_usermode: number;
  };
  system_cpu_usage: number;
  online_cpus: number;
  throttling_data: {
    periods: number;
    throttled_periods: number;
    throttled_time: number;
  };
}

export interface MemoryStats {
  usage: number;
  max_usage: number;
  limit: number;
  stats: Record<string, number>;
}

export interface NetworkStatsEntry {
  rx_bytes: number;
  rx_packets: number;
  rx_errors: number;
  rx_dropped: number;
  tx_bytes: number;
  tx_packets: number;
  tx_errors: number;
  tx_dropped: number;
}

export interface ContainerStatsRaw {
  read: string;
  cpu_stats: CpuStats;
  precpu_stats: CpuStats;
  memory_stats: MemoryStats;
  networks?: Record<string, NetworkStatsEntry>;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsageMb: number;
  memoryLimitMb: number;
  memoryPercent: number;
  networkRxMb: number;
  networkTxMb: number;
  timestamp: string;
}

export interface PruneResult {
  deleted: string[];
}

// ---------------------------------------------------------------------------
// Docker socket HTTP client
// ---------------------------------------------------------------------------

const DOCKER_SOCKET = process.env["DOCKER_SOCKET"] ?? "/var/run/docker.sock";

/**
 * Perform an HTTP request against the Docker Engine API over the Unix socket.
 */
function dockerRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath: DOCKER_SOCKET,
      path: `/v1.43${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf-8");
        resolve({
          statusCode: res.statusCode ?? 500,
          body: responseBody,
        });
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Docker API request failed: ${err.message}`));
    });

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Helper to parse JSON responses from Docker API, handling errors gracefully.
 */
function parseDockerResponse<T>(response: { statusCode: number; body: string }): T {
  if (response.statusCode >= 400) {
    let message = `Docker API error (HTTP ${response.statusCode})`;
    try {
      const parsed = JSON.parse(response.body) as { message?: string };
      if (parsed.message) {
        message = `${message}: ${parsed.message}`;
      }
    } catch {
      // Body is not JSON; include raw text
      if (response.body) {
        message = `${message}: ${response.body.slice(0, 200)}`;
      }
    }
    throw new Error(message);
  }

  if (!response.body || response.body.trim() === "") {
    return undefined as unknown as T;
  }

  return JSON.parse(response.body) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List running (and stopped) containers.
 * Optionally filter by container name patterns.
 */
export async function listContainers(
  filters?: { name?: string[]; label?: string[] },
): Promise<ContainerInfo[]> {
  try {
    const queryFilters: Record<string, string[]> = {};
    if (filters?.name) queryFilters["name"] = filters.name;
    if (filters?.label) queryFilters["label"] = filters.label;

    const filterParam = Object.keys(queryFilters).length > 0
      ? `&filters=${encodeURIComponent(JSON.stringify(queryFilters))}`
      : "";

    const response = await dockerRequest("GET", `/containers/json?all=true${filterParam}`);
    return parseDockerResponse<ContainerInfo[]>(response);
  } catch (err) {
    logger.error({ err }, "Failed to list containers");
    return [];
  }
}

/**
 * List containers belonging to a specific docker-compose project.
 */
export async function listProjectContainers(
  projectName: string,
): Promise<ContainerInfo[]> {
  return listContainers({
    label: [`com.docker.compose.project=${projectName}`],
  });
}

/**
 * Get detailed information about a specific container.
 */
export async function inspectContainer(id: string): Promise<ContainerDetail> {
  const response = await dockerRequest("GET", `/containers/${encodeURIComponent(id)}/json`);
  return parseDockerResponse<ContainerDetail>(response);
}

/**
 * Start a stopped container.
 */
export async function startContainer(id: string): Promise<void> {
  try {
    const response = await dockerRequest("POST", `/containers/${encodeURIComponent(id)}/start`);
    if (response.statusCode === 304) {
      logger.info({ id }, "Container already running");
      return;
    }
    if (response.statusCode >= 400) {
      parseDockerResponse(response); // Will throw with error message
    }
    logger.info({ id }, "Container started");
  } catch (err) {
    logger.error({ err, id }, "Failed to start container");
    throw err;
  }
}

/**
 * Stop a running container.
 */
export async function stopContainer(id: string, timeout = 10): Promise<void> {
  try {
    const response = await dockerRequest(
      "POST",
      `/containers/${encodeURIComponent(id)}/stop?t=${timeout}`,
    );
    if (response.statusCode === 304) {
      logger.info({ id }, "Container already stopped");
      return;
    }
    if (response.statusCode >= 400) {
      parseDockerResponse(response);
    }
    logger.info({ id }, "Container stopped");
  } catch (err) {
    logger.error({ err, id }, "Failed to stop container");
    throw err;
  }
}

/**
 * Restart a container.
 */
export async function restartContainer(id: string, timeout = 10): Promise<void> {
  try {
    const response = await dockerRequest(
      "POST",
      `/containers/${encodeURIComponent(id)}/restart?t=${timeout}`,
    );
    if (response.statusCode >= 400) {
      parseDockerResponse(response);
    }
    logger.info({ id }, "Container restarted");
  } catch (err) {
    logger.error({ err, id }, "Failed to restart container");
    throw err;
  }
}

/**
 * Retrieve container logs.
 */
export async function getContainerLogs(
  id: string,
  tail = 100,
  since?: number,
): Promise<string> {
  try {
    let path = `/containers/${encodeURIComponent(id)}/logs?stdout=true&stderr=true&tail=${tail}`;
    if (since !== undefined) {
      path += `&since=${since}`;
    }
    const response = await dockerRequest("GET", path);
    if (response.statusCode >= 400) {
      parseDockerResponse(response);
    }
    // Docker log output includes 8-byte header frames per line.
    // Strip the headers for clean output.
    return stripDockerLogHeaders(response.body);
  } catch (err) {
    logger.error({ err, id }, "Failed to get container logs");
    throw err;
  }
}

/**
 * Strip Docker multiplexed stream headers from log output.
 * Each frame: [STREAM_TYPE(1)] [0(3)] [SIZE(4)] [PAYLOAD(SIZE)]
 */
function stripDockerLogHeaders(raw: string): string {
  const lines: string[] = [];
  const buf = Buffer.from(raw, "binary");
  let offset = 0;

  while (offset < buf.length) {
    if (offset + 8 > buf.length) {
      // Not enough data for a header; treat remainder as raw text
      lines.push(buf.subarray(offset).toString("utf-8"));
      break;
    }

    const size = buf.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + size > buf.length) {
      lines.push(buf.subarray(offset).toString("utf-8"));
      break;
    }

    const line = buf.subarray(offset, offset + size).toString("utf-8");
    lines.push(line);
    offset += size;
  }

  return lines.join("").trim();
}

/**
 * Get real-time stats for a container (single snapshot, not streaming).
 */
export async function getContainerStats(id: string): Promise<ContainerStats> {
  try {
    const response = await dockerRequest(
      "GET",
      `/containers/${encodeURIComponent(id)}/stats?stream=false`,
    );
    const raw = parseDockerResponse<ContainerStatsRaw>(response);
    return computeStats(raw);
  } catch (err) {
    logger.error({ err, id }, "Failed to get container stats");
    throw err;
  }
}

/**
 * Compute human-readable stats from the raw Docker stats response.
 */
function computeStats(raw: ContainerStatsRaw): ContainerStats {
  // CPU percentage
  const cpuDelta =
    raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta =
    raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
  const onlineCpus = raw.cpu_stats.online_cpus || 1;

  let cpuPercent = 0;
  if (systemDelta > 0 && cpuDelta >= 0) {
    cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
  }

  // Memory
  const memoryUsageMb = (raw.memory_stats.usage ?? 0) / (1024 * 1024);
  const memoryLimitMb = (raw.memory_stats.limit ?? 0) / (1024 * 1024);
  const memoryPercent = memoryLimitMb > 0 ? (memoryUsageMb / memoryLimitMb) * 100 : 0;

  // Network (sum across all interfaces)
  let rxBytes = 0;
  let txBytes = 0;
  if (raw.networks) {
    for (const iface of Object.values(raw.networks)) {
      rxBytes += iface.rx_bytes ?? 0;
      txBytes += iface.tx_bytes ?? 0;
    }
  }

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    memoryUsageMb: Math.round(memoryUsageMb * 100) / 100,
    memoryLimitMb: Math.round(memoryLimitMb * 100) / 100,
    memoryPercent: Math.round(memoryPercent * 100) / 100,
    networkRxMb: Math.round((rxBytes / (1024 * 1024)) * 100) / 100,
    networkTxMb: Math.round((txBytes / (1024 * 1024)) * 100) / 100,
    timestamp: raw.read,
  };
}

/**
 * Remove a container (optionally force-remove running containers).
 */
export async function removeContainer(id: string, force = false): Promise<void> {
  try {
    const response = await dockerRequest(
      "DELETE",
      `/containers/${encodeURIComponent(id)}?force=${force}&v=true`,
    );
    if (response.statusCode >= 400) {
      parseDockerResponse(response);
    }
    logger.info({ id, force }, "Container removed");
  } catch (err) {
    logger.error({ err, id }, "Failed to remove container");
    throw err;
  }
}

/**
 * Prune stopped containers.
 */
export async function pruneContainers(): Promise<PruneResult> {
  try {
    const response = await dockerRequest("POST", "/containers/prune");
    const result = parseDockerResponse<{
      ContainersDeleted?: string[] | null;
      SpaceReclaimed?: number;
    }>(response);
    const deleted = result?.ContainersDeleted ?? [];
    logger.info({ count: deleted.length }, "Pruned stopped containers");
    return { deleted };
  } catch (err) {
    logger.error({ err }, "Failed to prune containers");
    return { deleted: [] };
  }
}

/**
 * Remove Docker volumes (used in full teardown).
 */
export async function pruneVolumes(): Promise<{ deleted: string[] }> {
  try {
    const response = await dockerRequest("POST", "/volumes/prune");
    const result = parseDockerResponse<{
      VolumesDeleted?: string[] | null;
      SpaceReclaimed?: number;
    }>(response);
    const deleted = result?.VolumesDeleted ?? [];
    logger.info({ count: deleted.length }, "Pruned volumes");
    return { deleted };
  } catch (err) {
    logger.error({ err }, "Failed to prune volumes");
    return { deleted: [] };
  }
}

/**
 * Execute a command inside a running container.
 * Used for running SQL scripts during reset, etc.
 */
export async function execInContainer(
  id: string,
  cmd: string[],
): Promise<{ exitCode: number; output: string }> {
  try {
    // Create exec instance
    const createResp = await dockerRequest(
      "POST",
      `/containers/${encodeURIComponent(id)}/exec`,
      {
        AttachStdout: true,
        AttachStderr: true,
        Cmd: cmd,
      },
    );
    const { Id: execId } = parseDockerResponse<{ Id: string }>(createResp);

    // Start exec instance
    const startResp = await dockerRequest(
      "POST",
      `/exec/${execId}/start`,
      { Detach: false, Tty: false },
    );

    // Inspect for exit code
    const inspectResp = await dockerRequest("GET", `/exec/${execId}/json`);
    const inspectData = parseDockerResponse<{ ExitCode: number }>(inspectResp);

    return {
      exitCode: inspectData?.ExitCode ?? -1,
      output: stripDockerLogHeaders(startResp.body),
    };
  } catch (err) {
    logger.error({ err, id, cmd }, "Failed to exec in container");
    throw err;
  }
}
