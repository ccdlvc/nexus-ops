import { Router, Response } from 'express';
import { JenkinsConnector } from '../connectors/jenkins';
import { KibanaConnector } from '../connectors/kibana';
import { GitHubConnector } from '../connectors/github';
import { PortainerConnector } from '../connectors/portainer';
import { PrometheusConnector } from '../connectors/prometheus';
import { GrafanaConnector } from '../connectors/grafana';
import { AWSConnector } from '../connectors/aws';
import { GCPConnector } from '../connectors/gcp';
import { AzureConnector } from '../connectors/azure';

const router = Router();

// ─── Module-level singletons (created once at startup) ───────────────────────

const jenkins = new JenkinsConnector(
  process.env.JENKINS_URL || 'http://jenkins:8080',
  process.env.JENKINS_USER || 'admin',
  process.env.JENKINS_TOKEN ?? '',
);

const kibana = new KibanaConnector(
  process.env.KIBANA_URL || 'http://kibana:5601',
  process.env.KIBANA_USER || 'elastic',
  process.env.KIBANA_PASSWORD ?? '',
  process.env.KIBANA_INDEX || 'logs-*',
);

const github = new GitHubConnector(
  process.env.GITHUB_TOKEN ?? '',
  process.env.GITHUB_OWNER ?? '',
  process.env.GITHUB_REPO ?? '',
);

const portainer = new PortainerConnector(
  process.env.PORTAINER_URL || 'http://portainer:9000',
  process.env.PORTAINER_TOKEN ?? '',
);

const prometheus = new PrometheusConnector(
  process.env.PROMETHEUS_URL || 'http://prometheus:9090',
  process.env.PROMETHEUS_USER,
  process.env.PROMETHEUS_PASSWORD,
);

const grafana = new GrafanaConnector(
  process.env.GRAFANA_URL || 'http://grafana:3000',
  process.env.GRAFANA_TOKEN ?? '',
);

const aws = new AWSConnector(
  process.env.AWS_ACCESS_KEY_ID ?? '',
  process.env.AWS_SECRET_ACCESS_KEY ?? '',
  process.env.AWS_REGION || 'us-east-1',
  process.env.AWS_SESSION_TOKEN,
);

const gcp = new GCPConnector(
  process.env.GCP_PROJECT_ID ?? '',
  process.env.GCP_CLIENT_EMAIL,
  process.env.GCP_PRIVATE_KEY,
);

const azureConfigured = !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_SUBSCRIPTION_ID);
const azure = azureConfigured
  ? new AzureConnector(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!,
      process.env.AZURE_SUBSCRIPTION_ID ?? '',
    )
  : (null as unknown as AzureConnector);

// ─── Configuration flags (service only called when its URL env var is set) ───

const jenkinsConfigured = !!process.env.JENKINS_URL;
const kibanaConfigured = !!process.env.KIBANA_URL;
const githubConfigured = !!process.env.GITHUB_TOKEN;
const portainerConfigured = !!process.env.PORTAINER_URL;
const prometheusConfigured = !!process.env.PROMETHEUS_URL;
const grafanaConfigured = !!(process.env.GRAFANA_URL && process.env.GRAFANA_TOKEN);
const awsConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const gcpConfigured = !!(process.env.GCP_PROJECT_ID && (process.env.GCP_CLIENT_EMAIL || process.env.GOOGLE_APPLICATION_CREDENTIALS));

function notConfigured(res: Response, service: string) {
  return res.status(503).json({ success: false, error: `${service} is not configured`, timestamp: new Date().toISOString() });
}

// ─── Jenkins ─────────────────────────────────────────────────────────────────

router.get('/jenkins/jobs', async (_req, res) => {
  if (!jenkinsConfigured) return notConfigured(res, 'Jenkins');
  const jobs = await jenkins.listJobs();
  res.json({ success: true, data: jobs, timestamp: new Date().toISOString() });
});

router.get('/jenkins/builds/:job', async (req, res) => {
  if (!jenkinsConfigured) return notConfigured(res, 'Jenkins');
  const { job } = req.params;
  const limit = parseInt((req.query.limit as string) ?? '10', 10);
  const builds = await jenkins.getBuilds(decodeURIComponent(job), limit);
  res.json({ success: true, data: builds, timestamp: new Date().toISOString() });
});

