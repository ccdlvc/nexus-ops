import { AzureConnector } from '../../connectors/azure';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

// ─── Mock Azure SDK ───────────────────────────────────────────────────────────

const mockVMListAll = jest.fn();
const mockAKSList = jest.fn();
const mockMetricsQueryResource = jest.fn();
const mockLogsQueryWorkspace = jest.fn();
const mockCostQueryUsage = jest.fn();

jest.mock('@azure/identity', () => ({
  ClientSecretCredential: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@azure/arm-compute', () => ({
  ComputeManagementClient: jest.fn().mockImplementation(() => ({
    virtualMachines: { listAll: mockVMListAll },
  })),
}));

jest.mock('@azure/arm-containerservice', () => ({
  ContainerServiceClient: jest.fn().mockImplementation(() => ({
    managedClusters: { list: mockAKSList },
  })),
}));

jest.mock('@azure/monitor-query', () => ({
  MetricsQueryClient: jest.fn().mockImplementation(() => ({
    queryResource: mockMetricsQueryResource,
  })),
  LogsQueryClient: jest.fn().mockImplementation(() => ({
    queryWorkspace: mockLogsQueryWorkspace,
  })),
  Durations: { oneHour: 'PT1H', oneDay: 'PT24H' },
}));

jest.mock('@azure/arm-costmanagement', () => ({
  CostManagementClient: jest.fn().mockImplementation(() => ({
    query: { usage: mockCostQueryUsage },
  })),
}));

