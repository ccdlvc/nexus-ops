import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { GrafanaConnector } from '../../connectors/grafana';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

describe('GrafanaConnector', () => {
  let mock: MockAdapter;
  let connector: GrafanaConnector;

  beforeEach(() => {
    mock = new MockAdapter(axios);
    connector = new GrafanaConnector('http://grafana:3000', 'glsa_test_token');
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── health ─────────────────────────────────────────────────────────────────

  describe('health()', () => {
    it('returns health info on success', async () => {
      mock.onGet('http://grafana:3000/api/health').reply(200, {
        commit: 'abc123',
        database: 'ok',
        version: '10.2.0',
      });

      const health = await connector.health();

      expect(health).not.toBeNull();
      expect(health!.version).toBe('10.2.0');
      expect(health!.database).toBe('ok');
      expect(health!.commit).toBe('abc123');
    });

    it('returns null on network error', async () => {
      mock.onGet('http://grafana:3000/api/health').networkError();

      expect(await connector.health()).toBeNull();
    });
  });

  // ─── listDashboards ──────────────────────────────────────────────────────────

  describe('listDashboards()', () => {
    const rawDash = {
      uid: 'abc-123',
      id: 1,
      title: 'Node Exporter',
      url: '/d/abc-123/node-exporter',
      folderTitle: 'Infrastructure',
      folderUid: 'folder-1',
      tags: ['node', 'infra'],
      isStarred: false,
      type: 'dash-db',
    };

    it('returns mapped dashboards on success', async () => {
      mock.onGet('http://grafana:3000/api/search').reply(200, [rawDash]);

      const dashboards = await connector.listDashboards();

      expect(dashboards).toHaveLength(1);
      expect(dashboards[0].uid).toBe('abc-123');
      expect(dashboards[0].title).toBe('Node Exporter');
      expect(dashboards[0].tags).toEqual(['node', 'infra']);
      expect(dashboards[0].starred).toBe(false);
    });

    it('passes query and tag params', async () => {
      mock.onGet('http://grafana:3000/api/search').reply(200, []);

      await connector.listDashboards('node', ['infra']);

      const params = mock.history.get[0].params;
      expect(params?.query).toBe('node');
      expect(params?.tag).toContain('infra');
    });

    it('returns empty array on error', async () => {
      mock.onGet('http://grafana:3000/api/search').networkError();

      expect(await connector.listDashboards()).toEqual([]);
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────────

  describe('getDashboard()', () => {
    const rawDetail = {
      dashboard: {
        uid: 'abc-123',
        title: 'Node Exporter',
        tags: ['node'],
        version: 3,
        schemaVersion: 39,
        panels: [
          { id: 1, title: 'CPU Usage', type: 'timeseries', gridPos: { x: 0, y: 0, w: 12, h: 8 } },
          { id: 2, title: 'Memory', type: 'gauge', gridPos: { x: 12, y: 0, w: 12, h: 8 } },
          { id: 99, title: 'Row', type: 'row', gridPos: { x: 0, y: 8, w: 24, h: 1 } }, // should be filtered
        ],
      },
      meta: { url: '/d/abc-123/node-exporter' },
    };

    it('returns detail with panels (rows excluded)', async () => {
      mock.onGet('http://grafana:3000/api/dashboards/uid/abc-123').reply(200, rawDetail);

      const dash = await connector.getDashboard('abc-123');

      expect(dash).not.toBeNull();
      expect(dash!.uid).toBe('abc-123');
      expect(dash!.panels).toHaveLength(2); // row panel filtered out
      expect(dash!.panels[0].title).toBe('CPU Usage');
      expect(dash!.version).toBe(3);
    });

    it('returns null on 404', async () => {
      mock.onGet('http://grafana:3000/api/dashboards/uid/missing').reply(404);

      expect(await connector.getDashboard('missing')).toBeNull();
    });

    it('returns null on network error', async () => {
      mock.onGet('http://grafana:3000/api/dashboards/uid/abc-123').networkError();

      expect(await connector.getDashboard('abc-123')).toBeNull();
    });
  });

  // ─── listDatasources ──────────────────────────────────────────────────────────

  describe('listDatasources()', () => {
    const rawDs = {
      id: 1,
      uid: 'ds-prom',
      name: 'Prometheus',
      type: 'prometheus',
      url: 'http://prometheus:9090',
      access: 'proxy',
      isDefault: true,
    };

    it('returns mapped datasources', async () => {
      mock.onGet('http://grafana:3000/api/datasources').reply(200, [rawDs]);

      const ds = await connector.listDatasources();

      expect(ds).toHaveLength(1);
      expect(ds[0].name).toBe('Prometheus');
      expect(ds[0].type).toBe('prometheus');
      expect(ds[0].isDefault).toBe(true);
    });

    it('returns empty array on error', async () => {
      mock.onGet('http://grafana:3000/api/datasources').networkError();

      expect(await connector.listDatasources()).toEqual([]);
    });
  });

  // ─── getDatasource ────────────────────────────────────────────────────────────

  describe('getDatasource()', () => {
    it('returns a single datasource by uid', async () => {
      mock.onGet('http://grafana:3000/api/datasources/uid/ds-prom').reply(200, {
        id: 1, uid: 'ds-prom', name: 'Prometheus', type: 'prometheus',
        url: 'http://prometheus:9090', access: 'proxy', isDefault: true,
      });

      const ds = await connector.getDatasource('ds-prom');

      expect(ds).not.toBeNull();
      expect(ds!.uid).toBe('ds-prom');
    });

    it('returns null on 404', async () => {
      mock.onGet('http://grafana:3000/api/datasources/uid/missing').reply(404);

      expect(await connector.getDatasource('missing')).toBeNull();
    });
  });

  // ─── authorization header ────────────────────────────────────────────────────

  describe('authorization', () => {
    it('sends Bearer token header', async () => {
      mock.onGet('http://grafana:3000/api/health').reply(200, {
        commit: 'x', database: 'ok', version: '10.0.0',
      });

      await connector.health();

      const req = mock.history.get[0];
      expect(req.headers?.Authorization).toBe('Bearer glsa_test_token');
    });
  });
});