router.get('/jenkins/builds/:job/:number', async (req, res) => {
  if (!jenkinsConfigured) return notConfigured(res, 'Jenkins');
  const { job, number } = req.params;
  const build = await jenkins.getBuildDetail(decodeURIComponent(job), parseInt(number, 10));
  if (!build) return res.status(404).json({ success: false, error: 'Build not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: build, timestamp: new Date().toISOString() });
});

router.post('/jenkins/builds/:job/trigger', async (req, res) => {
  if (!jenkinsConfigured) return notConfigured(res, 'Jenkins');
  const ok = await jenkins.triggerBuild(decodeURIComponent(req.params.job), req.body.params);
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

// ─── Kibana ──────────────────────────────────────────────────────────────────

router.get('/kibana/errors', async (req, res) => {
  if (!kibanaConfigured) return notConfigured(res, 'Kibana');
  const minutes = parseInt((req.query.minutes as string) ?? '15', 10);
  const logs = await kibana.getRecentErrors(minutes);
  res.json({ success: true, data: logs, timestamp: new Date().toISOString() });
});

router.get('/kibana/trends', async (req, res) => {
  if (!kibanaConfigured) return notConfigured(res, 'Kibana');
  const hours = parseInt((req.query.hours as string) ?? '24', 10);
  const trends = await kibana.getErrorTrends(hours);
  res.json({ success: true, data: trends, timestamp: new Date().toISOString() });
});

router.get('/kibana/anomalies', async (_req, res) => {
  if (!kibanaConfigured) return notConfigured(res, 'Kibana');
  const anomalies = await kibana.detectAnomalies();
  res.json({ success: true, data: anomalies, timestamp: new Date().toISOString() });
});

router.post('/kibana/query', async (req, res) => {
  if (!kibanaConfigured) return notConfigured(res, 'Kibana');
  const { kql, size = 50 } = req.body;
  if (!kql) return res.status(400).json({ success: false, error: 'kql is required', timestamp: new Date().toISOString() });
  const logs = await kibana.queryLogs(kql, size);
  res.json({ success: true, data: logs, timestamp: new Date().toISOString() });
});

// ─── GitHub: all repos ───────────────────────────────────────────────────────

/** List all repos accessible to the token */
router.get('/github/repos', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const perPage = parseInt((req.query.per_page as string) ?? '100', 10);
  const repos = await github.listAllRepos(page, perPage);
  res.json({ success: true, data: repos, timestamp: new Date().toISOString() });
});

/** List repos for a specific org */
router.get('/github/orgs/:org/repos', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { org } = req.params;
  const page = parseInt((req.query.page as string) ?? '1', 10);
  const repos = await github.listOrgRepos(org, page);
  res.json({ success: true, data: repos, timestamp: new Date().toISOString() });
});

// ─── GitHub: per-repo DevOps ──────────────────────────────────────────────────

/** Full summary for one repo */
router.get('/github/repos/:owner/:repo/summary', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const summary = await github.getRepoSummary(owner, repo);
  if (!summary) return res.status(404).json({ success: false, error: 'Repo not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: summary, timestamp: new Date().toISOString() });
});

/** Workflow runs for one repo */
router.get('/github/repos/:owner/:repo/runs', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const status = req.query.status as string | undefined;
  const runs = await github.getWorkflowRunsForRepo(owner, repo, limit, status);
  res.json({ success: true, data: runs, timestamp: new Date().toISOString() });
});

/** Commits for one repo */
router.get('/github/repos/:owner/:repo/commits', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const branch = (req.query.branch as string) ?? 'main';
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const commits = await github.getCommitsForRepo(owner, repo, branch, limit);
  res.json({ success: true, data: commits, timestamp: new Date().toISOString() });
});

/** Issues for one repo */
router.get('/github/repos/:owner/:repo/issues', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const state = ((req.query.state as string) ?? 'open') as 'open' | 'closed' | 'all';
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const issues = await github.getIssuesForRepo(owner, repo, state, limit);
  res.json({ success: true, data: issues, timestamp: new Date().toISOString() });
});

