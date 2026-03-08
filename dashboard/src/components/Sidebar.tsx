import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';
import { connectorsApi } from '../services/api';

export default function Sidebar() {
  const { alerts, unread } = useAlerts();
  const [buildCount, setBuildCount] = useState<number | null>(null);
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [repoCount, setRepoCount] = useState<number | null>(null);

  useEffect(() => {
    connectorsApi.jenkinsJobs().then((jobs) => setBuildCount(jobs.length)).catch(() => {});
    connectorsApi.portainerListEndpoints().then((eps) => setEndpointCount(eps.length)).catch(() => {});
    connectorsApi.githubListRepos().then((repos) => setRepoCount(repos.length)).catch(() => {});
  }, []);

  const recentAlerts = alerts.slice(0, 5);

  const linkStyle = (isActive: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
    borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 500,
    color: isActive ? '#58a6ff' : '#8b949e',
    background: isActive ? '#1f6feb22' : 'transparent',
    transition: 'all 0.15s',
  });

  return (
    <aside style={{
      width: 220, background: '#161b22', borderRight: '1px solid #30363d',
      padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
    }}>
      <NavLink to="/dashboard" style={({ isActive }) => linkStyle(isActive)}>📊 Dashboard</NavLink>
      <NavLink to="/incidents" style={({ isActive }) => linkStyle(isActive)}>🚨 Incidents</NavLink>
      <NavLink to="/ai" style={({ isActive }) => linkStyle(isActive)}>🤖 AI Assistant</NavLink>
      <NavLink to="/repos" style={({ isActive }) => linkStyle(isActive)}>🐙 GitHub Repos</NavLink>
      <NavLink to="/portainer" style={({ isActive }) => linkStyle(isActive)}>🐳 Portainer</NavLink>
      <NavLink to="/grafana" style={({ isActive }) => linkStyle(isActive)}>📊 Grafana</NavLink>

      <div style={{ marginTop: 8, marginBottom: 4, paddingLeft: 12, fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cloud</div>
      <NavLink to="/aws" style={({ isActive }) => linkStyle(isActive)}>☁ AWS</NavLink>
      <NavLink to="/gcp" style={({ isActive }) => linkStyle(isActive)}>🌐 GCP</NavLink>
      <NavLink to="/azure" style={({ isActive }) => linkStyle(isActive)}>🔷 Azure</NavLink>
      <NavLink to="/cloud-cost" style={({ isActive }) => linkStyle(isActive)}>💰 Cloud Cost</NavLink>

      <NavLink to="/settings" style={({ isActive }) => linkStyle(isActive)}>⚙️ Settings</NavLink>

      <div style={{ marginTop: 16, borderTop: '1px solid #21262d', paddingTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 12 }}>Status</div>
        <SidebarStat icon="🔧" label="Jenkins Jobs" value={buildCount !== null ? String(buildCount) : '…'} />
        <SidebarStat icon="🐙" label="GitHub Repos" value={repoCount !== null ? String(repoCount) : '…'} />
        <SidebarStat icon="🐳" label="PT Endpoints" value={endpointCount !== null ? String(endpointCount) : '…'} />
        <SidebarStat icon="🔔" label="Active Alerts" value={String(unread)} valueColor={unread > 0 ? '#f85149' : '#3fb950'} />
      </div>

      {recentAlerts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 12 }}>Recent Alerts</div>
          {recentAlerts.map((a) => (
            <div key={a.id} style={{ padding: '6px 12px', marginBottom: 2 }}>
              <div style={{ fontSize: 11, color: '#e6edf3', fontWeight: 500 }}>{a.ruleName}</div>
              <div style={{ fontSize: 10, color: '#8b949e' }}>{a.source} · {new Date(a.triggeredAt).toLocaleTimeString()}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function SidebarStat({ icon, label, value, valueColor = '#e6edf3' }: {
  icon: string; label: string; value: string; valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, color: '#8b949e', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: valueColor }}>{value}</span>
    </div>
  );
}
