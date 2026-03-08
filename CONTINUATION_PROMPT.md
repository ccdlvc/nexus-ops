# Continuation Prompt — Nexus Ops

Use this document to resume work on another machine. Paste the section below as your opening message to Claude Code.

---

## Prompt to paste into a new Claude Code session

```
I'm continuing work on the "Nexus Ops" project located at <path>/nexus-ops/.
It is an AI-powered DevOps assistant with a Node.js/Express backend, a React+Vite dashboard,
a Chrome MV3 browser extension, and a full observability stack (Prometheus, Grafana, node-exporter).

Please read the README.md in the root of the project before doing anything else, then read
backend/.env.example and docker-compose.yml to understand the full service configuration.

Here is a summary of what has already been completed, the key architectural decisions made,
and the current state — so you can continue without redoing anything.

─────────────────────────────────────────────────
COMPLETED WORK
─────────────────────────────────────────────────

1. BACKEND REFACTORING
   - Replaced a 125-line SQLite Singleton class with a simpler module-level export in
     backend/src/storage/db.ts.
   - Removed dead metrics from backend/src/metrics/registry.ts.
   - Major rewrite of backend/src/alerts/monitor.ts:
     * safeGetContainers() now calls portainer.listEndpoints() FIRST, validates the
       endpoint ID exists in the returned list, then calls getContainersForEndpoint()
       only with a confirmed valid ID. This fixes a root-cause bug where the connector's
       internal try/catch was swallowing 404 errors silently.
     * safeGetBuilds() and safeGetErrorTrends() guard against empty JENKINS_URL /
       KIBANA_URL with early returns.

2. RUNTIME BUG FIXES
   a. ERR_INVALID_URL for Jenkins/Kibana:
      Root cause: empty string env vars (JENKINS_URL='') pass through ?? but not ||.
      Fix: all URL env-var reads use || instead of ?? as the falsy guard.
   b. Portainer 404 on endpoint ID 1:
      Root cause: default PORTAINER_ENDPOINT was hardcoded to 1 in docker-compose,
      but endpoint 1 did not exist. Portainer connector catches 404 internally and
      returns [] silently, making the outer catch inert.
      Fix: Changed default to 0 (= auto-discover first online endpoint); safeGetContainers
      now calls listEndpoints() first and validates before forwarding the ID.
   c. EAI_AGAIN for jenkins/kibana Docker service names:
      Root cause: docker-compose was falling back to http://jenkins:8080 and
      http://kibana:5601 which resolve in the Docker network but those services
      do not exist.
      Fix: Added if (!process.env.JENKINS_URL) return [] guards in monitor.ts and
      notConfigured() guards in connectors.ts for all optional services.

3. ALERT DEDUPLICATION
   - NavBar, Sidebar, and Dashboard each had their own useAlerts() instance, causing
     3× HTTP requests + 3× WebSocket connections per page load.
   - Fixed by creating dashboard/src/context/AlertsContext.tsx with a single
     AlertsProvider that holds one shared fetch + one WebSocket connection.
   - App.tsx wraps the router in <AlertsProvider>; all three components call
     useContext(AlertsContext) instead of useAlerts() directly.

4. PROMETHEUS + GRAFANA OBSERVABILITY
   - Added Prometheus and Grafana services to docker-compose.yml.
   - prometheus/prometheus.yml scrapes the backend at :4000/metrics every 15 s.
   - Grafana is provisioned automatically via grafana/provisioning/:
     * datasources/ — Prometheus datasource
     * dashboards/dashboard.yml — dashboard provider
     * dashboards/copilot-overview.json — pre-built dashboard with CI/CD, error rate,
       container, GitHub, and host metrics panels.

5. NODE_EXPORTER INTEGRATION
   - Added prom/node-exporter:v1.9.1 service to docker-compose.yml with host PID
     namespace and /proc, /sys, /rootfs bind mounts.
   - Added node-exporter scrape job to prometheus/prometheus.yml.
   - Added 10 new panels to copilot-overview.json (Host CPU, Memory, Disk I/O,
     Network I/O using node_* metrics).

6. AWS INTEGRATION
   - New file: backend/src/connectors/aws.ts — AWSConnector class using AWS SDK v3
     (@aws-sdk/client-ec2, ecs, lambda, cloudwatch, cloudwatch-logs, cost-explorer).
   - Constructor: (accessKeyId, secretAccessKey, region, sessionToken?)
   - Methods: listInstances(), listClusters(), listServices(clusterArn),
     listFunctions(), getMetricStats(), listLogGroups(), getLogEvents(),
     getMonthlyCost(), getDailyCosts().
   - Routes in backend/src/routes/connectors.ts:
     GET /api/connectors/aws/ec2
     GET /api/connectors/aws/ecs/clusters
     GET /api/connectors/aws/ecs/clusters/:cluster/services
     GET /api/connectors/aws/lambda
     GET /api/connectors/aws/cloudwatch
     GET /api/connectors/aws/logs
     GET /api/connectors/aws/logs/:group/events
     GET /api/connectors/aws/cost
     GET /api/connectors/aws/cost/daily

7. GCP INTEGRATION
   - New file: backend/src/connectors/gcp.ts — GCPConnector class using googleapis
     package with GoogleAuth JWT service account credentials.
   - Constructor: (projectId, clientEmail?, privateKey?)
   - Methods: listInstances(), listClusters(), listRunServices(region),
     queryTimeSeries(), listLogEntries().
   - Routes:
     GET /api/connectors/gcp/compute
     GET /api/connectors/gcp/gke
     GET /api/connectors/gcp/run
     GET /api/connectors/gcp/monitoring
     GET /api/connectors/gcp/logging

8. AZURE INTEGRATION
   - New file: backend/src/connectors/azure.ts — AzureConnector class using:
     @azure/identity (ClientSecretCredential)
     @azure/arm-compute (VMs)
     @azure/arm-containerservice (AKS)
     @azure/monitor-query (MetricsQueryClient, LogsQueryClient / KQL)
     @azure/arm-costmanagement (Cost queries)
   - Constructor: (tenantId, clientId, clientSecret, subscriptionId)
   - Methods: listVMs(), listAKSClusters(), getMetrics(), queryLogs(),
     getMonthlyCost(), getDailyCosts().
   - Routes:
     GET /api/connectors/azure/vms
     GET /api/connectors/azure/aks
     GET /api/connectors/azure/metrics
     GET /api/connectors/azure/logs
     GET /api/connectors/azure/cost
     GET /api/connectors/azure/cost/daily

9. SHARED TYPES
   - shared/types/index.ts extended with:
     AWS types: AWSEC2Instance, AWSECSCluster, AWSECSService, AWSLambdaFunction,
               AWSCloudWatchDataPoint, AWSLogEvent, AWSCostItem, AWSCostSummary
     GCP types: GCPInstance, GKECluster, CloudRunService, GCPTimeSeries,
               GCPMetricPoint, GCPLogEntry
     Azure types: AzureVM, AzureAKSCluster, AzureMetricDataPoint, AzureMetricSeries,
                 AzureLogRow, AzureCostItem, AzureCostSummary
   - DataSource union type extended to include 'aws' | 'gcp' | 'azure'.

10. DASHBOARD CLOUD PAGES
    - dashboard/src/services/api.ts extended with awsApi, gcpApi, azureApi typed
      helper objects that call the backend routes.
    - New page: dashboard/src/pages/AWSPage.tsx
      * Tabs: EC2 Instances, ECS Clusters (lazy-loads services on expand), Lambda, Cost
      * Cost view: month-to-date total card + bar chart of top 15 services by spend
    - New page: dashboard/src/pages/GCPPage.tsx
      * Tabs: Compute Engine (status/zone/machine type chips), GKE Clusters,
              Cloud Run (clickable service URL links)
    - New page: dashboard/src/pages/AzurePage.tsx
      * Tabs: Virtual Machines (color-coded power state chip), AKS Clusters
              (node count summed from agentPoolProfiles), Cost
    - New page: dashboard/src/pages/CloudCostPage.tsx
      * Fetches AWS + Azure cost with Promise.allSettled (GCP placeholder)
      * Shows per-provider summary cards, horizontal comparison bar chart,
        top-8 service breakdown grids per provider
    - dashboard/src/App.tsx: Added routes /aws, /gcp, /azure, /cloud-cost
    - dashboard/src/components/Sidebar.tsx: Added "Cloud" section with four NavLinks

11. NL QUERY — CLOUD DATA INTEGRATION
    - backend/src/routes/query.ts extended with case 'aws', case 'gcp', case 'azure'
      in the context-gathering Promise.all switch.
      * AWS context: { instances, functions, cost } — running count + MTD cost summary
      * GCP context: { instances, clusters, runServices } — running instance count
      * Azure context: { vms, aksClusters, cost } — running VM count + MTD cost
    - backend/src/ai/agent.ts generateFollowUps() extended with cloud keyword buckets:
      aws, ec2, lambda, ecs, gcp, gke, cloudrun, azure, aks, cost
      Each bucket maps to 3 relevant follow-up question suggestions.

12. BROWSER EXTENSION — CLOUD UPDATES
    - extension/src/popup/App.tsx:
      * Added 4th tab "Cloud" (Tab type now includes 'cloud')
      * Fetches AWS + Azure MTD cost from backend on load
      * CloudPanel component shows cost per provider + cloud-sourced alerts
      * Tab bar font size reduced to 11px to accommodate 4 tabs
    - extension/src/popup/components/AlertPanel.tsx:
      * SOURCE_ICONS map extended with aws: '☁', gcp: '🌐', azure: '🔷'

13. TESTS — CLOUD CONNECTORS
    - backend/src/__tests__/connectors/aws.test.ts (NEW)
      * jest.mock() for all AWS SDK v3 clients
      * Tests: listInstances (mapping, no-Name-tag fallback), listClusters,
               listServices, listFunctions (pagination via NextMarker),
               listLogGroups (filters empty names), getLogEvents (message trim),
               getMonthlyCost (sorted byService, null on empty/error),
               getDailyCosts (one entry per day, error)
    - backend/src/__tests__/connectors/gcp.test.ts (NEW)
      * jest.mock() for googleapis module
      * Tests: listInstances, listClusters (nodePoolCount), listRunServices,
               listLogEntries
    - backend/src/__tests__/connectors/azure.test.ts (NEW)
      * jest.mock() for @azure/identity, arm-compute, arm-containerservice,
        monitor-query, arm-costmanagement
      * asyncGen<T>() helper simulates Azure SDK async iterables
      * Tests: listVMs (power state, no-power-state, error), listAKSClusters
               (nodeCount summed, error), getMonthlyCost (sorted byService,
               total calculation, error), getDailyCosts (date grouping, error),
               queryLogs (column-index matching, non-Success status, error)

14. CLOUD ALERT RULES
    - backend/src/storage/db.ts seedDefaultRules() now runs on every startup
      (safe because INSERT OR IGNORE is used), so new rules are added to
      existing installs automatically.
    - 8 new cloud alert rules seeded (r9–r16):
      r9:  EC2 Stopped Instances     — aws  / stoppedInstanceCount > 5     / medium
      r10: High Lambda Function Count — aws  / lambdaFunctionCount > 100    / info
      r11: AWS Monthly Cost Spike     — aws  / monthlyCostUSD > 1000        / high
      r12: GCP Terminated Instances   — gcp  / terminatedInstanceCount > 3  / medium
      r13: GKE Cluster Not Running    — gcp  / clusterNotRunningCount > 0   / high
      r14: Azure Deallocated VMs      — azure/ deallocatedVMCount > 5       / medium
      r15: Azure AKS Not Succeeded    — azure/ aksNotSucceededCount > 0     / high
      r16: Azure Monthly Cost Spike   — azure/ monthlyCostUSD > 1000        / high
    - backend/src/alerts/monitor.ts extended with safeGetCloudMetrics():
      * Instantiates AWS/GCP/Azure connectors on-demand (guarded by env vars)
      * Returns flat Array<{ source, metric, value }> evaluated directly in poll()
        (bypasses AnomalyDetector which only handles portainer/jenkins/kibana data)
      * AWS: stoppedInstanceCount, lambdaFunctionCount, monthlyCostUSD
      * GCP: terminatedInstanceCount, clusterNotRunningCount
      * Azure: deallocatedVMCount, aksNotSucceededCount, monthlyCostUSD

─────────────────────────────────────────────────
KEY DESIGN DECISIONS
─────────────────────────────────────────────────

- ALL connector singletons are created at module level in connectors.ts with a
  configuration flag (e.g. const awsConfigured = !!(AWS_ACCESS_KEY_ID && AWS_SECRET)).
  Every route handler starts with: if (!awsConfigured) return notConfigured(res, 'AWS');
  This returns HTTP 503 and the frontend handles it gracefully without crashing.

- Cloud alert rule evaluation bypasses the AnomalyDetector. The AnomalyDetector
  uses historical data from portainer/jenkins/kibana. Cloud metrics are evaluated
  as simple threshold comparisons in safeGetCloudMetrics() → poll().

- seedDefaultRules() always runs at startup using INSERT OR IGNORE, making it safe
  to add new rules to existing installs without overwriting custom user rules.

- node-exporter runs with pid: host and requires Linux for full functionality.
  On macOS/Windows Docker Desktop, host metrics reflect the Linux VM, not the real host.

- AWS Cost Explorer API is always in us-east-1 regardless of AWS_REGION.

- GCP supports EITHER individual env vars (GCP_CLIENT_EMAIL + GCP_PRIVATE_KEY) OR
  GOOGLE_APPLICATION_CREDENTIALS pointing to a mounted key file.

- Azure uses ClientSecretCredential (service principal / app registration).
  Log Analytics queries additionally require AZURE_LOG_ANALYTICS_WORKSPACE_ID.

- The backend's prom-client registry exposes metrics at GET /metrics (not /api/metrics).
  Prometheus scrapes this endpoint directly.

- Azure SDK list methods return async iterables (for await...of). Tests use a custom
  async generator helper: async function* asyncGen<T>(items: T[]) { for (const item
  of items) yield item; }

─────────────────────────────────────────────────
CURRENT STATE
─────────────────────────────────────────────────

The codebase is fully implemented across all planned features:
- Backend connectors for Jenkins, Kibana, Portainer, GitHub, Prometheus, Grafana,
  AWS (EC2/ECS/Lambda/Cost), GCP (Compute/GKE/Run), Azure (VMs/AKS/Cost)
- Dashboard pages for all connectors including AWS, GCP, Azure, and Cloud Cost
- Browser extension updated with Cloud tab and cloud alert source icons
- AI NL query route extended to include cloud resources in context
- 16 built-in alert rules covering portainer, jenkins, kibana, github, aws, gcp, azure
- Unit tests for all three cloud connectors (aws.test.ts, gcp.test.ts, azure.test.ts)
- README.md and CONTINUATION_PROMPT.md are up to date

─────────────────────────────────────────────────
POSSIBLE NEXT STEPS
─────────────────────────────────────────────────

1. GCP Cost API
   - GCP does not have a direct billing API as simple as AWS Cost Explorer or Azure
     Cost Management. Options: export billing to BigQuery and query it, or use the
     Cloud Billing API (v1beta). Currently CloudCostPage shows a placeholder for GCP.

2. Grafana connector — query execution
   - GrafanaConnector has getDashboard() and listDashboards() but no method to
     actually execute a Prometheus/Loki query via the Grafana data proxy API.
     This would enable the NL query route to pull live metric values from Grafana.

3. Incident auto-creation from alerts
   - When an alert fires, the system could automatically create an incident record
     (backend/src/storage/db.ts incidents table) with the alert as seed data,
     then trigger the AI agent to write an initial summary.

4. Extension — settings page
   - The extension popup hardcodes the backend URL as http://localhost:4000.
     A settings panel would let users configure this and persist it to chrome.storage.

5. End-to-end / integration tests
   - Current tests are unit tests with fully mocked dependencies.
     Integration tests that spin up a real SQLite DB and run against it
     (using a test.env with all services disabled) would increase confidence.

─────────────────────────────────────────────────
HOW TO SET UP ON A NEW MACHINE
─────────────────────────────────────────────────

Prerequisites: Docker Desktop (or Docker + Compose), Node.js 20+, npm.

git clone <your-repo-url> && cd nexus-ops
cp backend/.env.example backend/.env
# Edit backend/.env — add ANTHROPIC_API_KEY at minimum
docker compose up -d --build

Services will be available at:
  http://localhost:4000   — backend API
  http://localhost:3000   — React dashboard
  http://localhost:3001   — Grafana (admin / GRAFANA_PASSWORD)
  http://localhost:9090   — Prometheus

For local development without Docker:
  cd backend && npm install && npm run dev     # backend on :4000
  cd dashboard && npm install && npm run dev   # dashboard on :5173

The project does NOT use a git repo yet (as of the last session).
You will need to initialise one or set up your own remote.
```

