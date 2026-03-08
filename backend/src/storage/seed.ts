/**
 * @module storage/seed
 * @description Seeds the 16 default alert rules on first run.
 *
 * Rules cover: Portainer container health (memory, CPU, restart loops),
 * Jenkins build metrics (failure rate, slow tests), Kibana error counts,
 * and cloud resource counts/costs for AWS, GCP, and Azure.
 *
 * Uses onConflictDoNothing so re-seeding on restart is safe.
 */
import { db } from './db';
import { alertRules } from './schema';
import { logger } from '../utils/logger';

const DEFAULT_RULES = [
  { id: 'r1',  name: 'High Memory Usage',             source: 'portainer' as const, metric: 'memoryPercent',        condition: 'gt' as const, threshold: 80,     severity: 'high' as const,     message: 'Container memory usage exceeded 80%' },
  { id: 'r2',  name: 'Critical Memory Usage',         source: 'portainer' as const, metric: 'memoryPercent',        condition: 'gt' as const, threshold: 95,     severity: 'critical' as const, message: 'Container memory usage exceeded 95% — OOM risk' },
  { id: 'r3',  name: 'High CPU Usage',                source: 'portainer' as const, metric: 'cpuPercent',           condition: 'gt' as const, threshold: 90,     severity: 'high' as const,     message: 'Container CPU usage exceeded 90%' },
  { id: 'r4',  name: 'Container Restart Loop',        source: 'portainer' as const, metric: 'restartCount',         condition: 'gt' as const, threshold: 5,      severity: 'critical' as const, message: 'Container has restarted more than 5 times' },
  { id: 'r5',  name: 'Slow Test Execution',           source: 'jenkins' as const,   metric: 'testDurationMs',       condition: 'gt' as const, threshold: 300000, severity: 'medium' as const,   message: 'Test suite duration exceeded 5 minutes' },
  { id: 'r6',  name: 'High Error Rate',               source: 'kibana' as const,    metric: 'errorCount',           condition: 'gt' as const, threshold: 100,    severity: 'high' as const,     message: 'Error count exceeded 100 in the last 5 minutes' },
  { id: 'r7',  name: 'Pipeline Failure Rate',         source: 'jenkins' as const,   metric: 'failureRate',          condition: 'gt' as const, threshold: 0.5,    severity: 'high' as const,     message: 'Build failure rate exceeded 50%' },
  { id: 'r8',  name: 'GitHub Workflow Failure',       source: 'github' as const,    metric: 'failedWorkflows',      condition: 'gt' as const, threshold: 2,      severity: 'medium' as const,   message: 'More than 2 GitHub Actions workflows failed in last hour' },
  { id: 'r9',  name: 'EC2 Stopped Instances',         source: 'aws' as const,       metric: 'stoppedInstanceCount', condition: 'gt' as const, threshold: 5,      severity: 'medium' as const,   message: 'More than 5 EC2 instances are stopped' },
  { id: 'r10', name: 'High Lambda Function Count',    source: 'aws' as const,       metric: 'lambdaFunctionCount',  condition: 'gt' as const, threshold: 100,    severity: 'info' as const,     message: 'Lambda function count exceeded 100' },
  { id: 'r11', name: 'AWS Monthly Cost Spike',        source: 'aws' as const,       metric: 'monthlyCostUSD',       condition: 'gt' as const, threshold: 1000,   severity: 'high' as const,     message: 'AWS month-to-date cost exceeded $1000' },
  { id: 'r12', name: 'GCP Terminated Instances',      source: 'gcp' as const,       metric: 'terminatedInstanceCount', condition: 'gt' as const, threshold: 3,   severity: 'medium' as const,   message: 'More than 3 GCP Compute instances are terminated' },
  { id: 'r13', name: 'GKE Cluster Not Running',       source: 'gcp' as const,       metric: 'clusterNotRunningCount',  condition: 'gt' as const, threshold: 0,   severity: 'high' as const,     message: 'One or more GKE clusters are not in RUNNING state' },
  { id: 'r14', name: 'Azure Deallocated VMs',         source: 'azure' as const,     metric: 'deallocatedVMCount',   condition: 'gt' as const, threshold: 5,      severity: 'medium' as const,   message: 'More than 5 Azure VMs are deallocated' },
  { id: 'r15', name: 'Azure AKS Cluster Not Succeeded', source: 'azure' as const,  metric: 'aksNotSucceededCount', condition: 'gt' as const, threshold: 0,      severity: 'high' as const,     message: 'One or more AKS clusters are not in Succeeded provisioning state' },
  { id: 'r16', name: 'Azure Monthly Cost Spike',      source: 'azure' as const,     metric: 'monthlyCostUSD',       condition: 'gt' as const, threshold: 1000,   severity: 'high' as const,     message: 'Azure month-to-date cost exceeded $1000' },
];

export async function seed(): Promise<void> {
  await db.insert(alertRules).values(DEFAULT_RULES).onConflictDoNothing();
  logger.info('Seeded default alert rules');
}
