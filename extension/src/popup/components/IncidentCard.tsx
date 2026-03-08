import React, { useState } from 'react';

interface IncidentCardProps {
  incident: {
    id: string; title: string; summary: string; severity: string;
    status: string; rootCause: string; createdAt: string;
    suggestedFixes: Array<{ title: string; description: string; command?: string; priority: number }>;
    correlations: Array<{ source: string; description: string; confidence: number }>;
    affectedServices: string[];
    githubIssueUrl?: string;
  };
  onCreateIssue: () => void;
  onShareSlack: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950', info: '#8b949e',
};
const SOURCE_ICONS: Record<string, string> = {
  jenkins: '🔧', kibana: '📊', github: '🐙', portainer: '🐳',
};

export default function IncidentCard({ incident, onCreateIssue, onShareSlack }: IncidentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = SEVERITY_COLORS[incident.severity] ?? '#8b949e';

  return (
    <div style={{
      marginBottom: 8, borderRadius: 8, border: `1px solid ${color}44`,
      background: '#161b22', overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', flex: 1 }}>{incident.title}</span>
          <span style={{ fontSize: 9, color, background: color + '22', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
            {incident.severity.toUpperCase()}
          </span>
          <span style={{ fontSize: 9, color: '#8b949e' }}>{expanded ? '▲' : '▼'}</span>
        </div>
        <p style={{ fontSize: 11, color: '#8b949e', lineHeight: 1.4 }}>{incident.summary}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {incident.affectedServices.slice(0, 3).map((s) => (
            <span key={s} style={{ fontSize: 9, color: '#8b949e', background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>{s}</span>
          ))}
          <span style={{ fontSize: 9, color: '#8b949e' }}>{new Date(incident.createdAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #21262d', padding: '10px 12px' }}>
          <Section title="Root Cause">
            <p style={{ fontSize: 11, color: '#c9d1d9', lineHeight: 1.5 }}>{incident.rootCause}</p>
          </Section>

          {incident.correlations.length > 0 && (
            <Section title="Correlated Sources">
              {incident.correlations.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12 }}>{SOURCE_ICONS[c.source] ?? '📌'}</span>
                  <span style={{ fontSize: 11, color: '#8b949e', flex: 1 }}>{c.description}</span>
                  <span style={{ fontSize: 9, color: '#3fb950' }}>{(c.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </Section>
          )}

          {incident.suggestedFixes.length > 0 && (
            <Section title="Suggested Fixes">
              {incident.suggestedFixes.slice(0, 3).map((f, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#58a6ff', marginBottom: 2 }}>{i + 1}. {f.title}</div>
                  <div style={{ fontSize: 10, color: '#8b949e' }}>{f.description.slice(0, 120)}</div>
                  {f.command && (
                    <code style={{ display: 'block', marginTop: 4, padding: '4px 8px', background: '#0d1117', borderRadius: 4, fontSize: 10, color: '#3fb950', fontFamily: 'monospace' }}>
                      {f.command}
                    </code>
                  )}
                </div>
              ))}
            </Section>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <Button label={incident.githubIssueUrl ? '✓ Issue Created' : '🐙 Create Issue'} onClick={onCreateIssue} color="#238636" disabled={!!incident.githubIssueUrl} />
            <Button label="💬 Share to Slack" onClick={onShareSlack} color="#4a154b" />
            {incident.githubIssueUrl && (
              <a href={incident.githubIssueUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: '#58a6ff', textDecoration: 'none', alignSelf: 'center' }}>
                View Issue →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Button({ label, onClick, color, disabled }: { label: string; onClick: () => void; color: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize: 10, padding: '4px 8px', borderRadius: 4, background: disabled ? '#21262d' : color + '33',
      color: disabled ? '#8b949e' : '#e6edf3', border: `1px solid ${disabled ? '#30363d' : color + '88'}`,
      cursor: disabled ? 'default' : 'pointer', fontWeight: 600,
    }}>{label}</button>
  );
}
