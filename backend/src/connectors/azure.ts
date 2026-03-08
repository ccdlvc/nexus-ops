import { ClientSecretCredential } from '@azure/identity';
import { ComputeManagementClient } from '@azure/arm-compute';
import { ContainerServiceClient } from '@azure/arm-containerservice';
import { MetricsQueryClient, LogsQueryClient, Durations } from '@azure/monitor-query';
import { CostManagementClient } from '@azure/arm-costmanagement';
import {
  AzureVM, AzureAKSCluster,
  AzureMetricSeries, AzureMetricDataPoint,
  AzureLogRow, AzureCostSummary, AzureCostItem,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class AzureConnector {
  private readonly subscriptionId: string;
  private readonly credential: ClientSecretCredential;

  constructor(
    tenantId: string,
    clientId: string,
    clientSecret: string,
    subscriptionId: string,
  ) {
    this.subscriptionId = subscriptionId;
    this.credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  // ─── Compute (VMs) ───────────────────────────────────────────────────────────

  /** List all VMs in the subscription with their current power state. */
  async listVMs(): Promise<AzureVM[]> {
    try {
      const client = new ComputeManagementClient(this.credential, this.subscriptionId);
      const vms: AzureVM[] = [];
      for await (const vm of client.virtualMachines.listAll({ statusOnly: 'true' })) {
        vms.push(this.mapVM(vm as unknown as Record<string, unknown>));
      }
      return vms;
    } catch (err) {
      logger.error('Azure listVMs failed', { err });
      return [];
    }
  }

  // ─── AKS ─────────────────────────────────────────────────────────────────────

  /** List all AKS managed clusters in the subscription. */
  async listAKSClusters(): Promise<AzureAKSCluster[]> {
    try {
      const client = new ContainerServiceClient(this.credential, this.subscriptionId);
      const clusters: AzureAKSCluster[] = [];
      for await (const cluster of client.managedClusters.list()) {
        clusters.push(this.mapAKSCluster(cluster as unknown as Record<string, unknown>));
      }
      return clusters;
    } catch (err) {
      logger.error('Azure listAKSClusters failed', { err });
      return [];
    }
  }

  // ─── Azure Monitor Metrics ────────────────────────────────────────────────────

  /**
   * Query one or more metrics for an Azure resource.
   * @param resourceId - Full ARM resource ID
   *   e.g. /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Compute/virtualMachines/{name}
   * @param metricNames - e.g. ['Percentage CPU', 'Network In Total']
   * @param hours       - Look-back window (default 1)
   * @param granularity - ISO 8601 duration e.g. 'PT5M' (default)
   */
  async getMetrics(
    resourceId: string,
    metricNames: string[],
    hours: number = 1,
    granularity: string = 'PT5M',
  ): Promise<AzureMetricSeries[]> {
    try {
      const client = new MetricsQueryClient(this.credential);
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 3_600_000);
      const result = await client.queryResource(resourceId, metricNames, {
        granularity,
        timespan: { startTime, endTime },
      });
      return result.metrics.map((m) => ({
        name: m.name,
        unit: m.unit ?? 'Unspecified',
        data: (m.timeseries?.[0]?.data ?? []).map((pt): AzureMetricDataPoint => ({
          timestamp: pt.timeStamp.toISOString(),
          average: pt.average,
          total: pt.total,
          minimum: pt.minimum,
          maximum: pt.maximum,
          count: pt.count,
        })),
      }));
    } catch (err) {
      logger.error('Azure getMetrics failed', { resourceId, metricNames, err });
      return [];
    }
  }

  // ─── Log Analytics ────────────────────────────────────────────────────────────

  /**
   * Run a Kusto (KQL) query against a Log Analytics workspace.
   * @param workspaceId - Log Analytics workspace ID (GUID)
   * @param query       - KQL query string, e.g. 'AppExceptions | limit 50'
   * @param hours       - Look-back window (default 1)
   */
  async queryLogs(workspaceId: string, query: string, hours: number = 1): Promise<AzureLogRow[]> {
    try {
      const client = new LogsQueryClient(this.credential);
      const duration = `PT${hours}H` as typeof Durations.oneHour;
      const result = await client.queryWorkspace(workspaceId, query, { duration });
      if (result.status !== 'Success' || !result.tables?.length) return [];

      const table = result.tables[0];
      const cols = table.columnDescriptors.map((c) => c.name ?? '');
      const tsIdx = cols.findIndex((c) => /^time/i.test(c));
      const msgIdx = cols.findIndex((c) => /message|body|description/i.test(c));
      const sevIdx = cols.findIndex((c) => /severity|level/i.test(c));

      return table.rows.map((row) => {
        const obj: AzureLogRow = {
          timestamp: tsIdx >= 0 ? String(row[tsIdx] ?? '') : new Date().toISOString(),
          message: msgIdx >= 0 ? String(row[msgIdx] ?? '') : JSON.stringify(row),
          severity: sevIdx >= 0 ? String(row[sevIdx] ?? '') : undefined,
        };
        cols.forEach((col, i) => { if (i !== tsIdx && i !== msgIdx && i !== sevIdx) obj[col] = row[i]; });
        return obj;
      });
    } catch (err) {
      logger.error('Azure queryLogs failed', { workspaceId, err });
      return [];
    }
  }

  // ─── Cost Management ─────────────────────────────────────────────────────────

  /** Monthly-to-date cost grouped by service name. */
  async getMonthlyCost(): Promise<AzureCostSummary | null> {
    try {
      const client = new CostManagementClient(this.credential);
      const scope = `/subscriptions/${this.subscriptionId}`;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = now.toISOString().slice(0, 10);

      const result = await client.query.usage(scope, {
        type: 'Usage',
        timeframe: 'Custom',
        timePeriod: { from: new Date(start), to: new Date(end) },
        dataset: {
          granularity: 'None',
          grouping: [{ type: 'Dimension', name: 'ServiceName' }],
          aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } },
        },
      });

      return this.mapCostResult(result as Record<string, unknown>, start, end);
    } catch (err) {
      logger.error('Azure getMonthlyCost failed', { err });
      return null;
    }
  }

  /** Daily costs for the past N days, grouped by service name. */
  async getDailyCosts(days: number = 7): Promise<AzureCostSummary[]> {
    try {
      const client = new CostManagementClient(this.credential);
      const scope = `/subscriptions/${this.subscriptionId}`;
      const end = new Date();
      const start = new Date(end.getTime() - days * 86_400_000);

      const result = await client.query.usage(scope, {
        type: 'Usage',
        timeframe: 'Custom',
        timePeriod: { from: start, to: end },
        dataset: {
          granularity: 'Daily',
          grouping: [{ type: 'Dimension', name: 'ServiceName' }],
          aggregation: { totalCost: { name: 'PreTaxCost', function: 'Sum' } },
        },
      });

      return this.mapDailyCostResult(result as Record<string, unknown>);
    } catch (err) {
      logger.error('Azure getDailyCosts failed', { err });
      return [];
    }
  }

  // ─── Private mappers ─────────────────────────────────────────────────────────

  private mapVM(vm: Record<string, unknown>): AzureVM {
    const id = vm.id as string ?? '';
    const resourceGroup = id.split('/').find((_, i, a) => a[i - 1]?.toLowerCase() === 'resourcegroups') ?? '';
    const props = vm.properties as Record<string, unknown> ?? {};
    const hwProfile = props.hardwareProfile as Record<string, unknown> ?? {};
    const storProfile = props.storageProfile as Record<string, unknown> ?? {};
    const osProfile = storProfile.osDisk as Record<string, unknown> ?? {};
    const instanceView = props.instanceView as Record<string, unknown> | undefined;
    const statuses = instanceView?.statuses as Array<Record<string, string>> ?? [];
    const powerStatus = statuses.find((s) => s.code?.startsWith('PowerState/'));
    const tags = (vm.tags as Record<string, string>) ?? {};

    return {
      id,
      name: vm.name as string ?? '',
      location: vm.location as string ?? '',
      resourceGroup,
      size: hwProfile.vmSize as string ?? '',
      provisioningState: props.provisioningState as string ?? '',
      powerState: powerStatus?.code?.replace('PowerState/', ''),
      osType: osProfile.osType as string | undefined,
      tags,
    };
  }

  private mapAKSCluster(c: Record<string, unknown>): AzureAKSCluster {
    const id = c.id as string ?? '';
    const resourceGroup = id.split('/').find((_, i, a) => a[i - 1]?.toLowerCase() === 'resourcegroups') ?? '';
    const props = c.properties as Record<string, unknown> ?? {};
    const agentPools = (props.agentPoolProfiles as Array<Record<string, unknown>>) ?? [];
    const nodeCount = agentPools.reduce((sum, p) => sum + ((p.count as number) ?? 0), 0);

    return {
      id,
      name: c.name as string ?? '',
      location: c.location as string ?? '',
      resourceGroup,
      kubernetesVersion: props.kubernetesVersion as string ?? '',
      provisioningState: props.provisioningState as string ?? '',
      nodeCount,
      fqdn: props.fqdn as string | undefined,
      tags: (c.tags as Record<string, string>) ?? {},
    };
  }

  private mapCostResult(result: Record<string, unknown>, start: string, end: string): AzureCostSummary {
    const columns: Array<{ name: string }> = (result.columns as Array<{ name: string }>) ?? [];
    const rows: unknown[][] = (result.rows as unknown[][]) ?? [];

    const costIdx = columns.findIndex((c) => /cost|amount/i.test(c.name));
    const svcIdx = columns.findIndex((c) => /service/i.test(c.name));
    const curIdx = columns.findIndex((c) => /currency/i.test(c.name));

    const byService: AzureCostItem[] = rows
      .map((row) => ({
        service: svcIdx >= 0 ? String(row[svcIdx] ?? 'Unknown') : 'Unknown',
        amount: costIdx >= 0 ? Math.round((Number(row[costIdx]) ?? 0) * 100) / 100 : 0,
        currency: curIdx >= 0 ? String(row[curIdx] ?? 'USD') : 'USD',
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      timePeriod: { start, end },
      total: Math.round(byService.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      currency: byService[0]?.currency ?? 'USD',
      byService,
    };
  }

  private mapDailyCostResult(result: Record<string, unknown>): AzureCostSummary[] {
    const columns: Array<{ name: string }> = (result.columns as Array<{ name: string }>) ?? [];
    const rows: unknown[][] = (result.rows as unknown[][]) ?? [];

    const costIdx = columns.findIndex((c) => /cost|amount/i.test(c.name));
    const svcIdx = columns.findIndex((c) => /service/i.test(c.name));
    const curIdx = columns.findIndex((c) => /currency/i.test(c.name));
    const dateIdx = columns.findIndex((c) => /date|time/i.test(c.name));

    // Group rows by date
    const byDate = new Map<string, AzureCostItem[]>();
    for (const row of rows) {
      const dateRaw = dateIdx >= 0 ? String(row[dateIdx] ?? '') : '';
      const date = dateRaw.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push({
        service: svcIdx >= 0 ? String(row[svcIdx] ?? 'Unknown') : 'Unknown',
        amount: costIdx >= 0 ? Math.round((Number(row[costIdx]) ?? 0) * 100) / 100 : 0,
        currency: curIdx >= 0 ? String(row[curIdx] ?? 'USD') : 'USD',
      });
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        timePeriod: { start: date, end: date },
        total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100,
        currency: items[0]?.currency ?? 'USD',
        byService: items.sort((a, b) => b.amount - a.amount),
      }));
  }
}
