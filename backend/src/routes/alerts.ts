/**
 * @module routes/alerts
 * @description REST API routes for alert instances and alert rules.
 *
 * Alert instance endpoints:
 *   GET   /api/alerts                    – Active (unresolved) alerts; ?resolved=true for all.
 *   PATCH /api/alerts/:id/acknowledge    – Mark alert as acknowledged.
 *   PATCH /api/alerts/:id/resolve        – Set resolvedAt; removes from active list.
 *
 * Alert rule endpoints:
 *   GET   /api/alerts/rules              – All configured alert rules.
 *   PATCH /api/alerts/rules/:id          – Toggle enabled state or update threshold.
 *
 * The frontend AlertsContext fetches active alerts (resolvedAt IS NULL) to
 * drive the notification bell badge.
 */
import { Router, Request, Response } from 'express';
import { db } from '../storage/db';
import { alerts, alertRules } from '../storage/schema';
import { Alert, AlertRule } from '../../../shared/types';
import { eq, isNull, desc } from 'drizzle-orm';

const router = Router();

// GET /api/alerts — list active alerts
router.get('/', async (req: Request, res: Response) => {
  try {
    const { resolved = 'false', limit = '50' } = req.query;
    const pageSize = parseInt(limit as string, 10);

    const rows = resolved === 'true'
      ? await db.select().from(alerts).orderBy(desc(alerts.triggeredAt)).limit(pageSize)
      : await db.select().from(alerts).where(isNull(alerts.resolvedAt)).orderBy(desc(alerts.triggeredAt)).limit(pageSize);

    res.json({ success: true, data: rows.map(rowToAlert), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    await db.update(alerts).set({ acknowledged: true }).where(eq(alerts.id, req.params.id));
    res.json({ success: true, data: { id: req.params.id, acknowledged: true }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    await db.update(alerts).set({ resolvedAt: now }).where(eq(alerts.id, req.params.id));
    res.json({ success: true, data: { id: req.params.id, resolvedAt: now.toISOString() }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// GET /api/alerts/rules
router.get('/rules', async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(alertRules);
    res.json({ success: true, data: rows.map(rowToRule), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

// PATCH /api/alerts/rules/:id — toggle rule or update threshold
router.patch('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { enabled, threshold } = req.body;
    const updates: Partial<typeof alertRules.$inferInsert> = {};
    if (enabled   !== undefined) updates.enabled   = Boolean(enabled);
    if (threshold !== undefined) updates.threshold = Number(threshold);

    if (Object.keys(updates).length) {
      await db.update(alertRules).set(updates).where(eq(alertRules.id, req.params.id));
    }

    const [row] = await db.select().from(alertRules).where(eq(alertRules.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ success: false, error: 'Rule not found', timestamp: new Date().toISOString() });
    res.json({ success: true, data: rowToRule(row), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message, timestamp: new Date().toISOString() });
  }
});

function rowToAlert(r: typeof alerts.$inferSelect): Alert {
  return {
    id:           r.id,
    ruleId:       r.ruleId,
    ruleName:     r.ruleName,
    severity:     r.severity,
    source:       r.source,
    message:      r.message,
    value:        r.value,
    threshold:    r.threshold,
    triggeredAt:  r.triggeredAt.toISOString(),
    resolvedAt:   r.resolvedAt?.toISOString(),
    acknowledged: r.acknowledged,
    incidentId:   r.incidentId ?? undefined,
  };
}

function rowToRule(r: typeof alertRules.$inferSelect): AlertRule {
  return {
    id:        r.id,
    name:      r.name,
    source:    r.source,
    metric:    r.metric,
    condition: r.condition,
    threshold: r.threshold,
    severity:  r.severity,
    message:   r.message,
    enabled:   r.enabled,
  };
}

export default router;
