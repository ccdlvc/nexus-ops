import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { useAlerts } from '../hooks/useAlerts';
import { connectorsApi, integrationsApi } from '../services/api';
import { Alert, ContainerHealth, WorkflowRun } from '@shared/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import IncidentCard from '../components/IncidentCard';

export default function Dashboard() {
  const { incidents, loading: incLoading, refresh } = useIncidents({ status: 'open' }, 5);
  const { alerts, acknowledge, resolve } = useAlerts();
  const [containers, setContainers] = useState<ContainerHealth[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [trends, setTrends] = useState<Array<{ timestamp: string; count: number; service: string }>>([]);
  const [integrationStatus, setIntegrationStatus] = useState<Array<{ service: string; status: string }>>([]);

  useEffect(() => {
    connectorsApi.portainerContainers().then(setContainers).catch(() => {});
    connectorsApi.githubRuns(10).then(setRuns).catch(() => {});
    connectorsApi.kibanaTrends(6).then(setTrends).catch(() => {});
    integrationsApi.status().then(setIntegrationStatus).catch(() => {});
  }, []);

  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && !a.acknowledged);
  const unhealthyContainers = containers.filter((c) => c.health === 'unhealthy' || c.memoryPercent > 80);
  const failedRuns = runs.filter((r) => r.conclusion === 'failure');

  // Aggregate error trends for chart
  const chartData = Object.entries(
    trends.reduce((acc: Record<string, number>, t) => {
      const hour = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      acc[hour] = (acc[hour] || 0) + t.count;
      return acc;
    }, {})
  ).map(([time, count]) => ({ time, count }));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', marginBottom: 4 }}>Overview</h1>
        <p style={{ fontSize: 13, color: '#8b949e' }}>Real-time DevOps health across all connected services</p>
      </div>

      {/* Integration Status Bar */}
      {integrationStatus.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {integrationStatus.map((s) => (
            <div key={s.service} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 20, background: '#161b22', border: `1px solid ${s.status === 'ok' ? '#3fb95044' : '#f8514944'}`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.status === 'ok' ? '#3fb950' : '#f85149' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', textTransform: 'capitalize' }}>{s.service}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Open Incidents" value={String(incidents.length)} icon="🚨" color="#f85149" />
        <KpiCard label="Critical Alerts" value={String(criticalAlerts.length)} icon="🔴" color="#da3633" />
        <KpiCard label="Failed Workflows" value={String(failedRuns.length)} icon="❌" color="#d29922" />
        <KpiCard label="Unhealthy Containers" value={String(unhealthyContainers.length)} icon="🐳" color="#f85149" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Main: Incidents + Error Trend */}
        <div>
          {chartData.length > 0 && (
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 12 }}>Error Trend (Last 6h)</h3>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="time" tick={{ fill: '#8b949e', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="count" stroke="#f85149" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>Recent Incidents</h2>
            <Link to="/incidents" style={{ fontSize: 12, color: '#58a6ff', textDecoration: 'none' }}>View all →</Link>
          </div>
          {incLoading && <LoadingState />}
          {!incLoading && incidents.length === 0 && <EmptyState msg="No open incidents. 🎉" />}
          {incidents.map((inc) => <IncidentCard key={inc.id} incident={inc} onUpdate={refresh} />)}
        </div>

        {/* Alert Panel */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3', marginBottom: 12 }}>Active Alerts</h2>
          {alerts.length === 0 && <EmptyState msg="No active alerts." />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.slice(0, 12).map((al) => (
              <AlertRow key={al.id} alert={al} onAck={() => acknowledge(al.id)} onResolve={() => resolve(al.id)} />
            ))}
          </div>

          {/* Container Health */}
          {containers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', marginBottom: 10 }}>Container Health</h3>
              {containers.slice(0, 8).map((c, i) => (
                <ContainerRow key={i} container={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ padding: '16px', background: '#161b22', border: `1px solid ${color}33`, borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function AlertRow({ alert, onAck, onResolve }: { alert: Alert; onAck: () => void; onResolve: () => void }) {
  const color: Record<string, string> = { critical: '#f85149', high: '#d29922', medium: '#58a6ff', low: '#3fb950' };
  const c = color[alert.severity] ?? '#8b949e';
  return (
    <div style={{ padding: '10px 12px', background: '#161b22', border: `1px solid ${c}44`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', flex: 1 }}>{alert.ruleName}</span>
      </div>
      <p style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>{alert.message}</p>
      <div style={{ display: 'flex', gap: 6 }}>
        {!alert.acknowledged && (
          <button onClick={onAck} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#21262d', color: '#e6edf3', border: '1px solid #30363d', cursor: 'pointer' }}>Ack</button>
        )}
        <button onClick={onResolve} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#23863622', color: '#3fb950', border: '1px solid #23863644', cursor: 'pointer' }}>Resolve</button>
      </div>
    </div>
  );
}

function ContainerRow({ container }: { container: ContainerHealth }) {
  const memPct = container.memoryPercent;
  const cpuPct = container.cpuPercent;
  const health = container.health ?? 'none';
  const healthColor = health === 'healthy' ? '#3fb950' : health === 'unhealthy' ? '#f85149' : '#8b949e';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #21262d' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: '#c9d1d9', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{container.name}</span>
      <MiniBar value={memPct} color={memPct > 80 ? '#f85149' : '#58a6ff'} label="M" />
      <MiniBar value={cpuPct} color={cpuPct > 80 ? '#d29922' : '#3fb950'} label="C" />
    </div>
  );
}

function MiniBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: '#8b949e' }}>{label}</span>
      <div style={{ width: 40, height: 5, background: '#21262d', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color, width: 28, textAlign: 'right' }}>{value.toFixed(0)}%</span>
    </div>
  );
}

function LoadingState() { return <div style={{ textAlign: 'center', padding: 24, color: '#8b949e' }}>Loading…</div>; }
function EmptyState({ msg }: { msg: string }) { return <div style={{ textAlign: 'center', padding: 24, color: '#8b949e', fontSize: 13 }}>{msg}</div>; }
