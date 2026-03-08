import axios, { AxiosInstance } from 'axios';
import {
  GrafanaDashboard,
  GrafanaDashboardDetail,
  GrafanaPanel,
  GrafanaDatasource,
  GrafanaHealth,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class GrafanaConnector {
  private client: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15_000,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  }

  /** Grafana server health check */
  async health(): Promise<GrafanaHealth | null> {
    try {
      const { data } = await this.client.get('/api/health');
      return {
        commit: (data as Record<string, string>).commit ?? '',
        database: (data as Record<string, string>).database as 'ok' | 'degraded' ?? 'ok',
        version: (data as Record<string, string>).version ?? '',
      };
    } catch (err) {
      logger.error('Grafana health check failed', { err });
      return null;
    }
  }

  /** Search dashboards — optional free-text query and/or tag filter */
  async listDashboards(query?: string, tags?: string[]): Promise<GrafanaDashboard[]> {
    try {
      const params: Record<string, unknown> = { type: 'dash-db', limit: 100 };
      if (query) params.query = query;
      if (tags?.length) params.tag = tags;
      const { data } = await this.client.get('/api/search', { params });
      return (data as Record<string, unknown>[]).map(this.mapDashboard);
    } catch (err) {
      logger.error('Grafana listDashboards failed', { err });
      return [];
    }
  }

  /** Fetch full dashboard detail by UID */
  async getDashboard(uid: string): Promise<GrafanaDashboardDetail | null> {
    try {
      const { data } = await this.client.get(`/api/dashboards/uid/${uid}`);
      const dash = data as Record<string, unknown>;
      const meta = dash.meta as Record<string, unknown>;
      const model = dash.dashboard as Record<string, unknown>;
      return {
        uid: model.uid as string,
        title: model.title as string,
        url: meta.url as string ?? '',
        tags: (model.tags as string[]) ?? [],
        panels: this.mapPanels((model.panels as Record<string, unknown>[]) ?? []),
        version: (model.version as number) ?? 0,
        schemaVersion: (model.schemaVersion as number) ?? 0,
      };
    } catch (err) {
      logger.error('Grafana getDashboard failed', { uid, err });
      return null;
    }
  }

  /** List all configured datasources */
  async listDatasources(): Promise<GrafanaDatasource[]> {
    try {
      const { data } = await this.client.get('/api/datasources');
      return (data as Record<string, unknown>[]).map(this.mapDatasource);
    } catch (err) {
      logger.error('Grafana listDatasources failed', { err });
      return [];
    }
  }

  /** Get a single datasource by UID */
  async getDatasource(uid: string): Promise<GrafanaDatasource | null> {
    try {
      const { data } = await this.client.get(`/api/datasources/uid/${uid}`);
      return this.mapDatasource(data as Record<string, unknown>);
    } catch (err) {
      logger.error('Grafana getDatasource failed', { uid, err });
      return null;
    }
  }

  // ─── Private mappers ────────────────────────────────────────────────────

  private mapDashboard(d: Record<string, unknown>): GrafanaDashboard {
    return {
      uid: d.uid as string,
      id: d.id as number,
      title: d.title as string,
      url: d.url as string ?? '',
      folderTitle: d.folderTitle as string | undefined,
      folderUid: d.folderUid as string | undefined,
      tags: (d.tags as string[]) ?? [],
      starred: (d.isStarred as boolean) ?? false,
      type: (d.type as GrafanaDashboard['type']) ?? 'dash-db',
    };
  }

  private mapPanels(raw: Record<string, unknown>[]): GrafanaPanel[] {
    return raw
      .filter((p) => p.type !== 'row')
      .map((p) => ({
        id: p.id as number ?? 0,
        title: (p.title as string) ?? '',
        type: (p.type as string) ?? 'unknown',
        gridPos: (p.gridPos as GrafanaPanel['gridPos']) ?? { x: 0, y: 0, w: 12, h: 8 },
        description: p.description as string | undefined,
      }));
  }

  private mapDatasource(d: Record<string, unknown>): GrafanaDatasource {
    return {
      id: d.id as number,
      uid: d.uid as string ?? '',
      name: d.name as string,
      type: d.type as string,
      url: d.url as string ?? '',
      access: (d.access as 'proxy' | 'direct') ?? 'proxy',
      isDefault: (d.isDefault as boolean) ?? false,
      jsonData: d.jsonData as Record<string, unknown> | undefined,
    };
  }
}
