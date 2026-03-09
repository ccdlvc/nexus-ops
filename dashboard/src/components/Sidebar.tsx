/**
 * @module components/Sidebar
 * @description Left navigation sidebar with route links grouped by segment,
 * live status stats, and a recent-alerts mini-feed.
 */
import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';
import { useTheme } from '../context/ThemeContext';
import { connectorsApi } from '../services/api';

/* ── minimal inline SVG icons ─────────────────────────────────────────── */
const Icons = {
  dashboard:   () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
  incidents:   () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2L14 13H2L8 2z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.5" fill="currentColor"/></svg>,
  ai:          () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="5"/><path d="M5.5 8h5M8 5.5v5"/></svg>,
  repos:       () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 3v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6l-4-4H3a1 1 0 0 0-1 1z"/><polyline points="10,2 10,6 14,6"/></svg>,
  portainer:   () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><line x1="5" y1="9" x2="11" y2="9"/></svg>,
  grafana:     () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="2,12 6,7 9,10 14,4"/></svg>,
  aws:         () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10c-1-1-1-3 0-4a3 3 0 0 1 3-3 4 4 0 0 1 8 2c1 0 2 1 2 2s-1 2-2 2H3z"/></svg>,
  gcp:         () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10c-1-1-1-3 0-4a3 3 0 0 1 3-3 4 4 0 0 1 8 2c1 0 2 1 2 2s-1 2-2 2H3z"/></svg>,
  azure:       () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 10c-1-1-1-3 0-4a3 3 0 0 1 3-3 4 4 0 0 1 8 2c1 0 2 1 2 2s-1 2-2 2H3z"/></svg>,
  cost:        () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v1.5a1.5 1.5 0 0 0 0 3 1.5 1.5 0 0 1 0 3V14"/><line x1="8" y1="5" x2="8" y2="4"/></svg>,
  settings:    () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="2"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.9 3.9l.7.7M11.4 11.4l.7.7M11.4 4.6l-.7.7M4.6 11.4l-.7.7"/></svg>,
};

type NavItem = { to: string; label: string; Icon: () => JSX.Element };
type Section = { title: string; items: NavItem[] };

const NAV_SECTIONS: Section[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard',   Icon: Icons.dashboard },
      { to: '/incidents', label: 'Incidents',    Icon: Icons.incidents },
      { to: '/ai',        label: 'AI Assistant', Icon: Icons.ai },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { to: '/repos',     label: 'GitHub Repos', Icon: Icons.repos },
      { to: '/portainer', label: 'Portainer',    Icon: Icons.portainer },
      { to: '/grafana',   label: 'Grafana',      Icon: Icons.grafana },
    ],
  },
  {
    title: 'Cloud',
    items: [
      { to: '/aws',        label: 'AWS',        Icon: Icons.aws },
      { to: '/gcp',        label: 'GCP',        Icon: Icons.gcp },
      { to: '/azure',      label: 'Azure',      Icon: Icons.azure },
      { to: '/cloud-cost', label: 'Cloud Cost', Icon: Icons.cost },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', Icon: Icons.settings },
    ],
  },
];

export default function Sidebar() {
  const { tokens } = useTheme();
  const { alerts, unread } = useAlerts();
  const [buildCount, setBuildCount] = useState<number | null>(null);
  const [endpointCount, setEndpointCount] = useState<number | null>(null);
  const [repoCount, setRepoCount] = useState<number | null>(null);

  useEffect(() => {
    connectorsApi.jenkinsJobs().then((jobs) => setBuildCount(jobs.length)).catch(() => {});
    connectorsApi.portainerListEndpoints().then((eps) => setEndpointCount(eps.length)).catch(() => {});
    connectorsApi.githubListRepos().then((repos) => setRepoCount(repos.length)).catch(() => {});
  }, []);

  const recentAlerts = alerts.slice(0, 3);

  const linkBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
    borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 500,
    transition: 'background 0.12s, color 0.12s',
  };

  return (
    <aside style={{
      width: 216, background: tokens.bgSecondary,
      borderRight: `1px solid ${tokens.border}`,
      padding: '12px 8px', display: 'flex', flexDirection: 'column',
      gap: 0, flexShrink: 0, overflowY: 'auto',
    }}>
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.title} style={{ marginBottom: si < NAV_SECTIONS.length - 1 ? 4 : 0 }}>
          {/* Section label */}
          <div style={{
            padding: '8px 10px 4px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.6px',
            color: tokens.textMuted, textTransform: 'uppercase',
          }}>
            {section.title}
          </div>

          {/* Nav links */}
          {section.items.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              ...linkBase,
              color: isActive ? tokens.accent : tokens.textSecondary,
              background: isActive ? tokens.accentMuted : 'transparent',
            })}
            onMouseEnter={(e) => { if (!(e.currentTarget as HTMLAnchorElement).classList.contains('active')) e.currentTarget.style.background = tokens.bgHover; }}
            onMouseLeave={(e) => { if (!(e.currentTarget as HTMLAnchorElement).classList.contains('active')) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon />
              {label}
            </NavLink>
          ))}

          {/* Section divider (between sections, not after last) */}
          {si < NAV_SECTIONS.length - 1 && (
            <div style={{ margin: '8px 10px 4px', height: 1, background: tokens.borderSubtle }} />
          )}
        </div>
      ))}

      {/* Live stats */}
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${tokens.borderSubtle}` }}>
        <div style={{ padding: '6px 10px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: tokens.textMuted, textTransform: 'uppercase' }}>
          Live Status
        </div>
        {[
          { label: 'Jenkins Jobs', value: buildCount, color: '' },
          { label: 'GitHub Repos', value: repoCount, color: '' },
          { label: 'Endpoints',    value: endpointCount, color: '' },
          { label: 'Active Alerts', value: unread, color: unread > 0 ? tokens.danger : tokens.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', padding: '5px 10px' }}>
            <span style={{ fontSize: 12, color: tokens.textSecondary, flex: 1 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: color || tokens.textPrimary }}>
              {value !== null && value !== undefined ? String(value) : '–'}
            </span>
          </div>
        ))}
      </div>

      {/* Recent alerts mini-feed */}
      {recentAlerts.length > 0 && (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${tokens.borderSubtle}` }}>
          <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: tokens.textMuted, textTransform: 'uppercase' }}>
            Recent Alerts
          </div>
          {recentAlerts.map((a) => (
            <div key={a.id} style={{ padding: '5px 10px' }}>
              <div style={{ fontSize: 12, color: tokens.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ruleName}</div>
              <div style={{ fontSize: 11, color: tokens.textMuted }}>{a.source} · {new Date(a.triggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
