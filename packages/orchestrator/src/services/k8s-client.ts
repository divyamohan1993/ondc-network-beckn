import * as k8s from "@kubernetes/client-node";
import { Readable } from "node:stream";
import { createLogger } from "@ondc/shared";

const logger = createLogger("k8s-client");

// ---------------------------------------------------------------------------
// Types (identical to docker-client.ts for drop-in compatibility)
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
// Kubernetes client initialisation
// ---------------------------------------------------------------------------

const LABEL_SELECTOR = "app.kubernetes.io/part-of=ondc";

const K8S_NAMESPACE = process.env["K8S_NAMESPACE"] ?? "ondc";
const K8S_INFRA_NAMESPACE = process.env["K8S_INFRA_NAMESPACE"] ?? "ondc-infra";
const K8S_SIMULATION_NAMESPACE = process.env["K8S_SIMULATION_NAMESPACE"] ?? "ondc-simulation";

const ALL_NAMESPACES = [K8S_NAMESPACE, K8S_INFRA_NAMESPACE, K8S_SIMULATION_NAMESPACE];

const kc = new k8s.KubeConfig();

try {
  // Prefer in-cluster config (service account mounted at /var/run/secrets/kubernetes.io)
  kc.loadFromCluster();
  logger.info("Loaded Kubernetes config from in-cluster service account");
} catch {
  // Fall back to default kubeconfig (~/.kube/config) for local development
  kc.loadFromDefault();
  logger.info("Loaded Kubernetes config from default kubeconfig");
}

const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sExec = new k8s.Exec(kc);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the namespace for a given pod ID.
 * Pod IDs are encoded as `namespace/podName` to preserve namespace context.
 */
function parsePodId(id: string): { namespace: string; name: string } {
  const slashIdx = id.indexOf("/");
  if (slashIdx > 0) {
    return {
      namespace: id.substring(0, slashIdx),
      name: id.substring(slashIdx + 1),
    };
  }
  // If no namespace prefix, assume the primary namespace
  return { namespace: K8S_NAMESPACE, name: id };
}

/**
 * Encode a pod reference into a stable ID string: `namespace/podName`.
 */
function encodePodId(namespace: string, name: string): string {
  return `${namespace}/${name}`;
}

/**
 * Map a Kubernetes pod phase to a Docker-like container state string.
 */
