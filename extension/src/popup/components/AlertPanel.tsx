import React from 'react';

interface AlertPanelProps {
  alert: {
    id: string; ruleName: string; severity: string; source: string;
    message: string; value: number; threshold: number;
    triggeredAt: string; acknowledged: boolean;
  };
  onAcknowledge: () => void;
  onResolve: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950', info: '#8b949e',
};
const SOURCE_ICONS: Record<string, string> = {
  jenkins: '🔧', kibana: '📊', github: '🐙', portainer: '🐳',
  aws: '☁', gcp: '🌐', azure: '🔷',
};

export default function AlertPanel({ alert, onAcknowledge, onResolve }: AlertPanelProps) {
  const color = SEVERITY_COLORS[alert.severity] ?? '#8b949e';

  return (
    <div style={{
      marginBottom: 6, padding: '8px 10px', borderRadius: 6,
      border: `1px solid ${color}44`, background: '#161b22',
      opacity: alert.acknowledged ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 13 }}>{SOURCE_ICONS[alert.source] ?? '⚠️'}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3', flex: 1 }}>{alert.ruleName}</span>
        <span style={{ fontSize: 9, color, background: color + '22', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
          {alert.severity.toUpperCase()}
        </span>
      </div>
      <p style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>{alert.message}</p>
      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b949e', marginBottom: 6 }}>
        <span>Value: <strong style={{ color: '#e6edf3' }}>{alert.value.toFixed(1)}</strong></span>
        <span>Threshold: <strong style={{ color: '#e6edf3' }}>{alert.threshold}</strong></span>
        <span style={{ marginLeft: 'auto' }}>{new Date(alert.triggeredAt).toLocaleTimeString()}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {!alert.acknowledged && (
          <button onClick={onAcknowledge} style={{
            fontSize: 10, padding: '3px 7px', borderRadius: 4,
            background: '#21262d', color: '#e6edf3',
            border: '1px solid #30363d', cursor: 'pointer',
          }}>Acknowledge</button>
        )}
        <button onClick={onResolve} style={{
          fontSize: 10, padding: '3px 7px', borderRadius: 4,
          background: '#238636' + '33', color: '#3fb950',
          border: '1px solid #23863688', cursor: 'pointer',
        }}>Resolve</button>
      </div>
    </div>
  );
}