/** Pull requests for one repo */
router.get('/github/repos/:owner/:repo/pulls', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const state = ((req.query.state as string) ?? 'open') as 'open' | 'closed' | 'all';
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const prs = await github.getPullRequestsForRepo(owner, repo, state, limit);
  res.json({ success: true, data: prs, timestamp: new Date().toISOString() });
});

/** Branches for one repo */
router.get('/github/repos/:owner/:repo/branches', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const branches = await github.getBranches(owner, repo);
  res.json({ success: true, data: branches, timestamp: new Date().toISOString() });
});

/** Re-run failed jobs for a specific run */
router.post('/github/repos/:owner/:repo/runs/:runId/rerun', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo, runId } = req.params;
  const ok = await github.rerunFailedJobs(parseInt(runId, 10), owner, repo);
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

/** Create issue in a specific repo */
router.post('/github/repos/:owner/:repo/issues', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const { owner, repo } = req.params;
  const { title, body, labels } = req.body;
  if (!title) return res.status(400).json({ success: false, error: 'title is required', timestamp: new Date().toISOString() });
  const issue = await github.createIssue(title, body, labels, owner, repo);
  if (!issue) return res.status(502).json({ success: false, error: 'Failed to create issue', timestamp: new Date().toISOString() });
  res.json({ success: true, data: issue, timestamp: new Date().toISOString() });
});

// Legacy single-repo routes (backward compat)
router.get('/github/runs', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const limit = parseInt((req.query.limit as string) ?? '20', 10);
  const runs = await github.getWorkflowRuns(limit);
  res.json({ success: true, data: runs, timestamp: new Date().toISOString() });
});
router.get('/github/commits', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const branch = (req.query.branch as string) ?? 'main';
  const limit = parseInt((req.query.limit as string) ?? '10', 10);
  const commits = await github.getCommits(branch, limit);
  res.json({ success: true, data: commits, timestamp: new Date().toISOString() });
});
router.post('/github/runs/:id/rerun', async (req, res) => {
  if (!githubConfigured) return notConfigured(res, 'GitHub');
  const ok = await github.rerunFailedJobs(parseInt(req.params.id, 10));
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

// ─── Portainer: all endpoints ─────────────────────────────────────────────────

/** List all Portainer endpoints */
router.get('/portainer/endpoints', async (_req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const endpoints = await portainer.listEndpoints();
  res.json({ success: true, data: endpoints, timestamp: new Date().toISOString() });
});

/** Full summary for one endpoint */
router.get('/portainer/endpoints/:id/summary', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const summary = await portainer.getEndpointSummary(id);
  if (!summary) return res.status(404).json({ success: false, error: 'Endpoint not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: summary, timestamp: new Date().toISOString() });
});

/** Containers for one endpoint */
router.get('/portainer/endpoints/:id/containers', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const containers = await portainer.getContainersForEndpoint(id);
  res.json({ success: true, data: containers, timestamp: new Date().toISOString() });
});

/** Stacks for one endpoint */
router.get('/portainer/endpoints/:id/stacks', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const stacks = await portainer.getStacksForEndpoint(id);
  res.json({ success: true, data: stacks, timestamp: new Date().toISOString() });
});

/** Container logs for one endpoint */
router.get('/portainer/endpoints/:id/containers/:containerId/logs', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const { containerId } = req.params;
  const tail = parseInt((req.query.tail as string) ?? '200', 10);
  const logs = await portainer.getContainerLogsForEndpoint(id, containerId, tail);
  res.json({ success: true, data: { logs }, timestamp: new Date().toISOString() });
});

