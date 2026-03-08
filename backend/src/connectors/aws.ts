import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import {
  ECSClient, ListClustersCommand, DescribeClustersCommand,
  ListServicesCommand, DescribeServicesCommand,
} from '@aws-sdk/client-ecs';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import {
  CloudWatchClient, GetMetricStatisticsCommand,
  type Dimension, type Statistic,
} from '@aws-sdk/client-cloudwatch';
import {
  CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { CostExplorerClient, GetCostAndUsageCommand, type GroupDefinition } from '@aws-sdk/client-cost-explorer';
import {
  AWSEC2Instance, AWSECSCluster, AWSECSService, AWSLambdaFunction,
  AWSCostSummary, AWSCostItem, AWSCloudWatchDataPoint, AWSLogEvent,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class AWSConnector {
  private readonly region: string;
  private readonly clientConfig: {
    credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
    region: string;
  };

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string = 'us-east-1',
    sessionToken?: string,
  ) {
    this.region = region;
    this.clientConfig = {
      credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) },
      region,
    };
  }

  // ─── EC2 ────────────────────────────────────────────────────────────────────

  async listInstances(): Promise<AWSEC2Instance[]> {
    try {
      const client = new EC2Client(this.clientConfig);
      const { Reservations = [] } = await client.send(new DescribeInstancesCommand({}));
      const instances: AWSEC2Instance[] = [];
      for (const reservation of Reservations) {
        for (const inst of reservation.Instances ?? []) {
          instances.push(this.mapEC2Instance(inst as unknown as Record<string, unknown>));
        }
      }
      return instances;
    } catch (err) {
      logger.error('AWS listInstances failed', { err });
      return [];
    }
  }

  // ─── ECS ────────────────────────────────────────────────────────────────────

  async listClusters(): Promise<AWSECSCluster[]> {
    try {
      const client = new ECSClient(this.clientConfig);
      const { clusterArns = [] } = await client.send(new ListClustersCommand({}));
      if (!clusterArns.length) return [];
      const { clusters = [] } = await client.send(new DescribeClustersCommand({ clusters: clusterArns }));
      return clusters.map((c) => this.mapECSCluster(c as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('AWS listClusters failed', { err });
      return [];
    }
  }

  async listServices(clusterArn: string): Promise<AWSECSService[]> {
    try {
      const client = new ECSClient(this.clientConfig);
      const { serviceArns = [] } = await client.send(
        new ListServicesCommand({ cluster: clusterArn })
      );
      if (!serviceArns.length) return [];
      const { services = [] } = await client.send(
        new DescribeServicesCommand({ cluster: clusterArn, services: serviceArns })
      );
      return services.map((s) => this.mapECSService(s as unknown as Record<string, unknown>));
    } catch (err) {
      logger.error('AWS listServices failed', { clusterArn, err });
      return [];
    }
  }

  // ─── Lambda ─────────────────────────────────────────────────────────────────

  async listFunctions(): Promise<AWSLambdaFunction[]> {
    try {
      const client = new LambdaClient(this.clientConfig);
      const functions: AWSLambdaFunction[] = [];
      let marker: string | undefined;

      do {
        const resp = await client.send(new ListFunctionsCommand({ Marker: marker }));
        for (const fn of resp.Functions ?? []) {
          functions.push(this.mapLambda(fn as unknown as Record<string, unknown>));
        }
        marker = resp.NextMarker;
      } while (marker);

      return functions;
    } catch (err) {
      logger.error('AWS listFunctions failed', { err });
      return [];
    }
  }

  // ─── CloudWatch ──────────────────────────────────────────────────────────────

  async getMetricStats(
    namespace: string,
    metricName: string,
    dimensions: Array<{ name: string; value: string }>,
    stat: string = 'Average',
    hours: number = 1,
    period: number = 300,
  ): Promise<AWSCloudWatchDataPoint[]> {
    try {
      const client = new CloudWatchClient(this.clientConfig);
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 3_600_000);

      const dims: Dimension[] = dimensions.map((d) => ({ Name: d.name, Value: d.value }));
      const { Datapoints = [] } = await client.send(new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: dims,
        StartTime: startTime,
        EndTime: endTime,
        Period: period,
        Statistics: [stat as Statistic],
      }));

      return Datapoints
        .sort((a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0))
        .map((dp) => ({
          timestamp: dp.Timestamp?.toISOString() ?? '',
          value: (dp as Record<string, unknown>)[stat] as number ?? 0,
          unit: dp.Unit ?? 'None',
        }));
    } catch (err) {
      logger.error('AWS getMetricStats failed', { namespace, metricName, err });
      return [];
    }
  }

  // ─── CloudWatch Logs ─────────────────────────────────────────────────────────

  async listLogGroups(prefix?: string): Promise<string[]> {
    try {
      const client = new CloudWatchLogsClient(this.clientConfig);
      const { logGroups = [] } = await client.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: prefix })
      );
      return logGroups.map((g) => g.logGroupName ?? '').filter(Boolean);
    } catch (err) {
      logger.error('AWS listLogGroups failed', { err });
      return [];
    }
  }

  async getLogEvents(logGroup: string, filterPattern?: string, limit: number = 100): Promise<AWSLogEvent[]> {
    try {
      const client = new CloudWatchLogsClient(this.clientConfig);
      const endTime = Date.now();
      const startTime = endTime - 3_600_000; // last hour
      const { events = [] } = await client.send(new FilterLogEventsCommand({
        logGroupName: logGroup,
        filterPattern,
        startTime,
        endTime,
        limit,
      }));
      return events.map((e) => ({
        timestamp: new Date(e.timestamp ?? 0).toISOString(),
        message: e.message?.trim() ?? '',
        logStream: e.logStreamName ?? '',
        logGroup,
      }));
    } catch (err) {
      logger.error('AWS getLogEvents failed', { logGroup, err });
      return [];
    }
  }

  // ─── Cost Explorer ───────────────────────────────────────────────────────────

  async getMonthlyCost(): Promise<AWSCostSummary | null> {
    // Cost Explorer only works in us-east-1
    try {
      const client = new CostExplorerClient({ ...this.clientConfig, region: 'us-east-1' });
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = now.toISOString().slice(0, 10);

      const groupBy: GroupDefinition[] = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
      const { ResultsByTime = [] } = await client.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: groupBy,
      }));

      const result = ResultsByTime[0];
      if (!result) return null;

      const byService: AWSCostItem[] = (result.Groups ?? []).map((g) => ({
        service: g.Keys?.[0] ?? 'Unknown',
        amount: parseFloat(g.Metrics?.['UnblendedCost']?.Amount ?? '0'),
        currency: g.Metrics?.['UnblendedCost']?.Unit ?? 'USD',
      })).sort((a, b) => b.amount - a.amount);

      const total = byService.reduce((s, i) => s + i.amount, 0);
      return {
        timePeriod: { start, end },
        total: Math.round(total * 100) / 100,
        currency: byService[0]?.currency ?? 'USD',
        byService,
      };
    } catch (err) {
      logger.error('AWS getMonthlyCost failed', { err });
      return null;
    }
  }

  async getDailyCosts(days: number = 7): Promise<AWSCostSummary[]> {
    try {
      const client = new CostExplorerClient({ ...this.clientConfig, region: 'us-east-1' });
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

      const groupBy: GroupDefinition[] = [{ Type: 'DIMENSION', Key: 'SERVICE' }];
      const { ResultsByTime = [] } = await client.send(new GetCostAndUsageCommand({
        TimePeriod: { Start: start, End: end },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
        GroupBy: groupBy,
      }));

      return ResultsByTime.map((r) => {
        const byService: AWSCostItem[] = (r.Groups ?? []).map((g) => ({
          service: g.Keys?.[0] ?? 'Unknown',
          amount: parseFloat(g.Metrics?.['UnblendedCost']?.Amount ?? '0'),
          currency: g.Metrics?.['UnblendedCost']?.Unit ?? 'USD',
        })).sort((a, b) => b.amount - a.amount);
        const total = byService.reduce((s, i) => s + i.amount, 0);
        return {
          timePeriod: { start: r.TimePeriod?.Start ?? '', end: r.TimePeriod?.End ?? '' },
          total: Math.round(total * 100) / 100,
          currency: byService[0]?.currency ?? 'USD',
          byService,
        };
      });
    } catch (err) {
      logger.error('AWS getDailyCosts failed', { err });
      return [];
    }
  }

  // ─── Private mappers ─────────────────────────────────────────────────────────

  private mapEC2Instance(inst: Record<string, unknown>): AWSEC2Instance {
    const tags = ((inst.Tags as Array<Record<string, string>>) ?? []).reduce(
      (acc: Record<string, string>, t) => { acc[t.Key ?? ''] = t.Value ?? ''; return acc; },
      {} as Record<string, string>,
    );
    const placement = inst.Placement as Record<string, unknown> ?? {};
    return {
      id: inst.InstanceId as string ?? '',
      name: tags['Name'] ?? inst.InstanceId as string ?? '',
      state: ((inst.State as Record<string, unknown>)?.Name as string ?? 'stopped') as AWSEC2Instance['state'],
      type: inst.InstanceType as string ?? '',
      region: this.region,
      availabilityZone: placement.AvailabilityZone as string ?? this.region,
      publicIp: inst.PublicIpAddress as string | undefined,
      privateIp: inst.PrivateIpAddress as string | undefined,
      launchTime: (inst.LaunchTime as Date)?.toISOString() ?? '',
      tags,
    };
  }

  private mapECSCluster(c: Record<string, unknown>): AWSECSCluster {
    return {
      arn: c.clusterArn as string ?? '',
      name: c.clusterName as string ?? '',
      status: c.status as string ?? '',
      activeServiceCount: c.activeServicesCount as number ?? 0,
      runningTaskCount: c.runningTasksCount as number ?? 0,
      pendingTaskCount: c.pendingTasksCount as number ?? 0,
      registeredContainerInstancesCount: c.registeredContainerInstancesCount as number ?? 0,
    };
  }

  private mapECSService(s: Record<string, unknown>): AWSECSService {
    return {
      arn: s.serviceArn as string ?? '',
      name: s.serviceName as string ?? '',
      clusterArn: s.clusterArn as string ?? '',
      status: s.status as string ?? '',
      desiredCount: s.desiredCount as number ?? 0,
      runningCount: s.runningCount as number ?? 0,
      pendingCount: s.pendingCount as number ?? 0,
      taskDefinition: s.taskDefinition as string ?? '',
      launchType: s.launchType as string | undefined,
    };
  }

  private mapLambda(fn: Record<string, unknown>): AWSLambdaFunction {
    return {
      name: fn.FunctionName as string ?? '',
      arn: fn.FunctionArn as string ?? '',
      runtime: fn.Runtime as string ?? '',
      state: (fn.State as Record<string, unknown>)?.State as string | undefined,
      codeSize: fn.CodeSize as number ?? 0,
      timeout: fn.Timeout as number ?? 3,
      memorySize: fn.MemorySize as number ?? 128,
      lastModified: fn.LastModified as string ?? '',
      description: fn.Description as string | undefined,
    };
  }
}
