import express from 'express';
import request from 'supertest';

// ── mock the DB ─────────────────────────────────────────────────────────────
const mockPrepare = jest.fn();
jest.mock('../../storage/db', () => ({
  db: { prepare: mockPrepare },
}));

// ── mock AI / analysis services ─────────────────────────────────────────────
const mockAnalyze = jest.fn();
jest.mock('../../ai/rootCause', () => ({
  RootCauseAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
  })),
}));

const mockGenerate = jest.fn();
jest.mock('../../ai/reportGenerator', () => ({
  ReportGenerator: jest.fn().mockImplementation(() => ({
    generate: mockGenerate,
  })),
}));

jest.mock('../../ai/agent', () => ({
  AIAgent: jest.fn().mockImplementation(() => ({})),
}));

// ── mock GitHub connector ────────────────────────────────────────────────────
const mockCreateIssue = jest.fn();
jest.mock('../../connectors/github', () => ({
  GitHubConnector: jest.fn().mockImplementation(() => ({
    createIssue: mockCreateIssue,
  })),
}));

// ── mock uuid ────────────────────────────────────────────────────────────────
jest.mock('uuid', () => ({ v4: () => 'inc-test-uuid' }));

import incidentsRouter from '../../routes/incidents';

const app = express();
app.use(express.json());
app.use('/api/incidents', incidentsRouter);

function mockStmt(opts: { all?: unknown[]; run?: unknown; get?: unknown } = {}) {
  return {
    all: jest.fn(() => opts.all ?? []),
    run: jest.fn(() => opts.run ?? undefined),
    get: jest.fn(() => opts.get ?? undefined),
  };
}

// A representative incident row as stored in SQLite
const incidentRow = {
  id: 'inc-test-uuid',
  title: 'Build failure in payments-service-ci',
  summary: 'Memory OOM caused build failure',
  severity: 'high',
  status: 'open',
  root_cause: 'Memory limit exceeded',
  fixes_json: '["Increase memory limit","Add heap profiling"]',
  correlations_json: '[]',
  affected_services_json: '["payments-api"]',
  tags_json: '["ci","memory"]',
  raw_data_json: null,
  github_issue_url: null,
  slack_thread_url: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('Incidents routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/incidents ────────────────────────────────────────────────────

  describe('GET /api/incidents', () => {
    it('returns paginated incident list', async () => {
      const stmt = mockStmt({ all: [incidentRow] });
      const countStmt = mockStmt({ get: { c: 1 } });
      mockPrepare
        .mockReturnValueOnce(stmt)    // main SELECT
        .mockReturnValueOnce(countStmt); // COUNT(*)

      const res = await request(app).get('/api/incidents');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].id).toBe('inc-test-uuid');
      expect(res.body.data.items[0].suggestedFixes).toEqual(['Increase memory limit', 'Add heap profiling']);
      expect(res.body.data.total).toBe(1);
    });

    it('applies status filter when provided', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [], get: { c: 0 } }));

      await request(app).get('/api/incidents?status=open');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).toContain('status = ?');
    });

    it('applies severity filter when provided', async () => {
      mockPrepare.mockReturnValue(mockStmt({ all: [], get: { c: 0 } }));

      await request(app).get('/api/incidents?severity=critical');

      const sql: string = mockPrepare.mock.calls[0][0];
      expect(sql).toContain('severity = ?');
    });
  });

  // ─── GET /api/incidents/:id ────────────────────────────────────────────────

  describe('GET /api/incidents/:id', () => {
    it('returns the incident by ID', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: incidentRow }));

      const res = await request(app).get('/api/incidents/inc-test-uuid');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('inc-test-uuid');
      expect(res.body.data.affectedServices).toEqual(['payments-api']);
    });

    it('returns 404 when incident not found', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: undefined }));

      const res = await request(app).get('/api/incidents/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });

  // ─── POST /api/incidents ───────────────────────────────────────────────────

  describe('POST /api/incidents', () => {
    const newIncident = {
      id: 'inc-test-uuid',
      title: 'New incident',
      summary: 'Something broke',
      severity: 'medium' as const,
      status: 'open' as const,
      rootCause: 'Unknown',
      suggestedFixes: ['Fix 1'],
      correlations: [],
      affectedServices: ['api'],
      tags: ['prod'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('creates an incident and returns 201', async () => {
      mockAnalyze.mockResolvedValue(newIncident);
      mockPrepare.mockReturnValue(mockStmt());

      const res = await request(app).post('/api/incidents').send({
        build: { id: 'build-1', jobName: 'ci', status: 'FAILURE' },
        logs: [],
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('inc-test-uuid');
    });

    it('returns 500 if analysis throws', async () => {
      mockAnalyze.mockRejectedValue(new Error('AI service down'));

      const res = await request(app).post('/api/incidents').send({ build: {} });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('AI service down');
    });
  });

  // ─── PATCH /api/incidents/:id/status ──────────────────────────────────────

  describe('PATCH /api/incidents/:id/status', () => {
    it('updates status to a valid value', async () => {
      mockPrepare.mockReturnValue(mockStmt());

      const res = await request(app)
        .patch('/api/incidents/inc-test-uuid/status')
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('resolved');
    });

    it('rejects invalid status values', async () => {
      const res = await request(app)
        .patch('/api/incidents/inc-test-uuid/status')
        .send({ status: 'invalid-status' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('accepts all valid statuses', async () => {
      const validStatuses = ['open', 'investigating', 'resolved', 'suppressed'];
      for (const status of validStatuses) {
        mockPrepare.mockReturnValue(mockStmt());
        const res = await request(app)
          .patch('/api/incidents/inc-test-uuid/status')
          .send({ status });
        expect(res.status).toBe(200);
      }
    });
  });

  // ─── POST /api/incidents/:id/report ───────────────────────────────────────

  describe('POST /api/incidents/:id/report', () => {
    it('returns generated report for existing incident', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: incidentRow }));
      mockGenerate.mockResolvedValue({
        markdown: '# Incident Report',
        slackBlocks: [],
        githubIssueBody: '...',
        githubIssueLabels: ['incident'],
        teamsCard: {},
      });

      const res = await request(app).post('/api/incidents/inc-test-uuid/report');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.markdown).toBe('# Incident Report');
    });

    it('returns 404 for missing incident', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: undefined }));

      const res = await request(app).post('/api/incidents/missing/report');

      expect(res.status).toBe(404);
    });

    it('returns 500 if report generation fails', async () => {
      mockPrepare.mockReturnValue(mockStmt({ get: incidentRow }));
      mockGenerate.mockRejectedValue(new Error('Report generation failed'));

      const res = await request(app).post('/api/incidents/inc-test-uuid/report');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Report generation failed');
    });
  });

  // ─── POST /api/incidents/:id/slack ────────────────────────────────────────

  describe('POST /api/incidents/:id/slack', () => {
    it('returns 400 when SLACK_WEBHOOK_URL is not set', async () => {
      delete process.env.SLACK_WEBHOOK_URL;

      const res = await request(app).post('/api/incidents/inc-test-uuid/slack');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('SLACK_WEBHOOK_URL');
    });
  });
});
