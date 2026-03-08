// ─── Shared Domain Types ────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'suppressed';
export type DataSource = 'jenkins' | 'kibana' | 'github' | 'portainer' | 'aws' | 'gcp' | 'azure';

// ─── Build / CI ──────────────────────────────────────────────────────────────

export interface BuildResult {
  id: string;
  jobName: string;
  buildNumber: number;
  status: 'SUCCESS' | 'FAILURE' | 'ABORTED' | 'UNSTABLE' | 'IN_PROGRESS';
  timestamp: string;        // ISO-8601
  duration: number;         // ms
  url: string;
  commitSha?: string;
  branch?: string;
  triggeredBy?: string;
  logs?: string;
  testReport?: TestReport;
}

export interface TestReport {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;         // ms
  slowTests: SlowTest[];
}

export interface SlowTest {
  name: string;
  duration: number;
  threshold: number;
}

// ─── Kibana / Elasticsearch ──────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  service?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorTrend {
  timestamp: string;
  errorType: string;
  count: number;
  service: string;
}

export interface AnomalyResult {
  id: string;
  detectedAt: string;
  metric: string;
  value: number;
  baseline: number;
  deviation: number;        // percentage above baseline
  severity: Severity;
  source: DataSource;
  description: string;
}

// ─── GitHub Actions ──────────────────────────────────────────────────────────

