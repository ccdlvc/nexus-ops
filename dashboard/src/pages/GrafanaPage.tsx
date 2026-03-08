import React, { useEffect, useState, useCallback } from 'react';
import { grafanaApi } from '../services/api';
import { GrafanaDashboard, GrafanaDashboardDetail, GrafanaDatasource, GrafanaHealth } from '@shared/types';

export default function GrafanaPage() {
  const [health, setHealth] = useState<GrafanaHealth | null>(null);
  const [dashboards, setDashboards] = useState<GrafanaDashboard[]>([]);
  const [datasources, setDatasources] = useState<GrafanaDatasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDash, setSelectedDash] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      grafanaApi.health().catch(() => null),
      grafanaApi.listDashboards().catch(() => [] as GrafanaDashboard[]),
      grafanaApi.listDatasources().catch(() => [] as GrafanaDatasource[]),
    ]).then(([h, d, ds]) => {
      setHealth(h);
      setDashboards(d);
      setDatasources(ds);
      if (!h) setError('Could not reach Grafana. Check GRAFANA_URL and GRAFANA_TOKEN.');
    }).finally(() => setLoading(false));
  }, []);

  const filtered = dashboards.filter((d) =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.tags.some((t) => t.includes(search.toLowerCase()))
  );

  const grafanaBase = (typeof window !== 'undefined' ? (window as unknown as Record<string, string>).ENV_GRAFANA_URL : undefined)
    ?? (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GRAFANA_URL;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>Grafana</h1>
            {health && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: health.database === 'ok' ? '#23863622' : '#f8514922',
                color: health.database === 'ok' ? '#3fb950' : '#f85149',
                border: `1px solid ${health.database === 'ok' ? '#23863644' : '#f8514944'}`,
              }}>
                v{health.version} · {health.database}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
            {dashboards.length} dashboards · {datasources.length} datasources
          </p>
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dashboards…"
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: 12, width: 200, outline: 'none' }}
        />
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#f8514922', border: '1px solid #f8514944', borderRadius: 8, color: '#f85149', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}
      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading Grafana data…</div>}

      {/* Datasources strip */}
      {!loading && datasources.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {datasources.map((ds) => (
            <div key={ds.uid} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              borderRadius: 20, background: '#161b22',
              border: `1px solid ${ds.isDefault ? '#1f6feb44' : '#30363d'}`,
              fontSize: 11, color: ds.isDefault ? '#58a6ff' : '#8b949e',
            }}>
              <span style={{ fontSize: 12 }}>{dsIcon(ds.type)}</span>
              {ds.name}
              {ds.isDefault && <span style={{ fontSize: 9, color: '#8b949e' }}>default</span>}
            </div>
          ))}
        </div>
      )}

      {/* Dashboard grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {filtered.map((dash) => (
          <DashboardCard
            key={dash.uid}
            dash={dash}
            grafanaBase={grafanaBase}
            expanded={selectedDash === dash.uid}
            onToggle={() => setSelectedDash(selectedDash === dash.uid ? null : dash.uid)}
          />
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', color: '#8b949e', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
            No dashboards match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardCard({ dash, grafanaBase, expanded, onToggle }: {
  dash: GrafanaDashboard;
  grafanaBase?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [detail, setDetail] = useState<GrafanaDashboardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (detail || detailLoading) return;
    setDetailLoading(true);
    try {
      const d = await grafanaApi.getDashboard(dash.uid);
      setDetail(d);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }, [dash.uid, detail, detailLoading]);

  const handleToggle = () => {
    if (!expanded) load();
    onToggle();
  };

  const dashUrl = grafanaBase ? `${grafanaBase}${dash.url}` : dash.url;

  return (
    <div style={{ borderRadius: 10, border: '1px solid #30363d', background: '#161b22', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={handleToggle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📊</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <a href={dashUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 13, fontWeight: 700, color: '#58a6ff', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {dash.title}
              </a>
              {dash.starred && <span style={{ fontSize: 12 }}>⭐</span>}
            </div>
            {dash.folderTitle && (
              <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>📁 {dash.folderTitle}</div>
            )}
            {dash.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                {dash.tags.map((t) => (
                  <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#1f6feb22', color: '#58a6ff' }}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <span style={{ color: '#8b949e', fontSize: 12, flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #21262d', padding: '12px 16px' }}>
          {detailLoading && <div style={{ color: '#8b949e', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Loading panels…</div>}
          {!detailLoading && detail && (
            <>
              <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 10 }}>
                {detail.panels.length} panels · schema v{detail.schemaVersion} · v{detail.version}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {detail.panels.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #21262d' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{panelIcon(p.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || '(untitled)'}</div>
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 1 }}>{p.type} · {p.gridPos.w}×{p.gridPos.h}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function dsIcon(type: string): string {
  const icons: Record<string, string> = {
    prometheus: '🔥', loki: '📜', influxdb: '📈', elasticsearch: '🔍',
    mysql: '🐬', postgres: '🐘', tempo: '⏱', jaeger: '🔭',
  };
  return icons[type] ?? '🗄';
}

function panelIcon(type: string): string {
  const icons: Record<string, string> = {
    timeseries: '📈', graph: '📈', gauge: '🎯', stat: '📊',
    table: '📋', bargauge: '📊', piechart: '🥧', logs: '📜',
    alertlist: '🔔', text: '📝', heatmap: '🗺', histogram: '📊',
    nodeGraph: '🕸', traces: '🔭',
  };
  return icons[type] ?? '📊';
}
