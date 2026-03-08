import { Router, Request, Response } from 'express';
import { db } from '../storage/db';
import { incidents } from '../storage/schema';
import { AIAgent } from '../ai/agent';
import { RootCauseAnalyzer } from '../ai/rootCause';
import { ReportGenerator } from '../ai/reportGenerator';
import { GitHubConnector } from '../connectors/github';
import axios from 'axios';
import { IncidentCard, ApiResponse, SuggestedFix, IncidentCorrelation } from '../../../shared/types';
import { eq, and, desc, count } from 'drizzle-orm';

const router = Router();
const agent = new AIAgent();
const rca = new RootCauseAnalyzer(agent);
const reporter = new ReportGenerator(agent);

function rowToIncident(r: typeof incidents.$inferSelect): IncidentCard {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    severity: r.severity,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    rootCause: r.rootCause,
    suggestedFixes: (r.fixes as unknown as SuggestedFix[]) ?? [],
    correlations: (r.correlations as unknown as IncidentCorrelation[]) ?? [],
    affectedServices: (r.affectedServices as unknown as string[]) ?? [],
    tags: (r.tags as unknown as string[]) ?? [],
    rawData: r.rawData as Record<string, unknown> | undefined,
    githubIssueUrl: r.githubIssueUrl ?? undefined,
    slackThreadUrl: r.slackThreadUrl ?? undefined,
  };
}

// GET /api/incidents — list with optional filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, severity, limit = '20', page = '0' } = req.query;
    const pageSize = parseInt(limit as string, 10);
    const offset   = parseInt(page as string, 10) * pageSize;

    const conditions = [];
    if (status)   conditions.push(eq(incidents.status,   status as typeof incidents.$inferSelect['status']));
    if (severity) conditions.push(eq(incidents.severity, severity as typeof incidents.$inferSelect['severity']));

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(incidents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(incidents.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(incidents),
    ]);

    res.json({
      success: true,
      data: { items: rows.map(rowToIncident), total, page: parseInt(page as string, 10), pageSize },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// GET /api/incidents/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(incidents).where(eq(incidents.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    res.json({ success: true, data: rowToIncident(row), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// POST /api/incidents — manually create from raw context
router.post('/', async (req: Request, res: Response) => {
  try {
    const { build, logs, workflowRun, containers, prNumber } = req.body;
    const incident = await rca.analyze({ build, logs, workflowRun, containers, prNumber });

    await db.insert(incidents).values({
      id:              incident.id,
      title:           incident.title,
      summary:         incident.summary,
      severity:        incident.severity,
      status:          incident.status,
      rootCause:       incident.rootCause,
      fixes:           incident.suggestedFixes,
      correlations:    incident.correlations,
      affectedServices:incident.affectedServices,
      tags:            incident.tags,
      rawData:         incident.rawData ?? null,
      githubIssueUrl:  null,
      slackThreadUrl:  null,
      createdAt:       new Date(incident.createdAt),
      updatedAt:       new Date(incident.updatedAt),
    });

    const resp: ApiResponse<IncidentCard> = { success: true, data: incident, timestamp: new Date().toISOString() };
    res.status(201).json(resp);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// PATCH /api/incidents/:id/status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const allowed = ['open', 'investigating', 'resolved', 'suppressed'] as const;
    if (!allowed.includes(status)) return res.status(400).json({ success: false, error: 'Invalid status', timestamp: new Date().toISOString() });

    await db.update(incidents)
      .set({ status, updatedAt: new Date() })
      .where(eq(incidents.id, req.params.id));

    res.json({ success: true, data: { id: req.params.id, status }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// POST /api/incidents/:id/report — generate full incident report
router.post('/:id/report', async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(incidents).where(eq(incidents.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const report = await reporter.generate(rowToIncident(row));
    res.json({ success: true, data: report, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// POST /api/incidents/:id/github-issue — auto-create GitHub issue
router.post('/:id/github-issue', async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(incidents).where(eq(incidents.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const incident = rowToIncident(row);
    const report = await reporter.generate(incident);

    const gh = new GitHubConnector(
      process.env.GITHUB_TOKEN ?? '',
      process.env.GITHUB_OWNER ?? '',
      process.env.GITHUB_REPO ?? '',
    );
    const issue = await gh.createIssue(incident.title, report.githubIssueBody, report.githubIssueLabels);
    if (!issue) return res.status(502).json({ success: false, error: 'Failed to create GitHub issue', timestamp: new Date().toISOString() });

    await db.update(incidents)
      .set({ githubIssueUrl: issue.url, updatedAt: new Date() })
      .where(eq(incidents.id, incident.id));

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

    const [row] = await db.select().from(incidents).where(eq(incidents.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: 'Incident not found', timestamp: new Date().toISOString() });
    const report = await reporter.generate(rowToIncident(row));

    await axios.post(webhookUrl, { blocks: report.slackBlocks });
    res.json({ success: true, data: { slackWebhookPosted: true }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

export default router;
