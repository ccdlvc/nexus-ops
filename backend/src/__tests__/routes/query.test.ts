import express from 'express';
import request from 'supertest';

// ── mock the AI agent ─────────────────────────────────────────────────────────
const mockAnswerQuery = jest.fn();
jest.mock('../../ai/agent', () => ({
  AIAgent: jest.fn().mockImplementation(() => ({
    answerQuery: mockAnswerQuery,
  })),
}));

// ── mock connectors ───────────────────────────────────────────────────────────
const mockListJobs = jest.fn();
const mockGetBuilds = jest.fn();
jest.mock('../../connectors/jenkins', () => ({
  JenkinsConnector: jest.fn().mockImplementation(() => ({
    listJobs: mockListJobs,
    getBuilds: mockGetBuilds,
  })),
}));

const mockGetRecentErrors = jest.fn();
jest.mock('../../connectors/kibana', () => ({
  KibanaConnector: jest.fn().mockImplementation(() => ({
    getRecentErrors: mockGetRecentErrors,
  })),
}));

const mockGetWorkflowRuns = jest.fn();
jest.mock('../../connectors/github', () => ({
  GitHubConnector: jest.fn().mockImplementation(() => ({
    getWorkflowRuns: mockGetWorkflowRuns,
  })),
}));

const mockGetContainers = jest.fn();
jest.mock('../../connectors/portainer', () => ({
  PortainerConnector: jest.fn().mockImplementation(() => ({
    getContainers: mockGetContainers,
  })),
}));

import queryRouter from '../../routes/query';

const app = express();
app.use(express.json());
app.use('/api/query', queryRouter);

describe('Query route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Input validation ──────────────────────────────────────────────────────

  describe('POST /api/query — validation', () => {
    it('returns 400 when query is missing', async () => {
      const res = await request(app).post('/api/query').send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('query is required');
    });

    it('returns 400 when query is blank whitespace', async () => {
      const res = await request(app).post('/api/query').send({ query: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('query is required');
    });
  });

  // ─── Successful queries ────────────────────────────────────────────────────

  describe('POST /api/query — success', () => {
    const agentResponse = {
      answer: 'There are 2 failed builds.',
      sources: ['jenkins'],
      followUpSuggestions: ['Show details of failed builds'],
    };

    it('returns agent response when Jenkins data is fetched', async () => {
      mockListJobs.mockResolvedValue(['payments-ci', 'auth-ci']);
      mockGetBuilds.mockResolvedValue([
        { id: 'payments-ci#1', status: 'FAILURE', jobName: 'payments-ci', buildNumber: 1, timestamp: new Date().toISOString(), duration: 60000, url: '' },
        { id: 'auth-ci#2', status: 'SUCCESS', jobName: 'auth-ci', buildNumber: 2, timestamp: new Date().toISOString(), duration: 30000, url: '' },
      ]);
      mockAnswerQuery.mockResolvedValue(agentResponse);

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'What builds failed?', sources: ['jenkins'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBe('There are 2 failed builds.');
      expect(mockAnswerQuery).toHaveBeenCalledTimes(1);
    });

    it('returns agent response for Kibana source', async () => {
      mockGetRecentErrors.mockResolvedValue([
        { timestamp: '2024-01-01T00:00:00Z', level: 'ERROR', message: 'DB timeout', service: 'api' },
      ]);
      mockAnswerQuery.mockResolvedValue(agentResponse);

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'Any errors in logs?', sources: ['kibana'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns agent response for GitHub source', async () => {
      mockGetWorkflowRuns.mockResolvedValue([
        { id: 1, name: 'CI', status: 'completed', conclusion: 'failure', headBranch: 'main', headSha: 'abc', createdAt: '', updatedAt: '', htmlUrl: '' },
      ]);
      mockAnswerQuery.mockResolvedValue(agentResponse);

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'Any failed workflow runs?', sources: ['github'] });

      expect(res.status).toBe(200);
    });

    it('returns agent response for Portainer source', async () => {
      mockGetContainers.mockResolvedValue([
        { id: 'c1', name: 'api', status: 'running', health: 'healthy', memoryPercent: 40, cpuPercent: 10, restartCount: 0, memoryUsage: 0, memoryLimit: 0, networkRx: 0, networkTx: 0, image: '', created: '', portainer: { endpointId: 1 } },
      ]);
      mockAnswerQuery.mockResolvedValue(agentResponse);

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'Container health?', sources: ['portainer'] });

      expect(res.status).toBe(200);
    });

    it('handles unreachable source gracefully (no throw)', async () => {
      mockListJobs.mockRejectedValue(new Error('Connection refused'));
      mockAnswerQuery.mockResolvedValue({ answer: 'Could not reach jenkins', sources: [], followUpSuggestions: [] });

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'Any issues?', sources: ['jenkins'] });

      // Should still succeed — unreachable sources are handled gracefully inside the route
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('queries all default sources when sources not specified', async () => {
      mockListJobs.mockResolvedValue([]);
      mockGetBuilds.mockResolvedValue([]);
      mockGetRecentErrors.mockResolvedValue([]);
      mockGetWorkflowRuns.mockResolvedValue([]);
      mockGetContainers.mockResolvedValue([]);
      mockAnswerQuery.mockResolvedValue(agentResponse);

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'System status?' });

      expect(res.status).toBe(200);
      expect(mockAnswerQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────────

  describe('POST /api/query — error handling', () => {
    it('returns 500 when agent.answerQuery throws', async () => {
      mockListJobs.mockResolvedValue([]);
      mockGetBuilds.mockResolvedValue([]);
      mockGetRecentErrors.mockResolvedValue([]);
      mockGetWorkflowRuns.mockResolvedValue([]);
      mockGetContainers.mockResolvedValue([]);
      mockAnswerQuery.mockRejectedValue(new Error('AI timeout'));

      const res = await request(app)
        .post('/api/query')
        .send({ query: 'System status?' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('AI timeout');
    });
  });
});
