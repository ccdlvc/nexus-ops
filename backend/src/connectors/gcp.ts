import { google, type Auth } from 'googleapis';
import {
  GCPInstance, GKECluster, CloudRunService,
  GCPLogEntry, GCPTimeSeries, GCPMetricPoint,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class GCPConnector {
  private readonly projectId: string;
  private readonly auth: Auth.GoogleAuth;

  constructor(
    projectId: string,
    clientEmail?: string,
    privateKey?: string,
  ) {
    this.projectId = projectId;

    // If explicit service-account fields are provided, use them.
    // Otherwise fall back to Application Default Credentials
    // (GOOGLE_APPLICATION_CREDENTIALS env var or GCE metadata server).
    this.auth = new google.auth.GoogleAuth({
      credentials: clientEmail && privateKey
        ? { client_email: clientEmail, private_key: privateKey.replace(/\\n/g, '\n') }
        : undefined,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  // ─── Compute Engine ──────────────────────────────────────────────────────────

  /** List all VM instances across all zones in the project. */
  async listInstances(): Promise<GCPInstance[]> {
    try {
      const compute = google.compute({ version: 'v1', auth: this.auth });
      const { data } = await compute.instances.aggregatedList({ project: this.projectId, maxResults: 500 });
      const instances: GCPInstance[] = [];
      for (const [, zoneData] of Object.entries(data.items ?? {})) {
        for (const inst of (zoneData as Record<string, unknown[]>).instances ?? []) {
          instances.push(this.mapInstance(inst as Record<string, unknown>));
        }
      }
      return instances;
    } catch (err) {
      logger.error('GCP listInstances failed', { err });
      return [];
    }
  }

  // ─── GKE ─────────────────────────────────────────────────────────────────────

  /** List all GKE clusters in the project. */
  async listClusters(): Promise<GKECluster[]> {
    try {
      const container = google.container({ version: 'v1', auth: this.auth });
      const { data } = await container.projects.locations.clusters.list({
        parent: `projects/${this.projectId}/locations/-`,
      });
      return (data.clusters ?? []).map((c) => this.mapCluster(c as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('GCP listClusters failed', { err });
      return [];
    }
  }

  // ─── Cloud Run ───────────────────────────────────────────────────────────────

  /** List Cloud Run services for a specific region. */
  async listRunServices(region: string): Promise<CloudRunService[]> {
    try {
      const run = google.run({ version: 'v1', auth: this.auth });
      const { data } = await run.projects.locations.services.list({
        parent: `projects/${this.projectId}/locations/${region}`,
      });
      return ((data as Record<string, unknown>).items as Record<string, unknown>[] ?? [])
        .map((s) => this.mapRunService(s, region));
    } catch (err) {
      logger.error('GCP listRunServices failed', { region, err });
      return [];
    }
  }

  // ─── Cloud Monitoring ────────────────────────────────────────────────────────

  /**
   * Query time series from Cloud Monitoring.
   * @param filter  - Monitoring filter string, e.g. 'metric.type="compute.googleapis.com/instance/cpu/utilization"'
   * @param hours   - Look-back window in hours (default 1)
   * @param aligner - Alignment reducer, e.g. 'ALIGN_MEAN' (default)
   */
  async queryTimeSeries(filter: string, hours: number = 1, aligner = 'ALIGN_MEAN'): Promise<GCPTimeSeries[]> {
    try {
      const monitoring = google.monitoring({ version: 'v3', auth: this.auth });
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - hours * 3_600_000).toISOString();
      const { data } = await monitoring.projects.timeSeries.list({
        name: `projects/${this.projectId}`,
        filter,
        'interval.startTime': startTime,
        'interval.endTime': endTime,
        'aggregation.alignmentPeriod': `${Math.max(60, Math.floor(hours * 360))}s`,
        'aggregation.perSeriesAligner': aligner,
      });
      return ((data as Record<string, unknown>).timeSeries as Record<string, unknown>[] ?? [])
        .map(this.mapTimeSeries.bind(this));
    } catch (err) {
      logger.error('GCP queryTimeSeries failed', { filter, err });
      return [];
    }
  }

  // ─── Cloud Logging ───────────────────────────────────────────────────────────

  /**
   * List log entries matching a filter.
   * @param filter - Logging filter, e.g. 'severity>=ERROR'
   * @param limit  - Max entries (default 100)
   * @param hours  - Look-back window in hours (default 1)
   */
  async listLogEntries(filter: string = 'severity>=ERROR', limit: number = 100, hours: number = 1): Promise<GCPLogEntry[]> {
    try {
      const logging = google.logging({ version: 'v2', auth: this.auth });
      const timestamp = new Date(Date.now() - hours * 3_600_000).toISOString();
      const timeFilter = `timestamp>="${timestamp}" ${filter ? `AND (${filter})` : ''}`.trim();
      const { data } = await logging.entries.list({
        requestBody: {
          resourceNames: [`projects/${this.projectId}`],
          filter: timeFilter,
          orderBy: 'timestamp desc',
          pageSize: limit,
        },
      });
      return ((data as Record<string, unknown>).entries as Record<string, unknown>[] ?? [])
        .map(this.mapLogEntry.bind(this));
    } catch (err) {
      logger.error('GCP listLogEntries failed', { filter, err });
      return [];
    }
  }

  // ─── Private mappers ─────────────────────────────────────────────────────────

  private mapInstance(inst: Record<string, unknown>): GCPInstance {
    const zone = (inst.zone as string ?? '').split('/').pop() ?? '';
    const machineType = (inst.machineType as string ?? '').split('/').pop() ?? '';
    const nics = (inst.networkInterfaces as Record<string, unknown>[] ?? []);
    const firstNic = nics[0] ?? {};
    const accessConfigs = (firstNic.accessConfigs as Record<string, unknown>[] ?? []);
    const publicIp = accessConfigs[0]?.natIP as string | undefined;

    return {
      id: String(inst.id ?? ''),
      name: inst.name as string ?? '',
      zone,
      machineType,
      status: inst.status as GCPInstance['status'] ?? 'TERMINATED',
      networkIp: firstNic.networkIP as string | undefined,
      publicIp,
      labels: (inst.labels as Record<string, string> ?? {}),
      creationTimestamp: inst.creationTimestamp as string ?? '',
    };
  }

  private mapCluster(c: Record<string, unknown>): GKECluster {
    return {
      name: c.name as string ?? '',
      location: c.location as string ?? '',
      status: c.status as string ?? '',
      currentMasterVersion: c.currentMasterVersion as string ?? '',
      currentNodeCount: c.currentNodeCount as number ?? 0,
      nodePoolCount: (c.nodePools as unknown[] ?? []).length,
      endpoint: c.endpoint as string ?? '',
      createTime: c.createTime as string ?? '',
    };
  }

  private mapRunService(s: Record<string, unknown>, region: string): CloudRunService {
    const meta = s.metadata as Record<string, unknown> ?? {};
    const status = s.status as Record<string, unknown> ?? {};
    const name = (meta.name as string ?? '').split('/').pop() ?? meta.name as string ?? '';
    const conditions = (status.conditions as Record<string, unknown>[] ?? []);
    const ready = conditions.find((c) => c.type === 'Ready');
    return {
      name,
      region,
      status: ready?.status === 'True' ? 'Ready' : (ready?.message as string ?? 'Unknown'),
      url: status.url as string | undefined,
      latestReadyRevision: status.latestReadyRevisionName as string | undefined,
      latestCreatedRevision: status.latestCreatedRevisionName as string | undefined,
    };
  }

  private mapTimeSeries(ts: Record<string, unknown>): GCPTimeSeries {
    const metric = ts.metric as Record<string, unknown> ?? {};
    const resource = ts.resource as Record<string, unknown> ?? {};
    const points: GCPMetricPoint[] = (ts.points as Record<string, unknown>[] ?? []).map((p) => {
      const interval = p.interval as Record<string, unknown> ?? {};
      const value = p.value as Record<string, unknown> ?? {};
      const raw = value.doubleValue ?? value.int64Value ?? value.boolValue ?? 0;
      return {
        startTime: interval.startTime as string ?? '',
        endTime: interval.endTime as string ?? '',
        value: typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw),
      };
    });
    return {
      metric: {
        type: metric.type as string ?? '',
        labels: metric.labels as Record<string, string> ?? {},
      },
      resource: {
        type: resource.type as string ?? '',
        labels: resource.labels as Record<string, string> ?? {},
      },
      points,
    };
  }

  private mapLogEntry(e: Record<string, unknown>): GCPLogEntry {
    const resource = e.resource as Record<string, unknown> ?? {};
    const message =
      (e.textPayload as string) ??
      JSON.stringify(e.jsonPayload ?? e.protoPayload ?? {});
    return {
      timestamp: e.timestamp as string ?? new Date().toISOString(),
      severity: e.severity as string ?? 'DEFAULT',
      message,
      resource: {
        type: resource.type as string ?? '',
        labels: resource.labels as Record<string, string> ?? {},
      },
    };
  }
}
