import axios, { AxiosInstance } from 'axios';
import { ContainerHealth, ServiceHealth, PortainerEndpoint, EndpointSummary } from '../../../shared/types';
import { logger } from '../utils/logger';

export class PortainerConnector {
  private client: AxiosInstance;
  private quickClient: AxiosInstance; // short timeout for per-container stats

  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string,
    private readonly endpointId: number = 1,
  ) {
    const headers = { 'X-API-Key': apiToken };
    this.client = axios.create({ baseURL: baseUrl, timeout: 8_000, headers });
    this.quickClient = axios.create({ baseURL: baseUrl, timeout: 3_000, headers });
  }

  // ─── Multi-endpoint listing ───────────────────────────────────────────────

  /** List all Portainer endpoints */
  async listEndpoints(): Promise<PortainerEndpoint[]> {
    try {
      const { data } = await this.client.get('/api/endpoints');
      return (data as Record<string, unknown>[]).map(this.mapEndpoint);
    } catch (err) {
      logger.error('Portainer listEndpoints failed', { err });
      return [];
    }
  }

  /** Full summary for one endpoint: containers + stacks + health stats */
  async getEndpointSummary(endpointId: number): Promise<EndpointSummary | null> {
    const [endpoints, containers, stacks] = await Promise.all([
      this.listEndpoints(),
      this.getContainersForEndpoint(endpointId),
      this.getStacksForEndpoint(endpointId),
    ]);

    const endpoint = endpoints.find((e) => e.id === endpointId);
    if (!endpoint) return null;

    return {
      endpoint: {
        ...endpoint,
        containerCount: containers.length,
        runningContainerCount: containers.filter((c) => c.status === 'running').length,
        stackCount: stacks.length,
      },
      containers,
      stacks,
      runningCount: containers.filter((c) => c.status === 'running').length,
      unhealthyCount: containers.filter((c) => c.health === 'unhealthy').length,
      highMemoryCount: containers.filter((c) => c.memoryPercent > 80).length,
      highCpuCount: containers.filter((c) => c.cpuPercent > 80).length,
    };
  }

  /** Containers for a specific endpoint */
  async getContainersForEndpoint(endpointId: number, endpointName?: string): Promise<ContainerHealth[]> {
    try {
      const { data: containerList } = await this.client.get(
        `/api/endpoints/${endpointId}/docker/containers/json?all=true`
      );
      const healthList = await Promise.all(
        (containerList as Record<string, unknown>[]).map(async (c) => {
          const stats = await this.getContainerStats(endpointId, c.Id as string);
          const inspect = await this.inspectContainer(endpointId, c.Id as string);
          return this.mapContainer(c, stats, inspect, endpointId, endpointName);
        })
      );
      return healthList;
    } catch (err) {
      logger.error(`Portainer getContainersForEndpoint failed for endpoint ${endpointId}`, { err });
      return [];
    }
  }

  /** Stacks for a specific endpoint */
  async getStacksForEndpoint(endpointId: number): Promise<Array<{ id: number; name: string; status: number }>> {
    try {
      const { data } = await this.client.get('/api/stacks', {
        params: { filters: JSON.stringify({ EndpointID: endpointId }) },
      });
      return ((data ?? []) as Record<string, unknown>[]).map((s) => ({
        id: s.Id as number,
        name: s.Name as string,
        status: s.Status as number,
      }));
    } catch (err) {
      logger.error(`Portainer getStacksForEndpoint failed for endpoint ${endpointId}`, { err });
      return [];
    }
  }

  /** Container logs for a specific endpoint */
  async getContainerLogsForEndpoint(endpointId: number, containerId: string, tail = 200): Promise<string> {
    try {
      const { data } = await this.client.get<string>(
        `/api/endpoints/${endpointId}/docker/containers/${containerId}/logs?stderr=true&stdout=true&tail=${tail}`,
        { responseType: 'text' }
      );
      return typeof data === 'string' ? data : '';
    } catch { return ''; }
  }

  /** Restart a container on a specific endpoint */
  async restartContainerOnEndpoint(endpointId: number, containerId: string): Promise<boolean> {
    try {
      await this.client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/restart`);
      return true;
    } catch (err) {
      logger.error(`Portainer restartContainer failed on endpoint ${endpointId}`, { containerId, err });
      return false;
    }
  }

  /** Stop a container on a specific endpoint */
  async stopContainerOnEndpoint(endpointId: number, containerId: string): Promise<boolean> {
    try {
      await this.client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/stop`);
      return true;
    } catch (err) {
      logger.error(`Portainer stopContainer failed on endpoint ${endpointId}`, { containerId, err });
      return false;
    }
  }

  /** Start a stopped/exited container on a specific endpoint */
  async startContainerOnEndpoint(endpointId: number, containerId: string): Promise<boolean> {
    try {
      await this.client.post(`/api/endpoints/${endpointId}/docker/containers/${containerId}/start`);
      return true;
    } catch (err) {
      logger.error(`Portainer startContainer failed on endpoint ${endpointId}`, { containerId, err });
      return false;
    }
  }

  /** Start a stopped stack */
  async startStackOnEndpoint(stackId: number, endpointId: number): Promise<boolean> {
    try {
      await this.client.post(`/api/stacks/${stackId}/start`, null, { params: { endpointId } });
      return true;
    } catch (err) {
      logger.error(`Portainer startStack failed for stack ${stackId}`, { err });
      return false;
    }
  }

  /** Stop a running stack */
  async stopStackOnEndpoint(stackId: number, endpointId: number): Promise<boolean> {
    try {
      await this.client.post(`/api/stacks/${stackId}/stop`, null, { params: { endpointId } });
      return true;
    } catch (err) {
      logger.error(`Portainer stopStack failed for stack ${stackId}`, { err });
      return false;
    }
  }

  // ─── Backward-compat methods (use stored endpointId) ─────────────────────

  async getContainers(): Promise<ContainerHealth[]> {
    return this.getContainersForEndpoint(this.endpointId);
  }

  async getServices(): Promise<ServiceHealth[]> {
    try {
      const { data: services } = await this.client.get(
        `/api/endpoints/${this.endpointId}/docker/services`
      );
      return (services as Record<string, unknown>[]).map((s) => this.mapService(s));
    } catch (err) {
      logger.error('Portainer getServices failed', { err });
      return [];
    }
  }

  async getContainerLogs(containerId: string, tail = 200): Promise<string> {
    return this.getContainerLogsForEndpoint(this.endpointId, containerId, tail);
  }

  async restartContainer(containerId: string): Promise<boolean> {
    return this.restartContainerOnEndpoint(this.endpointId, containerId);
  }

  async getStacks(): Promise<Array<{ id: number; name: string; status: number }>> {
    return this.getStacksForEndpoint(this.endpointId);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getContainerStats(endpointId: number, containerId: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await this.quickClient.get(
        `/api/endpoints/${endpointId}/docker/containers/${containerId}/stats?stream=false`
      );
      return data as Record<string, unknown>;
    } catch { return {}; }
  }

  private async inspectContainer(endpointId: number, containerId: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await this.quickClient.get(
        `/api/endpoints/${endpointId}/docker/containers/${containerId}/json`
      );
      return data as Record<string, unknown>;
    } catch { return {}; }
  }

  private mapEndpoint(e: Record<string, unknown>): PortainerEndpoint {
    return {
      id: e.Id as number,
      name: e.Name as string,
      type: e.Type as number,
      url: e.URL as string ?? '',
      status: (e.Status as number ?? 1) as 1 | 2,
      publicUrl: e.PublicURL as string | undefined,
      groupId: e.GroupID as number ?? 0,
      tags: ((e.TagIDs as number[]) ?? []).map(String),
    };
  }

  private mapContainer(
    c: Record<string, unknown>,
    stats: Record<string, unknown>,
    inspect: Record<string, unknown>,
    endpointId: number,
    endpointName?: string,
  ): ContainerHealth {
    const cpu = this.calcCpuPercent(stats);
    const mem = this.calcMemory(stats);
    const names = (c.Names as string[]) ?? [];
    const restartCount = ((inspect.RestartCount as number) ?? 0);
    const stackName = ((c.Labels as Record<string, string>)?.['com.docker.compose.project'])
      ?? ((c.Labels as Record<string, string>)?.['com.docker.stack.namespace']);

    return {
      id: (c.Id as string).slice(0, 12),
      name: names[0]?.replace(/^\//, '') ?? 'unknown',
      image: (c.Image as string) ?? '',
      status: this.mapStatus(c.State as string),
      health: this.mapHealth((c.Status as string) ?? ''),
      restartCount,
      cpuPercent: cpu,
      memoryUsage: mem.usage,
      memoryLimit: mem.limit,
      memoryPercent: mem.percent,
      networkRx: this.calcNetworkRx(stats),
      networkTx: this.calcNetworkTx(stats),
      created: new Date((c.Created as number) * 1000).toISOString(),
      portainer: { endpointId, endpointName, stackName },
    };
  }

  private mapService(s: Record<string, unknown>): ServiceHealth {
    const spec = (s.Spec as Record<string, unknown>) ?? {};
    const replicas = (spec.Mode as Record<string, unknown>)?.Replicated as Record<string, unknown>;
    return {
      id: s.ID as string,
      name: (spec.Name as string) ?? 'unknown',
      replicas: (replicas?.Replicas as number) ?? 0,
      runningReplicas: 0,
      image: (((spec.TaskTemplate as Record<string, unknown>)?.ContainerSpec as Record<string, unknown>)?.Image as string) ?? '',
      updatedAt: (s.UpdatedAt as string) ?? new Date().toISOString(),
      containers: [],
    };
  }

  private mapStatus(state: string): ContainerHealth['status'] {
    const m: Record<string, ContainerHealth['status']> = {
      running: 'running', exited: 'exited', paused: 'paused', restarting: 'restarting',
    };
    return m[state?.toLowerCase()] ?? 'stopped';
  }

  private mapHealth(statusText: string): ContainerHealth['health'] {
    if (statusText.includes('healthy') && !statusText.includes('unhealthy')) return 'healthy';
    if (statusText.includes('unhealthy')) return 'unhealthy';
    if (statusText.includes('starting')) return 'starting';
    return 'none';
  }

  private calcCpuPercent(stats: Record<string, unknown>): number {
    try {
      const cpu = stats.cpu_stats as Record<string, unknown>;
      const preCpu = stats.precpu_stats as Record<string, unknown>;
      const cpuUsage = (cpu.cpu_usage as Record<string, unknown>).total_usage as number;
      const preCpuUsage = (preCpu.cpu_usage as Record<string, unknown>).total_usage as number;
      const cpuDelta = cpuUsage - preCpuUsage;
      const sysDelta = (cpu.system_cpu_usage as number) - (preCpu.system_cpu_usage as number);
      const numCpus = (cpu.online_cpus as number) ?? 1;
      return sysDelta > 0 ? (cpuDelta / sysDelta) * numCpus * 100 : 0;
    } catch { return 0; }
  }

  private calcMemory(stats: Record<string, unknown>): { usage: number; limit: number; percent: number } {
    try {
      const mem = stats.memory_stats as Record<string, unknown>;
      const cache = ((mem.stats as Record<string, number>)?.cache) ?? 0;
      const usage = (mem.usage as number) - cache;
      const limit = mem.limit as number;
      return { usage, limit, percent: limit > 0 ? (usage / limit) * 100 : 0 };
    } catch { return { usage: 0, limit: 0, percent: 0 }; }
  }

  private calcNetworkRx(stats: Record<string, unknown>): number {
    try {
      const networks = stats.networks as Record<string, Record<string, number>>;
      return Object.values(networks).reduce((sum, n) => sum + (n.rx_bytes ?? 0), 0);
    } catch { return 0; }
  }

  private calcNetworkTx(stats: Record<string, unknown>): number {
    try {
      const networks = stats.networks as Record<string, Record<string, number>>;
      return Object.values(networks).reduce((sum, n) => sum + (n.tx_bytes ?? 0), 0);
    } catch { return 0; }
  }
}
