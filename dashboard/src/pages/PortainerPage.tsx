import React, { useEffect, useState, useCallback } from 'react';
import { connectorsApi } from '../services/api';
import { PortainerEndpoint, EndpointSummary, ContainerHealth } from '@shared/types';

const STATUS_COLOR: Record<string, string> = {
  running: '#3fb950', exited: '#f85149', paused: '#d29922',
  restarting: '#d29922', stopped: '#8b949e',
};
const HEALTH_COLOR: Record<string, string> = {
  healthy: '#3fb950', unhealthy: '#f85149', starting: '#d29922', none: '#8b949e',
};

export default function PortainerPage() {
  const [endpoints, setEndpoints] = useState<PortainerEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    connectorsApi.portainerListEndpoints()
      .then(setEndpoints)
      .catch(() => setError('Could not fetch Portainer endpoints. Check PORTAINER_URL and PORTAINER_TOKEN.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>Portainer Endpoints</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
          {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''} · click to see containers and stacks
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#f8514922', border: '1px solid #f8514944', borderRadius: 8, color: '#f85149', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading endpoints…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {endpoints.map((ep) => (
          <EndpointRow
            key={ep.id}
            endpoint={ep}
            expanded={expandedId === ep.id}
            onToggle={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
          />
        ))}
        {!loading && endpoints.length === 0 && !error && (
          <div style={{ color: '#8b949e', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
            No Portainer endpoints found.
          </div>
        )}
      </div>
    </div>
  );
}

function EndpointRow({ endpoint, expanded, onToggle }: {
  endpoint: PortainerEndpoint; expanded: boolean; onToggle: () => void;
}) {
  const [summary, setSummary] = useState<EndpointSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'containers' | 'stacks'>('containers');

  const isOnline = endpoint.status === 1;

  const load = useCallback(async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    try {
      const s = await connectorsApi.portainerEndpointSummary(endpoint.id);
      setSummary(s);
    } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  }, [endpoint.id, summary, summaryLoading]);

  const handleToggle = () => {
    if (!expanded) load();
    onToggle();
  };

  const endpointTypeLabel = endpoint.type === 1 ? 'Docker' : endpoint.type === 2 ? 'Agent' : endpoint.type === 3 ? 'Azure ACI' : 'Edge';

  return (
    <div style={{ borderRadius: 10, border: '1px solid #30363d', background: '#161b22', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        onClick={handleToggle}>
        <span style={{ fontSize: 18 }}>🐳</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#e6edf3' }}>{endpoint.name}</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#21262d', color: '#8b949e', border: '1px solid #30363d' }}>
              {endpointTypeLabel}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: isOnline ? '#3fb950' : '#f85149' }}>
              ● {isOnline ? 'online' : 'offline'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {endpoint.url && (
              <span style={{ fontSize: 11, color: '#8b949e' }}>{endpoint.url}</span>
            )}
            {summary && (
              <>
                <MetaStat icon="📦" value={summary.containers.length} label="containers" />
                <MetaStat icon="▶" value={summary.runningCount} label="running" />
                {summary.unhealthyCount > 0 && (
                  <MetaStat icon="⚠" value={summary.unhealthyCount} label="unhealthy" color="#f85149" />
                )}
                {summary.stacks.length > 0 && (
                  <MetaStat icon="📚" value={summary.stacks.length} label="stacks" />
                )}
              </>
            )}
          </div>
        </div>
        <span style={{ color: '#8b949e', fontSize: 12, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid #21262d' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #21262d', padding: '0 16px', gap: 4 }}>
            {(['containers', 'stacks'] as const).map((tab) => {
              const labels = { containers: '🐳 Containers', stacks: '📚 Stacks' };
              const counts: Partial<Record<typeof tab, number>> = {
                containers: summary?.containers.length,
                stacks: summary?.stacks.length,
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

          <div style={{ padding: '16px', maxHeight: 420, overflowY: 'auto' }}>
            {summaryLoading && (
              <div style={{ color: '#8b949e', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Loading…</div>
            )}

            {!summaryLoading && summary && activeTab === 'containers' && (
              summary.containers.length === 0
                ? <Empty msg="No containers found" />
                : summary.containers.map((c) => (
                  <ContainerRow key={c.id} container={c} endpointId={endpoint.id} />
                ))
            )}

            {!summaryLoading && summary && activeTab === 'stacks' && (
              summary.stacks.length === 0
                ? <Empty msg="No stacks found" />
                : summary.stacks.map((s) => (
                  <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14 }}>📚</span>
                    <span style={{ fontSize: 13, color: '#e6edf3', flex: 1 }}>{s.name}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 10,
                      background: s.status === 1 ? '#23863622' : '#21262d',
                      color: s.status === 1 ? '#3fb950' : '#8b949e',
                    }}>
                      {s.status === 1 ? 'active' : 'inactive'}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContainerRow({ container, endpointId }: { container: ContainerHealth; endpointId: number }) {
  const [restarting, setRestarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const statusColor = STATUS_COLOR[container.status ?? 'stopped'] ?? '#8b949e';
  const healthColor = HEALTH_COLOR[container.health ?? 'none'] ?? '#8b949e';

  async function handleRestart() {
    setRestarting(true);
    try { await connectorsApi.portainerRestart(endpointId, container.id); } catch { /* ignore */ }
    finally { setRestarting(false); }
  }

  async function handleStop() {
    setStopping(true);
    try { await connectorsApi.portainerStop(endpointId, container.id); } catch { /* ignore */ }
    finally { setStopping(false); }
  }

  const memMB = Math.round(container.memoryUsage / 1024 / 1024);
  const memLimitMB = Math.round(container.memoryLimit / 1024 / 1024);

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #21262d' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>🐳</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3' }}>{container.name}</span>
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>● {container.status}</span>
            {container.health !== 'none' && (
              <span style={{ fontSize: 10, color: healthColor }}>{container.health}</span>
            )}
            {container.restartCount > 0 && (
              <span style={{ fontSize: 10, color: '#d29922' }}>↺ {container.restartCount} restarts</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {container.image}
          </div>
          {/* Stats bars */}
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            <StatBar label="CPU" value={container.cpuPercent} unit="%" color="#58a6ff" />
            <StatBar label="MEM" value={container.memoryPercent} unit="%" color="#a371f7"
              detail={memLimitMB > 0 ? `${memMB}/${memLimitMB} MB` : undefined} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {container.status === 'running' && (
            <>
              <ActionBtn label="↺ Restart" loading={restarting} onClick={handleRestart} color="#1f6feb44" textColor="#58a6ff" />
              <ActionBtn label="⏹ Stop" loading={stopping} onClick={handleStop} color="#f8514922" textColor="#f85149" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, value, unit, color, detail }: {
  label: string; value: number; unit: string; color: string; detail?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = pct > 80 ? '#f85149' : pct > 60 ? '#d29922' : color;
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8b949e', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: barColor }}>{pct.toFixed(1)}{unit}{detail ? ` · ${detail}` : ''}</span>
      </div>
      <div style={{ height: 4, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function ActionBtn({ label, loading, onClick, color, textColor }: {
  label: string; loading: boolean; onClick: () => void; color: string; textColor: string;
}) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      fontSize: 11, padding: '3px 8px', borderRadius: 4,
      cursor: loading ? 'default' : 'pointer',
      background: color, color: textColor,
      border: `1px solid ${color}`,
      opacity: loading ? 0.6 : 1,
    }}>
      {loading ? '…' : label}
    </button>
  );
}

function MetaStat({ icon, value, label, color = '#8b949e' }: {
  icon: string; value: string | number; label?: string; color?: string;
}) {
  return (
    <span style={{ fontSize: 11, color, display: 'flex', alignItems: 'center', gap: 3 }}>
      {icon} {value}{label ? ` ${label}` : ''}
    </span>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: '#8b949e', textAlign: 'center', padding: '24px 0' }}>{msg}</div>;
}
