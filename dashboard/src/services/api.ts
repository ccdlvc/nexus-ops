/**
 * @module services/api
 * @description Typed Axios API client for all Nexus Ops backend endpoints.
 *
 * Organized into named sub-clients by domain:
 *   incidentsApi   – Incident CRUD, status updates, report/issue/Slack generation.
 *   alertsApi      – Active alerts, acknowledge, resolve, rule management.
 *   queryApi       – Natural language DevOps query (AI assistant).
 *   connectorsApi  – All connector pass-throughs: Jenkins, Kibana, GitHub,
 *                    Portainer (multi-endpoint), Prometheus, Grafana.
 *   integrationsApi – /api/integrations/status health check.
 *   prometheusApi  – PromQL instant/range queries, labels, metric names, targets.
 *   grafanaApi     – Health, dashboards, datasources, alert instances/rules.
 *   awsApi         – EC2, ECS, Lambda, costs.
 *   gcpApi         – Compute, GKE, Cloud Run, logging.
 *   azureApi       – VMs, AKS, costs.
 *
 * Base URL is controlled by VITE_API_URL env var (empty string = same origin).
 * All requests time out after 30 seconds.
 */
import axios from 'axios';
import {
  IncidentCard, Alert, AlertRule, QueryResponse, IncidentReport,
  GithubRepo, GithubIssue, GithubPullRequest, GithubBranch,
  WorkflowRun, GitCommit, RepoSummary,
  PortainerEndpoint, EndpointSummary, ContainerHealth,
  PrometheusInstantResult, PrometheusRangeResult,
  GrafanaDashboard, GrafanaDashboardDetail, GrafanaDatasource, GrafanaHealth,
  GrafanaAlertInstance, GrafanaAlertRule,
  AWSEC2Instance, AWSECSCluster, AWSECSService, AWSLambdaFunction, AWSCostSummary, AWSCostItem,
  GCPInstance, GKECluster, CloudRunService, GCPLogEntry,
  AzureVM, AzureAKSCluster, AzureCostSummary,
} from '@shared/types';

const BASE = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({ baseURL: BASE, timeout: 30_000 });

// ─── Incidents ───────────────────────────────────────────────────────────────
export const incidentsApi = {
  list: (params?: { status?: string; severity?: string; limit?: number; page?: number }) =>
    api.get('/api/incidents', { params }).then((r) => r.data),

  get: (id: string) => api.get(`/api/incidents/${id}`).then((r) => r.data.data as IncidentCard),

  create: (body: Record<string, unknown>) =>
    api.post('/api/incidents', body).then((r) => r.data.data as IncidentCard),

  setStatus: (id: string, status: IncidentCard['status']) =>
    api.patch(`/api/incidents/${id}/status`, { status }).then((r) => r.data),

  generateReport: (id: string) =>
    api.post(`/api/incidents/${id}/report`).then((r) => r.data.data as IncidentReport),

  createGithubIssue: (id: string) =>
    api.post(`/api/incidents/${id}/github-issue`).then((r) => r.data),

  shareSlack: (id: string) =>
    api.post(`/api/incidents/${id}/slack`).then((r) => r.data),
};

// ─── Alerts ──────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: (resolved = false) =>
    api.get('/api/alerts', { params: { resolved } }).then((r) => r.data.data as Alert[]),

  acknowledge: (id: string) =>
    api.patch(`/api/alerts/${id}/acknowledge`).then((r) => r.data),

  resolve: (id: string) =>
    api.patch(`/api/alerts/${id}/resolve`).then((r) => r.data),

  listRules: () =>
    api.get('/api/alerts/rules').then((r) => r.data.data as AlertRule[]),

  updateRule: (id: string, updates: { enabled?: boolean; threshold?: number }) =>
    api.patch(`/api/alerts/rules/${id}`, updates).then((r) => r.data.data as AlertRule),
};

// ─── Natural Language Query ───────────────────────────────────────────────────
export const queryApi = {
  ask: (query: string, sources?: string[]) =>
    api.post('/api/query', { query, sources }).then((r) => r.data.data as QueryResponse),
};

