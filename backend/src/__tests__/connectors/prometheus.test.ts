import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { PrometheusConnector } from '../../connectors/prometheus';

// Mock the logger so we don't write log files during tests
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

describe('PrometheusConnector', () => {
  let mock: MockAdapter;
  let connector: PrometheusConnector;

  beforeEach(() => {
    // Create a fresh adapter so mocks don't bleed between tests
    mock = new MockAdapter(axios);
    connector = new PrometheusConnector('http://prometheus:9090');
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── query ──────────────────────────────────────────────────────────────────

  describe('query()', () => {
    it('returns parsed instant vector on success', async () => {
      const responsePayload = {
        status: 'success',
        data: {
          resultType: 'vector',
          result: [
            { metric: { job: 'node' }, value: [1700000000, '42'] },
          ],
        },
      };
      mock.onGet('http://prometheus:9090/api/v1/query').reply(200, responsePayload);

      const result = await connector.query('up');

      expect(result.status).toBe('success');
      expect(result.data.resultType).toBe('vector');
      expect(result.data.result).toHaveLength(1);
      expect(result.data.result[0].metric.job).toBe('node');
    });

    it('returns error result when Prometheus returns 4xx', async () => {
      mock.onGet('http://prometheus:9090/api/v1/query').reply(400, { error: 'bad query' });

      const result = await connector.query('invalid{{{');

      expect(result.status).toBe('error');
      expect(result.data.result).toHaveLength(0);
    });

    it('returns error result on network failure', async () => {
      mock.onGet('http://prometheus:9090/api/v1/query').networkError();

      const result = await connector.query('up');

      expect(result.status).toBe('error');
    });

    it('includes time param when provided', async () => {
      mock.onGet('http://prometheus:9090/api/v1/query').reply(200, {
        status: 'success',
        data: { resultType: 'vector', result: [] },
      });

      await connector.query('up', '2024-01-01T00:00:00Z');

      expect(mock.history.get[0].params?.time).toBe('2024-01-01T00:00:00Z');
    });
  });

  // ─── queryRange ─────────────────────────────────────────────────────────────

  describe('queryRange()', () => {
    it('returns matrix result on success', async () => {
      const payload = {
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: { __name__: 'up', job: 'node' },
              values: [[1700000000, '1'], [1700000060, '1']],
            },
          ],
        },
      };
      mock.onGet('http://prometheus:9090/api/v1/query_range').reply(200, payload);

      const result = await connector.queryRange(
        'up',
        '2024-01-01T00:00:00Z',
        '2024-01-01T01:00:00Z',
        '60s',
      );

      expect(result.status).toBe('success');
      expect(result.data.resultType).toBe('matrix');
      expect(result.data.result[0].values).toHaveLength(2);
    });

    it('returns error result on failure', async () => {
      mock.onGet('http://prometheus:9090/api/v1/query_range').networkError();

      const result = await connector.queryRange('up', 'start', 'end', '60s');

      expect(result.status).toBe('error');
      expect(result.data.result).toHaveLength(0);
    });
  });

  // ─── labels ─────────────────────────────────────────────────────────────────

  describe('labels()', () => {
    it('returns array of label names', async () => {
      mock.onGet('http://prometheus:9090/api/v1/labels').reply(200, {
        status: 'success',
        data: ['__name__', 'instance', 'job'],
      });

      const labels = await connector.labels();

      expect(labels).toEqual(['__name__', 'instance', 'job']);
    });

    it('returns empty array on error', async () => {
      mock.onGet('http://prometheus:9090/api/v1/labels').networkError();

      const labels = await connector.labels();

      expect(labels).toEqual([]);
    });
  });

  // ─── labelValues ─────────────────────────────────────────────────────────────

  describe('labelValues()', () => {
    it('returns values for a label', async () => {
      mock.onGet('http://prometheus:9090/api/v1/label/job/values').reply(200, {
        status: 'success',
        data: ['node', 'prometheus'],
      });

      const values = await connector.labelValues('job');

      expect(values).toEqual(['node', 'prometheus']);
    });

    it('returns empty array on error', async () => {
      mock.onGet('http://prometheus:9090/api/v1/label/job/values').networkError();

      expect(await connector.labelValues('job')).toEqual([]);
    });
  });

  // ─── series ─────────────────────────────────────────────────────────────────

  describe('series()', () => {
    it('returns matching series', async () => {
      mock.onGet('http://prometheus:9090/api/v1/series').reply(200, {
        status: 'success',
        data: [{ __name__: 'up', job: 'node', instance: 'localhost:9100' }],
      });

      const series = await connector.series('{job="node"}');

      expect(series).toHaveLength(1);
      expect(series[0].__name__).toBe('up');
    });

    it('returns empty array on error', async () => {
      mock.onGet('http://prometheus:9090/api/v1/series').networkError();

      expect(await connector.series('{}')).toEqual([]);
    });
  });

  // ─── targets ─────────────────────────────────────────────────────────────────

  describe('targets()', () => {
    it('returns active targets', async () => {
      mock.onGet('http://prometheus:9090/api/v1/targets').reply(200, {
        status: 'success',
        data: {
          activeTargets: [{ scrapeUrl: 'http://node:9100/metrics', health: 'up' }],
          droppedTargets: [],
        },
      });

      const result = await connector.targets();

      expect(result.activeTargets).toHaveLength(1);
    });

    it('returns empty targets on error', async () => {
      mock.onGet('http://prometheus:9090/api/v1/targets').networkError();

      const result = await connector.targets();

      expect(result.activeTargets).toHaveLength(0);
    });
  });

  // ─── authentication ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('sends Basic auth when username and password are provided', async () => {
      const authedConnector = new PrometheusConnector(
        'http://prometheus:9090',
        'admin',
        'secret',
      );
      mock.onGet('http://prometheus:9090/api/v1/labels').reply(200, {
        status: 'success',
        data: [],
      });

      await authedConnector.labels();

      const req = mock.history.get[0];
      expect(req.auth).toEqual({ username: 'admin', password: 'secret' });
    });
  });
});