function mapPodPhaseToState(phase: string | undefined): string {
  switch (phase) {
    case "Running":
      return "running";
    case "Pending":
      return "created";
    case "Succeeded":
      return "exited";
    case "Failed":
      return "dead";
    case "Unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * Build a human-readable status string from pod conditions and container statuses,
 * similar to `kubectl get pods` STATUS column.
 */
function buildPodStatus(pod: k8s.V1Pod): string {
  const phase = pod.status?.phase ?? "Unknown";
  const containerStatuses = pod.status?.containerStatuses ?? [];

  // Check for waiting containers (e.g. CrashLoopBackOff, ImagePullBackOff)
  for (const cs of containerStatuses) {
    if (cs.state?.waiting?.reason) {
      return cs.state.waiting.reason;
    }
  }

  // Check for terminated containers
  for (const cs of containerStatuses) {
    if (cs.state?.terminated?.reason) {
      return cs.state.terminated.reason;
    }
  }

  const readyCount = containerStatuses.filter((c) => c.ready).length;
  const totalCount = containerStatuses.length;

  if (phase === "Running" && totalCount > 0) {
    return `Running (${readyCount}/${totalCount} ready)`;
  }

  return phase;
}

/**
 * Extract container ports from pod spec.
 */
function extractPorts(pod: k8s.V1Pod): ContainerPort[] {
  const ports: ContainerPort[] = [];
  for (const container of pod.spec?.containers ?? []) {
    for (const port of container.ports ?? []) {
      ports.push({
        IP: pod.status?.podIP ?? "0.0.0.0",
        PrivatePort: port.containerPort,
        PublicPort: port.hostPort,
        Type: (port.protocol ?? "TCP").toLowerCase(),
      });
    }
  }
  return ports;
}

/**
 * Extract volume mounts mapped to ContainerMount from pod spec.
 */
function extractMounts(pod: k8s.V1Pod): ContainerMount[] {
  const mounts: ContainerMount[] = [];
  for (const container of pod.spec?.containers ?? []) {
    for (const vm of container.volumeMounts ?? []) {
      mounts.push({
        Type: "volume",
        Source: vm.name,
        Destination: vm.mountPath,
        Mode: vm.readOnly ? "ro" : "rw",
        RW: !vm.readOnly,
      });
    }
  }
  return mounts;
}

/**
 * Convert a V1Pod to the ContainerInfo interface.
 */
function podToContainerInfo(pod: k8s.V1Pod): ContainerInfo {
  const namespace = pod.metadata?.namespace ?? K8S_NAMESPACE;
  const name = pod.metadata?.name ?? "unknown";
  const labels = (pod.metadata?.labels ?? {}) as Record<string, string>;
  const createdAt = pod.metadata?.creationTimestamp
    ? new Date(pod.metadata.creationTimestamp).getTime() / 1000
    : 0;

  // Use the first container's image as the representative image
  const image = pod.spec?.containers?.[0]?.image ?? "unknown";

  const podIP = pod.status?.podIP ?? "";
  const networks: Record<string, ContainerNetwork> = {};
  if (podIP) {
    networks["pod-network"] = {
      IPAddress: podIP,
      Gateway: "",
      MacAddress: "",
    };
  }

  return {
    Id: encodePodId(namespace, name),
    Names: [`/${name}`],
    Image: image,
    State: mapPodPhaseToState(pod.status?.phase),
    Status: buildPodStatus(pod),
    Created: createdAt,
    Ports: extractPorts(pod),
    Labels: labels,
    NetworkSettings: {
      Networks: networks,
    },
  };
}

/**
 * Convert a V1Pod to the ContainerDetail interface.
 */
function podToContainerDetail(pod: k8s.V1Pod): ContainerDetail {
  const namespace = pod.metadata?.namespace ?? K8S_NAMESPACE;
  const name = pod.metadata?.name ?? "unknown";
  const labels = (pod.metadata?.labels ?? {}) as Record<string, string>;
  const phase = pod.status?.phase ?? "Unknown";
  const isRunning = phase === "Running";

  const mainContainer = pod.spec?.containers?.[0];
  const mainContainerStatus = pod.status?.containerStatuses?.[0];

  const podIP = pod.status?.podIP ?? "";
  const networks: Record<string, ContainerNetwork> = {};
  if (podIP) {
    networks["pod-network"] = {
      IPAddress: podIP,
      Gateway: "",
      MacAddress: "",
    };
  }

  // Determine exit code and error from container status
  let exitCode = 0;
  let errorMsg = "";
  if (mainContainerStatus?.state?.terminated) {
    exitCode = mainContainerStatus.state.terminated.exitCode ?? 0;
    errorMsg = mainContainerStatus.state.terminated.reason ?? "";
  }

  // Determine started/finished timestamps
  let startedAt = "";
  let finishedAt = "";
  if (mainContainerStatus?.state?.running?.startedAt) {
    startedAt = new Date(mainContainerStatus.state.running.startedAt).toISOString();
  }
  if (mainContainerStatus?.state?.terminated?.startedAt) {
    startedAt = new Date(mainContainerStatus.state.terminated.startedAt).toISOString();
  }
  if (mainContainerStatus?.state?.terminated?.finishedAt) {
    finishedAt = new Date(mainContainerStatus.state.terminated.finishedAt).toISOString();
  }

  return {
    Id: encodePodId(namespace, name),
    Name: `/${name}`,
    Created: pod.metadata?.creationTimestamp
      ? new Date(pod.metadata.creationTimestamp).toISOString()
      : "",
    State: {
      Status: mapPodPhaseToState(phase),
      Running: isRunning,
      Paused: false, // Kubernetes does not have a "paused" container state
      Restarting: phase === "Pending" && (mainContainerStatus?.restartCount ?? 0) > 0,
      OOMKilled:
        mainContainerStatus?.state?.terminated?.reason === "OOMKilled" ||
        mainContainerStatus?.lastState?.terminated?.reason === "OOMKilled",
      Dead: phase === "Failed",
      Pid: 0, // PID is not exposed via Kubernetes API
      ExitCode: exitCode,
      Error: errorMsg,
      StartedAt: startedAt,
      FinishedAt: finishedAt,
    },
    Config: {
      Image: mainContainer?.image ?? "unknown",
      Env: (mainContainer?.env ?? []).map(
        (e) => `${e.name}=${e.value ?? ""}`,
      ),
      Labels: labels,
      Hostname: pod.spec?.hostname ?? name,
    },
    NetworkSettings: {
      Networks: networks,
    },
    Mounts: extractMounts(pod),
    RestartCount: mainContainerStatus?.restartCount ?? 0,
  };
}

/**
 * Find the owning Deployment name for a pod by traversing owner references.
 * Pods are typically owned by a ReplicaSet which is owned by a Deployment.
 */
async function findOwnerDeployment(
  namespace: string,
  pod: k8s.V1Pod,
): Promise<{ name: string; namespace: string } | null> {
  const ownerRefs = pod.metadata?.ownerReferences ?? [];

  // Direct Deployment owner (rare but possible)
  const deploymentRef = ownerRefs.find((o) => o.kind === "Deployment");
  if (deploymentRef) {
    return { name: deploymentRef.name, namespace };
  }

  // ReplicaSet owner -> look up its Deployment owner
  const rsRef = ownerRefs.find((o) => o.kind === "ReplicaSet");
  if (rsRef) {
    try {
      const rs = await appsApi.readNamespacedReplicaSet({
        name: rsRef.name,
        namespace,
      });
      const rsOwners = rs.metadata?.ownerReferences ?? [];
      const depRef = rsOwners.find((o) => o.kind === "Deployment");
      if (depRef) {
        return { name: depRef.name, namespace };
      }
    } catch (err) {
      logger.warn({ err, replicaSet: rsRef.name, namespace }, "Failed to look up ReplicaSet owner");
    }
  }

  return null;
}

/**
 * Fetch pod metrics from the metrics.k8s.io API.
 * Returns null if the Metrics Server is unavailable.
 */
interface PodMetricsContainer {
  name: string;
  usage: {
    cpu: string;
    memory: string;
  };
}

interface PodMetricsResponse {
  metadata: { name: string; namespace: string };
  timestamp: string;
  containers: PodMetricsContainer[];
}

async function fetchPodMetrics(
  namespace: string,
  podName: string,
): Promise<PodMetricsResponse | null> {
  try {
    const metricsPath = `/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods/${podName}`;
    const requestOpts: Record<string, unknown> = { headers: {} };
    await kc.applyToHTTPSOptions(requestOpts as Parameters<typeof kc.applyToHTTPSOptions>[0]);

    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      logger.warn("No current cluster in kubeconfig");
      return null;
    }

    const response = await fetch(`${cluster.server}${metricsPath}`, {
      headers: requestOpts["headers"] as Record<string, string>,
    });

    if (!response.ok) {
      logger.debug(
        { status: response.status, podName, namespace },
        "Metrics API returned non-OK status",
      );
      return null;
    }

    return (await response.json()) as PodMetricsResponse;
  } catch (err) {
    logger.debug({ err, podName, namespace }, "Metrics API unavailable");
    return null;
  }
}

/**
 * Parse Kubernetes CPU resource string (e.g. "250m", "1", "500n") to nanocores.
 */
function parseCpuToNanocores(cpu: string): number {
  if (cpu.endsWith("n")) {
    return parseInt(cpu.slice(0, -1), 10) || 0;
  }
  if (cpu.endsWith("m")) {
    return (parseInt(cpu.slice(0, -1), 10) || 0) * 1_000_000;
  }
  // Whole cores
  return (parseFloat(cpu) || 0) * 1_000_000_000;
}

/**
 * Parse Kubernetes memory resource string (e.g. "128Mi", "1Gi", "512Ki") to bytes.
 */
function parseMemoryToBytes(mem: string): number {
  const units: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
  };

  for (const [suffix, multiplier] of Object.entries(units)) {
    if (mem.endsWith(suffix)) {
      return (parseInt(mem.slice(0, -suffix.length), 10) || 0) * multiplier;
    }
  }

  // Plain bytes
  return parseInt(mem, 10) || 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List pods across ONDC namespaces.
 * Optionally filter by name patterns or label selectors.
 */
export async function listContainers(
  filters?: { name?: string[]; label?: string[] },
): Promise<ContainerInfo[]> {
  try {
    const allPods: ContainerInfo[] = [];

    // Build label selector: always include the base ONDC selector
    const labelParts = [LABEL_SELECTOR];
    if (filters?.label) {
      labelParts.push(...filters.label);
    }
    const labelSelector = labelParts.join(",");

    for (const ns of ALL_NAMESPACES) {
      try {
        const response = await coreApi.listNamespacedPod({
          namespace: ns,
          labelSelector,
        });
        const pods = response.items ?? [];

        for (const pod of pods) {
          const info = podToContainerInfo(pod);

          // Apply name filter if provided
          if (filters?.name && filters.name.length > 0) {
            const podName = pod.metadata?.name ?? "";
            const matches = filters.name.some((pattern) => podName.includes(pattern));
            if (!matches) continue;
          }

          allPods.push(info);
        }
      } catch (err) {
        logger.warn({ err, namespace: ns }, "Failed to list pods in namespace");
      }
    }

    return allPods;
  } catch (err) {
    logger.error({ err }, "Failed to list containers (pods)");
    return [];
  }
}

/**
 * List pods belonging to the ONDC project.
 * Equivalent to listing by docker-compose project label.
 */
export async function listProjectContainers(
  projectName: string,
): Promise<ContainerInfo[]> {
  return listContainers({
    label: [`app.kubernetes.io/instance=${projectName}`],
  });
}

/**
 * Get detailed information about a specific pod.
 */
export async function inspectContainer(id: string): Promise<ContainerDetail> {
  const { namespace, name } = parsePodId(id);
  try {
    const pod = await coreApi.readNamespacedPod({ name, namespace });
    return podToContainerDetail(pod);
  } catch (err) {
    logger.error({ err, id }, "Failed to inspect pod");
    throw new Error(`Failed to inspect pod ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Start a pod by scaling its parent Deployment replicas from 0 to 1.
 */
export async function startContainer(id: string): Promise<void> {
  const { namespace, name } = parsePodId(id);
  try {
    // Find the owning Deployment
    const pod = await coreApi.readNamespacedPod({ name, namespace });
    const owner = await findOwnerDeployment(namespace, pod);

    if (!owner) {
      throw new Error(`Pod ${id} has no owning Deployment; cannot scale up`);
    }

    // Read current replicas
    const deployment = await appsApi.readNamespacedDeployment({
      name: owner.name,
      namespace: owner.namespace,
    });
    const currentReplicas = deployment.spec?.replicas ?? 0;

    if (currentReplicas > 0) {
      logger.info({ id, deployment: owner.name }, "Deployment already has running replicas");
      return;
    }

    // Scale to 1
    await appsApi.patchNamespacedDeploymentScale({
      name: owner.name,
      namespace: owner.namespace,
      body: { spec: { replicas: 1 } },
    }, { headers: { "Content-Type": "application/strategic-merge-patch+json" } });

    logger.info({ id, deployment: owner.name }, "Deployment scaled to 1 replica");
  } catch (err) {
    logger.error({ err, id }, "Failed to start container (scale deployment)");
    throw err;
  }
}

/**
 * Stop a pod by scaling its parent Deployment replicas to 0.
 */
export async function stopContainer(id: string, _timeout = 10): Promise<void> {
  const { namespace, name } = parsePodId(id);
  try {
    const pod = await coreApi.readNamespacedPod({ name, namespace });
    const owner = await findOwnerDeployment(namespace, pod);

    if (!owner) {
      throw new Error(`Pod ${id} has no owning Deployment; cannot scale down`);
    }

    const deployment = await appsApi.readNamespacedDeployment({
      name: owner.name,
      namespace: owner.namespace,
    });
    const currentReplicas = deployment.spec?.replicas ?? 0;

    if (currentReplicas === 0) {
      logger.info({ id, deployment: owner.name }, "Deployment already scaled to 0");
      return;
    }

    // Scale to 0
    await appsApi.patchNamespacedDeploymentScale({
      name: owner.name,
      namespace: owner.namespace,
      body: { spec: { replicas: 0 } },
    }, { headers: { "Content-Type": "application/strategic-merge-patch+json" } });

    logger.info({ id, deployment: owner.name }, "Deployment scaled to 0 replicas");
  } catch (err) {
    logger.error({ err, id }, "Failed to stop container (scale deployment)");
    throw err;
  }
}

/**
 * Restart a pod by patching its parent Deployment with a restart annotation.
 * Equivalent to `kubectl rollout restart deployment/<name>`.
 */
export async function restartContainer(id: string, _timeout = 10): Promise<void> {
  const { namespace, name } = parsePodId(id);
  try {
    const pod = await coreApi.readNamespacedPod({ name, namespace });
    const owner = await findOwnerDeployment(namespace, pod);

    if (!owner) {
      // Fallback: delete the pod directly and let its controller recreate it
      logger.warn({ id }, "No owning Deployment found; deleting pod directly for restart");
      await coreApi.deleteNamespacedPod({ name, namespace });
      logger.info({ id }, "Pod deleted for restart");
      return;
    }

    // Patch the Deployment's pod template with a restart annotation
    const restartPatch = {
      spec: {
        template: {
          metadata: {
            annotations: {
              "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
            },
          },
        },
      },
    };

    await appsApi.patchNamespacedDeployment({
      name: owner.name,
      namespace: owner.namespace,
      body: restartPatch,
    }, { headers: { "Content-Type": "application/strategic-merge-patch+json" } });

    logger.info({ id, deployment: owner.name }, "Deployment rolling restart triggered");
  } catch (err) {
    logger.error({ err, id }, "Failed to restart container");
    throw err;
  }
}

/**
 * Retrieve pod logs.
 */
export async function getContainerLogs(
  id: string,
  tail = 100,
  since?: number,
): Promise<string> {
  const { namespace, name } = parsePodId(id);
  try {
    const options: {
      name: string;
      namespace: string;
      tailLines?: number;
      sinceSeconds?: number;
    } = {
      name,
      namespace,
      tailLines: tail,
    };

    if (since !== undefined) {
      // `since` in docker-client is a Unix timestamp; convert to sinceSeconds
      const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000) - since);
      options.sinceSeconds = secondsAgo;
    }

    const logResponse = await coreApi.readNamespacedPodLog(options);

    // The K8s client may return the log as a string directly
    if (typeof logResponse === "string") {
      return logResponse.trim();
    }

    // Some versions return an object; coerce to string
    return String(logResponse).trim();
  } catch (err) {
    logger.error({ err, id }, "Failed to get pod logs");
    throw new Error(`Failed to get logs for pod ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Get resource usage stats for a pod.
 * Uses the metrics.k8s.io API (requires Metrics Server).
 * Returns zeroed stats if the Metrics Server is unavailable.
 */
export async function getContainerStats(id: string): Promise<ContainerStats> {
  const { namespace, name } = parsePodId(id);

  const zeroStats: ContainerStats = {
    cpuPercent: 0,
    memoryUsageMb: 0,
    memoryLimitMb: 0,
    memoryPercent: 0,
    networkRxMb: 0,
    networkTxMb: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const metrics = await fetchPodMetrics(namespace, name);
    if (!metrics || !metrics.containers || metrics.containers.length === 0) {
      logger.debug({ id }, "No metrics available; returning zero stats");
      return zeroStats;
    }

    // Aggregate CPU and memory across all containers in the pod
    let totalCpuNanocores = 0;
    let totalMemoryBytes = 0;
    for (const container of metrics.containers) {
      totalCpuNanocores += parseCpuToNanocores(container.usage.cpu);
      totalMemoryBytes += parseMemoryToBytes(container.usage.memory);
    }

    // Fetch resource limits from the pod spec for memory percentage
    let memoryLimitBytes = 0;
    try {
      const pod = await coreApi.readNamespacedPod({ name, namespace });
      for (const container of pod.spec?.containers ?? []) {
        const limitMem = container.resources?.limits?.["memory"];
        if (limitMem) {
          memoryLimitBytes += parseMemoryToBytes(limitMem);
        }
      }
    } catch {
      // If we cannot read the pod, just skip limit calculation
    }

    // CPU: nanocores -> percentage of one core (1 core = 1_000_000_000 nanocores)
    const cpuPercent = (totalCpuNanocores / 1_000_000_000) * 100;
    const memoryUsageMb = totalMemoryBytes / (1024 * 1024);
    const memoryLimitMb = memoryLimitBytes / (1024 * 1024);
    const memoryPercent = memoryLimitMb > 0 ? (memoryUsageMb / memoryLimitMb) * 100 : 0;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMb: Math.round(memoryUsageMb * 100) / 100,
      memoryLimitMb: Math.round(memoryLimitMb * 100) / 100,
      memoryPercent: Math.round(memoryPercent * 100) / 100,
      networkRxMb: 0, // Network stats not available via metrics API
      networkTxMb: 0,
      timestamp: metrics.timestamp ?? new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err, id }, "Failed to get container stats");
    return zeroStats;
  }
}

/**
 * Remove (delete) a pod.
 * If force is true, sets gracePeriodSeconds to 0.
 */
export async function removeContainer(id: string, force = false): Promise<void> {
  const { namespace, name } = parsePodId(id);
  try {
    const deleteOptions: {
      name: string;
      namespace: string;
      gracePeriodSeconds?: number;
    } = { name, namespace };

    if (force) {
      deleteOptions.gracePeriodSeconds = 0;
    }

    await coreApi.deleteNamespacedPod(deleteOptions);
    logger.info({ id, force }, "Pod deleted");
  } catch (err) {
    logger.error({ err, id }, "Failed to remove pod");
    throw new Error(`Failed to remove pod ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Prune completed and failed pods across ONDC namespaces.
 */
export async function pruneContainers(): Promise<PruneResult> {
  const deleted: string[] = [];

  try {
    for (const ns of ALL_NAMESPACES) {
      try {
        // List pods that have Succeeded or Failed
        const succeededResponse = await coreApi.listNamespacedPod({
          namespace: ns,
          labelSelector: LABEL_SELECTOR,
          fieldSelector: "status.phase=Succeeded",
        });

        const failedResponse = await coreApi.listNamespacedPod({
          namespace: ns,
          labelSelector: LABEL_SELECTOR,
          fieldSelector: "status.phase=Failed",
        });

        const podsToDelete = [
          ...(succeededResponse.items ?? []),
          ...(failedResponse.items ?? []),
        ];

        for (const pod of podsToDelete) {
          const podName = pod.metadata?.name;
          if (!podName) continue;
          try {
            await coreApi.deleteNamespacedPod({ name: podName, namespace: ns });
            const podId = encodePodId(ns, podName);
            deleted.push(podId);
          } catch (deleteErr) {
            logger.warn({ err: deleteErr, pod: podName, namespace: ns }, "Failed to delete pod during prune");
          }
        }
      } catch (err) {
        logger.warn({ err, namespace: ns }, "Failed to list pods for pruning in namespace");
      }
    }

    logger.info({ count: deleted.length }, "Pruned completed/failed pods");
    return { deleted };
  } catch (err) {
    logger.error({ err }, "Failed to prune containers (pods)");
    return { deleted: [] };
  }
}

/**
 * Prune unbound PersistentVolumeClaims across ONDC namespaces.
 */
export async function pruneVolumes(): Promise<{ deleted: string[] }> {
  const deleted: string[] = [];

  try {
    for (const ns of ALL_NAMESPACES) {
      try {
        const response = await coreApi.listNamespacedPersistentVolumeClaim({
          namespace: ns,
          labelSelector: LABEL_SELECTOR,
        });

        const pvcs = response.items ?? [];
        for (const pvc of pvcs) {
          // Only delete PVCs that are not bound (Available, Released, or Lost)
          const phase = pvc.status?.phase;
          if (phase === "Bound") continue;

          const pvcName = pvc.metadata?.name;
          if (!pvcName) continue;

          try {
            await coreApi.deleteNamespacedPersistentVolumeClaim({
              name: pvcName,
              namespace: ns,
            });
            deleted.push(encodePodId(ns, pvcName));
          } catch (deleteErr) {
            logger.warn(
              { err: deleteErr, pvc: pvcName, namespace: ns },
              "Failed to delete PVC during prune",
            );
          }
        }
      } catch (err) {
        logger.warn({ err, namespace: ns }, "Failed to list PVCs for pruning in namespace");
      }
    }

    logger.info({ count: deleted.length }, "Pruned unbound PVCs");
    return { deleted };
  } catch (err) {
    logger.error({ err }, "Failed to prune volumes (PVCs)");
    return { deleted: [] };
  }
}

/**
 * Run a command inside a running pod's first container.
 * Uses the Kubernetes WebSocket-based command execution API.
 */
export async function execInContainer(
  id: string,
  cmd: string[],
): Promise<{ exitCode: number; output: string }> {
  const { namespace, name } = parsePodId(id);

  try {
    // Read the pod to determine the first container name
    const pod = await coreApi.readNamespacedPod({ name, namespace });
    const containerName = pod.spec?.containers?.[0]?.name;
    if (!containerName) {
      throw new Error(`Pod ${id} has no containers`);
    }

    // Set up stdout/stderr collection via writable streams
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    const stdoutStream = new Readable({
      read() {
        // no-op; data is pushed by the WebSocket handler
      },
    });
    const stderrStream = new Readable({
      read() {
        // no-op
      },
    });

    stdoutStream.on("data", (chunk: Buffer) => stdoutChunks.push(Buffer.from(chunk)));
    stderrStream.on("data", (chunk: Buffer) => stderrChunks.push(Buffer.from(chunk)));

    // Run the command via the Kubernetes exec API
    const execStatus = await new Promise<k8s.V1Status>((resolve, reject) => {
      k8sExec
        .exec(
          namespace,
          name,
          containerName,
          cmd,
          stdoutStream as unknown as NodeJS.WritableStream,
          stderrStream as unknown as NodeJS.WritableStream,
          null, // stdin
          false, // tty
          (status: k8s.V1Status) => {
            resolve(status);
          },
        )
        .catch(reject);
    });

    const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
    const stderr = Buffer.concat(stderrChunks).toString("utf-8");
    const output = (stdout + stderr).trim();

    // Parse exit code from V1Status
    let exitCode = 0;
    if (execStatus.status !== "Success") {
      exitCode = 1;
      // Try to extract actual exit code from details
      const causes = execStatus.details?.causes ?? [];
      for (const cause of causes) {
        if (cause.reason === "ExitCode" && cause.message) {
          exitCode = parseInt(cause.message, 10) || 1;
        }
      }
    }

    return { exitCode, output };
  } catch (err) {
    logger.error({ err, id, cmd }, "Failed to run command in pod");
    throw new Error(
      `Failed to run command in pod ${id}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
