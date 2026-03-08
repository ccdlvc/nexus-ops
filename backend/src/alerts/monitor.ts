import { WebSocketServer, WebSocket } from 'ws';
import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../storage/db';
import { JenkinsConnector } from '../connectors/jenkins';
import { KibanaConnector } from '../connectors/kibana';
import { PortainerConnector } from '../connectors/portainer';
import { AWSConnector } from '../connectors/aws';
import { GCPConnector } from '../connectors/gcp';
import { AzureConnector } from '../connectors/azure';
import { AnomalyDetector } from '../ai/anomalyDetection';
import { AIAgent } from '../ai/agent';
import { AlertRule, Alert, DataSource } from '../../../shared/types';
import { logger } from '../utils/logger';
import { alertsTotal } from '../metrics/registry';

export class AlertMonitor {
  private readonly agent = new AIAgent();
  private readonly detector = new AnomalyDetector(this.agent);
  private readonly portainer = new PortainerConnector(
    process.env.PORTAINER_URL || 'http://portainer:9000',
    process.env.PORTAINER_TOKEN ?? '',
  );
  private readonly jenkins = new JenkinsConnector(
    process.env.JENKINS_URL || 'http://jenkins:8080',
    process.env.JENKINS_USER || 'admin',
    process.env.JENKINS_TOKEN ?? '',
  );
  private readonly kibana = new KibanaConnector(
    process.env.KIBANA_URL || 'http://kibana:5601',
    process.env.KIBANA_USER || 'elastic',
    process.env.KIBANA_PASSWORD ?? '',
    process.env.KIBANA_INDEX || 'logs-*',
  );

  constructor(private readonly wss: WebSocketServer) {}

  start(): void {
    // Run every 2 minutes
    schedule.scheduleJob('*/2 * * * *', () => this.poll().catch((err) => logger.error('Alert poll error', { err })));
    logger.info('AlertMonitor started — polling every 2 minutes');
  }

  private async poll(): Promise<void> {
    const rules = db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all() as Record<string, unknown>[];

    const [containers, builds, errorTrends, cloudMetrics] = await Promise.all([
      this.safeGetContainers(),
      this.safeGetBuilds(),
      this.safeGetErrorTrends(),
      this.safeGetCloudMetrics(),
    ]);

    // Anomaly detection across all sources
    const anomalies = await this.detector.detectAll({ containers, builds, errorTrends });

    // Map anomalies to alert rules and fire alerts
    for (const rule of rules.map(this.rowToRule)) {
      let value: number | undefined;

      // Check anomaly detector results for on-premise sources
      const anomaly = anomalies.find((a) => a.source === rule.source && a.metric === rule.metric);
      if (anomaly) {
        value = anomaly.value;
      }

      // Check cloud metrics directly for AWS/GCP/Azure rules
      if (value === undefined) {
        const cloudMetric = cloudMetrics.find((m) => m.source === rule.source && m.metric === rule.metric);
        if (cloudMetric) value = cloudMetric.value;
      }

      if (value === undefined) continue;

      const triggered = this.evaluateCondition(value, rule.condition, rule.threshold);
      if (!triggered) continue;

      // Avoid duplicate alerts (same rule in last 10 minutes)
      const recent = db.prepare(
        'SELECT id FROM alerts WHERE rule_id = ? AND triggered_at > datetime(\'now\', \'-10 minutes\') AND resolved_at IS NULL LIMIT 1'
      ).get(rule.id);
      if (recent) continue;

      const alert: Alert = {
        id: uuidv4(),
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        source: rule.source,
        message: rule.message,
        value,
        threshold: rule.threshold,
        triggeredAt: new Date().toISOString(),
        acknowledged: false,
      };

      db.prepare(
        'INSERT INTO alerts (id, rule_id, rule_name, severity, source, message, value, threshold) VALUES (?,?,?,?,?,?,?,?)'
      ).run(alert.id, alert.ruleId, alert.ruleName, alert.severity, alert.source, alert.message, alert.value, alert.threshold);

      // Auto-create a matching incident so it appears in the Incidents page
      const incId = `inc-${alert.id}`;
      db.prepare(`
        INSERT OR IGNORE INTO incidents
          (id, title, summary, severity, status, root_cause, fixes_json, correlations_json, affected_services_json, tags_json)
        VALUES (?, ?, ?, ?, 'open', ?, '[]', '[]', ?, ?)
      `).run(
        incId,
        alert.ruleName,
        alert.message,
        alert.severity,
        `${alert.ruleName} triggered on source "${alert.source}": measured value ${alert.value} exceeded threshold ${alert.threshold}. ${alert.message}`,
        JSON.stringify([alert.source]),
        JSON.stringify([alert.source, alert.severity]),
      );

      alertsTotal.inc({ severity: alert.severity, source: alert.source });
      this.broadcast({ type: 'alert', data: alert });
      logger.warn(`Alert fired: ${alert.ruleName} — ${alert.message}`, { alert });
    }
  }

