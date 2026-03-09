import { Router, Request, Response } from 'express';
import { AIAgent } from '../ai/agent';
import { JenkinsConnector } from '../connectors/jenkins';
import { KibanaConnector } from '../connectors/kibana';
import { GitHubConnector } from '../connectors/github';
import { PortainerConnector } from '../connectors/portainer';
import { AWSConnector } from '../connectors/aws';
import { GCPConnector } from '../connectors/gcp';
import { AzureConnector } from '../connectors/azure';
import { DataSource, ContainerHealth } from '../../../shared/types';

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
            if (!process.env.JENKINS_URL) {
              context.push({ source: 'jenkins', summary: 'Jenkins not configured', data: null });
              break;
            }
            const j = new JenkinsConnector(
              process.env.JENKINS_URL,
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
            if (!process.env.KIBANA_URL) {
              context.push({ source: 'kibana', summary: 'Kibana not configured', data: null });
              break;
            }
            const k = new KibanaConnector(
              process.env.KIBANA_URL,
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
            if (!process.env.PORTAINER_URL) {
              context.push({ source: 'portainer', summary: 'Portainer not configured', data: null });
              break;
            }
            const p = new PortainerConnector(
              process.env.PORTAINER_URL,
              process.env.PORTAINER_TOKEN ?? '',
            );
            const requestedId = parseInt(process.env.PORTAINER_ENDPOINT ?? '0', 10);
            let containers: ContainerHealth[];
            if (requestedId === 0) {
              // Auto-discover: collect containers from all online endpoints
              const endpoints = await p.listEndpoints();
              const online = endpoints.filter((e) => e.status === 1);
              if (online.length === 0) {
                containers = [];
              } else {
                // Isolate failures per-endpoint so one bad endpoint doesn't drop all data
                const perEndpoint = await Promise.all(
                  online.map((ep) => p.getContainersForEndpoint(ep.id, ep.name).catch(() => [] as ContainerHealth[])),
                );
                containers = perEndpoint.flat();
              }
            } else {
              containers = await p.getContainersForEndpoint(requestedId);
            }
            // Prioritise signal-rich containers; cap at 30 to keep AI payload small
            const unhealthy = containers.filter((c) => c.health === 'unhealthy');
            const highMem   = containers.filter((c) => c.health !== 'unhealthy' && c.memoryPercent > 50);
            const exited    = containers.filter((c) => c.status !== 'running' && c.health !== 'unhealthy');
            const rest      = containers.filter((c) => c.status === 'running' && c.health !== 'unhealthy' && c.memoryPercent <= 50);
            const notable   = [...unhealthy, ...highMem, ...exited, ...rest].slice(0, 30);
            context.push({ source: 'portainer', summary: `${containers.length} containers. Unhealthy: ${unhealthy.length}, High mem (>50%): ${highMem.length}, Exited: ${exited.length}`, data: notable });
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
