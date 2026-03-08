import axios, { AxiosInstance } from 'axios';
import { LogEntry, ErrorTrend, AnomalyResult, Severity } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class KibanaConnector {
  private client: AxiosInstance;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    private readonly indexPattern: string = 'logs-*',
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      auth: { username, password },
      timeout: 20_000,
      headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
    });
  }

  /** Fetch recent error logs from Elasticsearch via Kibana proxy */
  async getRecentErrors(minutes = 15, size = 100): Promise<LogEntry[]> {
    try {
      const from = new Date(Date.now() - minutes * 60_000).toISOString();
      const { data } = await this.client.post('/api/console/proxy?path=/' + encodeURIComponent(this.indexPattern) + '/_search&method=GET', {
        size,
        sort: [{ '@timestamp': { order: 'desc' } }],
        query: {
          bool: {
            must: [
              { range: { '@timestamp': { gte: from } } },
              { terms: { 'log.level': ['ERROR', 'error', 'FATAL', 'fatal'] } },
            ],
          },
        },
        _source: ['@timestamp', 'log.level', 'message', 'service.name', 'trace.id'],
      });

      return (data.hits?.hits ?? []).map((h: Record<string, unknown>) => {
        const src = h._source as Record<string, unknown>;
        return {
          timestamp: src['@timestamp'] as string,
          level: ((src['log.level'] as string) ?? 'ERROR').toUpperCase() as LogEntry['level'],
          message: src.message as string ?? '',
          service: src['service.name'] as string | undefined,
          traceId: src['trace.id'] as string | undefined,
        };
      });
    } catch (err) {
      logger.error('KibanaConnector getRecentErrors failed', { err });
      return [];
    }
  }

  /** Aggregated error counts per error-type/service over a time range */
  async getErrorTrends(hours = 24): Promise<ErrorTrend[]> {
    try {
      const from = new Date(Date.now() - hours * 3_600_000).toISOString();
      const { data } = await this.client.post('/api/console/proxy?path=' + encodeURIComponent(this.indexPattern) + '/_search&method=GET', {
        size: 0,
        query: { bool: { must: [{ range: { '@timestamp': { gte: from } } }, { term: { 'log.level': 'ERROR' } }] } },
        aggs: {
          by_time: {
            date_histogram: { field: '@timestamp', fixed_interval: '1h' },
            aggs: {
              by_service: {
                terms: { field: 'service.name.keyword', size: 10 },
                aggs: { by_error: { terms: { field: 'error.type.keyword', size: 5 } } },
              },
            },
          },
        },
      });

      const trends: ErrorTrend[] = [];
      for (const bucket of data.aggregations?.by_time?.buckets ?? []) {
        for (const svc of bucket.by_service?.buckets ?? []) {
          for (const err of svc.by_error?.buckets ?? []) {
            trends.push({
              timestamp: bucket.key_as_string,
              errorType: err.key,
              count: err.doc_count,
              service: svc.key,
            });
          }
        }
      }
      return trends;
    } catch (err) {
      logger.error('KibanaConnector getErrorTrends failed', { err });
      return [];
    }
  }

  /** Simple anomaly detection via significant deviation from rolling average */
  async detectAnomalies(windowMinutes = 60): Promise<AnomalyResult[]> {
    try {
      const trends = await this.getErrorTrends(Math.ceil(windowMinutes / 60) * 3 + 1);
      if (trends.length === 0) return [];

      // Group by service
      const byService: Record<string, number[]> = {};
      for (const t of trends) {
        (byService[t.service] ??= []).push(t.count);
      }

      const anomalies: AnomalyResult[] = [];
      for (const [service, counts] of Object.entries(byService)) {
        if (counts.length < 3) continue;
        const baseline = counts.slice(0, -1).reduce((a, b) => a + b, 0) / (counts.length - 1);
        const latest = counts[counts.length - 1];
        const deviation = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0;
        if (deviation > 50) {
          const severity: Severity = deviation > 200 ? 'critical' : deviation > 100 ? 'high' : 'medium';
          anomalies.push({
            id: uuidv4(),
            detectedAt: new Date().toISOString(),
            metric: 'errorCount',
            value: latest,
            baseline,
            deviation,
            severity,
            source: 'kibana',
            description: `Error count for ${service} is ${deviation.toFixed(0)}% above baseline (${latest} vs avg ${baseline.toFixed(0)})`,
          });
        }
      }
      return anomalies;
    } catch (err) {
      logger.error('KibanaConnector detectAnomalies failed', { err });
      return [];
    }
  }

  /** Natural-language-style log query using Kibana KQL */
  async queryLogs(kql: string, size = 50): Promise<LogEntry[]> {
    try {
      const { data } = await this.client.post('/api/console/proxy?path=' + encodeURIComponent(this.indexPattern) + '/_search&method=GET', {
        size,
        sort: [{ '@timestamp': { order: 'desc' } }],
        query: { query_string: { query: kql, default_field: 'message' } },
        _source: ['@timestamp', 'log.level', 'message', 'service.name', 'trace.id'],
      });
      return (data.hits?.hits ?? []).map((h: Record<string, unknown>) => {
        const src = h._source as Record<string, unknown>;
        return {
          timestamp: src['@timestamp'] as string,
          level: ((src['log.level'] as string) ?? 'INFO').toUpperCase() as LogEntry['level'],
          message: src.message as string ?? '',
          service: src['service.name'] as string | undefined,
          traceId: src['trace.id'] as string | undefined,
        };
      });
    } catch (err) {
      logger.error('KibanaConnector queryLogs failed', { kql, err });
      return [];
    }
  }
}