export interface WorkflowRun {
  id: number;
  name: string;
  headBranch: string;
  headSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  jobs?: WorkflowJob[];
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  startedAt: string;
  completedAt: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: string;
  conclusion?: string;
  number: number;
  startedAt: string;
  completedAt: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

// ─── Portainer / Docker ──────────────────────────────────────────────────────

export interface ContainerHealth {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'restarting' | 'paused' | 'exited';
  health?: 'healthy' | 'unhealthy' | 'starting' | 'none';
  restartCount: number;
  cpuPercent: number;
  memoryUsage: number;      // bytes
  memoryLimit: number;      // bytes
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  created: string;
  portainer?: {
    endpointId: number;
    stackName?: string;
  };
}

export interface ServiceHealth {
  id: string;
  name: string;
  replicas: number;
  runningReplicas: number;
  image: string;
  updatedAt: string;
  containers: ContainerHealth[];
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export interface IncidentCorrelation {
  source: DataSource;
  entityId: string;
  entityType: string;
  description: string;
  timestamp: string;
  confidence: number;       // 0-1
}

export interface SuggestedFix {
  title: string;
  description: string;
  command?: string;
  link?: string;
  priority: number;
}

export interface IncidentCard {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  rootCause: string;
  suggestedFixes: SuggestedFix[];
  correlations: IncidentCorrelation[];
  affectedServices: string[];
  tags: string[];
  rawData?: Record<string, unknown>;
  githubIssueUrl?: string;
  slackThreadUrl?: string;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface AlertRule {
  id: string;
  name: string;
  source: DataSource;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: Severity;
  message: string;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: Severity;
  source: DataSource;
  message: string;
  value: number;
  threshold: number;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledged: boolean;
  incidentId?: string;
}

// ─── AI Responses ────────────────────────────────────────────────────────────

export interface QueryResponse {
  query: string;
  answer: string;
  sources: Array<{
    source: DataSource;
    summary: string;
    data: unknown;
  }>;
  suggestedFollowUps: string[];
  processingMs: number;
}

export interface IncidentReport {
  incident: IncidentCard;
  markdownReport: string;
  slackBlocks: unknown[];
  githubIssueBody: string;
  githubIssueLabels: string[];
  teamsAdaptiveCard: unknown;
}

// ─── GitHub Repository ───────────────────────────────────────────────────────

export interface GithubRepo {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  stargazers: number;
  openIssues: number;
  htmlUrl: string;
  pushedAt: string;
  topics: string[];
}

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  body?: string;
}

export interface GithubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  draft: boolean;
  mergeable?: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface GithubBranch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface RepoSummary {
  repo: GithubRepo;
  recentRuns: WorkflowRun[];
  recentCommits: GitCommit[];
  openIssues: GithubIssue[];
  openPRs: GithubPullRequest[];
  branches: GithubBranch[];
}

// ─── Portainer Endpoint ──────────────────────────────────────────────────────

export interface PortainerEndpoint {
  id: number;
  name: string;
  type: number;           // 1=Docker, 2=Agent, 3=AzureAOCI, 4=EdgeAgent, 5=KubeEdge, 7=KubeAgent
  url: string;
  status: 1 | 2;          // 1=up, 2=down
  publicUrl?: string;
  groupId: number;
  tags: string[];
  containerCount?: number;
  runningContainerCount?: number;
  stackCount?: number;
}

export interface EndpointSummary {
  endpoint: PortainerEndpoint;
  containers: ContainerHealth[];
  stacks: Array<{ id: number; name: string; status: number }>;
  runningCount: number;
  unhealthyCount: number;
  highMemoryCount: number;
  highCpuCount: number;
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConnectorConfig {
  jenkins?: {
    url: string;
    username: string;
    token: string;
  };
  kibana?: {
    url: string;
    username: string;
    password: string;
    indexPattern: string;
  };
  github?: {
    token: string;
    owner: string;
    repo: string;
  };
  portainer?: {
    url: string;
    token: string;
    endpointId: number;
  };
  openai?: {
    apiKey: string;
    model: string;
  };
  anthropic?: {
    apiKey: string;
    model: string;
  };
  slack?: {
    webhookUrl: string;
    channel: string;
  };
}

// ─── Prometheus ───────────────────────────────────────────────────────────────

export interface PrometheusMetricValue {
  metric: Record<string, string>;   // label set, e.g. { job: 'node', instance: '...' }
  value: [number, string];          // [unixTimestamp, stringValue]
}

export interface PrometheusInstantResult {
  status: 'success' | 'error';
  data: {
    resultType: 'vector' | 'scalar' | 'string' | 'matrix';
    result: PrometheusMetricValue[];
  };
  error?: string;
}

export interface PrometheusRangeValue {
  metric: Record<string, string>;
  values: Array<[number, string]>;  // [[ts, val], ...]
}

export interface PrometheusRangeResult {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix';
    result: PrometheusRangeValue[];
  };
  error?: string;
}

export interface PrometheusLabel {
  name: string;
}

// ─── Grafana ──────────────────────────────────────────────────────────────────

export interface GrafanaDashboard {
  uid: string;
  id: number;
  title: string;
  url: string;                  // relative URL, e.g. /d/abc/my-dash
  folderTitle?: string;
  folderUid?: string;
  tags: string[];
  starred: boolean;
  type: 'dash-db' | 'dash-folder';
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: string;                 // e.g. 'timeseries', 'gauge', 'table'
  gridPos: { x: number; y: number; w: number; h: number };
  description?: string;
}

export interface GrafanaDashboardDetail {
  uid: string;
  title: string;
  url: string;
  tags: string[];
  panels: GrafanaPanel[];
  version: number;
  schemaVersion: number;
}

export interface GrafanaDatasource {
  id: number;
  uid: string;
  name: string;
  type: string;                 // e.g. 'prometheus', 'loki', 'influxdb'
  url: string;
  access: 'proxy' | 'direct';
  isDefault: boolean;
  jsonData?: Record<string, unknown>;
}

export interface GrafanaHealth {
  commit: string;
  database: 'ok' | 'degraded';
  version: string;
}

// ─── AWS ──────────────────────────────────────────────────────────────────────

export type EC2InstanceState = 'pending' | 'running' | 'shutting-down' | 'terminated' | 'stopping' | 'stopped';

export interface AWSEC2Instance {
  id: string;
  name: string;
  state: EC2InstanceState;
  type: string;             // e.g. 't3.medium'
  region: string;
  availabilityZone: string;
  publicIp?: string;
  privateIp?: string;
  launchTime: string;
  tags: Record<string, string>;
}

export interface AWSECSCluster {
  arn: string;
  name: string;
  status: string;
  activeServiceCount: number;
  runningTaskCount: number;
  pendingTaskCount: number;
  registeredContainerInstancesCount: number;
}

export interface AWSECSService {
  arn: string;
  name: string;
  clusterArn: string;
  status: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  taskDefinition: string;
  launchType?: string;
}

export interface AWSLambdaFunction {
  name: string;
  arn: string;
  runtime: string;
  state?: string;
  codeSize: number;         // bytes
  timeout: number;          // seconds
  memorySize: number;       // MB
  lastModified: string;
  description?: string;
}

export interface AWSCostItem {
  service: string;
  amount: number;
  currency: string;
}

export interface AWSCostSummary {
  timePeriod: { start: string; end: string };
  total: number;
  currency: string;
  byService: AWSCostItem[];
}

export interface AWSCloudWatchDataPoint {
  timestamp: string;
  value: number;
  unit: string;
}

export interface AWSLogEvent {
  timestamp: string;
  message: string;
  logStream: string;
  logGroup: string;
}

// ─── GCP ──────────────────────────────────────────────────────────────────────

export type GCPInstanceStatus =
  | 'PROVISIONING' | 'STAGING' | 'RUNNING'
  | 'STOPPING' | 'SUSPENDED' | 'SUSPENDING' | 'TERMINATED';

export interface GCPInstance {
  id: string;
  name: string;
  zone: string;
  machineType: string;
  status: GCPInstanceStatus;
  networkIp?: string;
  publicIp?: string;
  labels: Record<string, string>;
  creationTimestamp: string;
}

export interface GKECluster {
  name: string;
  location: string;
  status: string;
  currentMasterVersion: string;
  currentNodeCount: number;
  nodePoolCount: number;
  endpoint: string;
  createTime: string;
}

export interface CloudRunService {
  name: string;
  region: string;
  status: string;
  url?: string;
  latestReadyRevision?: string;
  latestCreatedRevision?: string;
}

export interface GCPLogEntry {
  timestamp: string;
  severity: string;
  message: string;
  resource: { type: string; labels: Record<string, string> };
}

export interface GCPMetricPoint {
  startTime: string;
  endTime: string;
  value: number;
}

export interface GCPTimeSeries {
  metric: { type: string; labels: Record<string, string> };
  resource: { type: string; labels: Record<string, string> };
  points: GCPMetricPoint[];
}

// ─── Azure ────────────────────────────────────────────────────────────────────

export interface AzureVM {
  id: string;
  name: string;
  location: string;
  resourceGroup: string;
  size: string;               // e.g. 'Standard_D2s_v3'
  provisioningState: string;  // e.g. 'Succeeded'
  powerState?: string;        // e.g. 'running', 'deallocated'
  osType?: string;            // 'Windows' | 'Linux'
  tags: Record<string, string>;
}

export interface AzureAKSCluster {
  id: string;
  name: string;
  location: string;
  resourceGroup: string;
  kubernetesVersion: string;
  provisioningState: string;
  nodeCount: number;
  fqdn?: string;
  tags: Record<string, string>;
}

export interface AzureMetricDataPoint {
  timestamp: string;
  average?: number;
  total?: number;
  minimum?: number;
  maximum?: number;
  count?: number;
}

export interface AzureMetricSeries {
  name: string;
  unit: string;
  data: AzureMetricDataPoint[];
}

export interface AzureLogRow {
  timestamp: string;
  message: string;
  severity?: string;
  [key: string]: unknown;
}

export interface AzureCostItem {
  service: string;
  amount: number;
  currency: string;
}

export interface AzureCostSummary {
  timePeriod: { start: string; end: string };
  total: number;
  currency: string;
  byService: AzureCostItem[];
}