---

## File inventory (files that were created or meaningfully changed)

| File | Status | Notes |
|------|--------|-------|
| `shared/types/index.ts` | Modified | Added AWS, GCP, Azure types; extended DataSource union |
| `backend/package.json` | Modified | Added AWS SDK v3, googleapis, Azure SDK packages |
| `backend/.env.example` | Modified | Added AWS, GCP, Azure sections; changed PORTAINER_ENDPOINT default to 0 |
| `backend/src/storage/db.ts` | Modified | Module-level export; always seeds rules (INSERT OR IGNORE); r9–r16 cloud rules |
| `backend/src/metrics/registry.ts` | Refactored | Removed dead metrics |
| `backend/src/alerts/monitor.ts` | Modified | safeGetContainers validates endpoint; safeGetCloudMetrics() added; cloud rule evaluation in poll() |
| `backend/src/routes/connectors.ts` | Extended | Configuration guards, AWS/GCP/Azure routes added |
| `backend/src/routes/query.ts` | Extended | aws/gcp/azure cases in context-gathering switch |
| `backend/src/connectors/aws.ts` | New | AWSConnector: EC2, ECS, Lambda, CloudWatch, Cost Explorer |
| `backend/src/connectors/gcp.ts` | New | GCPConnector: Compute, GKE, Cloud Run, Monitoring, Logging |
| `backend/src/connectors/azure.ts` | New | AzureConnector: VMs, AKS, Monitor metrics/logs, Cost Management |
| `backend/src/ai/agent.ts` | Modified | generateFollowUps() extended with aws/ec2/lambda/ecs/gcp/gke/azure/aks/cost buckets |
| `backend/src/__tests__/connectors/aws.test.ts` | New | Unit tests for AWSConnector (jest.mock for AWS SDK v3) |
| `backend/src/__tests__/connectors/gcp.test.ts` | New | Unit tests for GCPConnector (jest.mock for googleapis) |
| `backend/src/__tests__/connectors/azure.test.ts` | New | Unit tests for AzureConnector (jest.mock for Azure SDKs; asyncGen helper) |
| `dashboard/src/services/api.ts` | Extended | awsApi, gcpApi, azureApi typed helper objects |
| `dashboard/src/pages/AWSPage.tsx` | New | EC2 / ECS / Lambda / Cost tabbed page |
| `dashboard/src/pages/GCPPage.tsx` | New | Compute / GKE / Cloud Run tabbed page |
| `dashboard/src/pages/AzurePage.tsx` | New | VMs / AKS / Cost tabbed page |
| `dashboard/src/pages/CloudCostPage.tsx` | New | Cross-provider cost comparison page |
| `dashboard/src/App.tsx` | Modified | Routes for /aws, /gcp, /azure, /cloud-cost; AlertsProvider wrap |
| `dashboard/src/components/Sidebar.tsx` | Modified | Cloud nav section; AlertsContext usage |
| `dashboard/src/components/NavBar.tsx` | Modified | AlertsContext instead of direct useAlerts() |
| `dashboard/src/pages/Dashboard.tsx` | Modified | AlertsContext instead of direct useAlerts() |
| `dashboard/src/context/AlertsContext.tsx` | New | Single shared alert state (deduplicates fetches + WS connections) |
| `extension/src/popup/App.tsx` | Modified | Cloud tab added; CloudPanel component; cost fetch on load |
| `extension/src/popup/components/AlertPanel.tsx` | Modified | SOURCE_ICONS extended with aws/gcp/azure |
| `docker-compose.yml` | Extended | node-exporter, Prometheus, Grafana, AWS/GCP/Azure env vars |
| `prometheus/prometheus.yml` | Extended | node-exporter scrape job |
| `grafana/provisioning/dashboards/copilot-overview.json` | Extended | 10 host metrics panels (node_exporter) |
| `src/README.md` | Rewritten | Comprehensive docs: all pages, 16-rule table, API reference, connector guide |
| `src/CONTINUATION_PROMPT.md` | Rewritten | This file — reflects all 14 completed work items |
