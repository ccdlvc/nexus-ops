import React, { useEffect, useState, useCallback } from 'react';
import { connectorsApi } from '../services/api';
import { GithubRepo, RepoSummary, WorkflowRun } from '@shared/types';

const CONCLUSION_COLOR: Record<string, string> = {
  success: '#3fb950', failure: '#f85149', cancelled: '#8b949e',
  skipped: '#8b949e', timed_out: '#d29922', action_required: '#d29922',
};
const LANG_COLOR: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Java: '#b07219', Rust: '#dea584', Ruby: '#701516',
};

export default function ReposPage() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    connectorsApi.githubListRepos()
      .then(setRepos)
      .catch(() => setError('Could not fetch repositories. Check GITHUB_TOKEN is configured.'))
      .finally(() => setLoading(false));
  }, []);

  const languages = Array.from(new Set(repos.map((r) => r.language).filter(Boolean))) as string[];

  const filtered = repos.filter((r) => {
    const matchSearch = !search || r.fullName.toLowerCase().includes(search.toLowerCase())
      || (r.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchLang = !langFilter || r.language === langFilter;
    return matchSearch && matchLang;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>GitHub Repositories</h1>
          <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
            {repos.length} repos accessible · click any repo to see DevOps details
          </p>
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repos…"
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: 12, width: 200, outline: 'none' }}
        />
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: 12, outline: 'none' }}>
          <option value=''>All languages</option>
          {languages.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {error && <div style={{ padding: '12px 16px', background: '#f8514922', border: '1px solid #f8514944', borderRadius: 8, color: '#f85149', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading repositories…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((repo) => (
          <RepoRow
            key={repo.fullName}
            repo={repo}
            expanded={expandedRepo === repo.fullName}
            onToggle={() => setExpandedRepo(expandedRepo === repo.fullName ? null : repo.fullName)}
          />
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ color: '#8b949e', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
            No repositories match your filter.
          </div>
        )}
      </div>
    </div>
  );
}

function RepoRow({ repo, expanded, onToggle }: { repo: GithubRepo; expanded: boolean; onToggle: () => void }) {
  const [summary, setSummary] = useState<RepoSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'commits' | 'issues' | 'prs' | 'branches'>('runs');
  const langColor = LANG_COLOR[repo.language ?? ''] ?? '#8b949e';

  const load = useCallback(async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const s = await connectorsApi.githubRepoSummary(repo.owner, repo.name);
      setSummary(s);
    } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  }, [repo.owner, repo.name, summary, summaryLoading]);

  const handleToggle = () => {
    if (!expanded) load();
    onToggle();
  };

  return (
    <div style={{ borderRadius: 10, border: '1px solid #30363d', background: '#161b22', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={handleToggle}>
        <span style={{ fontSize: 18 }}>🐙</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <a href={repo.htmlUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 14, fontWeight: 700, color: '#58a6ff', textDecoration: 'none' }}>
              {repo.fullName}
            </a>
            {repo.private && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#21262d', color: '#8b949e', border: '1px solid #30363d' }}>private</span>}
            {repo.language && (
              <span style={{ fontSize: 11, fontWeight: 600, color: langColor }}>● {repo.language}</span>
            )}
          </div>
          {repo.description && (
            <div style={{ fontSize: 12, color: '#8b949e', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {repo.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            <MetaStat icon="⭐" value={repo.stargazers} />
            <MetaStat icon="🔴" value={repo.openIssues} label="issues" />
            <MetaStat icon="🌿" value={repo.defaultBranch} />
            <span style={{ fontSize: 11, color: '#8b949e' }}>pushed {timeAgo(repo.pushedAt)}</span>
          </div>
        </div>
        <span style={{ color: '#8b949e', fontSize: 12, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded DevOps panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid #21262d' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #21262d', padding: '0 16px', gap: 4 }}>
            {(['runs', 'commits', 'issues', 'prs', 'branches'] as const).map((tab) => {
              const labels = { runs: '⚡ Workflows', commits: '📦 Commits', issues: '🔴 Issues', prs: '🔀 Pull Requests', branches: '🌿 Branches' };
              const counts: Partial<Record<typeof tab, number>> = {
                runs: summary?.recentRuns.length,
                commits: summary?.recentCommits.length,
                issues: summary?.openIssues.length,
                prs: summary?.openPRs.length,
                branches: summary?.branches.length,
              };
              return (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '8px 12px', fontSize: 12, fontWeight: activeTab === tab ? 700 : 400,
                  color: activeTab === tab ? '#58a6ff' : '#8b949e',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                }}>
                  {labels[tab]}{counts[tab] !== undefined ? ` (${counts[tab]})` : ''}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '16px', maxHeight: 380, overflowY: 'auto' }}>
            {summaryLoading && <div style={{ color: '#8b949e', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Loading…</div>}

            {!summaryLoading && summary && activeTab === 'runs' && (
              summary.recentRuns.length === 0
                ? <Empty msg="No workflow runs found" />
                : summary.recentRuns.map((run) => <RunRow key={run.id} run={run} owner={repo.owner} repoName={repo.name} />)
            )}

            {!summaryLoading && summary && activeTab === 'commits' && (
              summary.recentCommits.length === 0
                ? <Empty msg="No commits found" />
                : summary.recentCommits.map((c) => (
                  <div key={c.sha} style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', gap: 10 }}>
                    <code style={{ fontSize: 11, color: '#58a6ff', flexShrink: 0, width: 60 }}>{c.sha.slice(0, 7)}</code>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#e6edf3', lineHeight: 1.4 }}>{c.message.split('\n')[0]}</div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{c.author} · {timeAgo(c.timestamp)}</div>
                    </div>
                  </div>
                ))
            )}

            {!summaryLoading && summary && activeTab === 'issues' && (
              summary.openIssues.length === 0
                ? <Empty msg="No open issues" />
                : summary.openIssues.map((i) => (
                  <div key={i.id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, color: '#3fb950', flexShrink: 0, marginTop: 2 }}>#{i.number}</span>
                    <div style={{ flex: 1 }}>
                      <a href={i.htmlUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#e6edf3', textDecoration: 'none' }}>{i.title}</a>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {i.labels.map((l) => <span key={l} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 10, background: '#58a6ff22', color: '#58a6ff' }}>{l}</span>)}
                        <span style={{ fontSize: 10, color: '#8b949e' }}>by {i.author} · {timeAgo(i.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))
            )}

            {!summaryLoading && summary && activeTab === 'prs' && (
              summary.openPRs.length === 0
                ? <Empty msg="No open pull requests" />
                : summary.openPRs.map((pr) => (
                  <div key={pr.id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, color: '#d29922', flexShrink: 0, marginTop: 2 }}>#{pr.number}</span>
                    <div style={{ flex: 1 }}>
                      <a href={pr.htmlUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#e6edf3', textDecoration: 'none' }}>
                        {pr.draft && <span style={{ fontSize: 10, color: '#8b949e', marginRight: 6 }}>[Draft]</span>}
                        {pr.title}
                      </a>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                        {pr.headBranch} → {pr.baseBranch} · by {pr.author} · {timeAgo(pr.updatedAt)}
                        <span style={{ color: '#3fb950', marginLeft: 8 }}>+{pr.additions}</span>
                        <span style={{ color: '#f85149', marginLeft: 4 }}>-{pr.deletions}</span>
                      </div>
                    </div>
                  </div>
                ))
            )}

            {!summaryLoading && summary && activeTab === 'branches' && (
              summary.branches.length === 0
                ? <Empty msg="No branches found" />
                : summary.branches.map((b) => (
                  <div key={b.name} style={{ padding: '7px 0', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>🌿</span>
                    <span style={{ fontSize: 12, color: b.name === repo.defaultBranch ? '#58a6ff' : '#e6edf3', flex: 1 }}>{b.name}</span>
                    {b.name === repo.defaultBranch && <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', padding: '1px 6px', borderRadius: 3 }}>default</span>}
                    {b.protected && <span style={{ fontSize: 10, color: '#3fb950', background: '#23863622', padding: '1px 6px', borderRadius: 3 }}>protected</span>}
                    <code style={{ fontSize: 10, color: '#8b949e' }}>{b.sha.slice(0, 7)}</code>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, owner, repoName }: { run: WorkflowRun; owner: string; repoName: string }) {
  const [rerunning, setRerunning] = useState(false);
  const color = run.conclusion ? CONCLUSION_COLOR[run.conclusion] ?? '#8b949e' : '#d29922';
  const icon = run.status === 'in_progress' ? '🔄' : run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⏸';

  async function rerun() {
    setRerunning(true);
    try { await connectorsApi.githubRerunJobs(owner, repoName, run.id); } catch { /* ignore */ }
    finally { setRerunning(false); }
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={run.htmlUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#e6edf3', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {run.name}
        </a>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
          <span style={{ color }}>{run.conclusion ?? run.status}</span>
          {' · '}{run.headBranch}{' · '}{timeAgo(run.updatedAt)}
        </div>
      </div>
      {run.conclusion === 'failure' && (
        <button onClick={rerun} disabled={rerunning} style={{
          fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: rerunning ? 'default' : 'pointer',
          background: '#1f6feb22', color: '#58a6ff', border: '1px solid #1f6feb44',
        }}>{rerunning ? '…' : '↺ Rerun'}</button>
      )}
    </div>
  );
}

function MetaStat({ icon, value, label }: { icon: string; value: string | number; label?: string }) {
  return (
    <span style={{ fontSize: 11, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 3 }}>
      {icon} {value}{label ? ` ${label}` : ''}
    </span>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: '#8b949e', textAlign: 'center', padding: '24px 0' }}>{msg}</div>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
