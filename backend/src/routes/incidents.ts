import { Router, Request, Response } from 'express';
import { db } from '../storage/db';
import { AIAgent } from '../ai/agent';
import { RootCauseAnalyzer } from '../ai/rootCause';
import { ReportGenerator } from '../ai/reportGenerator';
import { GitHubConnector } from '../connectors/github';
import axios from 'axios';
import { IncidentCard, ApiResponse } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const agent = new AIAgent();
const rca = new RootCauseAnalyzer(agent);
const reporter = new ReportGenerator(agent);

function row2incident(r: Record<string, unknown>): IncidentCard {
  return {
    id: r.id as string,
    title: r.title as string,
    summary: r.summary as string,
    severity: r.severity as IncidentCard['severity'],
    status: r.status as IncidentCard['status'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    rootCause: r.root_cause as string,
    suggestedFixes: JSON.parse(r.fixes_json as string ?? '[]'),
    correlations: JSON.parse(r.correlations_json as string ?? '[]'),
    affectedServices: JSON.parse(r.affected_services_json as string ?? '[]'),
    tags: JSON.parse(r.tags_json as string ?? '[]'),
    rawData: r.raw_data_json ? JSON.parse(r.raw_data_json as string) : undefined,
    githubIssueUrl: r.github_issue_url as string | undefined,
    slackThreadUrl: r.slack_thread_url as string | undefined,
  };
}

// GET /api/incidents — list with optional filters
router.get('/', (req: Request, res: Response) => {
  const { status, severity, limit = '20', page = '0' } = req.query;
  let sql = 'SELECT * FROM incidents WHERE 1=1';
  const params: unknown[] = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (severity) { sql += ' AND severity = ?'; params.push(severity); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit as string, 10), parseInt(page as string, 10) * parseInt(limit as string, 10));

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const total = (db.prepare('SELECT COUNT(*) as c FROM incidents').get() as { c: number }).c;
  res.json({ success: true, data: { items: rows.map(row2incident), total, page: parseInt(page as string, 10), pageSize: parseInt(limit as string, 10) }, timestamp: new Date().toISOString() });
});

// GET /api/incidents/:id
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: row2incident(row), timestamp: new Date().toISOString() });
});

// POST /api/incidents — manually create from raw context
router.post('/', async (req: Request, res: Response) => {
  try {
    const { build, logs, workflowRun, containers, prNumber } = req.body;
    const incident = await rca.analyze({ build, logs, workflowRun, containers, prNumber });
    db.prepare(`INSERT INTO incidents (id,title,summary,severity,status,root_cause,fixes_json,correlations_json,affected_services_json,tags_json,raw_data_json,github_issue_url,slack_thread_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(incident.id, incident.title, incident.summary, incident.severity, incident.status, incident.rootCause, JSON.stringify(incident.suggestedFixes), JSON.stringify(incident.correlations), JSON.stringify(incident.affectedServices), JSON.stringify(incident.tags), incident.rawData ? JSON.stringify(incident.rawData) : null, null, null, incident.createdAt, incident.updatedAt);
    const resp: ApiResponse<IncidentCard> = { success: true, data: incident, timestamp: new Date().toISOString() };
    res.status(201).json(resp);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// PATCH /api/incidents/:id/status
router.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const allowed = ['open', 'investigating', 'resolved', 'suppressed'];
  if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status', timestamp: new Date().toISOString() });
  db.prepare('UPDATE incidents SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, req.params.id);
  res.json({ success: true, data: { id: req.params.id, status }, timestamp: new Date().toISOString() });
});

// POST /api/incidents/:id/report — generate full incident report
router.post('/:id/report', async (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const incident = row2incident(row);
    const report = await reporter.generate(incident);
    res.json({ success: true, data: report, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// POST /api/incidents/:id/github-issue — auto-create GitHub issue
router.post('/:id/github-issue', async (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const incident = row2incident(row);
    const report = await reporter.generate(incident);

    const gh = new GitHubConnector(
      process.env.GITHUB_TOKEN ?? '',
      process.env.GITHUB_OWNER ?? '',
      process.env.GITHUB_REPO ?? '',
    );
    const issue = await gh.createIssue(incident.title, report.githubIssueBody, report.githubIssueLabels);
    if (!issue) return res.status(502).json({ success: false, error: 'Failed to create GitHub issue', timestamp: new Date().toISOString() });

    db.prepare('UPDATE incidents SET github_issue_url = ?, updated_at = datetime(\'now\') WHERE id = ?').run(issue.url, incident.id);
    res.json({ success: true, data: issue, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// POST /api/incidents/:id/slack — post to Slack
router.post('/:id/slack', async (req: Request, res: Response) => {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return res.status(400).json({ success: false, error: 'SLACK_WEBHOOK_URL not configured', timestamp: new Date().toISOString() });

    const row = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const incident = row2incident(row);
    const report = await reporter.generate(incident);

    await axios.post(webhookUrl, { blocks: report.slackBlocks });
    res.json({ success: true, data: { slackWebhookPosted: true }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

export default router;
