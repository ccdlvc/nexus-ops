import React, { useState, useEffect } from 'react';
import NavBar from './components/NavBar';
import IncidentCard from './components/IncidentCard';
import AlertPanel from './components/AlertPanel';
import QueryInput from './components/QueryInput';

const API_URL = 'http://localhost:4000';

type Tab = 'incidents' | 'alerts' | 'query' | 'cloud';

interface Incident {
  id: string; title: string; summary: string; severity: string;
  status: string; rootCause: string; createdAt: string;
  suggestedFixes: Array<{ title: string; description: string; command?: string; priority: number }>;
  correlations: Array<{ source: string; description: string; confidence: number }>;
  affectedServices: string[];
  githubIssueUrl?: string;
}
interface Alert {
  id: string; ruleName: string; severity: string; source: string;
  message: string; value: number; threshold: number; triggeredAt: string; acknowledged: boolean;
}
interface CostSummary {
  total: number;
  currency: string;
  provider: string;
  error?: string;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('incidents');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [cloudCosts, setCloudCosts] = useState<CostSummary[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiUrl, setApiUrl] = useState(API_URL);

  useEffect(() => {
    chrome.storage.local.get(['apiUrl'], (result) => {
      if (result.apiUrl) setApiUrl(result.apiUrl);
    });
  }, []);

  useEffect(() => { fetchData(); }, [tab, apiUrl]);

  async function fetchData() {
    setLoading(true);
    try {
      if (tab === 'incidents') {
        const r = await fetch(`${apiUrl}/api/incidents?limit=10`);
        const j = await r.json();
        setIncidents(j.data?.items ?? []);
      } else if (tab === 'alerts') {
        const r = await fetch(`${apiUrl}/api/alerts?limit=20`);
        const j = await r.json();
        setAlerts(j.data ?? []);
      } else if (tab === 'cloud') {
        fetchCloudCosts();
      }
    } catch { /* network error */ }
    finally { setLoading(false); }
  }

  async function fetchCloudCosts() {
    setCloudLoading(true);
    const results: CostSummary[] = [];
    await Promise.allSettled([
      fetch(`${apiUrl}/api/connectors/aws/cost`).then((r) => r.json()).then((j) => {
        if (j.success) results.push({ provider: 'AWS', total: j.data.total, currency: j.data.currency });
        else results.push({ provider: 'AWS', total: 0, currency: 'USD', error: 'Not configured' });
      }),
      fetch(`${apiUrl}/api/connectors/azure/cost`).then((r) => r.json()).then((j) => {
        if (j.success) results.push({ provider: 'Azure', total: j.data.total, currency: j.data.currency });
        else results.push({ provider: 'Azure', total: 0, currency: 'USD', error: 'Not configured' });
      }),
    ]);
    results.push({ provider: 'GCP', total: 0, currency: 'USD', error: 'Cost API not integrated' });
    setCloudCosts(results);
    setCloudLoading(false);
  }

  async function handleCreateGhIssue(id: string) {
    await fetch(`${apiUrl}/api/incidents/${id}/github-issue`, { method: 'POST' });
    fetchData();
  }

  async function handleSlack(id: string) {
    await fetch(`${apiUrl}/api/incidents/${id}/slack`, { method: 'POST' });
  }

  async function handleAck(id: string) {
    await fetch(`${apiUrl}/api/alerts/${id}/acknowledge`, { method: 'PATCH' });
    fetchData();
  }

  async function handleResolveAlert(id: string) {
    await fetch(`${apiUrl}/api/alerts/${id}/resolve`, { method: 'PATCH' });
    fetchData();
  }

