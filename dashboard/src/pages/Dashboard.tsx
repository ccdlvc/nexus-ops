/**
 * @module pages/Dashboard
 * @description Main overview page. Includes a platform health meter (scored 0-100),
 * KPI summary cards, error trend chart, recent incidents, active alerts,
 * and container health. Fully theme-aware.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { useAlerts } from '../hooks/useAlerts';
import { useTheme } from '../context/ThemeContext';
import { connectorsApi, integrationsApi } from '../services/api';
import { Alert, ContainerHealth, WorkflowRun } from '@shared/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import IncidentCard from '../components/IncidentCard';

/* ── Platform Health Score ─────────────────────────────────────────────── */

interface HealthInput {
  incidentCount: number;
  criticalIncidents: number;
  highIncidents: number;
  criticalAlerts: number;
  highAlerts: number;
  failedWorkflows: number;
  unhealthyContainers: number;
  downIntegrations: number;
}

function computeHealth(h: HealthInput): number {
  let score = 100;
  score -= h.criticalIncidents * 15;
  score -= h.highIncidents * 8;
  score -= (h.incidentCount - h.criticalIncidents - h.highIncidents) * 3;
  score -= h.criticalAlerts * 8;
  score -= h.highAlerts * 4;
  score -= h.failedWorkflows * 5;
  score -= h.unhealthyContainers * 6;
  score -= h.downIntegrations * 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function healthLabel(score: number): string {
  if (score >= 90) return 'Operational';
  if (score >= 70) return 'Degraded';
  if (score >= 50) return 'Impaired';
  if (score >= 30) return 'At Risk';
  return 'Outage';
}

function healthColor(score: number): string {
  if (score >= 90) return '#3fb950';
  if (score >= 70) return '#56d364';
  if (score >= 50) return '#d29922';
  if (score >= 30) return '#e87614';
  return '#f85149';
}

/* Semi-circle SVG gauge */
function HealthGauge({ score, trackColor, labelColor }: { score: number; trackColor: string; labelColor: string }) {
  const r = 72;
  const cx = 100, cy = 95;
  // Arc from (cx-r, cy) → (cx+r, cy) via top   → length = π*r
  const arcLen = Math.PI * r;
  const fill = arcLen * (score / 100);
  const color = healthColor(score);
  const label = healthLabel(score);

  return (
    <svg viewBox="0 0 200 110" width={200} height={110} style={{ display: 'block' }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={trackColor} strokeWidth={10} strokeLinecap="round"
      />
      {/* Value arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${fill} ${arcLen}`}
        style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s' }}
      />
      {/* Score */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={36} fontWeight="800" fill={color}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {score}
      </text>
      {/* Label */}
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill={labelColor}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {label}
      </text>
    </svg>
  );
}

/* ── Main Dashboard ─────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { tokens } = useTheme();
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

  const unackedAlerts = alerts.filter((a) => !a.acknowledged);
  const criticalAlerts = unackedAlerts.filter((a) => a.severity === 'critical');
  const highAlerts = unackedAlerts.filter((a) => a.severity === 'high');
  const unhealthyContainers = containers.filter((c) => c.health === 'unhealthy' || c.memoryPercent > 80);
  const failedRuns = runs.filter((r) => r.conclusion === 'failure');
  const downIntegrations = integrationStatus.filter((s) => s.status !== 'ok');

  const criticalIncidents = incidents.filter((i) => (i as any).severity === 'critical');
  const highIncidents = incidents.filter((i) => (i as any).severity === 'high');

  const healthScore = useMemo(() => computeHealth({
    incidentCount: incidents.length,
    criticalIncidents: criticalIncidents.length,
    highIncidents: highIncidents.length,
    criticalAlerts: criticalAlerts.length,
    highAlerts: highAlerts.length,
    failedWorkflows: failedRuns.length,
    unhealthyContainers: unhealthyContainers.length,
    downIntegrations: downIntegrations.length,
  }), [incidents, criticalAlerts, highAlerts, failedRuns, unhealthyContainers, downIntegrations]);

  const scoreColor = healthColor(healthScore);

  // Chart data
  const chartData = Object.entries(
    trends.reduce((acc: Record<string, number>, t) => {
      const hour = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      acc[hour] = (acc[hour] || 0) + t.count;
      return acc;
    }, {})
  ).map(([time, count]) => ({ time, count }));

  /* shared card style */
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: tokens.bgSecondary,
    border: `1px solid ${tokens.border}`,
    borderRadius: 10,
    ...extra,
  });

  const sectionHeader: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: tokens.textPrimary, marginBottom: 12,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Platform Health Meter ──────────────────────────────────────────── */}
      <div style={{ ...card(), padding: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <HealthGauge score={healthScore} trackColor={tokens.border} labelColor={tokens.textSecondary} />
          <span style={{ fontSize: 11, color: tokens.textSecondary, marginTop: 4 }}>
            Platform Health Score
          </span>
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, height: 100, background: tokens.border, flexShrink: 0 }} />

        {/* Status label + factors */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              background: scoreColor + '22', color: scoreColor,
              border: `1px solid ${scoreColor}44`,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: scoreColor }} />
              {healthLabel(healthScore)}
            </span>
            <span style={{ fontSize: 12, color: tokens.textSecondary }}>
              {healthScore >= 90 ? 'All systems operating normally' :
               healthScore >= 70 ? 'Minor issues detected' :
               healthScore >= 50 ? 'Service degradation in progress' :
               healthScore >= 30 ? 'Multiple systems affected' :
               'Critical platform failure — immediate action required'}
            </span>
          </div>

          {/* Factor grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '6px 16px' }}>
            <HealthFactor label="Open Incidents" value={incidents.length} bad={incidents.length > 0} badThreshold={1} tokens={tokens} />
            <HealthFactor label="Critical Alerts" value={criticalAlerts.length} bad={criticalAlerts.length > 0} badThreshold={1} tokens={tokens} />
            <HealthFactor label="Failed Workflows" value={failedRuns.length} bad={failedRuns.length > 0} badThreshold={1} tokens={tokens} />
            <HealthFactor label="Unhealthy Containers" value={unhealthyContainers.length} bad={unhealthyContainers.length > 0} badThreshold={1} tokens={tokens} />
            <HealthFactor label="Down Integrations" value={downIntegrations.length} bad={downIntegrations.length > 0} badThreshold={1} tokens={tokens} />
            <HealthFactor label="Total Containers" value={containers.length} bad={false} tokens={tokens} />
          </div>
        </div>

        {/* Integration status pills — right side */}
        {integrationStatus.length > 0 && (
          <>
            <div style={{ width: 1, height: 100, background: tokens.border, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: tokens.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>
                Integrations
              </span>
              {integrationStatus.map((s) => (
                <div key={s.service} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.status === 'ok' ? tokens.success : tokens.danger, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: tokens.textPrimary, textTransform: 'capitalize' }}>{s.service}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <KpiCard label="Open Incidents"       value={incidents.length}           color={tokens.danger}   tokens={tokens} />
        <KpiCard label="Unacked Alerts"        value={unackedAlerts.length}       color={unackedAlerts.length > 0 ? tokens.danger : tokens.success} tokens={tokens} />
        <KpiCard label="Failed Workflows"      value={failedRuns.length}          color={failedRuns.length > 0 ? tokens.warning : tokens.success} tokens={tokens} />
        <KpiCard label="Unhealthy Containers"  value={unhealthyContainers.length} color={unhealthyContainers.length > 0 ? tokens.danger : tokens.success} tokens={tokens} />
      </div>

      {/* ── Main content grid ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Error trend chart */}
          {chartData.length > 0 && (
            <div style={{ ...card(), padding: 16 }}>
              <h3 style={sectionHeader}>Error Trend — Last 6 h</h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderSubtle} />
                  <XAxis dataKey="time" tick={{ fill: tokens.textSecondary, fontSize: 11 }} />
                  <YAxis tick={{ fill: tokens.textSecondary, fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: tokens.bgSecondary, border: `1px solid ${tokens.border}`, borderRadius: 6, fontSize: 12, color: tokens.textPrimary }} />
                  <Line type="monotone" dataKey="count" stroke={tokens.danger} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent Incidents */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ ...sectionHeader, marginBottom: 0 }}>Recent Incidents</h2>
              <Link to="/incidents" style={{ fontSize: 12, color: tokens.accent, textDecoration: 'none' }}>View all →</Link>
            </div>
            {incLoading && <LoadingState tokens={tokens} />}
            {!incLoading && incidents.length === 0 && <EmptyState msg="No open incidents" tokens={tokens} />}
            {incidents.map((inc) => <IncidentCard key={inc.id} incident={inc} onUpdate={refresh} />)}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Active Alerts */}
          <div style={{ ...card(), padding: 14 }}>
            <h2 style={sectionHeader}>Active Alerts</h2>
            {unackedAlerts.length === 0 && <EmptyState msg="No active alerts" tokens={tokens} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unackedAlerts.slice(0, 10).map((al) => (
                <AlertRow key={al.id} alert={al} onAck={() => acknowledge(al.id)} onResolve={() => resolve(al.id)} tokens={tokens} />
              ))}
            </div>
          </div>

          {/* Container Health */}
          {containers.length > 0 && (
            <div style={{ ...card(), padding: 14 }}>
              <h3 style={sectionHeader}>Container Health</h3>
              <div>
                {containers.slice(0, 8).map((c, i) => (
                  <ContainerRow key={i} container={c} tokens={tokens} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function HealthFactor({ label, value, bad, tokens }: {
  label: string; value: number; bad: boolean; badThreshold?: number; tokens: any;
}) {
  const color = bad ? tokens.danger : tokens.success;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: tokens.textSecondary, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: bad && value > 0 ? color : tokens.textPrimary }}>{value}</span>
    </div>
  );
}

function KpiCard({ label, value, color, tokens }: { label: string; value: number; color: string; tokens: any }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: tokens.bgSecondary,
      border: `1px solid ${color}33`,
      borderRadius: 10,
    }}>
      <div style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function AlertRow({ alert, onAck, onResolve, tokens }: { alert: Alert; onAck: () => void; onResolve: () => void; tokens: any }) {
  const sevColor: Record<string, string> = {
    critical: tokens.danger, high: '#ff7b72', medium: tokens.warning, low: tokens.success,
  };
  const c = sevColor[alert.severity] ?? tokens.textSecondary;
  return (
    <div style={{ padding: '9px 10px', background: tokens.bgTertiary, border: `1px solid ${c}33`, borderRadius: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: tokens.textPrimary, flex: 1 }}>{alert.ruleName}</span>
        <span style={{ fontSize: 10, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{alert.severity}</span>
      </div>
      <p style={{ fontSize: 11, color: tokens.textSecondary, marginBottom: 7, lineHeight: 1.4 }}>{alert.message}</p>
      <div style={{ display: 'flex', gap: 5 }}>
        {!alert.acknowledged && (
          <button onClick={onAck} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tokens.accentMuted, color: tokens.accent, border: `1px solid ${tokens.accent}44`, cursor: 'pointer' }}>Acknowledge</button>
        )}
        <button onClick={onResolve} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tokens.successMuted, color: tokens.success, border: `1px solid ${tokens.success}44`, cursor: 'pointer' }}>Resolve</button>
      </div>
    </div>
  );
}

function ContainerRow({ container, tokens }: { container: ContainerHealth; tokens: any }) {
  const memPct = container.memoryPercent ?? 0;
  const cpuPct = container.cpuPercent ?? 0;
  const health = container.health ?? 'none';
  const healthColor = health === 'healthy' ? tokens.success : health === 'unhealthy' ? tokens.danger : tokens.textMuted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${tokens.borderSubtle}` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: healthColor, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: tokens.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{container.name}</span>
      <MiniBar value={memPct} color={memPct > 80 ? tokens.danger : tokens.accent} label="M" tokens={tokens} />
      <MiniBar value={cpuPct} color={cpuPct > 80 ? tokens.warning : tokens.success} label="C" tokens={tokens} />
    </div>
  );
}

function MiniBar({ value, color, label, tokens }: { value: number; color: string; label: string; tokens: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: tokens.textMuted }}>{label}</span>
      <div style={{ width: 40, height: 4, background: tokens.bgTertiary, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color, width: 28, textAlign: 'right' }}>{value.toFixed(0)}%</span>
    </div>
  );
}

function LoadingState({ tokens }: { tokens: any }) {
  return <div style={{ textAlign: 'center', padding: 24, color: tokens.textSecondary, fontSize: 13 }}>Loading…</div>;
}

function EmptyState({ msg, tokens }: { msg: string; tokens: any }) {
  return <div style={{ textAlign: 'center', padding: 20, color: tokens.textSecondary, fontSize: 13 }}>{msg}</div>;
}
