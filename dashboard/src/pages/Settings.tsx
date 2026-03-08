import React, { useState, useEffect } from 'react';
import { alertsApi } from '../services/api';
import { AlertRule } from '@shared/types';

export default function Settings() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setLoading(true);
    alertsApi.listRules().then(setRules).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function toggleRule(id: string, enabled: boolean) {
    const updated = await alertsApi.updateRule(id, { enabled });
    setRules((prev) => prev.map((r) => r.id === id ? updated : r));
    setSaved(`Rule "${updated.name}" ${enabled ? 'enabled' : 'disabled'}`);
    setTimeout(() => setSaved(''), 2500);
  }

  async function updateThreshold(id: string, threshold: number) {
    const updated = await alertsApi.updateRule(id, { threshold });
    setRules((prev) => prev.map((r) => r.id === id ? updated : r));
    setSaved(`Threshold updated for "${updated.name}"`);
    setTimeout(() => setSaved(''), 2500);
  }

  const SEV_COLOR: Record<string, string> = {
    critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950', info: '#8b949e',
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 24 }}>Configure alert rules, thresholds, and integrations</p>

      {saved && (
        <div style={{ padding: '10px 16px', background: '#23863622', border: '1px solid #23863644', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#3fb950' }}>
          ✓ {saved}
        </div>
      )}

      {/* Environment Config Hint */}
      <div style={{ marginBottom: 28, padding: 16, background: '#161b22', border: '1px solid #30363d', borderRadius: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>Integration Configuration</h2>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 12 }}>Configure integrations via environment variables in the backend. See <code style={{ background: '#21262d', padding: '1px 5px', borderRadius: 3 }}>.env.example</code> for all options.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: '🔧 Jenkins', keys: ['JENKINS_URL', 'JENKINS_USER', 'JENKINS_TOKEN'] },
            { label: '📊 Kibana', keys: ['KIBANA_URL', 'KIBANA_USER', 'KIBANA_PASSWORD'] },
            { label: '🐙 GitHub', keys: ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO'] },
            { label: '🐳 Portainer', keys: ['PORTAINER_URL', 'PORTAINER_TOKEN'] },
            { label: '🤖 AI', keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] },
            { label: '💬 Slack', keys: ['SLACK_WEBHOOK_URL'] },
          ].map(({ label, keys }) => (
            <div key={label} style={{ padding: '10px 12px', background: '#0d1117', borderRadius: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 6 }}>{label}</div>
              {keys.map((k) => (
                <code key={k} style={{ display: 'block', fontSize: 10, color: '#8b949e' }}>{k}</code>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Alert Rules */}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', marginBottom: 12 }}>Alert Rules</h2>
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading rules…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rules.map((rule) => (
          <div key={rule.id} style={{
            padding: '14px 16px', background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
            opacity: rule.enabled ? 1 : 0.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>{rule.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: (SEV_COLOR[rule.severity] ?? '#8b949e') + '22', color: SEV_COLOR[rule.severity] ?? '#8b949e' }}>
                    {rule.severity.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', padding: '1px 6px', borderRadius: 3 }}>{rule.source}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>{rule.message}</div>
                <div style={{ fontSize: 11, color: '#58a6ff', marginTop: 4 }}>
                  {rule.metric} {rule.condition} {rule.threshold}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="number" defaultValue={rule.threshold} step="0.5"
                    onBlur={(e) => updateThreshold(rule.id, parseFloat(e.target.value))}
                    style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: 12 }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                  <div onClick={() => toggleRule(rule.id, !rule.enabled)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, background: rule.enabled ? '#238636' : '#30363d',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                    }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: rule.enabled ? 18 : 2, transition: 'left 0.2s',
                    }} />
                  </div>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