  private broadcast(payload: unknown): void {
    const msg = JSON.stringify(payload);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  private evaluateCondition(value: number, condition: AlertRule['condition'], threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
    }
  }

  private rowToRule(r: Record<string, unknown>): AlertRule {
    return {
      id: r.id as string, name: r.name as string, source: r.source as AlertRule['source'],
      metric: r.metric as string, condition: r.condition as AlertRule['condition'],
      threshold: r.threshold as number, severity: r.severity as AlertRule['severity'],
      message: r.message as string, enabled: r.enabled === 1,
    };
  }

  private async safeGetContainers() {
    if (!process.env.PORTAINER_URL) return [];
    try {
      const endpoints = await this.portainer.listEndpoints();
      if (!endpoints.length) return [];
      const envId = parseInt(process.env.PORTAINER_ENDPOINT ?? '0', 10);
      // Prefer the configured endpoint if it exists in the list, otherwise fall back to first online
      const target = envId > 0
        ? (endpoints.find((e) => e.id === envId) ?? endpoints.find((e) => e.status === 1))
        : endpoints.find((e) => e.status === 1);
      if (!target) return [];
      return await this.portainer.getContainersForEndpoint(target.id);
    } catch { return []; }
  }

  private async safeGetBuilds() {
    if (!process.env.JENKINS_URL) return [];
    try {
      const jobs = await this.jenkins.listJobs();
      const all = await Promise.all(jobs.slice(0, 5).map((job) => this.jenkins.getBuilds(job, 5)));
      return all.flat();
    } catch { return []; }
  }

  private async safeGetErrorTrends() {
    if (!process.env.KIBANA_URL) return [];
    try {
      return await this.kibana.getErrorTrends(2);
    } catch { return []; }
  }

  /** Compute a flat list of {source, metric, value} for cloud resources. */
  private async safeGetCloudMetrics(): Promise<Array<{ source: DataSource; metric: string; value: number }>> {
    const metrics: Array<{ source: DataSource; metric: string; value: number }> = [];

    // ─── AWS ──────────────────────────────────────────────────────────────────
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      try {
        const aws = new AWSConnector(
          process.env.AWS_ACCESS_KEY_ID,
          process.env.AWS_SECRET_ACCESS_KEY,
          process.env.AWS_REGION ?? 'us-east-1',
          process.env.AWS_SESSION_TOKEN,
        );
        const [instances, functions, cost] = await Promise.all([
          aws.listInstances().catch(() => []),
          aws.listFunctions().catch(() => []),
          aws.getMonthlyCost().catch(() => null),
        ]);
        metrics.push({ source: 'aws', metric: 'stoppedInstanceCount', value: instances.filter((i) => i.state === 'stopped').length });
        metrics.push({ source: 'aws', metric: 'lambdaFunctionCount', value: functions.length });
        if (cost) metrics.push({ source: 'aws', metric: 'monthlyCostUSD', value: cost.total });
      } catch (err) {
        logger.debug('AWS cloud metrics fetch failed', { err });
      }
    }

    // ─── GCP ──────────────────────────────────────────────────────────────────
    if (process.env.GCP_PROJECT_ID) {
      try {
        const gcp = new GCPConnector(
          process.env.GCP_PROJECT_ID,
          process.env.GCP_CLIENT_EMAIL,
          process.env.GCP_PRIVATE_KEY,
        );
        const [instances, clusters] = await Promise.all([
          gcp.listInstances().catch(() => []),
          gcp.listClusters().catch(() => []),
        ]);
        metrics.push({ source: 'gcp', metric: 'terminatedInstanceCount', value: instances.filter((i) => i.status === 'TERMINATED').length });
        metrics.push({ source: 'gcp', metric: 'clusterNotRunningCount', value: clusters.filter((c) => c.status !== 'RUNNING').length });
      } catch (err) {
        logger.debug('GCP cloud metrics fetch failed', { err });
      }
    }

    // ─── Azure ────────────────────────────────────────────────────────────────
    if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
      try {
        const azure = new AzureConnector(
          process.env.AZURE_TENANT_ID,
          process.env.AZURE_CLIENT_ID,
          process.env.AZURE_CLIENT_SECRET,
          process.env.AZURE_SUBSCRIPTION_ID ?? '',
        );
        const [vms, clusters, cost] = await Promise.all([
          azure.listVMs().catch(() => []),
          azure.listAKSClusters().catch(() => []),
          azure.getMonthlyCost().catch(() => null),
        ]);
        metrics.push({ source: 'azure', metric: 'deallocatedVMCount', value: vms.filter((v) => v.powerState?.toLowerCase() === 'deallocated').length });
        metrics.push({ source: 'azure', metric: 'aksNotSucceededCount', value: clusters.filter((c) => c.provisioningState !== 'Succeeded').length });
        if (cost) metrics.push({ source: 'azure', metric: 'monthlyCostUSD', value: cost.total });
      } catch (err) {
        logger.debug('Azure cloud metrics fetch failed', { err });
      }
    }

    return metrics;
  }
}
