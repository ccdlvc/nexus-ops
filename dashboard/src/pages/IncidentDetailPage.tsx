import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { incidentsApi } from '../services/api';
import { IncidentCard as IncidentType } from '@shared/types';

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950', info: '#8b949e',
};
const STATUS_COLOR: Record<string, string> = {
  open: '#d29922', investigating: '#58a6ff', resolved: '#3fb950', suppressed: '#8b949e',
};
const SRC_ICON: Record<string, string> = {
  jenkins: '🔧', kibana: '📊', github: '🐙', portainer: '🐳',
  aws: '☁', gcp: '🌐', azure: '🔷',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
      background: color + '22', color, border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<IncidentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await incidentsApi.get(id);
      setIncident(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doAction(key: string, fn: () => Promise<unknown>) {
    setActionLoading(key);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as Error).message ?? 'Action failed';
      setActionError(msg);
    } finally { setActionLoading(''); }
  }

  async function generateReport() {
    if (!id) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const r = await incidentsApi.generateReport(id);
      setReport(r.markdownReport);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })
        ?.response?.data?.error ?? (e as Error).message ?? 'Failed to generate report';
      setReportError(msg);
    } finally { setReportLoading(false); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8b949e', fontSize: 14 }}>
        Loading incident…
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
        <div style={{ color: '#f85149', fontSize: 16, marginBottom: 16 }}>{error ?? 'Incident not found'}</div>
        <button onClick={() => navigate('/incidents')} style={{
          padding: '8px 16px', borderRadius: 6, background: '#1f6feb33', border: '1px solid #1f6feb88',
          color: '#58a6ff', cursor: 'pointer', fontSize: 13,
        }}>← Back to Incidents</button>
      </div>
    );
  }

  const color = SEV_COLOR[incident.severity] ?? '#8b949e';
  const statusColor = STATUS_COLOR[incident.status] ?? '#8b949e';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate('/incidents')} style={{
        background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer',
        fontSize: 13, marginBottom: 20, padding: 0, display: 'flex', alignItems: 'center', gap: 4,
      }}>← Back to Incidents</button>

      {/* Header card */}
      <div style={{
        background: '#161b22', border: `1px solid ${color}55`, borderRadius: 10,
        padding: 24, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#e6edf3', margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>{incident.title}</h2>
            <p style={{ color: '#8b949e', margin: 0, fontSize: 14, lineHeight: 1.6 }}>{incident.summary}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Badge label={incident.severity.toUpperCase()} color={color} />
          <Badge label={incident.status} color={statusColor} />
          {incident.affectedServices.map((s) => (
            <Badge key={s} label={s} color='#58a6ff' />
          ))}
          {incident.tags.map((t) => (
            <span key={t} style={{ fontSize: 11, color: '#8b949e', background: '#21262d', padding: '2px 6px', borderRadius: 4 }}>#{t}</span>
          ))}
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#8b949e' }}>Created</div>
            <div style={{ fontSize: 12, color: '#c9d1d9' }}>{new Date(incident.createdAt).toLocaleString()}</div>
          </div>
          {incident.updatedAt !== incident.createdAt && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#8b949e' }}>Updated</div>
              <div style={{ fontSize: 12, color: '#c9d1d9' }}>{new Date(incident.updatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {incident.status === 'open' && (
          <ActionBtn label="🔍 Mark Investigating" loading={actionLoading === 'inv'} color='#d29922'
            onClick={() => doAction('inv', () => incidentsApi.setStatus(incident.id, 'investigating'))} />
        )}
        {incident.status !== 'resolved' && (
          <ActionBtn label="✅ Resolve" loading={actionLoading === 'res'} color='#238636'
            onClick={() => doAction('res', () => incidentsApi.setStatus(incident.id, 'resolved'))} />
        )}
        {incident.status !== 'suppressed' && (
          <ActionBtn label="🔕 Suppress" loading={actionLoading === 'sup'} color='#8b949e'
            onClick={() => doAction('sup', () => incidentsApi.setStatus(incident.id, 'suppressed'))} />
        )}
        <ActionBtn
          label={incident.githubIssueUrl ? '✓ Issue Created' : '🐙 Create GitHub Issue'}
          loading={actionLoading === 'gh'} disabled={!!incident.githubIssueUrl} color='#238636'
          onClick={() => doAction('gh', () => incidentsApi.createGithubIssue(incident.id))} />
        <ActionBtn label="💬 Share to Slack" loading={actionLoading === 'slack'} color='#4a154b'
          onClick={() => doAction('slack', () => incidentsApi.shareSlack(incident.id))} />
        <ActionBtn label={report ? '📄 Regenerate Report' : '📄 Generate Report'} loading={reportLoading} color='#1f6feb'
          onClick={generateReport} />
      </div>

      {/* Action error banner */}
      {actionError && (
        <div style={{ padding: '10px 14px', background: '#f8514922', border: '1px solid #f8514966', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#f85149', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Action failed: {actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      {reportError && (
        <div style={{ padding: '10px 14px', background: '#f8514922', border: '1px solid #f8514966', borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#f85149', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Report failed: {reportError}</span>
          <button onClick={() => setReportError(null)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {incident.githubIssueUrl && (
        <a href={incident.githubIssueUrl} target="_blank" rel="noreferrer"
          style={{ display: 'block', marginBottom: 16, fontSize: 13, color: '#58a6ff' }}>
          🐙 View GitHub Issue →
        </a>
      )}
      {incident.slackThreadUrl && (
        <a href={incident.slackThreadUrl} target="_blank" rel="noreferrer"
          style={{ display: 'block', marginBottom: 16, fontSize: 13, color: '#58a6ff' }}>
          💬 View Slack Thread →
        </a>
      )}

      {/* Root Cause */}
      <Section title="Root Cause">
        <p style={{ fontSize: 14, color: '#c9d1d9', lineHeight: 1.7, margin: 0 }}>{incident.rootCause}</p>
      </Section>

      {/* Correlations */}
      {incident.correlations.length > 0 && (
        <Section title={`Correlated Sources (${incident.correlations.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {incident.correlations.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', background: '#0d1117', borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>{SRC_ICON[c.source] ?? '📌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase' }}>{c.source}</span>
                    <span style={{ fontSize: 11, color: '#8b949e' }}>{c.entityType}: {c.entityId}</span>
                    <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 'auto' }}>{new Date(c.timestamp).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.5 }}>{c.description}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#3fb950', flexShrink: 0 }}>
                  {(c.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Suggested Fixes */}
      {incident.suggestedFixes.length > 0 && (
        <Section title={`Suggested Fixes (${incident.suggestedFixes.length})`}>
          {incident.suggestedFixes.sort((a, b) => a.priority - b.priority).map((fix, i) => (
            <div key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: i < incident.suggestedFixes.length - 1 ? '1px solid #21262d' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#1f6feb', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#58a6ff' }}>{fix.title}</span>
              </div>
              <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6, margin: '0 0 8px 28px' }}>{fix.description}</p>
              {fix.command && (
                <pre style={{ margin: '0 0 8px 28px', padding: '10px 14px', background: '#0d1117', borderRadius: 6, fontSize: 12, color: '#3fb950', fontFamily: 'monospace', overflowX: 'auto' }}>
                  {fix.command}
                </pre>
              )}
              {fix.link && (
                <a href={fix.link} target="_blank" rel="noreferrer" style={{ display: 'block', marginLeft: 28, fontSize: 12, color: '#58a6ff' }}>→ Reference</a>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* AI Report (shown after clicking Generate Report) */}
      {report && (
        <Section title="AI-Generated Incident Report">
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#c9d1d9', lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>
            {report}
          </pre>
        </Section>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, loading, disabled, color }: {
  label: string; onClick: () => void; loading: boolean; disabled?: boolean; color: string;
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled} style={{
      padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: (loading || disabled) ? 'default' : 'pointer',
      background: (loading || disabled) ? '#21262d' : color + '33',
      color: (loading || disabled) ? '#8b949e' : '#e6edf3',
      border: `1px solid ${(loading || disabled) ? '#30363d' : color + '88'}`,
    }}>{loading ? '…' : label}</button>
  );
}
