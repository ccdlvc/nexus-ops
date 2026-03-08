import axios, { AxiosInstance } from 'axios';
import {
  PrometheusInstantResult,
  PrometheusRangeResult,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class PrometheusConnector {
  private client: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly username?: string,
    private readonly password?: string,
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15_000,
      auth: username && password ? { username, password } : undefined,
    });
  }

  /** Instant PromQL query — returns a vector of current values */
  async query(promql: string, time?: string): Promise<PrometheusInstantResult> {
    try {
      const params: Record<string, string> = { query: promql };
      if (time) params.time = time;
      const { data } = await this.client.get('/api/v1/query', { params });
      return data as PrometheusInstantResult;
    } catch (err) {
      logger.error('Prometheus instant query failed', { promql, err });
      return { status: 'error', data: { resultType: 'vector', result: [] }, error: String(err) };
    }
  }

  /** Range PromQL query — returns a matrix of values over time */
  async queryRange(
    promql: string,
    start: string,
    end: string,
    step: string,
  ): Promise<PrometheusRangeResult> {
    try {
      const { data } = await this.client.get('/api/v1/query_range', {
        params: { query: promql, start, end, step },
      });
      return data as PrometheusRangeResult;
    } catch (err) {
      logger.error('Prometheus range query failed', { promql, err });
      return { status: 'error', data: { resultType: 'matrix', result: [] }, error: String(err) };
    }
  }

  /** Return all label names */
  async labels(): Promise<string[]> {
    try {
      const { data } = await this.client.get('/api/v1/labels');
      return (data as { data: string[] }).data ?? [];
    } catch (err) {
      logger.error('Prometheus labels fetch failed', { err });
      return [];
    }
  }

  /** Return label values for a given label name */
  async labelValues(label: string): Promise<string[]> {
    try {
      const { data } = await this.client.get(`/api/v1/label/${encodeURIComponent(label)}/values`);
      return (data as { data: string[] }).data ?? [];
    } catch (err) {
      logger.error('Prometheus label values fetch failed', { label, err });
      return [];
    }
  }

  /** Return all series matching a selector */
  async series(match: string): Promise<Record<string, string>[]> {
    try {
      const { data } = await this.client.get('/api/v1/series', { params: { 'match[]': match } });
      return (data as { data: Record<string, string>[] }).data ?? [];
    } catch (err) {
      logger.error('Prometheus series fetch failed', { match, err });
      return [];
    }
  }

  /** List all metric names (scrape targets) */
  async metricNames(): Promise<string[]> {
    return this.labelValues('__name__');
  }

  /** Return scrape target health */
  async targets(): Promise<{ activeTargets: Record<string, unknown>[] }> {
    try {
      const { data } = await this.client.get('/api/v1/targets');
      return (data as { data: { activeTargets: Record<string, unknown>[] } }).data;
    } catch (err) {
      logger.error('Prometheus targets fetch failed', { err });
      return { activeTargets: [] };
    }
  }
}
