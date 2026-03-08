import axios, { AxiosInstance } from 'axios';
import {
  WorkflowRun, WorkflowJob, GitCommit,
  GithubRepo, GithubIssue, GithubPullRequest, GithubBranch, RepoSummary,
} from '../../../shared/types';
import { logger } from '../utils/logger';

export class GitHubConnector {
  private client: AxiosInstance;

  constructor(
    private readonly token: string,
    private readonly owner: string = '',
    private readonly repo: string = '',
  ) {
    this.client = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 15_000,
    });
  }

  // ─── Multi-repo listing ───────────────────────────────────────────────────

  /** All repos accessible to the token (personal + org member) */
  async listAllRepos(page = 1, perPage = 100): Promise<GithubRepo[]> {
    try {
      const { data } = await this.client.get('/user/repos', {
        params: { per_page: perPage, page, sort: 'pushed', direction: 'desc', type: 'all' },
      });
      return (data as Record<string, unknown>[]).map(this.mapRepo);
    } catch (err) {
      logger.error('GitHub listAllRepos failed', { err });
      return [];
    }
  }

  /** Repos for a specific org */
  async listOrgRepos(org: string, page = 1, perPage = 100): Promise<GithubRepo[]> {
    try {
      const { data } = await this.client.get(`/orgs/${org}/repos`, {
        params: { per_page: perPage, page, sort: 'pushed', type: 'all' },
      });
      return (data as Record<string, unknown>[]).map(this.mapRepo);
    } catch (err) {
      logger.error(`GitHub listOrgRepos failed for ${org}`, { err });
      return [];
    }
  }

  /** Single repo metadata */
  async getRepo(owner: string, repo: string): Promise<GithubRepo | null> {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}`);
      return this.mapRepo(data as Record<string, unknown>);
    } catch (err) {
      logger.error(`GitHub getRepo failed for ${owner}/${repo}`, { err });
      return null;
    }
  }

  /** Headline summary for one repo: runs + commits + issues + PRs + branches */
  async getRepoSummary(owner: string, repo: string): Promise<RepoSummary | null> {
    const repoMeta = await this.getRepo(owner, repo);
    if (!repoMeta) return null;

    const [recentRuns, recentCommits, openIssues, openPRs, branches] = await Promise.all([
      this.getWorkflowRunsForRepo(owner, repo, 10),
      this.getCommitsForRepo(owner, repo, repoMeta.defaultBranch, 5),
      this.getIssuesForRepo(owner, repo, 'open', 10),
      this.getPullRequestsForRepo(owner, repo, 'open', 10),
      this.getBranches(owner, repo),
    ]);

    return { repo: repoMeta, recentRuns, recentCommits, openIssues, openPRs, branches };
  }

  // ─── Per-repo DevOps methods (dynamic owner/repo) ─────────────────────────

  async getWorkflowRunsForRepo(owner: string, repo: string, limit = 20, status?: string): Promise<WorkflowRun[]> {
    if (!owner || !repo) return [];
    try {
      const params: Record<string, unknown> = { per_page: limit };
      if (status) params.status = status;
      const { data } = await this.client.get(`/repos/${owner}/${repo}/actions/runs`, { params });
      return ((data.workflow_runs ?? []) as Record<string, unknown>[]).map(this.mapRun);
    } catch (err) {
      logger.error(`GitHub getWorkflowRunsForRepo failed for ${owner}/${repo}`, { err });
      return [];
    }
  }

  async getCommitsForRepo(owner: string, repo: string, branch = 'main', limit = 10): Promise<GitCommit[]> {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/commits`, {
        params: { sha: branch, per_page: limit },
      });
      return (data as Record<string, unknown>[]).map((c) => ({
        sha: c.sha as string,
        message: ((c.commit as Record<string, unknown>)?.message as string) ?? '',
        author:
          (((c.commit as Record<string, unknown>)?.author as Record<string, unknown>)?.name as string)
          ?? ((c.author as Record<string, unknown>)?.login as string)
          ?? 'unknown',
        timestamp:
          (((c.commit as Record<string, unknown>)?.author as Record<string, unknown>)?.date as string)
          ?? new Date().toISOString(),
        filesChanged: [],
        additions: 0,
        deletions: 0,
      }));
    } catch (err) {
      logger.error(`GitHub getCommitsForRepo failed for ${owner}/${repo}`, { err });
      return [];
    }
  }

  async getIssuesForRepo(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', limit = 20): Promise<GithubIssue[]> {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/issues`, {
        params: { state, per_page: limit, sort: 'updated', direction: 'desc' },
      });
      return (data as Record<string, unknown>[])
        .filter((i) => !i.pull_request)
        .map((i) => ({
          id: i.id as number,
          number: i.number as number,
          title: i.title as string,
          state: i.state as GithubIssue['state'],
          author: ((i.user as Record<string, unknown>)?.login as string) ?? 'unknown',
          labels: ((i.labels as Array<Record<string, unknown>>) ?? []).map((l) => l.name as string),
          createdAt: i.created_at as string,
          updatedAt: i.updated_at as string,
          htmlUrl: i.html_url as string,
          body: i.body as string | undefined,
        }));
    } catch (err) {
      logger.error(`GitHub getIssuesForRepo failed for ${owner}/${repo}`, { err });
      return [];
    }
  }

  async getPullRequestsForRepo(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', limit = 20): Promise<GithubPullRequest[]> {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state, per_page: limit, sort: 'updated', direction: 'desc' },
      });
      return (data as Record<string, unknown>[]).map((p) => ({
        id: p.id as number,
        number: p.number as number,
        title: p.title as string,
        state: p.merged_at ? 'merged' : (p.state as GithubPullRequest['state']),
        author: ((p.user as Record<string, unknown>)?.login as string) ?? 'unknown',
        headBranch: ((p.head as Record<string, unknown>)?.ref as string) ?? '',
        baseBranch: ((p.base as Record<string, unknown>)?.ref as string) ?? '',
        createdAt: p.created_at as string,
        updatedAt: p.updated_at as string,
        htmlUrl: p.html_url as string,
        draft: (p.draft as boolean) ?? false,
        mergeable: p.mergeable as boolean | undefined,
        additions: (p.additions as number) ?? 0,
        deletions: (p.deletions as number) ?? 0,
        changedFiles: (p.changed_files as number) ?? 0,
      }));
    } catch (err) {
      logger.error(`GitHub getPullRequestsForRepo failed for ${owner}/${repo}`, { err });
      return [];
    }
  }

  async getBranches(owner: string, repo: string): Promise<GithubBranch[]> {
    try {
      const { data } = await this.client.get(`/repos/${owner}/${repo}/branches`, {
        params: { per_page: 100 },
      });
      return (data as Record<string, unknown>[]).map((b) => ({
        name: b.name as string,
        sha: ((b.commit as Record<string, unknown>)?.sha as string) ?? '',
        protected: (b.protected as boolean) ?? false,
      }));
    } catch (err) {
      logger.error(`GitHub getBranches failed for ${owner}/${repo}`, { err });
      return [];
    }
  }

  // ─── Backward-compat methods (use stored owner/repo) ─────────────────────

  async getWorkflowRuns(limit = 20, status?: string): Promise<WorkflowRun[]> {
    return this.getWorkflowRunsForRepo(this.owner, this.repo, limit, status);
  }

  async getRunJobs(runId: number): Promise<WorkflowJob[]> {
    try {
      const { data } = await this.client.get(`/repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs`);
      return ((data.jobs ?? []) as Record<string, unknown>[]).map((j) => ({
        id: j.id as number, name: j.name as string, status: j.status as string,
        conclusion: j.conclusion as string | undefined,
        startedAt: j.started_at as string, completedAt: j.completed_at as string,
        steps: ((j.steps as Array<Record<string, unknown>>) ?? []).map((s) => ({
          name: s.name as string, status: s.status as string,
          conclusion: s.conclusion as string | undefined, number: s.number as number,
          startedAt: s.started_at as string, completedAt: s.completed_at as string,
        })),
      }));
    } catch (err) {
      logger.error('GitHub getRunJobs failed', { runId, err });
      return [];
    }
  }

  async getCommits(branch = 'main', limit = 10): Promise<GitCommit[]> {
    return this.getCommitsForRepo(this.owner, this.repo, branch, limit);
  }

  async createIssue(title: string, body: string, labels: string[] = [], owner?: string, repo?: string): Promise<{ url: string; number: number } | null> {
    const o = owner ?? this.owner;
    const r = repo ?? this.repo;
    try {
      const { data } = await this.client.post(`/repos/${o}/${r}/issues`, { title, body, labels });
      return { url: data.html_url, number: data.number };
    } catch (err) {
      logger.error('GitHub createIssue failed', { title, err });
      return null;
    }
  }

  async rerunFailedJobs(runId: number, owner?: string, repo?: string): Promise<boolean> {
    const o = owner ?? this.owner;
    const r = repo ?? this.repo;
    try {
      await this.client.post(`/repos/${o}/${r}/actions/runs/${runId}/rerun-failed-jobs`);
      return true;
    } catch (err) {
      logger.error('GitHub rerunFailedJobs failed', { runId, err });
      return false;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private mapRepo(r: Record<string, unknown>): GithubRepo {
    const ownerLogin = ((r.owner as Record<string, unknown>)?.login as string) ?? '';
    return {
      id: r.id as number,
      owner: ownerLogin,
      name: r.name as string,
      fullName: (r.full_name as string) ?? `${ownerLogin}/${r.name as string}`,
      description: r.description as string | null,
      private: r.private as boolean,
      defaultBranch: (r.default_branch as string) ?? 'main',
      language: r.language as string | null,
      stargazers: (r.stargazers_count as number) ?? 0,
      openIssues: (r.open_issues_count as number) ?? 0,
      htmlUrl: r.html_url as string,
      pushedAt: (r.pushed_at as string) ?? new Date().toISOString(),
      topics: (r.topics as string[]) ?? [],
    };
  }

  private mapRun(r: Record<string, unknown>): WorkflowRun {
    return {
      id: r.id as number,
      name: r.name as string,
      headBranch: r.head_branch as string,
      headSha: r.head_sha as string,
      status: r.status as WorkflowRun['status'],
      conclusion: r.conclusion as WorkflowRun['conclusion'] | undefined,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      htmlUrl: r.html_url as string,
    };
  }
}
