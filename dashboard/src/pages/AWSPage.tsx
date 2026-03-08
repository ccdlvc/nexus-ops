import React, { useEffect, useState } from 'react';
import { awsApi } from '../services/api';
import {
  AWSEC2Instance, AWSECSCluster, AWSECSService, AWSLambdaFunction, AWSCostSummary,
} from '@shared/types';

const STATE_COLOR: Record<string, string> = {
  running: '#3fb950', stopped: '#f85149', terminated: '#8b949e',
  pending: '#d29922', stopping: '#d29922', 'shutting-down': '#8b949e',
};

export default function AWSPage() {
  const [tab, setTab] = useState<'ec2' | 'ecs' | 'lambda' | 'cost'>('ec2');
  const [ec2, setEc2] = useState<AWSEC2Instance[]>([]);
  const [clusters, setClusters] = useState<AWSECSCluster[]>([]);
  const [lambda, setLambda] = useState<AWSLambdaFunction[]>([]);
  const [cost, setCost] = useState<AWSCostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const loaders: Record<typeof tab, () => Promise<void>> = {
      ec2: () => awsApi.ec2().then(setEc2),
      ecs: () => awsApi.ecsClusters().then(setClusters),
      lambda: () => awsApi.lambda().then(setLambda),
      cost: () => awsApi.cost().then(setCost),
    };
    loaders[tab]()
      .catch(() => setError(`Could not load AWS ${tab.toUpperCase()} data. Check AWS credentials.`))
      .finally(() => setLoading(false));
  }, [tab]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'ec2', label: 'EC2 Instances' },
    { key: 'ecs', label: 'ECS Clusters' },
    { key: 'lambda', label: 'Lambda' },
    { key: 'cost', label: 'Cost' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>AWS</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
          EC2, ECS, Lambda, and cost data from your AWS account
        </p>
      </div>

      {/* Tab bar */}
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

      {!loading && !error && tab === 'ec2' && <EC2Table instances={ec2} />}
      {!loading && !error && tab === 'ecs' && <ECSView clusters={clusters} />}
      {!loading && !error && tab === 'lambda' && <LambdaTable functions={lambda} />}
      {!loading && !error && tab === 'cost' && <CostView summary={cost} />}
    </div>
  );
}

// ─── EC2 ──────────────────────────────────────────────────────────────────────

function EC2Table({ instances }: { instances: AWSEC2Instance[] }) {
  if (instances.length === 0) return <Empty msg="No EC2 instances found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{instances.length} instance{instances.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {instances.map((i) => (
          <div key={i.id} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>☁</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{i.name || i.id}</span>
              {i.name && <span style={{ fontSize: 11, color: '#8b949e' }}>{i.id}</span>}
              <StatChip label={i.state} color={STATE_COLOR[i.state] ?? '#8b949e'} />
              <StatChip label={i.type} color="#58a6ff" />
              <StatChip label={i.region} color="#a371f7" />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#8b949e', flexWrap: 'wrap' }}>
              {i.publicIp && <span>Public: {i.publicIp}</span>}
              {i.privateIp && <span>Private: {i.privateIp}</span>}
              <span>AZ: {i.availabilityZone}</span>
              <span>Launched: {new Date(i.launchTime).toLocaleDateString()}</span>
            </div>
            {Object.keys(i.tags).length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {Object.entries(i.tags).map(([k, v]) => (
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

// ─── ECS ──────────────────────────────────────────────────────────────────────

function ECSView({ clusters }: { clusters: AWSECSCluster[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [services, setServices] = useState<Record<string, AWSECSService[]>>({});
  const [loadingServices, setLoadingServices] = useState<string | null>(null);

  async function toggleCluster(arn: string) {
    if (expanded === arn) { setExpanded(null); return; }
    setExpanded(arn);
    if (!services[arn]) {
      setLoadingServices(arn);
      try {
        const svcs = await awsApi.ecsServices(arn);
        setServices((prev) => ({ ...prev, [arn]: svcs }));
      } catch { /* ignore */ }
      finally { setLoadingServices(null); }
    }
  }

  if (clusters.length === 0) return <Empty msg="No ECS clusters found." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 6 }}>{clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</div>
      {clusters.map((c) => (
        <div key={c.arn} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => toggleCluster(c.arn)}>
            <span style={{ fontSize: 16 }}>🗂</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{c.name}</span>
                <StatChip label={c.status} color={c.status === 'ACTIVE' ? '#3fb950' : '#d29922'} />
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
                <span>Services: {c.activeServiceCount}</span>
                <span>Running tasks: {c.runningTaskCount}</span>
                <span>Pending: {c.pendingTaskCount}</span>
                <span>Instances: {c.registeredContainerInstancesCount}</span>
              </div>
            </div>
            <span style={{ color: '#8b949e', fontSize: 12 }}>{expanded === c.arn ? '▲' : '▼'}</span>
          </div>
          {expanded === c.arn && (
            <div style={{ borderTop: '1px solid #21262d', padding: '12px 16px' }}>
              {loadingServices === c.arn && <div style={{ color: '#8b949e', fontSize: 12 }}>Loading services…</div>}
              {services[c.arn]?.length === 0 && <div style={{ color: '#8b949e', fontSize: 12 }}>No services found.</div>}
              {services[c.arn]?.map((s) => (
                <div key={s.arn} style={{ padding: '8px 0', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, flex: 1, color: '#e6edf3', fontWeight: 500 }}>{s.name}</span>
                  <StatChip label={s.status} color={s.status === 'ACTIVE' ? '#3fb950' : '#d29922'} />
                  {s.launchType && <StatChip label={s.launchType} color="#58a6ff" />}
                  <span style={{ fontSize: 11, color: '#8b949e' }}>
                    {s.runningCount}/{s.desiredCount} running
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Lambda ───────────────────────────────────────────────────────────────────

function LambdaTable({ functions }: { functions: AWSLambdaFunction[] }) {
  if (functions.length === 0) return <Empty msg="No Lambda functions found." />;
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>{functions.length} function{functions.length !== 1 ? 's' : ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {functions.map((f) => (
          <div key={f.arn} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>λ</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>{f.name}</span>
              <StatChip label={f.runtime} color="#58a6ff" />
              {f.state && <StatChip label={f.state} color={f.state === 'Active' ? '#3fb950' : '#d29922'} />}
            </div>
            {f.description && (
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>{f.description}</div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8b949e', flexWrap: 'wrap' }}>
              <span>Memory: {f.memorySize} MB</span>
              <span>Timeout: {f.timeout}s</span>
              <span>Code: {(f.codeSize / 1024).toFixed(0)} KB</span>
              <span>Modified: {new Date(f.lastModified).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cost ─────────────────────────────────────────────────────────────────────

function CostView({ summary }: { summary: AWSCostSummary | null }) {
  if (!summary) return <Empty msg="No cost data available." />;

  const maxAmount = Math.max(...summary.byService.map((s) => s.amount), 0.01);
  const top = [...summary.byService].sort((a, b) => b.amount - a.amount).slice(0, 15);

  return (
    <div>
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Month-to-date total</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#e6edf3', marginTop: 4 }}>
            {summary.currency} {summary.total.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
            {summary.timePeriod.start} → {summary.timePeriod.end}
          </div>
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
