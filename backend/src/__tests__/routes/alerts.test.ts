import express from 'express';
import request from 'supertest';

// ── mock the DB before any module-level code runs ──────────────────────────
const mockPrepare = jest.fn();
jest.mock('../../storage/db', () => ({
  db: { prepare: mockPrepare },
}));

// Import the router after mocks are in place
import alertsRouter from '../../routes/alerts';

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

// Default stub for prepare().all() / .run() / .get()
function mockStmt(opts: { all?: unknown[]; run?: unknown; get?: unknown } = {}) {
  return {
    all: jest.fn(() => opts.all ?? []),
    run: jest.fn(() => opts.run ?? undefined),
    get: jest.fn(() => opts.get ?? undefined),
  };
}

describe('Alerts routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/alerts ──────────────────────────────────────────────────────

  describe('GET /api/alerts', () => {
    const alertRow = {
      id: 'alert-1',
      rule_id: 'rule-1',
      rule_name: 'High Memory',
      severity: 'critical',
      source: 'portainer',
      message: 'Memory > 90%',
      value: 92,
      threshold: 90,
      triggered_at: '2024-01-01T00:00:00Z',
      resolved_at: null,
      acknowledged: 0,
      incident_id: null,
    };

    it('returns active (unresolved) alerts by default', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [alertRow] }));

      const res = await request(app).get('/api/alerts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('alert-1');
      expect(res.body.data[0].acknowledged).toBe(false);
    });

    it('includes WHERE resolved_at IS NULL in default query', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [] }));

      await request(app).get('/api/alerts');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).toContain('resolved_at IS NULL');
    });

    it('includes all alerts when ?resolved=true', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [] }));

      await request(app).get('/api/alerts?resolved=true');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).not.toContain('WHERE');
    });

    it('maps acknowledged=1 to true', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [{ ...alertRow, acknowledged: 1 }] }));

      const res = await request(app).get('/api/alerts');

      expect(res.body.data[0].acknowledged).toBe(true);
    });
  });

  // ─── PATCH /api/alerts/:id/acknowledge ───────────────────────────────────

  describe('PATCH /api/alerts/:id/acknowledge', () => {
    it('returns acknowledged: true', async () => {
      mockPrepare.mockReturnValue(mockStmt());

      const res = await request(app).patch('/api/alerts/alert-1/acknowledge');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.acknowledged).toBe(true);
      expect(res.body.data.id).toBe('alert-1');
    });

    it('calls UPDATE with acknowledged=1', async () => {
      const stmt = mockStmt();
      mockPrepare.mockReturnValue(stmt);

      await request(app).patch('/api/alerts/alert-1/acknowledge');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).toMatch(/UPDATE alerts SET acknowledged = 1/);
    });
  });

  // ─── PATCH /api/alerts/:id/resolve ───────────────────────────────────────

  describe('PATCH /api/alerts/:id/resolve', () => {
    it('returns resolvedAt timestamp', async () => {
      mockPrepare.mockReturnValue(mockStmt());

      const res = await request(app).patch('/api/alerts/alert-1/resolve');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('alert-1');
      expect(res.body.data.resolvedAt).toBeDefined();
    });

    it('calls UPDATE with resolved_at', async () => {
      mockPrepare.mockReturnValue(mockStmt());

      await request(app).patch('/api/alerts/alert-2/resolve');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).toContain('resolved_at');
    });
  });

  // ─── GET /api/alerts/rules ────────────────────────────────────────────────

  describe('GET /api/alerts/rules', () => {
    const ruleRow = {
      id: 'rule-1',
      name: 'High Memory',
      source: 'portainer',
      metric: 'memoryPercent',
      condition: 'gt',
      threshold: 90,
      severity: 'critical',
      message: 'Memory over limit',
      enabled: 1,
    };

    it('returns all alert rules', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [ruleRow] }));

      const res = await request(app).get('/api/alerts/rules');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('High Memory');
      expect(res.body.data[0].enabled).toBe(true);
    });

    it('maps enabled=0 to false', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [{ ...ruleRow, enabled: 0 }] }));

      const res = await request(app).get('/api/alerts/rules');

      expect(res.body.data[0].enabled).toBe(false);
    });
  });

  // ─── PATCH /api/alerts/rules/:id ─────────────────────────────────────────

  describe('PATCH /api/alerts/rules/:id', () => {
    it('updates enabled and returns updated rule', async () => {
      const updatedRule = {
        id: 'rule-1', name: 'High Memory', source: 'portainer',
        metric: 'memoryPercent', condition: 'gt', threshold: 90,
        severity: 'critical', message: 'Memory over limit', enabled: 0,
      };
      mockPrepare.mockReturnValue(mockStmt({ get: updatedRule }));

      const res = await request(app)
        .patch('/api/alerts/rules/rule-1')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(false);
    });

    it('returns 404 if rule not found', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: undefined }));

      const res = await request(app)
        .patch('/api/alerts/rules/nonexistent')
        .send({ enabled: true });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
