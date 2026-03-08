import { GCPConnector } from '../../connectors/gcp';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

// ─── Mock googleapis ──────────────────────────────────────────────────────────

const mockComputeInstancesAggregatedList = jest.fn();
const mockContainerProjectsZonesClustersListFn = jest.fn();
const mockRunProjectsLocationServicesListFn = jest.fn();
const mockMonitoringProjectsTimeSeriesListFn = jest.fn();
const mockLoggingEntriesListFn = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({})),
    },
    compute: jest.fn().mockReturnValue({
      instances: { aggregatedList: mockComputeInstancesAggregatedList },
    }),
    container: jest.fn().mockReturnValue({
      projects: {
        zones: { clusters: { list: mockContainerProjectsZonesClustersListFn } },
        locations: { clusters: { list: mockContainerProjectsZonesClustersListFn } },
      },
    }),
    run: jest.fn().mockReturnValue({
      projects: { locations: { services: { list: mockRunProjectsLocationServicesListFn } } },
    }),
    monitoring: jest.fn().mockReturnValue({
      projects: { timeSeries: { list: mockMonitoringProjectsTimeSeriesListFn } },
    }),
    logging: jest.fn().mockReturnValue({
      entries: { list: mockLoggingEntriesListFn },
    }),
  },
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('GCPConnector', () => {
  let connector: GCPConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new GCPConnector('my-project', 'sa@my-project.iam.gserviceaccount.com', '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----');
  });

  // ─── listInstances ────────────────────────────────────────────────────────

  describe('listInstances()', () => {
    it('returns mapped Compute Engine instances', async () => {
      mockComputeInstancesAggregatedList.mockResolvedValue({
        data: {
          items: {
            'zones/us-central1-a': {
              instances: [{
                id: '12345',
                name: 'web-server',
                zone: 'projects/my-project/zones/us-central1-a',
                machineType: 'projects/my-project/machineTypes/n1-standard-2',
                status: 'RUNNING',
                networkInterfaces: [{
                  networkIP: '10.0.0.2',
                  accessConfigs: [{ natIP: '35.1.2.3' }],
                }],
                labels: { env: 'prod' },
                creationTimestamp: '2024-01-01T00:00:00Z',
              }],
            },
          },
        },
      });

      const instances = await connector.listInstances();

      expect(instances.length).toBeGreaterThan(0);
      expect(instances[0].name).toBe('web-server');
      expect(instances[0].status).toBe('RUNNING');
    });

    it('returns empty array on error', async () => {
      mockComputeInstancesAggregatedList.mockRejectedValue(new Error('GCP error'));
      expect(await connector.listInstances()).toEqual([]);
    });
  });

  // ─── listClusters ─────────────────────────────────────────────────────────

  describe('listClusters()', () => {
    it('returns mapped GKE clusters', async () => {
      mockContainerProjectsZonesClustersListFn.mockResolvedValue({
        data: {
          clusters: [{
            name: 'prod-cluster',
            location: 'us-central1',
            status: 'RUNNING',
            currentMasterVersion: '1.28.5-gke.1',
            currentNodeCount: 5,
            nodePools: [{ name: 'default' }, { name: 'gpu' }],
            endpoint: '34.1.2.3',
            createTime: '2023-06-01T00:00:00Z',
          }],
        },
      });

      const clusters = await connector.listClusters();

      expect(clusters).toHaveLength(1);
      expect(clusters[0].name).toBe('prod-cluster');
      expect(clusters[0].status).toBe('RUNNING');
      expect(clusters[0].currentNodeCount).toBe(5);
      expect(clusters[0].nodePoolCount).toBe(2);
    });

    it('returns empty array when no clusters', async () => {
      mockContainerProjectsZonesClustersListFn.mockResolvedValue({ data: { clusters: [] } });
      expect(await connector.listClusters()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockContainerProjectsZonesClustersListFn.mockRejectedValue(new Error('GKE error'));
      expect(await connector.listClusters()).toEqual([]);
    });
  });

  // ─── listRunServices ──────────────────────────────────────────────────────

  describe('listRunServices()', () => {
    it('returns mapped Cloud Run services', async () => {
      mockRunProjectsLocationServicesListFn.mockResolvedValue({
        data: {
          items: [{
            metadata: { name: 'my-service' },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              url: 'https://my-service-xyz.run.app',
              latestReadyRevisionName: 'my-service-00003',
              latestCreatedRevisionName: 'my-service-00003',
            },
          }],
        },
      });

      const services = await connector.listRunServices('us-central1');

      expect(services.length).toBeGreaterThan(0);
    });

    it('returns empty array on error', async () => {
      mockRunProjectsLocationServicesListFn.mockRejectedValue(new Error('Cloud Run error'));
      expect(await connector.listRunServices()).toEqual([]);
    });
  });

  // ─── listLogEntries ───────────────────────────────────────────────────────

  describe('listLogEntries()', () => {
    it('returns mapped log entries', async () => {
      mockLoggingEntriesListFn.mockResolvedValue({
        data: {
          entries: [{
            timestamp: '2024-01-01T12:00:00Z',
            severity: 'ERROR',
            jsonPayload: { message: 'database connection failed' },
            resource: { type: 'gce_instance', labels: { instance_id: '123' } },
          }],
        },
      });

      const entries = await connector.listLogEntries('severity=ERROR');

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].severity).toBe('ERROR');
    });

    it('returns empty array on error', async () => {
      mockLoggingEntriesListFn.mockRejectedValue(new Error('Logging error'));
      expect(await connector.listLogEntries()).toEqual([]);
    });
  });
});
