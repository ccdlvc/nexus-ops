import { AWSConnector } from '../../connectors/aws';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

// ─── Mock AWS SDK v3 clients ──────────────────────────────────────────────────

const mockEC2Send = jest.fn();
const mockECSSend = jest.fn();
const mockLambdaSend = jest.fn();
const mockCWSend = jest.fn();
const mockCWLogsSend = jest.fn();
const mockCESend = jest.fn();

jest.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: jest.fn().mockImplementation(() => ({ send: mockEC2Send })),
  DescribeInstancesCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ecs', () => ({
  ECSClient: jest.fn().mockImplementation(() => ({ send: mockECSSend })),
  ListClustersCommand: jest.fn(),
  DescribeClustersCommand: jest.fn(),
  ListServicesCommand: jest.fn(),
  DescribeServicesCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({ send: mockLambdaSend })),
  ListFunctionsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn().mockImplementation(() => ({ send: mockCWSend })),
  GetMetricStatisticsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({ send: mockCWLogsSend })),
  FilterLogEventsCommand: jest.fn(),
  DescribeLogGroupsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cost-explorer', () => ({
  CostExplorerClient: jest.fn().mockImplementation(() => ({ send: mockCESend })),
  GetCostAndUsageCommand: jest.fn(),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AWSConnector', () => {
  let connector: AWSConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    connector = new AWSConnector('AKID', 'SECRET', 'us-east-1');
  });

  // ─── listInstances ────────────────────────────────────────────────────────

  describe('listInstances()', () => {
    it('returns mapped EC2 instances', async () => {
      mockEC2Send.mockResolvedValue({
        Reservations: [{
          Instances: [{
            InstanceId: 'i-abc123',
            InstanceType: 't3.medium',
            State: { Name: 'running' },
            Placement: { AvailabilityZone: 'us-east-1a' },
            PublicIpAddress: '54.1.2.3',
            PrivateIpAddress: '10.0.0.1',
            LaunchTime: new Date('2024-01-15T12:00:00Z'),
            Tags: [{ Key: 'Name', Value: 'web-server' }],
          }],
        }],
      });

      const instances = await connector.listInstances();

      expect(instances).toHaveLength(1);
      expect(instances[0].id).toBe('i-abc123');
      expect(instances[0].name).toBe('web-server');
      expect(instances[0].state).toBe('running');
      expect(instances[0].type).toBe('t3.medium');
      expect(instances[0].publicIp).toBe('54.1.2.3');
      expect(instances[0].privateIp).toBe('10.0.0.1');
      expect(instances[0].region).toBe('us-east-1');
      expect(instances[0].availabilityZone).toBe('us-east-1a');
    });

    it('uses instance ID as name when no Name tag', async () => {
      mockEC2Send.mockResolvedValue({
        Reservations: [{
          Instances: [{
            InstanceId: 'i-noname',
            InstanceType: 't2.micro',
            State: { Name: 'stopped' },
            Placement: { AvailabilityZone: 'us-east-1b' },
            LaunchTime: new Date(),
            Tags: [],
          }],
        }],
      });

      const instances = await connector.listInstances();

      expect(instances[0].name).toBe('i-noname');
    });

    it('returns empty array on error', async () => {
      mockEC2Send.mockRejectedValue(new Error('AccessDenied'));

      expect(await connector.listInstances()).toEqual([]);
    });

    it('handles empty reservations', async () => {
      mockEC2Send.mockResolvedValue({ Reservations: [] });
      expect(await connector.listInstances()).toEqual([]);
    });
  });

  // ─── listClusters ─────────────────────────────────────────────────────────

  describe('listClusters()', () => {
    it('returns mapped ECS clusters', async () => {
      mockECSSend
        .mockResolvedValueOnce({ clusterArns: ['arn:aws:ecs:us-east-1:123:cluster/prod'] })
        .mockResolvedValueOnce({
          clusters: [{
            clusterArn: 'arn:aws:ecs:us-east-1:123:cluster/prod',
            clusterName: 'prod',
            status: 'ACTIVE',
            activeServicesCount: 5,
            runningTasksCount: 10,
            pendingTasksCount: 0,
            registeredContainerInstancesCount: 3,
          }],
        });

      const clusters = await connector.listClusters();

      expect(clusters).toHaveLength(1);
      expect(clusters[0].name).toBe('prod');
      expect(clusters[0].status).toBe('ACTIVE');
      expect(clusters[0].activeServiceCount).toBe(5);
      expect(clusters[0].runningTaskCount).toBe(10);
    });

    it('returns empty array when no cluster ARNs', async () => {
      mockECSSend.mockResolvedValue({ clusterArns: [] });
      expect(await connector.listClusters()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockECSSend.mockRejectedValue(new Error('ECS error'));
      expect(await connector.listClusters()).toEqual([]);
    });
  });

  // ─── listServices ─────────────────────────────────────────────────────────

  describe('listServices()', () => {
    const clusterArn = 'arn:aws:ecs:us-east-1:123:cluster/prod';

    it('returns mapped ECS services', async () => {
      mockECSSend
        .mockResolvedValueOnce({ serviceArns: ['arn:aws:ecs:us-east-1:123:service/api'] })
        .mockResolvedValueOnce({
          services: [{
            serviceArn: 'arn:aws:ecs:us-east-1:123:service/api',
            serviceName: 'api',
            clusterArn,
            status: 'ACTIVE',
            desiredCount: 3,
            runningCount: 3,
            pendingCount: 0,
            taskDefinition: 'api:42',
            launchType: 'FARGATE',
          }],
        });

      const services = await connector.listServices(clusterArn);

      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('api');
      expect(services[0].runningCount).toBe(3);
      expect(services[0].launchType).toBe('FARGATE');
    });

    it('returns empty array when no service ARNs', async () => {
      mockECSSend.mockResolvedValue({ serviceArns: [] });
      expect(await connector.listServices(clusterArn)).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockECSSend.mockRejectedValue(new Error('ECS error'));
      expect(await connector.listServices(clusterArn)).toEqual([]);
    });
  });

  // ─── listFunctions ────────────────────────────────────────────────────────

  describe('listFunctions()', () => {
    it('returns mapped Lambda functions', async () => {
      mockLambdaSend.mockResolvedValue({
        Functions: [{
          FunctionName: 'my-function',
          FunctionArn: 'arn:aws:lambda:us-east-1:123:function:my-function',
          Runtime: 'nodejs20.x',
          CodeSize: 204800,
          Timeout: 30,
          MemorySize: 512,
          LastModified: '2024-01-01T00:00:00.000+0000',
          Description: 'My function',
        }],
        NextMarker: undefined,
      });

      const fns = await connector.listFunctions();

      expect(fns).toHaveLength(1);
      expect(fns[0].name).toBe('my-function');
      expect(fns[0].runtime).toBe('nodejs20.x');
      expect(fns[0].memorySize).toBe(512);
      expect(fns[0].timeout).toBe(30);
      expect(fns[0].description).toBe('My function');
    });

    it('paginates using NextMarker', async () => {
      mockLambdaSend
        .mockResolvedValueOnce({
          Functions: [{ FunctionName: 'fn-1', FunctionArn: 'arn:1', Runtime: 'python3.11', CodeSize: 100, Timeout: 3, MemorySize: 128, LastModified: '' }],
          NextMarker: 'page2',
        })
        .mockResolvedValueOnce({
          Functions: [{ FunctionName: 'fn-2', FunctionArn: 'arn:2', Runtime: 'python3.11', CodeSize: 100, Timeout: 3, MemorySize: 128, LastModified: '' }],
          NextMarker: undefined,
        });

      const fns = await connector.listFunctions();

      expect(fns).toHaveLength(2);
      expect(fns.map((f) => f.name)).toEqual(['fn-1', 'fn-2']);
    });

    it('returns empty array on error', async () => {
      mockLambdaSend.mockRejectedValue(new Error('Lambda error'));
      expect(await connector.listFunctions()).toEqual([]);
    });
  });

  // ─── listLogGroups ────────────────────────────────────────────────────────

  describe('listLogGroups()', () => {
    it('returns log group names', async () => {
      mockCWLogsSend.mockResolvedValue({
        logGroups: [
          { logGroupName: '/aws/lambda/my-function' },
          { logGroupName: '/aws/ecs/prod' },
        ],
      });

      const groups = await connector.listLogGroups();

      expect(groups).toEqual(['/aws/lambda/my-function', '/aws/ecs/prod']);
    });

    it('filters out groups with no name', async () => {
      mockCWLogsSend.mockResolvedValue({
        logGroups: [{ logGroupName: '/valid' }, { logGroupName: '' }, {}],
      });

      const groups = await connector.listLogGroups();
      expect(groups).toEqual(['/valid']);
    });

    it('returns empty array on error', async () => {
      mockCWLogsSend.mockRejectedValue(new Error('CWLogs error'));
      expect(await connector.listLogGroups()).toEqual([]);
    });
  });

  // ─── getLogEvents ─────────────────────────────────────────────────────────

  describe('getLogEvents()', () => {
    it('returns mapped log events', async () => {
      mockCWLogsSend.mockResolvedValue({
        events: [{
          timestamp: 1700000000000,
          message: 'ERROR: connection refused\n',
          logStreamName: 'stream-1',
        }],
      });

      const events = await connector.getLogEvents('/aws/lambda/fn');

      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('ERROR: connection refused');
      expect(events[0].logStream).toBe('stream-1');
      expect(events[0].logGroup).toBe('/aws/lambda/fn');
    });

    it('returns empty array on error', async () => {
      mockCWLogsSend.mockRejectedValue(new Error('Error'));
      expect(await connector.getLogEvents('/group')).toEqual([]);
    });
  });

  // ─── getMonthlyCost ───────────────────────────────────────────────────────

  describe('getMonthlyCost()', () => {
    it('returns cost summary sorted by amount', async () => {
      mockCESend.mockResolvedValue({
        ResultsByTime: [{
          TimePeriod: { Start: '2024-01-01', End: '2024-01-31' },
          Groups: [
            { Keys: ['Amazon EC2'], Metrics: { UnblendedCost: { Amount: '120.50', Unit: 'USD' } } },
            { Keys: ['Amazon S3'], Metrics: { UnblendedCost: { Amount: '5.20', Unit: 'USD' } } },
            { Keys: ['AWS Lambda'], Metrics: { UnblendedCost: { Amount: '0.80', Unit: 'USD' } } },
          ],
        }],
      });

      const summary = await connector.getMonthlyCost();

      expect(summary).not.toBeNull();
      expect(summary!.byService[0].service).toBe('Amazon EC2');
      expect(summary!.byService[0].amount).toBe(120.50);
      expect(summary!.total).toBeCloseTo(126.50, 1);
      expect(summary!.currency).toBe('USD');
    });

    it('returns null when no results', async () => {
      mockCESend.mockResolvedValue({ ResultsByTime: [] });
      expect(await connector.getMonthlyCost()).toBeNull();
    });

    it('returns null on error', async () => {
      mockCESend.mockRejectedValue(new Error('CostExplorer error'));
      expect(await connector.getMonthlyCost()).toBeNull();
    });
  });

  // ─── getDailyCosts ────────────────────────────────────────────────────────

  describe('getDailyCosts()', () => {
    it('returns one entry per day', async () => {
      mockCESend.mockResolvedValue({
        ResultsByTime: [
          {
            TimePeriod: { Start: '2024-01-01', End: '2024-01-02' },
            Groups: [{ Keys: ['Amazon EC2'], Metrics: { UnblendedCost: { Amount: '4.00', Unit: 'USD' } } }],
          },
          {
            TimePeriod: { Start: '2024-01-02', End: '2024-01-03' },
            Groups: [{ Keys: ['Amazon EC2'], Metrics: { UnblendedCost: { Amount: '4.50', Unit: 'USD' } } }],
          },
        ],
      });

      const days = await connector.getDailyCosts(2);

      expect(days).toHaveLength(2);
      expect(days[0].timePeriod.start).toBe('2024-01-01');
      expect(days[0].total).toBe(4);
      expect(days[1].total).toBe(4.5);
    });

    it('returns empty array on error', async () => {
      mockCESend.mockRejectedValue(new Error('Error'));
      expect(await connector.getDailyCosts()).toEqual([]);
    });
  });
});