/** Restart container on one endpoint */
router.post('/portainer/endpoints/:id/containers/:containerId/restart', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const ok = await portainer.restartContainerOnEndpoint(id, req.params.containerId);
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

/** Stop container on one endpoint */
router.post('/portainer/endpoints/:id/containers/:containerId/stop', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const id = parseInt(req.params.id, 10);
  const ok = await portainer.stopContainerOnEndpoint(id, req.params.containerId);
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

// Legacy single-endpoint routes (backward compat)
router.get('/portainer/containers', async (_req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const containers = await portainer.getContainers();
  res.json({ success: true, data: containers, timestamp: new Date().toISOString() });
});
router.get('/portainer/services', async (_req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const services = await portainer.getServices();
  res.json({ success: true, data: services, timestamp: new Date().toISOString() });
});
router.post('/portainer/containers/:id/restart', async (req, res) => {
  if (!portainerConfigured) return notConfigured(res, 'Portainer');
  const ok = await portainer.restartContainer(req.params.id);
  res.json({ success: ok, timestamp: new Date().toISOString() });
});

// ─── Prometheus ──────────────────────────────────────────────────────────────

/** Instant PromQL query */
router.get('/prometheus/query', async (req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const promql = req.query.q as string;
  if (!promql) return res.status(400).json({ success: false, error: 'q is required', timestamp: new Date().toISOString() });
  const result = await prometheus.query(promql, req.query.time as string | undefined);
  res.json({ success: result.status === 'success', data: result.data, timestamp: new Date().toISOString() });
});

/** Range PromQL query */
router.get('/prometheus/query_range', async (req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const { q, start, end, step } = req.query as Record<string, string>;
  if (!q || !start || !end || !step) {
    return res.status(400).json({ success: false, error: 'q, start, end, step are required', timestamp: new Date().toISOString() });
  }
  const result = await prometheus.queryRange(q, start, end, step);
  res.json({ success: result.status === 'success', data: result.data, timestamp: new Date().toISOString() });
});

/** List label names */
router.get('/prometheus/labels', async (_req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const labels = await prometheus.labels();
  res.json({ success: true, data: labels, timestamp: new Date().toISOString() });
});

/** List values for a label */
router.get('/prometheus/labels/:label/values', async (req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const values = await prometheus.labelValues(req.params.label);
  res.json({ success: true, data: values, timestamp: new Date().toISOString() });
});

/** List all metric names */
router.get('/prometheus/metrics', async (_req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const names = await prometheus.metricNames();
  res.json({ success: true, data: names, timestamp: new Date().toISOString() });
});

/** Scrape target health */
router.get('/prometheus/targets', async (_req, res) => {
  if (!prometheusConfigured) return notConfigured(res, 'Prometheus');
  const targets = await prometheus.targets();
  res.json({ success: true, data: targets, timestamp: new Date().toISOString() });
});

// ─── Grafana ──────────────────────────────────────────────────────────────────

/** Grafana server health */
router.get('/grafana/health', async (_req, res) => {
  if (!grafanaConfigured) return notConfigured(res, 'Grafana');
  const health = await grafana.health();
  if (!health) return res.status(503).json({ success: false, error: 'Grafana unreachable', timestamp: new Date().toISOString() });
  res.json({ success: true, data: health, timestamp: new Date().toISOString() });
});

/** List dashboards (optional ?q=text&tag=x) */
router.get('/grafana/dashboards', async (req, res) => {
  if (!grafanaConfigured) return notConfigured(res, 'Grafana');
  const q = req.query.q as string | undefined;
  const tags = req.query.tag ? (Array.isArray(req.query.tag) ? req.query.tag as string[] : [req.query.tag as string]) : undefined;
  const dashboards = await grafana.listDashboards(q, tags);
  res.json({ success: true, data: dashboards, timestamp: new Date().toISOString() });
});

/** Get dashboard detail by UID */
router.get('/grafana/dashboards/:uid', async (req, res) => {
  if (!grafanaConfigured) return notConfigured(res, 'Grafana');
  const dash = await grafana.getDashboard(req.params.uid);
  if (!dash) return res.status(404).json({ success: false, error: 'Dashboard not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: dash, timestamp: new Date().toISOString() });
});

/** List datasources */
router.get('/grafana/datasources', async (_req, res) => {
  if (!grafanaConfigured) return notConfigured(res, 'Grafana');
  const ds = await grafana.listDatasources();
  res.json({ success: true, data: ds, timestamp: new Date().toISOString() });
});

/** Get datasource by UID */
router.get('/grafana/datasources/:uid', async (req, res) => {
  if (!grafanaConfigured) return notConfigured(res, 'Grafana');
  const ds = await grafana.getDatasource(req.params.uid);
  if (!ds) return res.status(404).json({ success: false, error: 'Datasource not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: ds, timestamp: new Date().toISOString() });
});

// ─── AWS ─────────────────────────────────────────────────────────────────────

/** EC2 instances */
router.get('/aws/ec2', async (_req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const instances = await aws.listInstances();
  res.json({ success: true, data: instances, timestamp: new Date().toISOString() });
});

/** ECS clusters */
router.get('/aws/ecs/clusters', async (_req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const clusters = await aws.listClusters();
  res.json({ success: true, data: clusters, timestamp: new Date().toISOString() });
});

/** ECS services for a cluster */
router.get('/aws/ecs/clusters/:cluster/services', async (req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const services = await aws.listServices(decodeURIComponent(req.params.cluster));
  res.json({ success: true, data: services, timestamp: new Date().toISOString() });
});

/** Lambda functions */
router.get('/aws/lambda', async (_req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const functions = await aws.listFunctions();
  res.json({ success: true, data: functions, timestamp: new Date().toISOString() });
});

/** CloudWatch metric statistics
 * Query params: namespace, metric, stat (default Average), hours (default 1), period (default 300)
 * dimension_<Name>=<Value> for each dimension (e.g. dimension_InstanceId=i-xxx)
 */
router.get('/aws/cloudwatch', async (req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const { namespace, metric, stat = 'Average', hours = '1', period = '300' } = req.query as Record<string, string>;
  if (!namespace || !metric) {
    return res.status(400).json({ success: false, error: 'namespace and metric are required', timestamp: new Date().toISOString() });
  }
  const dimensions = Object.entries(req.query)
    .filter(([k]) => k.startsWith('dimension_'))
    .map(([k, v]) => ({ name: k.replace('dimension_', ''), value: v as string }));
  const data = await aws.getMetricStats(namespace, metric, dimensions, stat, parseInt(hours, 10), parseInt(period, 10));
  res.json({ success: true, data, timestamp: new Date().toISOString() });
});

/** CloudWatch Log groups */
router.get('/aws/logs', async (req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const groups = await aws.listLogGroups(req.query.prefix as string | undefined);
  res.json({ success: true, data: groups, timestamp: new Date().toISOString() });
});

/** CloudWatch Log events for a log group */
router.get('/aws/logs/:group/events', async (req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const limit = parseInt((req.query.limit as string) ?? '100', 10);
  const events = await aws.getLogEvents(
    decodeURIComponent(req.params.group),
    req.query.filter as string | undefined,
    limit,
  );
  res.json({ success: true, data: events, timestamp: new Date().toISOString() });
});

/** AWS monthly cost breakdown by service */
router.get('/aws/cost', async (_req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const summary = await aws.getMonthlyCost();
  if (!summary) return res.status(502).json({ success: false, error: 'Cost data unavailable', timestamp: new Date().toISOString() });
  res.json({ success: true, data: summary, timestamp: new Date().toISOString() });
});

/** AWS daily costs (query param: days, default 7) */
router.get('/aws/cost/daily', async (req, res) => {
  if (!awsConfigured) return notConfigured(res, 'AWS');
  const days = parseInt((req.query.days as string) ?? '7', 10);
  const summaries = await aws.getDailyCosts(days);
  res.json({ success: true, data: summaries, timestamp: new Date().toISOString() });
});

// ─── GCP ─────────────────────────────────────────────────────────────────────

/** Compute Engine instances */
router.get('/gcp/compute', async (_req, res) => {
  if (!gcpConfigured) return notConfigured(res, 'GCP');
  const instances = await gcp.listInstances();
  res.json({ success: true, data: instances, timestamp: new Date().toISOString() });
});

/** GKE clusters */
router.get('/gcp/gke', async (_req, res) => {
  if (!gcpConfigured) return notConfigured(res, 'GCP');
  const clusters = await gcp.listClusters();
  res.json({ success: true, data: clusters, timestamp: new Date().toISOString() });
});

/** Cloud Run services (query param: region, required) */
router.get('/gcp/run', async (req, res) => {
  if (!gcpConfigured) return notConfigured(res, 'GCP');
  const region = req.query.region as string;
  if (!region) return res.status(400).json({ success: false, error: 'region is required', timestamp: new Date().toISOString() });
  const services = await gcp.listRunServices(region);
  res.json({ success: true, data: services, timestamp: new Date().toISOString() });
});

/** Cloud Monitoring time series (query params: filter, hours, aligner) */
router.get('/gcp/monitoring', async (req, res) => {
  if (!gcpConfigured) return notConfigured(res, 'GCP');
  const filter = req.query.filter as string;
  if (!filter) return res.status(400).json({ success: false, error: 'filter is required', timestamp: new Date().toISOString() });
  const hours = parseInt((req.query.hours as string) ?? '1', 10);
  const aligner = (req.query.aligner as string) ?? 'ALIGN_MEAN';
  const series = await gcp.queryTimeSeries(filter, hours, aligner);
  res.json({ success: true, data: series, timestamp: new Date().toISOString() });
});

/** Cloud Logging entries (query params: filter, limit, hours) */
router.get('/gcp/logging', async (req, res) => {
  if (!gcpConfigured) return notConfigured(res, 'GCP');
  const filter = (req.query.filter as string) ?? 'severity>=ERROR';
  const limit = parseInt((req.query.limit as string) ?? '100', 10);
  const hours = parseInt((req.query.hours as string) ?? '1', 10);
  const entries = await gcp.listLogEntries(filter, limit, hours);
  res.json({ success: true, data: entries, timestamp: new Date().toISOString() });
});

// ─── Azure ────────────────────────────────────────────────────────────────────

/** Virtual Machines */
router.get('/azure/vms', async (_req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const vms = await azure.listVMs();
  res.json({ success: true, data: vms, timestamp: new Date().toISOString() });
});

/** AKS managed clusters */
router.get('/azure/aks', async (_req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const clusters = await azure.listAKSClusters();
  res.json({ success: true, data: clusters, timestamp: new Date().toISOString() });
});

/** Azure Monitor metrics for a resource
 * Query params: resourceId (required), metrics (comma-separated, required), hours, granularity
 */
router.get('/azure/metrics', async (req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const { resourceId, metrics, hours = '1', granularity = 'PT5M' } = req.query as Record<string, string>;
  if (!resourceId || !metrics) {
    return res.status(400).json({ success: false, error: 'resourceId and metrics are required', timestamp: new Date().toISOString() });
  }
  const metricNames = metrics.split(',').map((m) => m.trim()).filter(Boolean);
  const data = await azure.getMetrics(resourceId, metricNames, parseInt(hours, 10), granularity);
  res.json({ success: true, data, timestamp: new Date().toISOString() });
});

/** Log Analytics KQL query
 * Query params: workspace (workspace ID, required), query (KQL, required), hours
 */
router.get('/azure/logs', async (req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const { workspace, query, hours = '1' } = req.query as Record<string, string>;
  if (!workspace || !query) {
    return res.status(400).json({ success: false, error: 'workspace and query are required', timestamp: new Date().toISOString() });
  }
  const entries = await azure.queryLogs(workspace, query, parseInt(hours, 10));
  res.json({ success: true, data: entries, timestamp: new Date().toISOString() });
});

/** Azure monthly cost by service */
router.get('/azure/cost', async (_req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const summary = await azure.getMonthlyCost();
  if (!summary) return res.status(502).json({ success: false, error: 'Cost data unavailable', timestamp: new Date().toISOString() });
  res.json({ success: true, data: summary, timestamp: new Date().toISOString() });
});

/** Azure daily costs (query param: days, default 7) */
router.get('/azure/cost/daily', async (req, res) => {
  if (!azureConfigured) return notConfigured(res, 'Azure');
  const days = parseInt((req.query.days as string) ?? '7', 10);
  const summaries = await azure.getDailyCosts(days);
  res.json({ success: true, data: summaries, timestamp: new Date().toISOString() });
});

export default router;
