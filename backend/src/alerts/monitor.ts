/**
 * @module alerts/monitor
 * @description Background alert polling engine.
 *
 * AlertMonitor runs on a 2-minute cron schedule and:
 *   1. Fetches live metrics from every configured connector (Portainer, Jenkins,
 *      Kibana, AWS, GCP, Azure, Grafana) with graceful per-source fallback.
 *   2. Runs AnomalyDetector across the raw data.
 *   3. Evaluates the database alert rules against measured values.
 *   4. Deduplicates alerts: skips if an identical rule fired within 10 minutes.
 *      For Portainer, deduplication is per container+rule so that a memory
 *      spike on container A does not suppress an alert for container B.
 *   5. Persists new alerts and matching incidents to PostgreSQL in a single
 *      atomic transaction.
 *   6. Separately ingests firing Grafana Alertmanager alerts (bypassing rules).
 *   7. Broadcasts every new alert over WebSocket to all connected clients.
 *
 * Singleton connectors are created once per AlertMonitor instance and reused
 * across all poll cycles.
 */
import { WebSocketServer, WebSocket } from 'ws';
import schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../storage/db';
import { alerts, alertRules, incidents } from '../storage/schema';
import { JenkinsConnector } from '../connectors/jenkins';
import { KibanaConnector } from '../connectors/kibana';
import { PortainerConnector } from '../connectors/portainer';
import { AWSConnector } from '../connectors/aws';
import { GCPConnector } from '../connectors/gcp';
import { AzureConnector } from '../connectors/azure';
import { GrafanaConnector } from '../connectors/grafana';
import { AnomalyDetector } from '../ai/anomalyDetection';
import { AIAgent } from '../ai/agent';
import { AlertRule, Alert, DataSource } from '../../../shared/types';
import { logger } from '../utils/logger';
import { alertsTotal } from '../metrics/registry';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';

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
  private readonly grafana = new GrafanaConnector(
    process.env.GRAFANA_URL || 'http://grafana:3000',
    process.env.GRAFANA_TOKEN ?? '',
  );

  constructor(private readonly wss: WebSocketServer) {}

  start(): void {
    schedule.scheduleJob('*/2 * * * *', () => this.poll().catch((err) => logger.error('Alert poll error', { err })));
    logger.info('AlertMonitor started — polling every 2 minutes');
  }

  private async poll(): Promise<void> {
    const rules = await db.select().from(alertRules).where(eq(alertRules.enabled, true));

    const [containers, builds, errorTrends, cloudMetrics] = await Promise.all([
      this.safeGetContainers(),
      this.safeGetBuilds(),
      this.safeGetErrorTrends(),
      this.safeGetCloudMetrics(),
    ]);

    // Ingest Grafana Alertmanager alerts directly (parallel, independent of rule-based flow)
    await this.safeIngestGrafanaAlerts();

    // Anomaly detection across all sources
    const anomalies = await this.detector.detectAll({ containers, builds, errorTrends });

    for (const rule of rules) {
      let value: number | undefined;

      const anomaly = anomalies.find((a) => a.source === rule.source && a.metric === rule.metric);
      if (anomaly) value = anomaly.value;

      if (value === undefined) {
        const cloudMetric = cloudMetrics.find((m) => m.source === rule.source && m.metric === rule.metric);
        if (cloudMetric) value = cloudMetric.value;
      }

      if (value === undefined) continue;

      const triggered = this.evaluateCondition(value, rule.condition, rule.threshold);
      if (!triggered) continue;

      // Build a specific title and affected-services list for portainer alerts
      const containerName = anomaly?.resourceName;
      const serverName = anomaly?.endpointName;
      const incidentTitle = (rule.source === 'portainer' && containerName)
        ? `${rule.name}: ${containerName}${serverName ? ` on ${serverName}` : ''}`
        : rule.name;
      const affectedServices: string[] = (rule.source === 'portainer' && containerName)
        ? [containerName, ...(serverName ? [serverName] : [])]
        : [rule.source];

      // For Portainer, dedup per container+rule so different containers don't suppress each other
      const dedupKey = (rule.source === 'portainer' && containerName)
        ? `${rule.id}:${containerName}`
        : rule.id;

      // Avoid duplicate alerts (same rule in last 10 minutes)
      const recent = await db
        .select({ id: alerts.id })
        .from(alerts)
        .where(and(
          eq(alerts.ruleId, dedupKey),
          isNull(alerts.resolvedAt),
          gt(alerts.triggeredAt, sql`now() - interval '10 minutes'`),
        ))
        .limit(1);
      if (recent.length) continue;

      const alert: Alert = {
        id: uuidv4(),
        ruleId: dedupKey,
        ruleName: rule.name,
        severity: rule.severity,
        source: rule.source,
        message: anomaly?.description ?? rule.message,
        value,
        threshold: rule.threshold,
        triggeredAt: new Date().toISOString(),
        acknowledged: false,
      };

      const incId = `inc-${alert.id}`;

      // Atomic: insert alert + matching incident together
      await db.transaction(async (tx) => {
        await tx.insert(alerts).values({
          id:          alert.id,
          ruleId:      alert.ruleId,
          ruleName:    alert.ruleName,
          severity:    alert.severity,
          source:      alert.source,
          message:     alert.message,
          value:       alert.value,
          threshold:   alert.threshold,
          triggeredAt: new Date(alert.triggeredAt),
        });

        await tx.insert(incidents).values({
          id:              incId,
          title:           incidentTitle,
          summary:         alert.message,
          severity:        alert.severity,
          status:          'open',
          rootCause:       `${incidentTitle} triggered: measured value ${alert.value} exceeded threshold ${alert.threshold}. ${alert.message}`,
          fixes:           [],
          correlations:    [],
          affectedServices: affectedServices,
          tags:            [alert.source, alert.severity],
        }).onConflictDoNothing();
      });

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
      case 'gt':  return value >  threshold;
      case 'gte': return value >= threshold;
      case 'lt':  return value <  threshold;
      case 'lte': return value <= threshold;
      case 'eq':  return value === threshold;
    }
  }

  private async safeGetContainers() {
    if (!process.env.PORTAINER_URL) return [];
    try {
      const endpoints = await this.portainer.listEndpoints();
      const onlineEndpoints = endpoints.filter((e) => e.status === 1);
      if (!onlineEndpoints.length) return [];
      const perEndpoint = await Promise.all(
        onlineEndpoints.map((ep) => this.portainer.getContainersForEndpoint(ep.id, ep.name))
      );
      return perEndpoint.flat();
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

  private async safeIngestGrafanaAlerts(): Promise<void> {
    if (!process.env.GRAFANA_URL || !process.env.GRAFANA_TOKEN) return;
    try {
      const instances = await this.grafana.listAlertInstances();
      const firing = instances.filter((i) => i.state === 'active' || i.state === 'unprocessed');

      for (const instance of firing) {
        const ruleId = `grafana:${instance.fingerprint}`;

        const recent = await db
          .select({ id: alerts.id })
          .from(alerts)
          .where(and(
            eq(alerts.ruleId, ruleId),
            isNull(alerts.resolvedAt),
            gt(alerts.triggeredAt, sql`now() - interval '10 minutes'`),
          ))
          .limit(1);
        if (recent.length) continue;

        const alert: Alert = {
          id:           uuidv4(),
          ruleId,
          ruleName:     instance.name,
          severity:     instance.severity,
          source:       'grafana',
          message:      instance.summary || instance.name,
          value:        1,
          threshold:    0,
          triggeredAt:  instance.startsAt,
          acknowledged: false,
        };

        const incId = `inc-${alert.id}`;
        const folder = instance.folder ? `[${instance.folder}] ` : '';

        // Atomic: insert alert + matching incident together
        await db.transaction(async (tx) => {
          await tx.insert(alerts).values({
            id:          alert.id,
            ruleId:      alert.ruleId,
            ruleName:    alert.ruleName,
            severity:    alert.severity,
            source:      alert.source,
            message:     alert.message,
            value:       alert.value,
            threshold:   alert.threshold,
            triggeredAt: new Date(alert.triggeredAt),
          });

          await tx.insert(incidents).values({
            id:              incId,
            title:           `${folder}${instance.name}`,
            summary:         instance.summary || instance.name,
            severity:        instance.severity,
            status:          'open',
            rootCause:       `Grafana alert "${instance.name}" is firing. ${instance.summary}`,
            fixes:           [],
            correlations:    [],
            affectedServices:['grafana'],
            tags:            ['grafana', instance.severity, ...(instance.folder ? [instance.folder] : [])],
          }).onConflictDoNothing();
        });

        alertsTotal.inc({ severity: alert.severity, source: 'grafana' });
        this.broadcast({ type: 'alert', data: alert });
        logger.warn(`Grafana alert ingested: ${instance.name}`, { fingerprint: instance.fingerprint, severity: instance.severity });
      }
    } catch (err) {
      logger.debug('Grafana alert ingestion failed', { err });
    }
  }
}
