import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { GitHubConnector } from '../../connectors/github';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), http: jest.fn() },
}));

describe('GitHubConnector', () => {
  let mock: MockAdapter;
  let connector: GitHubConnector;

  const rawRepo = {
    id: 1,
    name: 'my-repo',
    full_name: 'owner/my-repo',
    description: 'A test repo',
    private: false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 42,
    open_issues_count: 3,
    html_url: 'https://github.com/owner/my-repo',
    pushed_at: '2024-01-01T00:00:00Z',
    topics: ['devops'],
    owner: { login: 'owner' },
  };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    connector = new GitHubConnector('ghp_test_token', 'owner', 'my-repo');
  });

  afterEach(() => {
    mock.restore();
  });

  // ─── listAllRepos ─────────────────────────────────────────────────────────

  describe('listAllRepos()', () => {
    it('returns mapped repos on success', async () => {
      mock.onGet('https://api.github.com/user/repos').reply(200, [rawRepo]);

      const repos = await connector.listAllRepos();

      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('my-repo');
      expect(repos[0].owner).toBe('owner');
      expect(repos[0].stargazers).toBe(42);
      expect(repos[0].defaultBranch).toBe('main');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/user/repos').networkError();

      expect(await connector.listAllRepos()).toEqual([]);
    });
  });

  // ─── listOrgRepos ─────────────────────────────────────────────────────────

  describe('listOrgRepos()', () => {
    it('returns repos for an org', async () => {
      mock.onGet('https://api.github.com/orgs/my-org/repos').reply(200, [rawRepo]);

      const repos = await connector.listOrgRepos('my-org');

      expect(repos).toHaveLength(1);
      expect(repos[0].fullName).toBe('owner/my-repo');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/orgs/my-org/repos').networkError();

      expect(await connector.listOrgRepos('my-org')).toEqual([]);
    });
  });

  // ─── getRepo ──────────────────────────────────────────────────────────────

  describe('getRepo()', () => {
    it('returns repo metadata', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo').reply(200, rawRepo);

      const repo = await connector.getRepo('owner', 'my-repo');

      expect(repo).not.toBeNull();
      expect(repo!.id).toBe(1);
      expect(repo!.language).toBe('TypeScript');
      expect(repo!.topics).toEqual(['devops']);
    });

    it('returns null on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/bad').networkError();

      expect(await connector.getRepo('owner', 'bad')).toBeNull();
    });
  });

  // ─── getWorkflowRunsForRepo ───────────────────────────────────────────────

  describe('getWorkflowRunsForRepo()', () => {
    const rawRun = {
      id: 100,
      name: 'CI',
      head_branch: 'main',
      head_sha: 'abc123',
      status: 'completed',
      conclusion: 'success',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T01:00:00Z',
      html_url: 'https://github.com/owner/my-repo/actions/runs/100',
    };

    it('returns mapped runs', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/actions/runs').reply(200, { workflow_runs: [rawRun] });

      const runs = await connector.getWorkflowRunsForRepo('owner', 'my-repo');

      expect(runs).toHaveLength(1);
      expect(runs[0].id).toBe(100);
      expect(runs[0].conclusion).toBe('success');
    });

    it('returns empty array when owner or repo is empty', async () => {
      expect(await connector.getWorkflowRunsForRepo('', 'my-repo')).toEqual([]);
      expect(await connector.getWorkflowRunsForRepo('owner', '')).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/actions/runs').networkError();

      expect(await connector.getWorkflowRunsForRepo('owner', 'my-repo')).toEqual([]);
    });
  });

  // ─── getCommitsForRepo ────────────────────────────────────────────────────

  describe('getCommitsForRepo()', () => {
    it('returns mapped commits', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/commits').reply(200, [
        {
          sha: 'deadbeef',
          commit: {
            message: 'fix: something',
            author: { name: 'Alice', date: '2024-01-01T00:00:00Z' },
          },
          author: { login: 'alice' },
        },
      ]);

      const commits = await connector.getCommitsForRepo('owner', 'my-repo');

      expect(commits).toHaveLength(1);
      expect(commits[0].sha).toBe('deadbeef');
      expect(commits[0].message).toBe('fix: something');
      expect(commits[0].author).toBe('Alice');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/commits').networkError();

      expect(await connector.getCommitsForRepo('owner', 'my-repo')).toEqual([]);
    });
  });

  // ─── getIssuesForRepo ─────────────────────────────────────────────────────

  describe('getIssuesForRepo()', () => {
    it('returns issues and filters out pull requests', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/issues').reply(200, [
        {
          id: 1, number: 10, title: 'Bug report', state: 'open',
          user: { login: 'reporter' }, labels: [{ name: 'bug' }],
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
          html_url: 'https://github.com/owner/my-repo/issues/10', body: 'Description',
        },
        {
          id: 2, number: 11, title: 'PR disguised as issue', state: 'open',
          user: { login: 'dev' }, labels: [], pull_request: { url: '...' },
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
          html_url: 'https://github.com/owner/my-repo/pull/11', body: null,
        },
      ]);

      const issues = await connector.getIssuesForRepo('owner', 'my-repo');

      expect(issues).toHaveLength(1);
      expect(issues[0].number).toBe(10);
      expect(issues[0].labels).toEqual(['bug']);
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/issues').networkError();

      expect(await connector.getIssuesForRepo('owner', 'my-repo')).toEqual([]);
    });
  });

  // ─── getPullRequestsForRepo ───────────────────────────────────────────────

  describe('getPullRequestsForRepo()', () => {
    it('returns mapped PRs', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/pulls').reply(200, [
        {
          id: 5, number: 42, title: 'feat: add feature', state: 'open', merged_at: null,
          user: { login: 'developer' }, head: { ref: 'feature-branch' }, base: { ref: 'main' },
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
          html_url: 'https://github.com/owner/my-repo/pull/42', draft: false,
          additions: 100, deletions: 20, changed_files: 5,
        },
      ]);

      const prs = await connector.getPullRequestsForRepo('owner', 'my-repo');

      expect(prs).toHaveLength(1);
      expect(prs[0].number).toBe(42);
      expect(prs[0].headBranch).toBe('feature-branch');
      expect(prs[0].additions).toBe(100);
    });

    it('marks merged PRs', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/pulls').reply(200, [
        {
          id: 6, number: 43, title: 'Merged PR', state: 'closed', merged_at: '2024-01-02T00:00:00Z',
          user: { login: 'dev' }, head: { ref: 'fix' }, base: { ref: 'main' },
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
          html_url: 'https://github.com/owner/my-repo/pull/43', draft: false,
          additions: 0, deletions: 0, changed_files: 0,
        },
      ]);

      const prs = await connector.getPullRequestsForRepo('owner', 'my-repo');

      expect(prs[0].state).toBe('merged');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/pulls').networkError();

      expect(await connector.getPullRequestsForRepo('owner', 'my-repo')).toEqual([]);
    });
  });

  // ─── getBranches ──────────────────────────────────────────────────────────

  describe('getBranches()', () => {
    it('returns mapped branches', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/branches').reply(200, [
        { name: 'main', commit: { sha: 'abc' }, protected: true },
        { name: 'dev', commit: { sha: 'def' }, protected: false },
      ]);

      const branches = await connector.getBranches('owner', 'my-repo');

      expect(branches).toHaveLength(2);
      expect(branches[0].name).toBe('main');
      expect(branches[0].protected).toBe(true);
      expect(branches[0].sha).toBe('abc');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/branches').networkError();

      expect(await connector.getBranches('owner', 'my-repo')).toEqual([]);
    });
  });

  // ─── getRunJobs ───────────────────────────────────────────────────────────

  describe('getRunJobs()', () => {
    it('returns jobs with steps', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/actions/runs/100/jobs').reply(200, {
        jobs: [
          {
            id: 200, name: 'build', status: 'completed', conclusion: 'success',
            started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:10:00Z',
            steps: [
              { name: 'Checkout', status: 'completed', conclusion: 'success', number: 1,
                started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:01:00Z' },
            ],
          },
        ],
      });

      const jobs = await connector.getRunJobs(100);

      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('build');
      expect(jobs[0].steps).toHaveLength(1);
      expect(jobs[0].steps[0].name).toBe('Checkout');
    });

    it('returns empty array on error', async () => {
      mock.onGet('https://api.github.com/repos/owner/my-repo/actions/runs/999/jobs').networkError();

      expect(await connector.getRunJobs(999)).toEqual([]);
    });
  });

  // ─── createIssue ──────────────────────────────────────────────────────────

  describe('createIssue()', () => {
    it('creates an issue and returns url + number', async () => {
      mock.onPost('https://api.github.com/repos/owner/my-repo/issues').reply(201, {
        html_url: 'https://github.com/owner/my-repo/issues/99',
        number: 99,
      });

      const result = await connector.createIssue('Bug found', 'Details here', ['bug']);

      expect(result).not.toBeNull();
      expect(result!.number).toBe(99);
      expect(result!.url).toContain('/issues/99');
    });

    it('returns null on error', async () => {
      mock.onPost('https://api.github.com/repos/owner/my-repo/issues').networkError();

      expect(await connector.createIssue('Title', 'Body')).toBeNull();
    });
  });

  // ─── rerunFailedJobs ──────────────────────────────────────────────────────

  describe('rerunFailedJobs()', () => {
    it('returns true on success', async () => {
      mock.onPost('https://api.github.com/repos/owner/my-repo/actions/runs/100/rerun-failed-jobs').reply(201);

      expect(await connector.rerunFailedJobs(100)).toBe(true);
    });

    it('returns false on error', async () => {
      mock.onPost('https://api.github.com/repos/owner/my-repo/actions/runs/999/rerun-failed-jobs').networkError();

      expect(await connector.rerunFailedJobs(999)).toBe(false);
    });
  });

  // ─── authorization ────────────────────────────────────────────────────────

  describe('authorization', () => {
    it('sends Bearer token + GitHub headers', async () => {
      mock.onGet('https://api.github.com/user/repos').reply(200, []);

      await connector.listAllRepos();

      const req = mock.history.get[0];
      expect(req.headers?.Authorization).toBe('Bearer ghp_test_token');
      expect(req.headers?.Accept).toBe('application/vnd.github+json');
    });
  });
});
