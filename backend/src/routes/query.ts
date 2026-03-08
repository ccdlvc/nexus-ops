import { Router, Request, Response } from 'express';
import { AIAgent } from '../ai/agent';
import { JenkinsConnector } from '../connectors/jenkins';
import { KibanaConnector } from '../connectors/kibana';
import { GitHubConnector } from '../connectors/github';
import { PortainerConnector } from '../connectors/portainer';
import { AWSConnector } from '../connectors/aws';
import { GCPConnector } from '../connectors/gcp';
import { AzureConnector } from '../connectors/azure';
import { DataSource } from '../../../shared/types';

const router = Router();
const agent = new AIAgent();

// POST /api/query  — natural language DevOps query
router.post('/', async (req: Request, res: Response) => {
  const start = Date.now();
  const { query, sources = ['jenkins', 'kibana', 'github', 'portainer'] } = req.body as { query: string; sources?: DataSource[] };

  if (!query?.trim()) {
    return res.status(400).json({ success: false, error: 'query is required', timestamp: new Date().toISOString() });
  }

  try {
    const context: Array<{ source: DataSource; summary: string; data: unknown }> = [];

    // Collect data from requested sources in parallel
    await Promise.all((sources as DataSource[]).map(async (src) => {
      try {
        switch (src) {
          case 'jenkins': {
            const j = new JenkinsConnector(
              process.env.JENKINS_URL ?? 'http://jenkins:8080',
              process.env.JENKINS_USER ?? 'admin',
              process.env.JENKINS_TOKEN ?? '',
            );
            const jobs = await j.listJobs();
            const builds = await Promise.all(jobs.slice(0, 3).map((job) => j.getBuilds(job, 5)));
            const flat = builds.flat();
            context.push({ source: 'jenkins', summary: `${flat.length} recent builds across ${jobs.length} jobs. Failures: ${flat.filter((b) => b.status === 'FAILURE').length}`, data: flat.slice(0, 15) });
            break;
          }
          case 'kibana': {
            const k = new KibanaConnector(
              process.env.KIBANA_URL ?? 'http://kibana:5601',
              process.env.KIBANA_USER ?? 'elastic',
              process.env.KIBANA_PASSWORD ?? '',
              process.env.KIBANA_INDEX ?? 'logs-*',
            );
            const errors = await k.getRecentErrors(30, 50);
            context.push({ source: 'kibana', summary: `${errors.length} error log entries in last 30 minutes`, data: errors.slice(0, 20) });
            break;
          }
          case 'github': {
            const gh = new GitHubConnector(
              process.env.GITHUB_TOKEN ?? '',
              process.env.GITHUB_OWNER ?? '',
              process.env.GITHUB_REPO ?? '',
            );
            const runs = await gh.getWorkflowRuns(10);
            context.push({ source: 'github', summary: `${runs.length} workflow runs. Failed: ${runs.filter((r) => r.conclusion === 'failure').length}`, data: runs });
            break;
          }
          case 'portainer': {
            const p = new PortainerConnector(
              process.env.PORTAINER_URL ?? 'http://portainer:9000',
              process.env.PORTAINER_TOKEN ?? '',
              parseInt(process.env.PORTAINER_ENDPOINT ?? '1', 10),
            );
            const containers = await p.getContainers();
            context.push({ source: 'portainer', summary: `${containers.length} containers. Unhealthy: ${containers.filter((c) => c.health === 'unhealthy').length}, High mem: ${containers.filter((c) => c.memoryPercent > 80).length}`, data: containers });
            break;
          }
          case 'aws': {
            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
              context.push({ source: 'aws', summary: 'AWS not configured', data: null });
              break;
            }
            const aws = new AWSConnector(
              process.env.AWS_ACCESS_KEY_ID!,
              process.env.AWS_SECRET_ACCESS_KEY!,
              process.env.AWS_REGION ?? 'us-east-1',
              process.env.AWS_SESSION_TOKEN,
            );
            const [instances, functions, cost] = await Promise.all([
              aws.listInstances().catch(() => []),
              aws.listFunctions().catch(() => []),
              aws.getMonthlyCost().catch(() => null),
            ]);
            const running = instances.filter((i) => i.state === 'running').length;
            context.push({
              source: 'aws',
              summary: `${instances.length} EC2 instances (${running} running), ${functions.length} Lambda functions. MTD cost: ${cost ? `${cost.currency} ${cost.total.toFixed(2)}` : 'unavailable'}`,
              data: { instances: instances.slice(0, 20), functions: functions.slice(0, 20), cost },
            });
            break;
          }
          case 'gcp': {
            if (!process.env.GCP_PROJECT_ID) {
              context.push({ source: 'gcp', summary: 'GCP not configured', data: null });
              break;
            }
            const gcp = new GCPConnector(
              process.env.GCP_PROJECT_ID,
              process.env.GCP_CLIENT_EMAIL,
              process.env.GCP_PRIVATE_KEY,
            );
            const [gcpInstances, clusters, runServices] = await Promise.all([
              gcp.listInstances().catch(() => []),
              gcp.listClusters().catch(() => []),
              gcp.listRunServices(process.env.GCP_REGION ?? 'us-central1').catch(() => []),
            ]);
            const gcpRunning = gcpInstances.filter((i) => i.status === 'RUNNING').length;
            context.push({
              source: 'gcp',
              summary: `${gcpInstances.length} Compute instances (${gcpRunning} running), ${clusters.length} GKE clusters, ${runServices.length} Cloud Run services`,
              data: { instances: gcpInstances.slice(0, 20), clusters, runServices },
            });
            break;
          }
          case 'azure': {
            if (!process.env.AZURE_TENANT_ID || !process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
              context.push({ source: 'azure', summary: 'Azure not configured', data: null });
              break;
            }
            const azure = new AzureConnector(
              process.env.AZURE_TENANT_ID,
              process.env.AZURE_CLIENT_ID,
              process.env.AZURE_CLIENT_SECRET,
              process.env.AZURE_SUBSCRIPTION_ID ?? '',
            );
            const [vms, aksClusters, azureCost] = await Promise.all([
              azure.listVMs().catch(() => []),
              azure.listAKSClusters().catch(() => []),
              azure.getMonthlyCost().catch(() => null),
            ]);
            const running = vms.filter((v) => v.powerState?.toLowerCase() === 'running').length;
            context.push({
              source: 'azure',
              summary: `${vms.length} VMs (${running} running), ${aksClusters.length} AKS clusters. MTD cost: ${azureCost ? `${azureCost.currency} ${azureCost.total.toFixed(2)}` : 'unavailable'}`,
              data: { vms: vms.slice(0, 20), aksClusters, cost: azureCost },
            });
            break;
          }
        }
      } catch {
        context.push({ source: src, summary: `Could not reach ${src} — check credentials`, data: null });
      }
    }));

    const response = await agent.answerQuery(query, context, start);
    res.json({ success: true, data: response, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

export default router;
