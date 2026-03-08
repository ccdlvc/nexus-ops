import React, { useEffect, useState } from 'react';
import { gcpApi } from '../services/api';
import { GCPInstance, GKECluster, CloudRunService } from '@shared/types';

const STATUS_COLOR: Record<string, string> = {
  RUNNING: '#3fb950', TERMINATED: '#f85149', STOPPING: '#d29922',
  STAGING: '#d29922', PROVISIONING: '#d29922', SUSPENDED: '#8b949e', SUSPENDING: '#8b949e',
};

export default function GCPPage() {
  const [tab, setTab] = useState<'compute' | 'gke' | 'run'>('compute');
  const [instances, setInstances] = useState<GCPInstance[]>([]);
  const [clusters, setClusters] = useState<GKECluster[]>([]);
  const [services, setServices] = useState<CloudRunService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const loaders: Record<typeof tab, () => Promise<void>> = {
      compute: () => gcpApi.compute().then(setInstances),
      gke: () => gcpApi.gke().then(setClusters),
      run: () => gcpApi.run().then(setServices),
    };
    loaders[tab]()
      .catch(() => setError(`Could not load GCP ${tab} data. Check GCP credentials.`))
      .finally(() => setLoading(false));
  }, [tab]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'compute', label: 'Compute Engine' },
    { key: 'gke', label: 'GKE Clusters' },
    { key: 'run', label: 'Cloud Run' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>GCP</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
          Compute Engine, GKE, and Cloud Run services from your GCP project
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #21262d' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? '#58a6ff' : '#8b949e',
            background: 'transparent', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.key ? '2px solid #58a6ff' : '2px solid transparent',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner msg={error} />}
      {loading && <Loading />}

      {!loading && !error && tab === 'compute' && <ComputeTable instances={instances} />}
      {!loading && !error && tab === 'gke' && <GKETable clusters={clusters} />}
      {!loading && !error && tab === 'run' && <CloudRunTable services={services} />}
    </div>
  );
}

// ─── Compute ──────────────────────────────────────────────────────────────────

function ComputeTable({ instances }: { instances: GCPInstance[] }) {
  if (instances.length === 0) return <Empty msg="No Compute Engine instances found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{instances.length} instance{instances.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {instances.map((i) => (
          <div key={i.id} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>☁</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{i.name}</span>
              <StatChip label={i.status} color={STATUS_COLOR[i.status] ?? '#8b949e'} />
              <StatChip label={i.machineType.split('/').pop() ?? i.machineType} color="#58a6ff" />
              <StatChip label={i.zone.split('/').pop() ?? i.zone} color="#a371f7" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
              {i.networkIp && <span>Internal IP: {i.networkIp}</span>}
              {i.publicIp && <span>External IP: {i.publicIp}</span>}
              <span>Created: {new Date(i.creationTimestamp).toLocaleDateString()}</span>
            </div>
            {Object.keys(i.labels).length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {Object.entries(i.labels).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 10, background: '#21262d', color: '#8b949e', padding: '2px 6px', borderRadius: 4 }}>
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GKE ──────────────────────────────────────────────────────────────────────

function GKETable({ clusters }: { clusters: GKECluster[] }) {
  if (clusters.length === 0) return <Empty msg="No GKE clusters found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {clusters.map((c) => (
          <div key={c.name} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>☸</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{c.name}</span>
              <StatChip label={c.status} color={c.status === 'RUNNING' ? '#3fb950' : '#d29922'} />
              <StatChip label={c.location} color="#a371f7" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
              <span>K8s: {c.currentMasterVersion}</span>
              <span>Nodes: {c.currentNodeCount}</span>
              <span>Node pools: {c.nodePoolCount}</span>
              {c.endpoint && <span>Endpoint: {c.endpoint}</span>}
              <span>Created: {new Date(c.createTime).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cloud Run ────────────────────────────────────────────────────────────────

function CloudRunTable({ services }: { services: CloudRunService[] }) {
  if (services.length === 0) return <Empty msg="No Cloud Run services found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{services.length} service{services.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {services.map((s) => (
          <div key={s.name} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>▶</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{s.name.split('/').pop() ?? s.name}</span>
              <StatChip label={s.status} color={s.status === 'Ready' ? '#3fb950' : '#d29922'} />
              <StatChip label={s.region} color="#a371f7" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#58a6ff' }}>{s.url}</a>
              )}
              {s.latestReadyRevision && <span>Ready revision: {s.latestReadyRevision.split('/').pop()}</span>}
              {s.latestCreatedRevision && (
                <span>Latest: {s.latestCreatedRevision.split('/').pop()}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '12px 16px', background: '#f8514922', border: '1px solid #f8514944', borderRadius: 8, color: '#f85149', fontSize: 13, marginBottom: 16 }}>
      {msg}
    </div>
  );
}

function Loading() {
  return <div style={{ color: '#8b949e', fontSize: 13 }}>Loading…</div>;
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ fontSize: 13, color: '#8b949e', textAlign: 'center', padding: '48px 0' }}>{msg}</div>;
}