// ─── Connectors ───────────────────────────────────────────────────────────────
export const connectorsApi = {
  // Jenkins
  jenkinsJobs: () =>
    api.get('/api/connectors/jenkins/jobs').then((r) => r.data.data as string[]),
  jenkinsBuilds: (job: string, limit = 10) =>
    api.get(`/api/connectors/jenkins/builds/${encodeURIComponent(job)}`, { params: { limit } }).then((r) => r.data.data),

  // Kibana
  kibanaErrors: (minutes = 15) =>
    api.get('/api/connectors/kibana/errors', { params: { minutes } }).then((r) => r.data.data),
  kibanaTrends: (hours = 24) =>
    api.get('/api/connectors/kibana/trends', { params: { hours } }).then((r) => r.data.data),

  // ─── GitHub: multi-repo ────────────────────────────────────────────────────
  /** All repos accessible to the token */
  githubListRepos: (page = 1, perPage = 100) =>
    api.get('/api/connectors/github/repos', { params: { page, per_page: perPage } })
      .then((r) => r.data.data as GithubRepo[]),

  /** Repos for a specific org */
  githubOrgRepos: (org: string, page = 1) =>
    api.get(`/api/connectors/github/orgs/${org}/repos`, { params: { page } })
      .then((r) => r.data.data as GithubRepo[]),

  /** Full summary for one repo */
  githubRepoSummary: (owner: string, repo: string) =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/summary`)
      .then((r) => r.data.data as RepoSummary),

  /** Workflow runs for one repo */
  githubRepoRuns: (owner: string, repo: string, limit = 20, status?: string) =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/runs`, { params: { limit, status } })
      .then((r) => r.data.data as WorkflowRun[]),

  /** Commits for one repo */
  githubRepoCommits: (owner: string, repo: string, branch = 'main', limit = 20) =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/commits`, { params: { branch, limit } })
      .then((r) => r.data.data as GitCommit[]),

  /** Issues for one repo */
  githubRepoIssues: (owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/issues`, { params: { state } })
      .then((r) => r.data.data as GithubIssue[]),

  /** PRs for one repo */
  githubRepoPRs: (owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/pulls`, { params: { state } })
      .then((r) => r.data.data as GithubPullRequest[]),

  /** Branches for one repo */
  githubRepoBranches: (owner: string, repo: string) =>
    api.get(`/api/connectors/github/repos/${owner}/${repo}/branches`)
      .then((r) => r.data.data as GithubBranch[]),

  /** Re-run failed jobs */
  githubRerunJobs: (owner: string, repo: string, runId: number) =>
    api.post(`/api/connectors/github/repos/${owner}/${repo}/runs/${runId}/rerun`)
      .then((r) => r.data),

  // Legacy
  githubRuns: (limit = 20) =>
    api.get('/api/connectors/github/runs', { params: { limit } }).then((r) => r.data.data as WorkflowRun[]),

  // ─── Portainer: multi-endpoint ─────────────────────────────────────────────
  /** All Portainer endpoints */
  portainerListEndpoints: () =>
    api.get('/api/connectors/portainer/endpoints')
      .then((r) => r.data.data as PortainerEndpoint[]),

  /** Full summary for one endpoint */
  portainerEndpointSummary: (id: number) =>
    api.get(`/api/connectors/portainer/endpoints/${id}/summary`)
      .then((r) => r.data.data as EndpointSummary),

  /** Containers for one endpoint */
  portainerEndpointContainers: (id: number) =>
    api.get(`/api/connectors/portainer/endpoints/${id}/containers`)
      .then((r) => r.data.data as ContainerHealth[]),

  /** Stacks for one endpoint */
  portainerEndpointStacks: (id: number) =>
    api.get(`/api/connectors/portainer/endpoints/${id}/stacks`)
      .then((r) => r.data.data as Array<{ id: number; name: string; status: number }>),

  /** Restart container */
  portainerRestart: (endpointId: number, containerId: string) =>
    api.post(`/api/connectors/portainer/endpoints/${endpointId}/containers/${containerId}/restart`)
      .then((r) => r.data),

  /** Stop container */
  portainerStop: (endpointId: number, containerId: string) =>
    api.post(`/api/connectors/portainer/endpoints/${endpointId}/containers/${containerId}/stop`)
      .then((r) => r.data),

  /** Start a stopped/exited container */
  portainerStart: (endpointId: number, containerId: string) =>
    api.post(`/api/connectors/portainer/endpoints/${endpointId}/containers/${containerId}/start`)
      .then((r) => r.data),

  /** Fetch recent container logs */
  portainerContainerLogs: (endpointId: number, containerId: string, tail = 200) =>
    api.get(`/api/connectors/portainer/endpoints/${endpointId}/containers/${containerId}/logs`, { params: { tail } })
      .then((r) => (r.data.data as { logs: string }).logs),

  /** Start a stopped stack */
  portainerStackStart: (stackId: number, endpointId: number) =>
    api.post(`/api/connectors/portainer/stacks/${stackId}/start`, null, { params: { endpointId } })
      .then((r) => r.data),

  /** Stop a running stack */
  portainerStackStop: (stackId: number, endpointId: number) =>
    api.post(`/api/connectors/portainer/stacks/${stackId}/stop`, null, { params: { endpointId } })
      .then((r) => r.data),

  // Legacy
  portainerContainers: () =>
    api.get('/api/connectors/portainer/containers').then((r) => r.data.data as ContainerHealth[]),
};

// ─── Integrations ─────────────────────────────────────────────────────────────
export const integrationsApi = {
  status: () => api.get('/api/integrations/status').then((r) => r.data.data),
};

// ─── Prometheus ───────────────────────────────────────────────────────────────
export const prometheusApi = {
  query: (q: string, time?: string) =>
    api.get('/api/connectors/prometheus/query', { params: { q, time } })
      .then((r) => r.data.data as PrometheusInstantResult['data']),

  queryRange: (q: string, start: string, end: string, step: string) =>
    api.get('/api/connectors/prometheus/query_range', { params: { q, start, end, step } })
      .then((r) => r.data.data as PrometheusRangeResult['data']),

  labels: () =>
    api.get('/api/connectors/prometheus/labels').then((r) => r.data.data as string[]),

  labelValues: (label: string) =>
    api.get(`/api/connectors/prometheus/labels/${encodeURIComponent(label)}/values`)
      .then((r) => r.data.data as string[]),

  metricNames: () =>
    api.get('/api/connectors/prometheus/metrics').then((r) => r.data.data as string[]),

  targets: () =>
    api.get('/api/connectors/prometheus/targets')
      .then((r) => r.data.data as { activeTargets: Record<string, unknown>[] }),
};

// ─── Grafana ──────────────────────────────────────────────────────────────────
export const grafanaApi = {
  health: () =>
    api.get('/api/connectors/grafana/health').then((r) => r.data.data as GrafanaHealth),

  listDashboards: (q?: string, tag?: string) =>
    api.get('/api/connectors/grafana/dashboards', { params: { q, tag } })
      .then((r) => r.data.data as GrafanaDashboard[]),

  getDashboard: (uid: string) =>
    api.get(`/api/connectors/grafana/dashboards/${uid}`)
      .then((r) => r.data.data as GrafanaDashboardDetail),

  listDatasources: () =>
    api.get('/api/connectors/grafana/datasources')
      .then((r) => r.data.data as GrafanaDatasource[]),

  listAlertInstances: () =>
    api.get('/api/connectors/grafana/alert-instances')
      .then((r) => r.data.data as GrafanaAlertInstance[]),

  listAlertRules: () =>
    api.get('/api/connectors/grafana/alert-rules')
      .then((r) => r.data.data as GrafanaAlertRule[]),
};

// ─── AWS ──────────────────────────────────────────────────────────────────────
export const awsApi = {
  ec2: () =>
    api.get('/api/connectors/aws/ec2').then((r) => r.data.data as AWSEC2Instance[]),

  ecsClusters: () =>
    api.get('/api/connectors/aws/ecs/clusters').then((r) => r.data.data as AWSECSCluster[]),

  ecsServices: (cluster: string) =>
    api.get(`/api/connectors/aws/ecs/clusters/${encodeURIComponent(cluster)}/services`)
      .then((r) => r.data.data as AWSECSService[]),

  lambda: () =>
    api.get('/api/connectors/aws/lambda').then((r) => r.data.data as AWSLambdaFunction[]),

  cost: () =>
    api.get('/api/connectors/aws/cost').then((r) => r.data.data as AWSCostSummary),

  costDaily: (days = 14) =>
    api.get('/api/connectors/aws/cost/daily', { params: { days } })
      .then((r) => r.data.data as Array<{ date: string; items: AWSCostItem[]; total: number }>),
};

// ─── GCP ──────────────────────────────────────────────────────────────────────
export const gcpApi = {
  compute: () =>
    api.get('/api/connectors/gcp/compute').then((r) => r.data.data as GCPInstance[]),

  gke: () =>
    api.get('/api/connectors/gcp/gke').then((r) => r.data.data as GKECluster[]),

  run: (region?: string) =>
    api.get('/api/connectors/gcp/run', { params: { region } })
      .then((r) => r.data.data as CloudRunService[]),

  logging: (filter?: string, limit = 50) =>
    api.get('/api/connectors/gcp/logging', { params: { filter, limit } })
      .then((r) => r.data.data as GCPLogEntry[]),
};

// ─── Azure ────────────────────────────────────────────────────────────────────
export const azureApi = {
  vms: () =>
    api.get('/api/connectors/azure/vms').then((r) => r.data.data as AzureVM[]),

  aks: () =>
    api.get('/api/connectors/azure/aks').then((r) => r.data.data as AzureAKSCluster[]),

  cost: () =>
    api.get('/api/connectors/azure/cost').then((r) => r.data.data as AzureCostSummary),

  costDaily: (days = 14) =>
    api.get('/api/connectors/azure/cost/daily', { params: { days } })
      .then((r) => r.data.data as AzureCostSummary[]),
};
