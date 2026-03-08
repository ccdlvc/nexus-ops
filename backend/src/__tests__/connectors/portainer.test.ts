import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { PortainerConnector } from '../../connectors/portainer';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

describe('PortainerConnector', () => {
  let mock: MockAdapter;
  let connector: PortainerConnector;

  const BASE = 'http://portainer:9000';
  const ENDPOINT_ID = 1;
  const API_TOKEN = 'ptr_test_token';

  const rawEndpoint = {
    Id: 1,
    Name: 'local',
    Type: 1,
    URL: 'unix:///var/run/docker.sock',
    Status: 1,
    PublicURL: 'http://localhost',
    GroupID: 1,
    TagIDs: [1, 2],
  };

  const rawContainer = {
    Id: 'abc123def456',
    Names: ['/my-service'],
    Image: 'nginx:latest',
    State: 'running',
    Status: 'Up 2 hours (healthy)',
    Created: 1700000000,
    Labels: { 'com.docker.compose.project': 'my-stack' },
  };

  const rawStats = {
    cpu_stats: {
      cpu_usage: { total_usage: 2000 },
      system_cpu_usage: 20000,
      online_cpus: 4,
    },
    precpu_stats: {
      cpu_usage: { total_usage: 1000 },
      system_cpu_usage: 10000,
    },
    memory_stats: {
      usage: 104857600, // 100 MB
      limit: 536870912, // 512 MB
      stats: { cache: 0 },
    },
    networks: {
      eth0: { rx_bytes: 1024, tx_bytes: 2048 },
    },
  };

  const rawInspect = { RestartCount: 2 };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    connector = new PortainerConnector(BASE, API_TOKEN, ENDPOINT_ID);
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── listEndpoints ────────────────────────────────────────────────────────

  describe('listEndpoints()', () => {
    it('returns mapped endpoints', async () => {
      mock.onGet(`${BASE}/api/endpoints`).reply(200, [rawEndpoint]);

      const endpoints = await connector.listEndpoints();

      expect(endpoints).toHaveLength(1);
      expect(endpoints[0].id).toBe(1);
      expect(endpoints[0].name).toBe('local');
      expect(endpoints[0].status).toBe(1);
      expect(endpoints[0].tags).toEqual(['1', '2']);
    });

    it('returns empty array on error', async () => {
      mock.onGet(`${BASE}/api/endpoints`).networkError();

      expect(await connector.listEndpoints()).toEqual([]);
    });
  });

  // ─── getContainersForEndpoint ─────────────────────────────────────────────

  describe('getContainersForEndpoint()', () => {
    it('returns mapped containers with CPU/memory metrics', async () => {
      mock
        .onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true`)
        .reply(200, [rawContainer]);
      mock
        .onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123def456/stats?stream=false`)
        .reply(200, rawStats);
      mock
        .onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123def456/json`)
        .reply(200, rawInspect);

      const containers = await connector.getContainersForEndpoint(ENDPOINT_ID);

      expect(containers).toHaveLength(1);
      expect(containers[0].id).toBe('abc123def456'); // full 12 chars sliced
      expect(containers[0].name).toBe('my-service');
      expect(containers[0].image).toBe('nginx:latest');
      expect(containers[0].status).toBe('running');
      expect(containers[0].health).toBe('healthy');
      expect(containers[0].restartCount).toBe(2);
      expect(containers[0].memoryUsage).toBe(104857600);
      expect(containers[0].memoryLimit).toBe(536870912);
      expect(containers[0].networkRx).toBe(1024);
      expect(containers[0].networkTx).toBe(2048);
      expect(containers[0].portainer?.stackName).toBe('my-stack');
    });

    it('maps health states correctly', async () => {
      const cases = [
        { Status: 'Up (unhealthy)', expected: 'unhealthy' },
        { Status: 'Up 1 hour (health: starting)', expected: 'starting' },
        { Status: 'Up 5 minutes', expected: 'none' },
      ];

      for (const { Status, expected } of cases) {
        mock.resetHistory();
        mock.onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true`)
          .reply(200, [{ ...rawContainer, Status }]);
        mock.onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/stats.*`))
          .reply(200, {});
        mock.onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/json`))
          .reply(200, {});

        const containers = await connector.getContainersForEndpoint(ENDPOINT_ID);
        expect(containers[0].health).toBe(expected);
      }
    });

    it('maps container state correctly', async () => {
      const cases = [
        { State: 'exited', expected: 'exited' },
        { State: 'paused', expected: 'paused' },
        { State: 'restarting', expected: 'restarting' },
        { State: 'dead', expected: 'stopped' },
      ];

      for (const { State, expected } of cases) {
        mock.resetHistory();
        mock.onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true`)
          .reply(200, [{ ...rawContainer, State }]);
        mock.onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/stats.*`))
          .reply(200, {});
        mock.onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/json`))
          .reply(200, {});

        const containers = await connector.getContainersForEndpoint(ENDPOINT_ID);
        expect(containers[0].status).toBe(expected);
      }
    });

    it('returns empty array on error', async () => {
      mock.onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/json?all=true`)
        .networkError();

      expect(await connector.getContainersForEndpoint(ENDPOINT_ID)).toEqual([]);
    });
  });

  // ─── getStacksForEndpoint ─────────────────────────────────────────────────

  describe('getStacksForEndpoint()', () => {
    it('returns stacks', async () => {
      mock.onGet(`${BASE}/api/stacks`).reply(200, [
        { Id: 1, Name: 'web-stack', Status: 1 },
        { Id: 2, Name: 'monitoring', Status: 1 },
      ]);

      const stacks = await connector.getStacksForEndpoint(ENDPOINT_ID);

      expect(stacks).toHaveLength(2);
      expect(stacks[0].name).toBe('web-stack');
    });

    it('returns empty array on error', async () => {
      mock.onGet(`${BASE}/api/stacks`).networkError();

      expect(await connector.getStacksForEndpoint(ENDPOINT_ID)).toEqual([]);
    });
  });

  // ─── getContainerLogsForEndpoint ──────────────────────────────────────────

  describe('getContainerLogsForEndpoint()', () => {
    it('returns log text', async () => {
      mock
        .onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/logs.*`))
        .reply(200, 'ERROR some service crashed\n');

      const logs = await connector.getContainerLogsForEndpoint(ENDPOINT_ID, 'abc123', 100);

      expect(logs).toContain('ERROR some service crashed');
    });

    it('returns empty string on error', async () => {
      mock
        .onGet(new RegExp(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/.*/logs.*`))
        .networkError();

      expect(await connector.getContainerLogsForEndpoint(ENDPOINT_ID, 'abc123')).toBe('');
    });
  });

  // ─── restartContainerOnEndpoint ───────────────────────────────────────────

  describe('restartContainerOnEndpoint()', () => {
    it('returns true on success', async () => {
      mock
        .onPost(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123/restart`)
        .reply(204);

      expect(await connector.restartContainerOnEndpoint(ENDPOINT_ID, 'abc123')).toBe(true);
    });

    it('returns false on error', async () => {
      mock
        .onPost(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123/restart`)
        .networkError();

      expect(await connector.restartContainerOnEndpoint(ENDPOINT_ID, 'abc123')).toBe(false);
    });
  });

  // ─── stopContainerOnEndpoint ──────────────────────────────────────────────

  describe('stopContainerOnEndpoint()', () => {
    it('returns true on success', async () => {
      mock
        .onPost(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123/stop`)
        .reply(204);

      expect(await connector.stopContainerOnEndpoint(ENDPOINT_ID, 'abc123')).toBe(true);
    });

    it('returns false on error', async () => {
      mock
        .onPost(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/containers/abc123/stop`)
        .networkError();

      expect(await connector.stopContainerOnEndpoint(ENDPOINT_ID, 'abc123')).toBe(false);
    });
  });

  // ─── getServices ──────────────────────────────────────────────────────────

  describe('getServices()', () => {
    it('returns mapped services', async () => {
      mock.onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/services`).reply(200, [
        {
          ID: 'svc-1',
          Spec: {
            Name: 'web-service',
            Mode: { Replicated: { Replicas: 3 } },
            TaskTemplate: { ContainerSpec: { Image: 'nginx:latest' } },
          },
          UpdatedAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const services = await connector.getServices();

      expect(services).toHaveLength(1);
      expect(services[0].id).toBe('svc-1');
      expect(services[0].name).toBe('web-service');
      expect(services[0].replicas).toBe(3);
      expect(services[0].image).toBe('nginx:latest');
    });

    it('returns empty array on error', async () => {
      mock.onGet(`${BASE}/api/endpoints/${ENDPOINT_ID}/docker/services`).networkError();

      expect(await connector.getServices()).toEqual([]);
    });
  });

  // ─── API Key header ───────────────────────────────────────────────────────

  describe('API key authentication', () => {
    it('sends X-API-Key header', async () => {
      mock.onGet(`${BASE}/api/endpoints`).reply(200, []);

      await connector.listEndpoints();

      const req = mock.history.get[0];
      expect(req.headers?.['X-API-Key']).toBe(API_TOKEN);
    });
  });
});