  const unacknowledgedAlerts = alerts.filter((a) => !a.acknowledged);
  const cloudAlerts = alerts.filter((a) => ['aws', 'gcp', 'azure'].includes(a.source));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '560px', background: '#0d1117', color: '#e6edf3' }}>
      <NavBar />
      <div style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#161b22' }}>
        {(['incidents', 'alerts', 'cloud', 'query'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '10px 4px', background: tab === t ? '#0d1117' : 'transparent',
            color: tab === t ? '#58a6ff' : '#8b949e', border: 'none',
            borderBottom: tab === t ? '2px solid #58a6ff' : '2px solid transparent',
            cursor: 'pointer', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
          }}>
            {t === 'cloud' ? '☁ Cloud' : t}
            {t === 'alerts' && unacknowledgedAlerts.length > 0
              ? <span style={{ marginLeft: 4, background: '#da3633', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{unacknowledgedAlerts.length}</span>
              : null}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 20, color: '#8b949e', fontSize: 13 }}>Loading…</div>}

        {!loading && tab === 'incidents' && (
          incidents.length === 0
            ? <EmptyState msg="No incidents. Everything looks good!" />
            : incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc}
                onCreateIssue={() => handleCreateGhIssue(inc.id)}
                onShareSlack={() => handleSlack(inc.id)} />
            ))
        )}

        {!loading && tab === 'alerts' && (
          alerts.length === 0
            ? <EmptyState msg="No active alerts." />
            : alerts.map((al) => (
              <AlertPanel key={al.id} alert={al}
                onAcknowledge={() => handleAck(al.id)}
                onResolve={() => handleResolveAlert(al.id)} />
            ))
        )}

        {tab === 'cloud' && <CloudPanel costs={cloudCosts} loading={cloudLoading} cloudAlerts={cloudAlerts} />}

        {tab === 'query' && <QueryInput apiUrl={apiUrl} />}
      </div>

      <div style={{ padding: '6px 12px', borderTop: '1px solid #21262d', background: '#161b22', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#8b949e' }}>Nexus Ops</span>
        <button onClick={fetchData} style={{ fontSize: 10, color: '#58a6ff', background: 'none', border: 'none', cursor: 'pointer' }}>Refresh</button>
      </div>
    </div>
  );
}

function CloudPanel({ costs, loading, cloudAlerts }: { costs: CostSummary[]; loading: boolean; cloudAlerts: Alert[] }) {
  const PROVIDER_ICONS: Record<string, string> = { AWS: '☁', GCP: '🌐', Azure: '🔷' };
  const PROVIDER_COLORS: Record<string, string> = { AWS: '#f90', GCP: '#34a853', Azure: '#0078d4' };
  const grandTotal = costs.filter((c) => !c.error).reduce((s, c) => s + c.total, 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 20, color: '#8b949e', fontSize: 13 }}>Loading cloud data…</div>;

  return (
    <div>
      {/* Cost summary */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Month-to-date cost</div>
        {grandTotal > 0 && (
          <div style={{ fontSize: 18, fontWeight: 800, color: '#e6edf3', marginBottom: 8 }}>
            USD {grandTotal.toFixed(2)}
          </div>
        )}
        {costs.map((c) => (
          <div key={c.provider} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #21262d' }}>
            <span style={{ fontSize: 13 }}>{PROVIDER_ICONS[c.provider]}</span>
            <span style={{ fontSize: 12, flex: 1, color: '#e6edf3' }}>{c.provider}</span>
            {c.error
              ? <span style={{ fontSize: 10, color: '#8b949e' }}>{c.error}</span>
              : <span style={{ fontSize: 13, fontWeight: 700, color: PROVIDER_COLORS[c.provider] }}>
                  {c.currency} {c.total.toFixed(2)}
                </span>
            }
          </div>
        ))}
      </div>

      {/* Cloud alerts */}
      {cloudAlerts.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Cloud Alerts ({cloudAlerts.length})
          </div>
          {cloudAlerts.map((a) => (
            <div key={a.id} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 5, background: '#161b22', border: '1px solid #30363d' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3' }}>{a.ruleName}</div>
              <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>{a.source.toUpperCase()} · {a.message}</div>
            </div>
          ))}
        </div>
      )}

      {costs.length === 0 && cloudAlerts.length === 0 && (
        <EmptyState msg="No cloud data. Configure AWS or Azure credentials." />
      )}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div style={{ textAlign: 'center', padding: 40, color: '#8b949e', fontSize: 13 }}>{msg}</div>;
}
