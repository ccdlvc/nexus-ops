import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { JenkinsConnector } from '../../connectors/jenkins';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

describe('JenkinsConnector', () => {
  let mock: MockAdapter;
  let connector: JenkinsConnector;

  const BASE = 'http://jenkins:8080';
  const rawBuild = {
    number: 42,
    result: 'FAILURE',
    timestamp: 1700000000000,
    duration: 120000,
    url: `${BASE}/job/payments-service-ci/42/`,
    changeSets: [{ items: [{ commitId: 'abc123', author: { fullName: 'Alice' } }] }],
  };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    connector = new JenkinsConnector(BASE, 'admin', 'secret_token');
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── getBuilds ────────────────────────────────────────────────────────────

  describe('getBuilds()', () => {
    it('returns mapped builds on success', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*`)).reply(200, { builds: [rawBuild] });

      const builds = await connector.getBuilds('payments-service-ci');

      expect(builds).toHaveLength(1);
      expect(builds[0].buildNumber).toBe(42);
      expect(builds[0].status).toBe('FAILURE');
      expect(builds[0].commitSha).toBe('abc123');
      expect(builds[0].jobName).toBe('payments-service-ci');
      expect(builds[0].id).toBe('payments-service-ci#42');
    });

    it('encodes nested job paths', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*`)).reply(200, { builds: [] });

      await connector.getBuilds('folder/sub/job-name');

      const url = mock.history.get[0].url ?? '';
      expect(url).toContain('folder');
      expect(url).toContain('sub');
    });

    it('returns empty array on error', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*`)).networkError();

      expect(await connector.getBuilds('my-job')).toEqual([]);
    });

    it('maps null result to IN_PROGRESS', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*`)).reply(200, {
        builds: [{ ...rawBuild, result: null }],
      });

      const builds = await connector.getBuilds('my-job');

      expect(builds[0].status).toBe('IN_PROGRESS');
    });

    it('maps known result strings correctly', async () => {
      const statuses = ['SUCCESS', 'ABORTED', 'UNSTABLE'] as const;
      for (const result of statuses) {
        mock.resetHistory();
        mock.onGet(new RegExp(`${BASE}/job/.*`)).reply(200, {
          builds: [{ ...rawBuild, result }],
        });
        const builds = await connector.getBuilds('my-job');
        expect(builds[0].status).toBe(result);
      }
    });
  });

  // ─── getBuildLogs ─────────────────────────────────────────────────────────

  describe('getBuildLogs()', () => {
    it('returns console text', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*/consoleText`)).reply(200, 'Build started\nBuild failed\n');

      const logs = await connector.getBuildLogs('my-job', 1);

      expect(logs).toContain('Build failed');
    });

    it('returns empty string on error', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*/consoleText`)).networkError();

      expect(await connector.getBuildLogs('my-job', 1)).toBe('');
    });
  });

  // ─── getTestReport ────────────────────────────────────────────────────────

  describe('getTestReport()', () => {
    it('returns test report with slow test detection', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*/testReport/.*`)).reply(200, {
        totalCount: 50,
        passCount: 48,
        failCount: 2,
        skipCount: 0,
        duration: 120,
        suites: [
          {
            cases: [
              { name: 'fastTest', className: 'com.example.Tests', duration: 1, status: 'PASSED' },
              { name: 'slowTest', className: 'com.example.Tests', duration: 45, status: 'PASSED' },
            ],
          },
        ],
      });

      const report = await connector.getTestReport('my-job', 1);

      expect(report).not.toBeNull();
      expect(report!.total).toBe(50);
      expect(report!.passed).toBe(48);
      expect(report!.failed).toBe(2);
      expect(report!.slowTests).toHaveLength(1);
      expect(report!.slowTests[0].name).toContain('slowTest');
    });

    it('returns null on 404 (no test results)', async () => {
      mock.onGet(new RegExp(`${BASE}/job/.*/testReport/.*`)).reply(404);

      expect(await connector.getTestReport('my-job', 1)).toBeNull();
    });
  });

  // ─── listJobs ─────────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('returns job names', async () => {
      mock.onGet(`${BASE}/api/json?tree=jobs[name,fullName]`).reply(200, {
        jobs: [
          { name: 'job-a', fullName: 'folder/job-a' },
          { name: 'job-b', fullName: 'job-b' },
        ],
      });

      const jobs = await connector.listJobs();

      expect(jobs).toEqual(['folder/job-a', 'job-b']);
    });

    it('returns empty array on error', async () => {
      mock.onGet(`${BASE}/api/json?tree=jobs[name,fullName]`).networkError();

      expect(await connector.listJobs()).toEqual([]);
    });
  });

  // ─── triggerBuild ─────────────────────────────────────────────────────────

  describe('triggerBuild()', () => {
    it('returns true on success (no params)', async () => {
      mock.onPost(new RegExp(`${BASE}/job/.*/build`)).reply(201);

      expect(await connector.triggerBuild('my-job')).toBe(true);
    });

    it('uses buildWithParameters endpoint when params provided', async () => {
      mock.onPost(new RegExp(`${BASE}/job/.*/buildWithParameters`)).reply(201);

      const result = await connector.triggerBuild('my-job', { BRANCH: 'main' });

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mock.onPost(new RegExp(`${BASE}/job/.*/build`)).networkError();

      expect(await connector.triggerBuild('my-job')).toBe(false);
    });
  });

  // ─── authentication ───────────────────────────────────────────────────────

  describe('authentication', () => {
    it('sends Basic auth', async () => {
      mock.onGet(`${BASE}/api/json?tree=jobs[name,fullName]`).reply(200, { jobs: [] });

      await connector.listJobs();

      const req = mock.history.get[0];
      expect(req.auth).toEqual({ username: 'admin', password: 'secret_token' });
    });
  });
});
