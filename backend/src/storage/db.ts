import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { logger } from '../utils/logger';

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '../../data/nexus.db');

function createDb() {
  const instance = new BetterSqlite3(DB_PATH);
  instance.pragma('journal_mode = WAL');
  migrate(instance);
  logger.info(`SQLite database initialized at ${DB_PATH}`);
  return instance;
}

export const db = createDb();

function migrate(instance: InstanceType<typeof BetterSqlite3>): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      summary     TEXT NOT NULL,
      severity    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      root_cause  TEXT NOT NULL,
      fixes_json  TEXT NOT NULL DEFAULT '[]',
      correlations_json TEXT NOT NULL DEFAULT '[]',
      affected_services_json TEXT NOT NULL DEFAULT '[]',
      tags_json   TEXT NOT NULL DEFAULT '[]',
      raw_data_json TEXT,
      github_issue_url TEXT,
      slack_thread_url TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id           TEXT PRIMARY KEY,
      rule_id      TEXT NOT NULL,
      rule_name    TEXT NOT NULL,
      severity     TEXT NOT NULL,
      source       TEXT NOT NULL,
      message      TEXT NOT NULL,
      value        REAL NOT NULL,
      threshold    REAL NOT NULL,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at  TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      incident_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      source    TEXT NOT NULL,
      metric    TEXT NOT NULL,
      condition TEXT NOT NULL,
      threshold REAL NOT NULL,
      severity  TEXT NOT NULL,
      message   TEXT NOT NULL,
      enabled   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS build_history (
      id          TEXT PRIMARY KEY,
      job_name    TEXT NOT NULL,
      build_number INTEGER NOT NULL,
      status      TEXT NOT NULL,
      timestamp   TEXT NOT NULL,
      duration    INTEGER NOT NULL,
      url         TEXT NOT NULL,
      commit_sha  TEXT,
      branch      TEXT,
      triggered_by TEXT,
      raw_json    TEXT,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_trends (
      id          TEXT PRIMARY KEY,
      timestamp   TEXT NOT NULL,
      error_type  TEXT NOT NULL,
      count       INTEGER NOT NULL,
      service     TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'kibana'
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_status  ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_triggered  ON alerts(triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_builds_timestamp  ON build_history(timestamp DESC);
  `);

  // Seed default alert rules — uses INSERT OR IGNORE so new rules are added
  // without overwriting any custom rules on existing installs.
  seedDefaultRules(instance);
}

function seedDefaultRules(instance: InstanceType<typeof BetterSqlite3>): void {
  const rules = [
    { id: 'r1', name: 'High Memory Usage', source: 'portainer', metric: 'memoryPercent', condition: 'gt', threshold: 80, severity: 'high', message: 'Container memory usage exceeded 80%' },
    { id: 'r2', name: 'Critical Memory Usage', source: 'portainer', metric: 'memoryPercent', condition: 'gt', threshold: 95, severity: 'critical', message: 'Container memory usage exceeded 95% — OOM risk' },
    { id: 'r3', name: 'High CPU Usage', source: 'portainer', metric: 'cpuPercent', condition: 'gt', threshold: 90, severity: 'high', message: 'Container CPU usage exceeded 90%' },
    { id: 'r4', name: 'Container Restart Loop', source: 'portainer', metric: 'restartCount', condition: 'gt', threshold: 5, severity: 'critical', message: 'Container has restarted more than 5 times' },
    { id: 'r5', name: 'Slow Test Execution', source: 'jenkins', metric: 'testDurationMs', condition: 'gt', threshold: 300000, severity: 'medium', message: 'Test suite duration exceeded 5 minutes' },
    { id: 'r6', name: 'High Error Rate', source: 'kibana', metric: 'errorCount', condition: 'gt', threshold: 100, severity: 'high', message: 'Error count exceeded 100 in the last 5 minutes' },
    { id: 'r7', name: 'Pipeline Failure Rate', source: 'jenkins', metric: 'failureRate', condition: 'gt', threshold: 0.5, severity: 'high', message: 'Build failure rate exceeded 50%' },
    { id: 'r8', name: 'GitHub Workflow Failure', source: 'github', metric: 'failedWorkflows', condition: 'gt', threshold: 2, severity: 'medium', message: 'More than 2 GitHub Actions workflows failed in last hour' },
    // ─── AWS ──────────────────────────────────────────────────────────────────
    { id: 'r9',  name: 'EC2 Stopped Instances', source: 'aws', metric: 'stoppedInstanceCount', condition: 'gt', threshold: 5, severity: 'medium', message: 'More than 5 EC2 instances are stopped' },
    { id: 'r10', name: 'High Lambda Function Count', source: 'aws', metric: 'lambdaFunctionCount', condition: 'gt', threshold: 100, severity: 'info', message: 'Lambda function count exceeded 100' },
    { id: 'r11', name: 'AWS Monthly Cost Spike', source: 'aws', metric: 'monthlyCostUSD', condition: 'gt', threshold: 1000, severity: 'high', message: 'AWS month-to-date cost exceeded $1000' },
    // ─── GCP ──────────────────────────────────────────────────────────────────
    { id: 'r12', name: 'GCP Terminated Instances', source: 'gcp', metric: 'terminatedInstanceCount', condition: 'gt', threshold: 3, severity: 'medium', message: 'More than 3 GCP Compute instances are terminated' },
    { id: 'r13', name: 'GKE Cluster Not Running', source: 'gcp', metric: 'clusterNotRunningCount', condition: 'gt', threshold: 0, severity: 'high', message: 'One or more GKE clusters are not in RUNNING state' },
    // ─── Azure ────────────────────────────────────────────────────────────────
    { id: 'r14', name: 'Azure Deallocated VMs', source: 'azure', metric: 'deallocatedVMCount', condition: 'gt', threshold: 5, severity: 'medium', message: 'More than 5 Azure VMs are deallocated' },
    { id: 'r15', name: 'Azure AKS Cluster Not Succeeded', source: 'azure', metric: 'aksNotSucceededCount', condition: 'gt', threshold: 0, severity: 'high', message: 'One or more AKS clusters are not in Succeeded provisioning state' },
    { id: 'r16', name: 'Azure Monthly Cost Spike', source: 'azure', metric: 'monthlyCostUSD', condition: 'gt', threshold: 1000, severity: 'high', message: 'Azure month-to-date cost exceeded $1000' },
  ];

  const stmt = instance.prepare(
    `INSERT OR IGNORE INTO alert_rules (id, name, source, metric, condition, threshold, severity, message) VALUES (?,?,?,?,?,?,?,?)`
  );
  for (const r of rules) stmt.run(r.id, r.name, r.source, r.metric, r.condition, r.threshold, r.severity, r.message);
  logger.info('Seeded default alert rules');
}
