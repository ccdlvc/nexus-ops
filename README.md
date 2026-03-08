# Nexus Ops

[![Build & Push Docker Images](https://github.com/ccdlvc/nexus-ops/actions/workflows/docker.yml/badge.svg)](https://github.com/ccdlvc/nexus-ops/actions/workflows/docker.yml)
[![Docker Pulls (backend)](https://img.shields.io/docker/pulls/ccdlvc/nexus-ops-backend?label=backend%20pulls&logo=docker)](https://hub.docker.com/r/ccdlvc/nexus-ops-backend)
[![Docker Pulls (dashboard)](https://img.shields.io/docker/pulls/ccdlvc/nexus-ops-dashboard?label=dashboard%20pulls&logo=docker)](https://hub.docker.com/r/ccdlvc/nexus-ops-dashboard)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> ☕ If Nexus Ops saves you time, consider supporting its development:
> **[Donate via PayPal](https://www.paypal.me/ccdlvc)**

AI-powered DevOps assistant that functions as a browser extension and a standalone React dashboard. Aggregates Jenkins, Kibana, GitHub, Portainer, Prometheus, Grafana, AWS, GCP, and Azure data to auto-generate incident reports, root cause analyses, and actionable fixes using Claude (Anthropic) or GPT-4 (OpenAI).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser / Client                         │
│  ┌──────────────────────┐    ┌─────────────────────────────┐   │
│  │  Chrome Extension    │    │  React Dashboard (Vite)     │   │
│  │  (MV3 + React popup) │    │  localhost:3000             │   │
│  └──────────┬───────────┘    └──────────────┬──────────────┘   │
└─────────────┼──────────────────────────────┼───────────────────┘
              │ HTTP + WebSocket              │ HTTP + WebSocket
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend API (Node.js / Express)  :4000             │
│  ┌────────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ AI Layer   │  │ Routes   │  │ Connectors│  │ Alert       │ │
│  │ (Claude /  │  │ incidents│  │ Jenkins   │  │ Monitor     │ │
│  │  GPT-4)    │  │ query    │  │ Kibana    │  │ (background │ │
│  │ agent.ts   │  │ alerts   │  │ GitHub    │  │  polling)   │ │
│  │ rootCause  │  │ connectors│ │ Portainer │  └─────────────┘ │
│  │ anomaly    │  │ integrations│ Prometheus│  ┌─────────────┐ │
│  │ reports    │  └──────────┘  │ Grafana   │  │ SQLite DB   │ │
│  └────────────┘                │ AWS       │  │ (incidents, │ │
│                                │ GCP       │  │  alerts,    │ │
│                                │ Azure     │  │  rules)     │ │
│                                └───────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ scrapes
┌─────────────────────────────────────────────────────────────────┐
│  Prometheus :9090  ←─── node-exporter :9100                    │
│  Grafana :3001  (provisioned dashboards + datasources)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
nexus-ops/
├── docker-compose.yml              # Full stack: backend, dashboard, Prometheus, Grafana, node-exporter
├── README.md
├── EXAMPLE_INCIDENT_REPORT.md
│
├── shared/
│   └── types/index.ts              # All shared TypeScript types
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example                # Full env var reference
│   └── src/
│       ├── index.ts                # Express + WebSocket server entry
│       ├── connectors/
│       │   ├── jenkins.ts          # Jenkins API client
│       │   ├── kibana.ts           # Kibana/Elasticsearch client
│       │   ├── github.ts           # GitHub REST API client
│       │   ├── portainer.ts        # Portainer API client
│       │   ├── prometheus.ts       # Prometheus HTTP API client
│       │   ├── grafana.ts          # Grafana API client
│       │   ├── aws.ts              # AWS SDK v3 (EC2, ECS, Lambda, CloudWatch, Cost Explorer)
│       │   ├── gcp.ts              # GCP APIs (Compute, GKE, Cloud Run, Monitoring, Logging)
│       │   └── azure.ts            # Azure SDK (VMs, AKS, Monitor, Cost Management)
│       ├── ai/
│       │   ├── agent.ts            # Natural language query agent (cloud-aware follow-ups)
│       │   ├── rootCause.ts        # Root cause analyzer
│       │   ├── anomalyDetection.ts # Statistical + AI anomaly detection
│       │   └── reportGenerator.ts  # Markdown/Slack/Teams/GitHub report generator
│       ├── routes/
│       │   ├── incidents.ts        # Incident CRUD + report/issue generation
│       │   ├── query.ts            # POST /api/query — includes aws/gcp/azure data sources
│       │   ├── alerts.ts           # Alert list, rules, acknowledge
│       │   ├── connectors.ts       # All connector pass-through routes + cloud routes
│       │   └── integrations.ts     # Integration health status
│       ├── alerts/
│       │   └── monitor.ts          # Background polling — cloud metrics every 2 min
│       ├── storage/
│       │   └── db.ts               # SQLite WAL; seeds 16 default alert rules inc. cloud
│       ├── metrics/
│       │   └── registry.ts         # prom-client metrics registry
│       └── utils/
│           └── logger.ts           # Winston logger
│
├── dashboard/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── App.tsx                 # Router + AlertsProvider wrapper
│       ├── context/
│       │   └── AlertsContext.tsx   # Single shared alert state (avoids duplicate fetches)
│       ├── hooks/
│       │   ├── useAlerts.ts        # Consumes AlertsContext
│       │   └── useIncidents.ts     # Fetches incidents
│       ├── pages/
│       │   ├── Dashboard.tsx       # Overview with live alert feed
│       │   ├── Incidents.tsx       # Incident management
│       │   ├── PortainerPage.tsx   # Portainer container view
│       │   ├── GrafanaPage.tsx     # Embedded Grafana iframe
│       │   ├── ReposPage.tsx       # GitHub repos/workflows
│       │   ├── AWSPage.tsx         # EC2, ECS clusters/services, Lambda, cost breakdown
│       │   ├── GCPPage.tsx         # Compute Engine, GKE clusters, Cloud Run services
│       │   ├── AzurePage.tsx       # VMs, AKS clusters, cost breakdown
│       │   ├── CloudCostPage.tsx   # Unified AWS vs GCP vs Azure cost comparison
│       │   └── Settings.tsx        # Integration configuration
│       ├── components/
│       │   ├── NavBar.tsx
│       │   ├── Sidebar.tsx         # Cloud nav section (AWS, GCP, Azure, Cloud Cost)
│       │   └── IncidentCard.tsx
│       └── services/
│           └── api.ts              # Typed Axios client — includes awsApi, gcpApi, azureApi
│
├── extension/
│   ├── manifest.json               # Chrome MV3 manifest
│   └── src/
│       ├── popup/
│       │   ├── App.tsx             # 4 tabs: Incidents, Alerts, Cloud, Query
│       │   └── components/
│       │       ├── AlertPanel.tsx  # Cloud source icons (aws ☁, gcp 🌐, azure 🔷)
│       │       ├── IncidentCard.tsx
│       │       ├── NavBar.tsx
│       │       └── QueryInput.tsx
│       ├── background/             # Service worker (badge, notifications, WebSocket)
│       └── content/                # Context overlay on DevOps pages
│
├── prometheus/
│   └── prometheus.yml              # Scrape config (backend :4000/metrics, node-exporter :9100)
│
└── grafana/
    └── provisioning/
        ├── dashboards/
        │   ├── dashboard.yml       # Dashboard provider config
        │   ├── nexus-overview.json # Pre-built dashboard (CI/CD, containers, host metrics)
        │   └── prometheus.yml      # Prometheus datasource
        └── datasources/
```

---

## Quick Start

### 1. Configure environment

```bash
cd nexus-ops/backend
cp .env.example .env
# Edit .env — fill in the services you actually have
```

Only the AI provider key is strictly required. All other sections are optional — the backend skips unconfigured integrations gracefully.

### 2. Run with Docker Compose

```bash
cd nexus-ops
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Backend API | http://localhost:4000 |
| React Dashboard | http://localhost:3000 |
| Grafana | http://localhost:3001 (admin / see `GRAFANA_PASSWORD`) |
| Prometheus | http://localhost:9090 |

### 3. Local development

```bash
# Backend (hot-reload with ts-node-dev)
cd backend && npm install && npm run dev

# Dashboard (Vite HMR)
cd dashboard && npm install && npm run dev

# Run tests
cd backend && npm test

# Run tests with coverage
cd backend && npm run test:coverage
```

### 4. Build browser extension

```bash
cd extension && npm install && npm run build
# Load extension/dist/ as an unpacked extension in chrome://extensions
```

---

## Environment Variables

All variables are optional except an AI provider key. The backend logs a warning and skips connector routes for any unconfigured service.

### AI Provider (at least one required)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Anthropic Claude API key |
| `ANTHROPIC_MODEL` | `claude-opus-4-6` | Model ID |
| `OPENAI_API_KEY` | — | OpenAI API key (fallback) |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI model ID |

### Jenkins

| Variable | Description |
|----------|-------------|
| `JENKINS_URL` | Jenkins base URL e.g. `http://jenkins.example.com:8080` |
| `JENKINS_USER` | Jenkins username |
| `JENKINS_TOKEN` | Jenkins API token |

### Kibana / Elasticsearch

| Variable | Default | Description |
|----------|---------|-------------|
| `KIBANA_URL` | — | Kibana base URL |
| `KIBANA_USER` | — | Kibana username |
| `KIBANA_PASSWORD` | — | Kibana password |
| `KIBANA_INDEX` | `logs-*` | Log index pattern |

### GitHub

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | Personal access token (repo, workflow scopes) |
| `GITHUB_OWNER` | Organization or username |
| `GITHUB_REPO` | Default repository name |

### Portainer

| Variable | Default | Description |
|----------|---------|-------------|
| `PORTAINER_URL` | — | Portainer base URL |
| `PORTAINER_TOKEN` | — | Portainer API token |
| `PORTAINER_ENDPOINT` | `0` | Endpoint ID (`0` = auto-discover first online) |

### Prometheus

| Variable | Default | Description |
|----------|---------|-------------|
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus base URL |
| `PROMETHEUS_USER` | — | Basic auth username (if enabled) |
| `PROMETHEUS_PASSWORD` | — | Basic auth password (if enabled) |

### Grafana

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_URL` | `http://grafana:3000` | Grafana base URL |
| `GRAFANA_TOKEN` | — | Service account token |
| `GRAFANA_USER` | `admin` | Admin username (used by compose) |
| `GRAFANA_PASSWORD` | `change_me_in_production` | Admin password |

### Collaboration

| Variable | Description |
|----------|-------------|
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams webhook URL |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `LOG_LEVEL` | `info` | Winston log level |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origins (comma-separated) |
| `DASHBOARD_URL` | `http://localhost:3000` | Dashboard URL for links in reports |
| `DB_PATH` | `./data/copilot.db` | SQLite database path |

### AWS

> IAM user or role needs: `ec2:Describe*`, `ecs:List*`/`Describe*`, `lambda:List*`/`GetFunction`, `cloudwatch:GetMetricStatistics`, `logs:*`, `ce:GetCostAndUsage`

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | — | IAM access key ID |
| `AWS_SECRET_ACCESS_KEY` | — | IAM secret access key |
| `AWS_REGION` | `us-east-1` | Default AWS region |
| `AWS_SESSION_TOKEN` | — | Temporary credentials / SSO only |

### GCP

> Service account needs roles: Compute Viewer, Kubernetes Engine Viewer, Cloud Run Viewer, Monitoring Viewer, Logs Viewer

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_CLIENT_EMAIL` | Service account email |
| `GCP_PRIVATE_KEY` | Private key from JSON key file (newlines as `\n`) |

Alternatively, mount a key file and set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/keyfile.json`.

### Azure

> App registration (service principal) with `Reader` role. Create with:
> `az ad sp create-for-rbac --role Reader --scopes /subscriptions/{id}`

| Variable | Description |
|----------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `AZURE_SUBSCRIPTION_ID` | Target subscription ID |
| `AZURE_LOG_ANALYTICS_WORKSPACE_ID` | Workspace GUID (required for `/azure/logs`) |

---

## API Reference

### Incidents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/incidents` | List incidents (`?status=open&severity=high`) |
| `POST` | `/api/incidents` | Analyze context and create incident card |
| `GET` | `/api/incidents/:id` | Get single incident |
| `PATCH` | `/api/incidents/:id` | Update status, severity, assignee |
| `POST` | `/api/incidents/:id/report` | Generate report (`format`: markdown/slack/teams/github) |
| `POST` | `/api/incidents/:id/github-issue` | Create GitHub issue from incident |
| `POST` | `/api/incidents/:id/slack` | Post incident to Slack |
| `POST` | `/api/incidents/:id/teams` | Post incident to Teams |

### Natural Language Query

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/query` | `{ query: string, sources?: DataSource[] }` | Ask a DevOps question in plain English. `sources` accepts `'jenkins'`, `'kibana'`, `'github'`, `'portainer'`, `'aws'`, `'gcp'`, `'azure'` |

### Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/alerts` | List alerts (`?resolved=false`) |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `GET` | `/api/alerts/rules` | List alert rules |
| `POST` | `/api/alerts/rules` | Create alert rule |
| `DELETE` | `/api/alerts/rules/:id` | Delete alert rule |

### Integration Status

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations/status` | Health check for all configured integrations |

### Metrics

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/metrics` | Prometheus metrics endpoint (prom-client) |
| `GET` | `/health` | Health check (`{ status: "ok" }`) |

### Connectors — On-premise / SaaS

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/connectors/jenkins/builds` | Recent Jenkins builds |
| `GET` | `/api/connectors/jenkins/jobs` | All Jenkins jobs |
| `GET` | `/api/connectors/kibana/logs` | Recent log entries |
| `GET` | `/api/connectors/kibana/error-trends` | Error trend over time |
| `GET` | `/api/connectors/github/repos` | Repository list |
| `GET` | `/api/connectors/github/workflows` | Workflow runs |
| `GET` | `/api/connectors/github/prs` | Open pull requests |
| `GET` | `/api/connectors/portainer/containers` | Container list + stats |
| `GET` | `/api/connectors/portainer/endpoints` | Portainer endpoints |
| `GET` | `/api/connectors/prometheus/query` | Instant PromQL query (`?query=...`) |
| `GET` | `/api/connectors/prometheus/range` | Range PromQL query |
| `GET` | `/api/connectors/prometheus/alerts` | Active Prometheus alerts |
| `GET` | `/api/connectors/grafana/dashboards` | Grafana dashboard list |
| `GET` | `/api/connectors/grafana/alerts` | Grafana alert rules |

### Connectors — AWS

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/connectors/aws/ec2` | EC2 instances with state |
| `GET` | `/api/connectors/aws/ecs/clusters` | ECS clusters |
| `GET` | `/api/connectors/aws/ecs/clusters/:cluster/services` | Services in an ECS cluster |
| `GET` | `/api/connectors/aws/lambda` | Lambda functions |
| `GET` | `/api/connectors/aws/cloudwatch` | CloudWatch metric query |
| `GET` | `/api/connectors/aws/logs` | List CloudWatch log groups |
| `GET` | `/api/connectors/aws/logs/:group/events` | Log events from a group |
| `GET` | `/api/connectors/aws/cost` | Month-to-date cost by service |
| `GET` | `/api/connectors/aws/cost/daily` | Daily costs for past N days |

### Connectors — GCP

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/connectors/gcp/compute` | Compute Engine instances |
| `GET` | `/api/connectors/gcp/gke` | GKE clusters |
| `GET` | `/api/connectors/gcp/run` | Cloud Run services (`?region=us-central1`) |
| `GET` | `/api/connectors/gcp/monitoring` | Monitoring time series |
| `GET` | `/api/connectors/gcp/logging` | Log entries (KQL-style filter) |

### Connectors — Azure

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/connectors/azure/vms` | Virtual machines with power state |
| `GET` | `/api/connectors/azure/aks` | AKS managed clusters |
| `GET` | `/api/connectors/azure/metrics` | Azure Monitor metrics |
| `GET` | `/api/connectors/azure/logs` | Log Analytics KQL query |
| `GET` | `/api/connectors/azure/cost` | Month-to-date cost by service |
| `GET` | `/api/connectors/azure/cost/daily` | Daily costs for past N days |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:4000` | Real-time alert push (`{ type: 'alert', data: Alert }`) |

---

## AI Features

- **Natural Language Query** — "Show me failed builds last week", "Which Lambda functions are cold starting?", "Compare AWS vs Azure costs", "How many GKE clusters are running?"
- **Root Cause Analysis** — Correlates Jenkins logs + Kibana errors + GitHub commits + container health + cloud metrics
- **Anomaly Detection** — Statistical baselines + AI cross-source pattern detection
- **Report Generation** — Markdown, GitHub issue body, Slack Block Kit, Teams Adaptive Card
- **Proactive Alerts** — Memory >80%, crash loops, build failures, error spikes, stopped EC2 instances, Azure deallocated VMs, GKE failures, cost spikes (16 built-in rules, all configurable)

---

## Built-in Alert Rules

| Rule | Source | Metric | Threshold | Severity |
|------|--------|--------|-----------|----------|
| High Memory Usage | Portainer | memoryPercent | >80% | High |
| Critical Memory (OOM risk) | Portainer | memoryPercent | >95% | Critical |
| High CPU | Portainer | cpuPercent | >90% | High |
| Container Restart Loop | Portainer | restartCount | >5 | Critical |
| Slow Test Suite | Jenkins | testDurationMs | >5min | Medium |
| High Error Rate | Kibana | errorCount | >100/5min | High |
| Pipeline Failure Rate | Jenkins | failureRate | >50% | High |
| Failed Workflows | GitHub | failedWorkflows | >2/hr | Medium |
| EC2 Stopped Instances | AWS | stoppedInstanceCount | >5 | Medium |
| High Lambda Function Count | AWS | lambdaFunctionCount | >100 | Info |
| AWS Monthly Cost Spike | AWS | monthlyCostUSD | >$1000 | High |
| GCP Terminated Instances | GCP | terminatedInstanceCount | >3 | Medium |
| GKE Cluster Not Running | GCP | clusterNotRunningCount | >0 | High |
| Azure Deallocated VMs | Azure | deallocatedVMCount | >5 | Medium |
| Azure AKS Cluster Not Succeeded | Azure | aksNotSucceededCount | >0 | High |
| Azure Monthly Cost Spike | Azure | monthlyCostUSD | >$1000 | High |

---

## Grafana Dashboard

The pre-provisioned `nexus-overview` dashboard at `http://localhost:3001` includes:

- **CI/CD** — Jenkins build success rate, build duration trends
- **Error Rates** — Kibana error counts, error spikes
- **Containers** — Portainer container count, memory, CPU
- **GitHub** — Open PRs, workflow run status
- **Host Metrics** (via node_exporter) — CPU by mode, memory breakdown, disk I/O, network I/O

Default credentials: `admin` / value of `GRAFANA_PASSWORD` env var.

---

## Observability Stack

The docker-compose setup includes:

- **Prometheus** (`:9090`) — scrapes `/metrics` on the backend every 15 s, and node-exporter every 15 s
- **Grafana** (`:3001`) — provisioned with Prometheus datasource and the overview dashboard
- **node-exporter** — host OS metrics (CPU, memory, disk, network)

To add your own Prometheus targets, edit `prometheus/prometheus.yml`.

---

## Development Notes

### Running tests

```bash
cd backend
npm test                  # run all tests
npm run test:coverage     # with coverage report
```

Tests live in `backend/src/__tests__/`. Coverage is collected for `src/connectors/**` and `src/routes/**`.

Connector test files: `jenkins`, `grafana`, `kibana`, `portainer`, `prometheus`, `github`, `aws`, `gcp`, `azure`.

### TypeScript build

```bash
cd backend && npm run build    # outputs to backend/dist/
```

### Adding a new connector

1. Create `backend/src/connectors/myservice.ts`
2. Add shared types to `shared/types/index.ts`
3. Add env var guards and routes to `backend/src/routes/connectors.ts`
4. Add a `case 'myservice'` block to `backend/src/routes/query.ts`
5. Add cloud metric computation to `backend/src/alerts/monitor.ts` `safeGetCloudMetrics()` if applicable
6. Add default alert rules to `backend/src/storage/db.ts` `seedDefaultRules()`
7. Add API methods to `dashboard/src/services/api.ts`
8. Create a page in `dashboard/src/pages/`
9. Register the route and sidebar link in `App.tsx` and `Sidebar.tsx`

### Configuration guards pattern

Every route that depends on an optional service follows this pattern:

```ts
const myConfigured = !!(process.env.MY_URL && process.env.MY_TOKEN);

router.get('/my/resource', async (req, res) => {
  if (!myConfigured) return notConfigured(res, 'MyService');
  // ... connector call
});
```

`notConfigured()` returns HTTP 503 with a JSON error message. The frontend handles 503 gracefully.

---

## Support

If Nexus Ops helps your team, consider buying me a coffee ☕

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-0070ba?logo=paypal&logoColor=white)](https://www.paypal.me/ccdlvc)

---

## License

MIT
