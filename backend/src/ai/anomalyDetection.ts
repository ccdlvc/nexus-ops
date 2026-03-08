import { AIAgent } from './agent';
import { AnomalyResult, ContainerHealth, BuildResult, ErrorTrend, Severity } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class AnomalyDetector {
  constructor(private readonly agent: AIAgent) {}

  /** Detect anomalies across all data sources */
  async detectAll(data: {
    containers?: ContainerHealth[];
    builds?: BuildResult[];
    errorTrends?: ErrorTrend[];
  }): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = [];

    if (data.containers?.length) anomalies.push(...this.detectContainerAnomalies(data.containers));
    if (data.builds?.length) anomalies.push(...this.detectBuildAnomalies(data.builds));
    if (data.errorTrends?.length) anomalies.push(...this.detectErrorAnomalies(data.errorTrends));

    // Use AI to find cross-cutting patterns
    if (anomalies.length >= 2) {
      const aiSuggested = await this.aiPatternDetect(anomalies, data);
      anomalies.push(...aiSuggested);
    }

    logger.info(`Anomaly detection found ${anomalies.length} anomalies`);
    return anomalies;
  }

  private detectContainerAnomalies(containers: ContainerHealth[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    const now = new Date().toISOString();

    for (const c of containers) {
      if (c.memoryPercent > 95) {
        results.push({ id: uuidv4(), detectedAt: now, metric: 'memoryPercent', value: c.memoryPercent, baseline: 60, deviation: ((c.memoryPercent - 60) / 60) * 100, severity: 'critical', source: 'portainer', description: `Container ${c.name} at ${c.memoryPercent.toFixed(1)}% memory — OOM imminent` });
      } else if (c.memoryPercent > 80) {
        results.push({ id: uuidv4(), detectedAt: now, metric: 'memoryPercent', value: c.memoryPercent, baseline: 60, deviation: ((c.memoryPercent - 60) / 60) * 100, severity: 'high', source: 'portainer', description: `Container ${c.name} at ${c.memoryPercent.toFixed(1)}% memory usage` });
      }

      if (c.cpuPercent > 90) {
        results.push({ id: uuidv4(), detectedAt: now, metric: 'cpuPercent', value: c.cpuPercent, baseline: 40, deviation: ((c.cpuPercent - 40) / 40) * 100, severity: 'high', source: 'portainer', description: `Container ${c.name} CPU at ${c.cpuPercent.toFixed(1)}%` });
      }

      if (c.restartCount > 5) {
        results.push({ id: uuidv4(), detectedAt: now, metric: 'restartCount', value: c.restartCount, baseline: 0, deviation: Infinity, severity: 'critical', source: 'portainer', description: `Container ${c.name} has restarted ${c.restartCount} times — crash-loop suspected` });
      }
    }
    return results;
  }

  private detectBuildAnomalies(builds: BuildResult[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    if (builds.length < 3) return results;
    const now = new Date().toISOString();

    // Failure rate
    const failureRate = builds.filter((b) => b.status === 'FAILURE').length / builds.length;
    if (failureRate > 0.5) {
      results.push({ id: uuidv4(), detectedAt: now, metric: 'failureRate', value: failureRate, baseline: 0.1, deviation: ((failureRate - 0.1) / 0.1) * 100, severity: 'high', source: 'jenkins', description: `Build failure rate is ${(failureRate * 100).toFixed(0)}% (${builds.filter((b) => b.status === 'FAILURE').length}/${builds.length} builds)` });
    }

    // Slow tests
    for (const build of builds) {
      if (build.testReport && build.testReport.duration > 300_000) {
        results.push({ id: uuidv4(), detectedAt: now, metric: 'testDurationMs', value: build.testReport.duration, baseline: 120_000, deviation: ((build.testReport.duration - 120_000) / 120_000) * 100, severity: 'medium', source: 'jenkins', description: `Test suite in ${build.jobName} #${build.buildNumber} took ${(build.testReport.duration / 60_000).toFixed(1)} minutes (>5 min threshold)` });
      }
    }
    return results;
  }

  private detectErrorAnomalies(trends: ErrorTrend[]): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    const now = new Date().toISOString();

    // Group by service and find spikes
    const byService = new Map<string, number[]>();
    for (const t of trends) {
      const arr = byService.get(t.service) ?? [];
      arr.push(t.count);
      byService.set(t.service, arr);
    }

    for (const [service, counts] of byService.entries()) {
      if (counts.length < 3) continue;
      const baseline = counts.slice(0, -1).reduce((a, b) => a + b, 0) / (counts.length - 1);
      const latest = counts[counts.length - 1];
      const deviation = baseline > 0 ? ((latest - baseline) / baseline) * 100 : 0;
      if (deviation > 100) {
        const sev: Severity = deviation > 300 ? 'critical' : deviation > 200 ? 'high' : 'medium';
        results.push({ id: uuidv4(), detectedAt: now, metric: 'errorCount', value: latest, baseline, deviation, severity: sev, source: 'kibana', description: `${service} error count spiked ${deviation.toFixed(0)}% above baseline (${latest} vs avg ${baseline.toFixed(0)})` });
      }
    }
    return results;
  }

  private async aiPatternDetect(
    existing: AnomalyResult[],
    data: { containers?: ContainerHealth[]; builds?: BuildResult[]; errorTrends?: ErrorTrend[] }
  ): Promise<AnomalyResult[]> {
    try {
      const prompt = `Given these detected anomalies and raw metrics, identify any additional cross-cutting patterns or cascading failure indicators. Return a JSON array of additional anomalies (may be empty []) using this schema: { id, detectedAt, metric, value, baseline, deviation, severity, source, description }. Anomalies: ${JSON.stringify(existing.slice(0, 5))}`;
      const raw = await this.agent.chat(
        'You are a DevOps anomaly detection specialist. Find cross-source incident patterns.',
        prompt, 600
      );
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]) as AnomalyResult[];
      return parsed.map((a) => ({ ...a, id: uuidv4() }));
    } catch (err) {
      logger.warn('AI pattern detection failed (non-fatal)', { err });
      return [];
    }
  }
}
