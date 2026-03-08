import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { KibanaConnector } from '../../connectors/kibana';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

// uuid returns deterministic id in test (we just verify it's a string)
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

describe('KibanaConnector', () => {
  let mock: MockAdapter;
  let connector: KibanaConnector;

  const BASE = 'http://kibana:5601';

  beforeEach(() => {
    mock = new MockAdapter(axios);
    connector = new KibanaConnector(BASE, 'elastic', 'password123', 'logs-*');
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── getRecentErrors ──────────────────────────────────────────────────────

  describe('getRecentErrors()', () => {
    it('returns mapped log entries on success', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        hits: {
          hits: [
            {
              _source: {
                '@timestamp': '2024-01-01T00:00:00Z',
                'log.level': 'ERROR',
                message: 'NullPointerException in PaymentService',
                'service.name': 'payments-api',
                'trace.id': 'trace-abc',
              },
            },
          ],
        },
      });

      const entries = await connector.getRecentErrors();

      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('ERROR');
      expect(entries[0].message).toBe('NullPointerException in PaymentService');
      expect(entries[0].service).toBe('payments-api');
      expect(entries[0].traceId).toBe('trace-abc');
    });

    it('normalises lowercase log levels to uppercase', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        hits: {
          hits: [
            {
              _source: {
                '@timestamp': '2024-01-01T00:00:00Z',
                'log.level': 'error',
                message: 'Some error',
              },
            },
          ],
        },
      });

      const entries = await connector.getRecentErrors();

      expect(entries[0].level).toBe('ERROR');
    });

    it('returns empty array when no hits', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, { hits: { hits: [] } });

      expect(await connector.getRecentErrors()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).networkError();

      expect(await connector.getRecentErrors()).toEqual([]);
    });
  });

  // ─── getErrorTrends ───────────────────────────────────────────────────────

  describe('getErrorTrends()', () => {
    it('returns error trends from aggregation buckets', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        aggregations: {
          by_time: {
            buckets: [
              {
                key_as_string: '2024-01-01T00:00:00Z',
                by_service: {
                  buckets: [
                    {
                      key: 'payments-api',
                      by_error: {
                        buckets: [
                          { key: 'NullPointerException', doc_count: 5 },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const trends = await connector.getErrorTrends();

      expect(trends).toHaveLength(1);
      expect(trends[0].service).toBe('payments-api');
      expect(trends[0].errorType).toBe('NullPointerException');
      expect(trends[0].count).toBe(5);
    });

    it('returns empty array when aggregations empty', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        aggregations: { by_time: { buckets: [] } },
      });

      expect(await connector.getErrorTrends()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).networkError();

      expect(await connector.getErrorTrends()).toEqual([]);
    });
  });

  // ─── detectAnomalies ──────────────────────────────────────────────────────

  describe('detectAnomalies()', () => {
    it('returns anomaly when latest count is >50% above baseline', async () => {
      // We need at least 3 data points per service for anomaly detection.
      // Simulate baseline of 10, 10 and a spike of 25 (150% above baseline of 10)
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        aggregations: {
          by_time: {
            buckets: [
              {
                key_as_string: '2024-01-01T00:00:00Z',
                by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 10 }] } }] },
              },
              {
                key_as_string: '2024-01-01T01:00:00Z',
                by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 10 }] } }] },
              },
              {
                key_as_string: '2024-01-01T02:00:00Z',
                by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 25 }] } }] },
              },
            ],
          },
        },
      });

      const anomalies = await connector.detectAnomalies();

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].source).toBe('kibana');
      expect(anomalies[0].metric).toBe('errorCount');
      expect(anomalies[0].id).toBe('test-uuid-1234');
    });

    it('returns no anomalies when counts are stable', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        aggregations: {
          by_time: {
            buckets: [
              { key_as_string: 't1', by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 10 }] } }] } },
              { key_as_string: 't2', by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 10 }] } }] } },
              { key_as_string: 't3', by_service: { buckets: [{ key: 'api', by_error: { buckets: [{ key: 'Err', doc_count: 11 }] } }] } },
            ],
          },
        },
      });

      const anomalies = await connector.detectAnomalies();

      expect(anomalies).toHaveLength(0);
    });

    it('returns empty array on error', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).networkError();

      expect(await connector.detectAnomalies()).toEqual([]);
    });
  });

  // ─── queryLogs ────────────────────────────────────────────────────────────

  describe('queryLogs()', () => {
    it('returns log entries matching KQL', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, {
        hits: {
          hits: [
            {
              _source: {
                '@timestamp': '2024-01-01T00:00:00Z',
                'log.level': 'WARN',
                message: 'Slow query detected',
                'service.name': 'db-service',
              },
            },
          ],
        },
      });

      const logs = await connector.queryLogs('message: "Slow query"');

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Slow query detected');
      expect(logs[0].service).toBe('db-service');
    });

    it('returns empty array on error', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).networkError();

      expect(await connector.queryLogs('error')).toEqual([]);
    });
  });

  // ─── authentication ───────────────────────────────────────────────────────

  describe('authentication', () => {
    it('sends Basic auth headers', async () => {
      mock.onPost(new RegExp(`${BASE}/api/console/proxy`)).reply(200, { hits: { hits: [] } });

      await connector.getRecentErrors();

      const req = mock.history.post[0];
      expect(req.auth).toEqual({ username: 'elastic', password: 'password123' });
      expect(req.headers?.['kbn-xsrf']).toBe('true');
    });
  });
});
