import { Router, Request, Response } from 'express';
import { db } from '../storage/db';
import { Alert, AlertRule } from '../../../shared/types';

const router = Router();

// GET /api/alerts — list active alerts
router.get('/', (req: Request, res: Response) => {
  const { resolved = 'false', limit = '50' } = req.query;
  const sql = resolved === 'true'
    ? 'SELECT * FROM alerts ORDER BY triggered_at DESC LIMIT ?'
    : 'SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY triggered_at DESC LIMIT ?';
  const rows = db.prepare(sql).all(parseInt(limit as string, 10)) as Record<string, unknown>[];
  res.json({ success: true, data: rows.map(rowToAlert), timestamp: new Date().toISOString() });
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', (req: Request, res: Response) => {
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, data: { id: req.params.id, acknowledged: true }, timestamp: new Date().toISOString() });
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', (req: Request, res: Response) => {
  db.prepare('UPDATE alerts SET resolved_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ success: true, data: { id: req.params.id, resolvedAt: new Date().toISOString() }, timestamp: new Date().toISOString() });
});

// GET /api/alerts/rules
router.get('/rules', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM alert_rules').all() as Record<string, unknown>[];
  res.json({ success: true, data: rows.map(rowToRule), timestamp: new Date().toISOString() });
});

// PATCH /api/alerts/rules/:id — toggle rule or update threshold
router.patch('/rules/:id', (req: Request, res: Response) => {
  const { enabled, threshold } = req.body;
  if (enabled !== undefined) db.prepare('UPDATE alert_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, req.params.id);
  if (threshold !== undefined) db.prepare('UPDATE alert_rules SET threshold = ? WHERE id = ?').run(threshold, req.params.id);
  const row = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ success: false, error: 'Rule not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: rowToRule(row), timestamp: new Date().toISOString() });
});

function rowToAlert(r: Record<string, unknown>): Alert {
  return {
    id: r.id as string, ruleId: r.rule_id as string, ruleName: r.rule_name as string,
    severity: r.severity as Alert['severity'], source: r.source as Alert['source'],
    message: r.message as string, value: r.value as number, threshold: r.threshold as number,
    triggeredAt: r.triggered_at as string, resolvedAt: r.resolved_at as string | undefined,
    acknowledged: r.acknowledged === 1, incidentId: r.incident_id as string | undefined,
  };
}

function rowToRule(r: Record<string, unknown>): AlertRule {
  return {
    id: r.id as string, name: r.name as string, source: r.source as AlertRule['source'],
    metric: r.metric as string, condition: r.condition as AlertRule['condition'],
    threshold: r.threshold as number, severity: r.severity as AlertRule['severity'],
    message: r.message as string, enabled: r.enabled === 1,
  };
}

export default router;
