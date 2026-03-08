import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IncidentCard as IncidentCardType } from '@shared/types';
import { incidentsApi } from '../services/api';

interface Props {
  incident: IncidentCardType;
  onUpdate?: () => void;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950', info: '#8b949e',
};
const SRC_ICON: Record<string, string> = {
  jenkins: '🔧', kibana: '📊', github: '🐙', portainer: '🐳',
  aws: '☁', gcp: '🌐', azure: '🔷',
};

export default function IncidentCard({ incident, onUpdate }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const color = SEV_COLOR[incident.severity] ?? '#8b949e';

  async function doAction(action: string, fn: () => Promise<unknown>) {
    setActionLoading(action);
    try { await fn(); onUpdate?.(); } catch { /* ignore */ }
    finally { setActionLoading(''); }
  }

  return (
    <div style={{
      marginBottom: 12, borderRadius: 10, border: `1px solid ${color}44`,
      background: '#161b22', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{incident.title}</span>
            <Badge label={incident.severity.toUpperCase()} color={color} />
            <Badge label={incident.status} color='#8b949e' />
          </div>
          <p style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.4 }}>{incident.summary}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {incident.affectedServices.slice(0, 4).map((s) => (
              <span key={s} style={{ fontSize: 11, color: '#58a6ff', background: '#1f6feb22', padding: '1px 6px', borderRadius: 4 }}>{s}</span>
            ))}
            <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 'auto' }}>{new Date(incident.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/incidents/${incident.id}`); }}
          style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 12, padding: '2px 6px', flexShrink: 0 }}
          title="Open detail page"
        >View →</button>
        <span style={{ color: '#8b949e', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #21262d', padding: '16px' }}>
          <Section title="Root Cause">
            <p style={{ fontSize: 13, color: '#c9d1d9', lineHeight: 1.6 }}>{incident.rootCause}</p>
          </Section>

          {incident.correlations.length > 0 && (
            <Section title="Correlated Sources">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {incident.correlations.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', background: '#21262d', borderRadius: 6 }}>
                    <span style={{ fontSize: 16 }}>{SRC_ICON[c.source] ?? '📌'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', marginBottom: 2 }}>{c.source}</div>
                      <div style={{ fontSize: 13, color: '#c9d1d9' }}>{c.description}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#3fb950' }}>{(c.confidence * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {incident.suggestedFixes.length > 0 && (
            <Section title="Suggested Fixes">
              {incident.suggestedFixes.map((f, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#58a6ff', marginBottom: 4 }}>{i + 1}. {f.title}</div>
                  <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.5 }}>{f.description}</div>
                  {f.command && (
                    <pre style={{ marginTop: 6, padding: '8px 12px', background: '#0d1117', borderRadius: 6, fontSize: 12, color: '#3fb950', fontFamily: 'monospace', overflowX: 'auto' }}>
                      {f.command}
                    </pre>
                  )}
                  {f.link && <a href={f.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#58a6ff' }}>→ Reference</a>}
                </div>
              ))}
            </Section>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid #21262d' }}>
            <ActionButton
              label={incident.githubIssueUrl ? '✓ Issue Created' : '🐙 Create GitHub Issue'}
              clicking={actionLoading === 'gh'}
              disabled={!!incident.githubIssueUrl}
              color='#238636'
              onClick={() => doAction('gh', () => incidentsApi.createGithubIssue(incident.id))}
            />
            <ActionButton
              label="💬 Share to Slack"
              clicking={actionLoading === 'slack'}
              color='#4a154b'
              onClick={() => doAction('slack', () => incidentsApi.shareSlack(incident.id))}
            />
            <ActionButton
              label="📄 Generate Report"
              clicking={actionLoading === 'report'}
              color='#1f6feb'
              onClick={() => doAction('report', () => incidentsApi.generateReport(incident.id))}
            />
            {incident.status === 'open' && (
              <ActionButton
                label="🔍 Mark Investigating"
                clicking={actionLoading === 'inv'}
                color='#d29922'
                onClick={() => doAction('inv', () => incidentsApi.setStatus(incident.id, 'investigating'))}
              />
            )}
            {incident.status !== 'resolved' && (
              <ActionButton
                label="✅ Resolve"
                clicking={actionLoading === 'res'}
                color='#238636'
                onClick={() => doAction('res', () => incidentsApi.setStatus(incident.id, 'resolved'))}
              />
            )}
          </div>
          {incident.githubIssueUrl && (
            <a href={incident.githubIssueUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8, fontSize: 12, color: '#58a6ff' }}>
              View GitHub Issue →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: color + '22', color, border: `1px solid ${color}44` }}>{label}</span>
  );
}

function ActionButton({ label, onClick, clicking, disabled, color }: {
  label: string; onClick: () => void; clicking: boolean; disabled?: boolean; color: string;
}) {
  return (
    <button onClick={onClick} disabled={clicking || disabled} style={{
      padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: (clicking || disabled) ? '#21262d' : color + '33',
      color: (clicking || disabled) ? '#8b949e' : '#e6edf3',
      border: `1px solid ${(clicking || disabled) ? '#30363d' : color + '88'}`,
      cursor: (clicking || disabled) ? 'default' : 'pointer',
    }}>{clicking ? '…' : label}</button>
  );
}
