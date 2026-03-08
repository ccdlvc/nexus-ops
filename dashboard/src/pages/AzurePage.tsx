import React, { useEffect, useState } from 'react';
import { azureApi } from '../services/api';
import { AzureVM, AzureAKSCluster, AzureCostSummary } from '@shared/types';

const POWER_COLOR: Record<string, string> = {
  running: '#3fb950', deallocated: '#f85149', stopped: '#f85149',
  starting: '#d29922', stopping: '#d29922', deallocating: '#d29922',
};

export default function AzurePage() {
  const [tab, setTab] = useState<'vms' | 'aks' | 'cost'>('vms');
  const [vms, setVMs] = useState<AzureVM[]>([]);
  const [aks, setAKS] = useState<AzureAKSCluster[]>([]);
  const [cost, setCost] = useState<AzureCostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const loaders: Record<typeof tab, () => Promise<void>> = {
      vms: () => azureApi.vms().then(setVMs),
      aks: () => azureApi.aks().then(setAKS),
      cost: () => azureApi.cost().then(setCost),
    };
    loaders[tab]()
      .catch(() => setError(`Could not load Azure ${tab.toUpperCase()} data. Check Azure credentials.`))
      .finally(() => setLoading(false));
  }, [tab]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'vms', label: 'Virtual Machines' },
    { key: 'aks', label: 'AKS Clusters' },
    { key: 'cost', label: 'Cost' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>Azure</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
          Virtual Machines, AKS clusters, and cost data from your Azure subscription
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

      {!loading && !error && tab === 'vms' && <VMTable vms={vms} />}
      {!loading && !error && tab === 'aks' && <AKSTable clusters={aks} />}
      {!loading && !error && tab === 'cost' && <CostView summary={cost} />}
    </div>
  );
}

// ─── VMs ──────────────────────────────────────────────────────────────────────

function VMTable({ vms }: { vms: AzureVM[] }) {
  if (vms.length === 0) return <Empty msg="No Azure VMs found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{vms.length} VM{vms.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {vms.map((vm) => {
          const powerState = vm.powerState?.toLowerCase() ?? '';
          return (
            <div key={vm.id} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16 }}>🖥</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{vm.name}</span>
                {vm.powerState && (
                  <StatChip label={vm.powerState} color={POWER_COLOR[powerState] ?? '#8b949e'} />
                )}
                <StatChip label={vm.size} color="#58a6ff" />
                <StatChip label={vm.location} color="#a371f7" />
                {vm.osType && <StatChip label={vm.osType} color="#3fb95066" />}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
                <span>RG: {vm.resourceGroup}</span>
                <span>State: {vm.provisioningState}</span>
              </div>
              {Object.keys(vm.tags).length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  {Object.entries(vm.tags).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, background: '#21262d', color: '#8b949e', padding: '2px 6px', borderRadius: 4 }}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AKS ──────────────────────────────────────────────────────────────────────

function AKSTable({ clusters }: { clusters: AzureAKSCluster[] }) {
  if (clusters.length === 0) return <Empty msg="No AKS clusters found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {clusters.map((c) => (
          <div key={c.id} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>☸</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{c.name}</span>
              <StatChip label={c.provisioningState} color={c.provisioningState === 'Succeeded' ? '#3fb950' : '#d29922'} />
              <StatChip label={c.location} color="#a371f7" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
              <span>K8s: {c.kubernetesVersion}</span>
              <span>Nodes: {c.nodeCount}</span>
              <span>RG: {c.resourceGroup}</span>
              {c.fqdn && <span>FQDN: {c.fqdn}</span>}
            </div>
            {Object.keys(c.tags).length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {Object.entries(c.tags).map(([k, v]) => (
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

// ─── Cost ─────────────────────────────────────────────────────────────────────

function CostView({ summary }: { summary: AzureCostSummary | null }) {
  if (!summary) return <Empty msg="No cost data available. Check AZURE_LOG_ANALYTICS_WORKSPACE_ID and billing permissions." />;

  const maxAmount = Math.max(...summary.byService.map((s) => s.amount), 0.01);
  const top = [...summary.byService].sort((a, b) => b.amount - a.amount).slice(0, 15);

  return (
    <div>
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Month-to-date total</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#e6edf3', marginTop: 4 }}>
          {summary.currency} {summary.total.toFixed(2)}
        </div>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
          {summary.timePeriod.start} → {summary.timePeriod.end}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 10 }}>Cost by service (top {top.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top.map((s) => (
          <div key={s.service} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, flex: 1, color: '#e6edf3', fontWeight: 500 }}>{s.service}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#58a6ff' }}>{s.currency} {s.amount.toFixed(2)}</span>
            </div>
            <div style={{ height: 4, background: '#21262d', borderRadius: 2 }}>
              <div style={{ width: `${(s.amount / maxAmount) * 100}%`, height: '100%', background: '#1f6feb', borderRadius: 2 }} />
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