// Helper to create an async generator from an array
async function* asyncGen<T>(items: T[]) {
  for (const item of items) yield item;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AzureConnector', () => {
  let connector: AzureConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new AzureConnector('tenant-id', 'client-id', 'client-secret', 'sub-id');
  });

  // ─── listVMs ──────────────────────────────────────────────────────────────

  describe('listVMs()', () => {
    it('returns mapped virtual machines', async () => {
      const rawVM = {
        id: '/subscriptions/sub-id/resourceGroups/my-rg/providers/Microsoft.Compute/virtualMachines/vm1',
        name: 'vm1',
        location: 'eastus',
        properties: {
          hardwareProfile: { vmSize: 'Standard_D2s_v3' },
          storageProfile: { osDisk: { osType: 'Linux' } },
          provisioningState: 'Succeeded',
          instanceView: {
            statuses: [
              { code: 'ProvisioningState/succeeded' },
              { code: 'PowerState/running' },
            ],
          },
        },
        tags: { env: 'prod' },
      };

      mockVMListAll.mockReturnValue(asyncGen([rawVM]));

      const vms = await connector.listVMs();

      expect(vms).toHaveLength(1);
      expect(vms[0].name).toBe('vm1');
      expect(vms[0].location).toBe('eastus');
      expect(vms[0].resourceGroup).toBe('my-rg');
      expect(vms[0].size).toBe('Standard_D2s_v3');
      expect(vms[0].powerState).toBe('running');
      expect(vms[0].provisioningState).toBe('Succeeded');
      expect(vms[0].tags).toEqual({ env: 'prod' });
    });

    it('handles VM with no power state', async () => {
      mockVMListAll.mockReturnValue(asyncGen([{
        id: '/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm2',
        name: 'vm2',
        location: 'westus',
        properties: {
          hardwareProfile: { vmSize: 'Standard_B1s' },
          storageProfile: { osDisk: {} },
          provisioningState: 'Deallocated',
          instanceView: { statuses: [] },
        },
        tags: {},
      }]));

      const vms = await connector.listVMs();

      expect(vms[0].powerState).toBeUndefined();
    });

    it('returns empty array on error', async () => {
      mockVMListAll.mockImplementation(() => {
        throw new Error('Azure error');
      });
      expect(await connector.listVMs()).toEqual([]);
    });
  });

  // ─── listAKSClusters ──────────────────────────────────────────────────────

  describe('listAKSClusters()', () => {
    it('returns mapped AKS clusters', async () => {
      const rawCluster = {
        id: '/subscriptions/sub-id/resourceGroups/k8s-rg/providers/Microsoft.ContainerService/managedClusters/prod-cluster',
        name: 'prod-cluster',
        location: 'eastus',
        properties: {
          kubernetesVersion: '1.28.5',
          provisioningState: 'Succeeded',
          agentPoolProfiles: [
            { name: 'system', count: 2 },
            { name: 'user', count: 3 },
          ],
          fqdn: 'prod-cluster-east.hcp.eastus.azmk8s.io',
        },
        tags: { team: 'platform' },
      };

      mockAKSList.mockReturnValue(asyncGen([rawCluster]));

      const clusters = await connector.listAKSClusters();

      expect(clusters).toHaveLength(1);
      expect(clusters[0].name).toBe('prod-cluster');
      expect(clusters[0].kubernetesVersion).toBe('1.28.5');
      expect(clusters[0].nodeCount).toBe(5);
      expect(clusters[0].resourceGroup).toBe('k8s-rg');
      expect(clusters[0].fqdn).toBe('prod-cluster-east.hcp.eastus.azmk8s.io');
      expect(clusters[0].tags).toEqual({ team: 'platform' });
    });

    it('returns empty array on error', async () => {
      mockAKSList.mockImplementation(() => {
        throw new Error('AKS error');
      });
      expect(await connector.listAKSClusters()).toEqual([]);
    });
  });

  // ─── getMonthlyCost ───────────────────────────────────────────────────────

  describe('getMonthlyCost()', () => {
    it('returns cost summary', async () => {
      mockCostQueryUsage.mockResolvedValue({
        columns: [
          { name: 'PreTaxCost' },
          { name: 'ServiceName' },
          { name: 'Currency' },
        ],
        rows: [
          [85.50, 'Virtual Machines', 'USD'],
          [12.30, 'Storage', 'USD'],
          [3.10, 'Bandwidth', 'USD'],
        ],
      });

      const summary = await connector.getMonthlyCost();

      expect(summary).not.toBeNull();
      expect(summary!.byService[0].service).toBe('Virtual Machines');
      expect(summary!.byService[0].amount).toBe(85.50);
      expect(summary!.total).toBeCloseTo(100.90, 1);
      expect(summary!.currency).toBe('USD');
    });

    it('returns null on error', async () => {
      mockCostQueryUsage.mockRejectedValue(new Error('Cost error'));
      expect(await connector.getMonthlyCost()).toBeNull();
    });
  });

  // ─── getDailyCosts ────────────────────────────────────────────────────────

  describe('getDailyCosts()', () => {
    it('groups rows by date into per-day summaries', async () => {
      mockCostQueryUsage.mockResolvedValue({
        columns: [
          { name: 'PreTaxCost' },
          { name: 'ServiceName' },
          { name: 'Currency' },
          { name: 'UsageDate' },
        ],
        rows: [
          [10.0, 'Virtual Machines', 'USD', '2024-01-01T00:00:00Z'],
          [5.0, 'Storage', 'USD', '2024-01-01T00:00:00Z'],
          [8.0, 'Virtual Machines', 'USD', '2024-01-02T00:00:00Z'],
        ],
      });

      const dailyCosts = await connector.getDailyCosts(2);

      expect(dailyCosts).toHaveLength(2);
      expect(dailyCosts[0].timePeriod.start).toBe('2024-01-01');
      expect(dailyCosts[0].total).toBe(15);
      expect(dailyCosts[1].total).toBe(8);
    });

    it('returns empty array on error', async () => {
      mockCostQueryUsage.mockRejectedValue(new Error('Cost error'));
      expect(await connector.getDailyCosts()).toEqual([]);
    });
  });

  // ─── queryLogs ────────────────────────────────────────────────────────────

  describe('queryLogs()', () => {
    it('returns mapped log rows', async () => {
      mockLogsQueryWorkspace.mockResolvedValue({
        status: 'Success',
        tables: [{
          columnDescriptors: [
            { name: 'TimeGenerated' },
            { name: 'Message' },
            { name: 'SeverityLevel' },
          ],
          rows: [
            ['2024-01-01T12:00:00Z', 'App crashed', 'Error'],
          ],
        }],
      });

      const rows = await connector.queryLogs('workspace-id', 'AppExceptions | limit 10');

      expect(rows).toHaveLength(1);
      expect(rows[0].timestamp).toBe('2024-01-01T12:00:00Z');
      expect(rows[0].message).toBe('App crashed');
      expect(rows[0].severity).toBe('Error');
    });

    it('returns empty array when status is not Success', async () => {
      mockLogsQueryWorkspace.mockResolvedValue({ status: 'Failed', tables: [] });
      expect(await connector.queryLogs('ws', 'query')).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockLogsQueryWorkspace.mockRejectedValue(new Error('KQL error'));
      expect(await connector.queryLogs('ws', 'query')).toEqual([]);
    });
  });
});
