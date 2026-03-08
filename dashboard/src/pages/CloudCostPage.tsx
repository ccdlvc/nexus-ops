import React, { useEffect, useState } from 'react';
import { awsApi, azureApi } from '../services/api';
import { AWSCostSummary, AzureCostSummary } from '@shared/types';

interface CloudCost {
  provider: 'AWS' | 'GCP' | 'Azure';
  color: string;
  icon: string;
  total: number;
  currency: string;
  period: string;
  byService: { service: string; amount: number; currency: string }[];
  error?: string;
}

export default function CloudCostPage() {
  const [costs, setCosts] = useState<CloudCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const results: CloudCost[] = [];

    Promise.allSettled([
      awsApi.cost(),
      azureApi.cost(),
    ]).then(([awsResult, azureResult]) => {
      if (awsResult.status === 'fulfilled') {
        const d = awsResult.value as AWSCostSummary;
        results.push({
          provider: 'AWS', color: '#f90', icon: '☁', currency: d.currency,
          total: d.total, period: `${d.timePeriod.start} → ${d.timePeriod.end}`,
          byService: d.byService,
        });
      } else {
        results.push({ provider: 'AWS', color: '#f90', icon: '☁', currency: 'USD', total: 0, period: '—', byService: [], error: 'Not configured or unavailable' });
      }

      if (azureResult.status === 'fulfilled') {
        const d = azureResult.value as AzureCostSummary;
        results.push({
          provider: 'Azure', color: '#0078d4', icon: '🔷', currency: d.currency,
          total: d.total, period: `${d.timePeriod.start} → ${d.timePeriod.end}`,
          byService: d.byService,
        });
      } else {
        results.push({ provider: 'Azure', color: '#0078d4', icon: '🔷', currency: 'USD', total: 0, period: '—', byService: [], error: 'Not configured or unavailable' });
      }

      // GCP does not expose a cost API in this project yet — placeholder
      results.push({ provider: 'GCP', color: '#34a853', icon: '🌐', currency: 'USD', total: 0, period: '—', byService: [], error: 'GCP Cost API not yet integrated' });

      setCosts(results);
      setLoading(false);
    });
  }, []);

  const configured = costs.filter((c) => !c.error);
  const grandTotal = configured.reduce((sum, c) => sum + c.total, 0);
  const maxTotal = Math.max(...costs.map((c) => c.total), 0.01);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', margin: 0 }}>Cloud Cost</h1>
        <p style={{ fontSize: 13, color: '#8b949e', margin: '4px 0 0' }}>
          Month-to-date spend across all configured cloud providers
        </p>
      </div>

      {loading && <div style={{ color: '#8b949e', fontSize: 13 }}>Loading cost data…</div>}

      {!loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {configured.length > 1 && (
              <SummaryCard label="Total cloud spend" value={`USD ${grandTotal.toFixed(2)}`} color="#e6edf3" icon="💰" />
            )}
            {costs.map((c) => (
              <SummaryCard
                key={c.provider}
                label={`${c.icon} ${c.provider}`}
                value={c.error ? 'N/A' : `${c.currency} ${c.total.toFixed(2)}`}
                color={c.error ? '#8b949e' : c.color}
                icon=""
                subtitle={c.error ?? c.period}
              />
            ))}
          </div>

          {/* Provider comparison bars */}
          {configured.length > 0 && (
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Provider Comparison</div>
              {costs.map((c) => (
                <div key={c.provider} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, width: 56, color: '#e6edf3', fontWeight: 600 }}>{c.icon} {c.provider}</span>
                    <div style={{ flex: 1, height: 10, background: '#21262d', borderRadius: 5, overflow: 'hidden' }}>
                      {!c.error && (
                        <div style={{
                          width: `${(c.total / maxTotal) * 100}%`,
                          height: '100%', background: c.color, borderRadius: 5,
                          transition: 'width 0.4s ease',
                        }} />
                      )}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.error ? '#8b949e' : c.color, minWidth: 80, textAlign: 'right' }}>
                      {c.error ? 'N/A' : `${c.currency} ${c.total.toFixed(2)}`}
                    </span>
                  </div>
                  {c.error && (
                    <div style={{ fontSize: 11, color: '#8b949e', paddingLeft: 66 }}>{c.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Per-provider service breakdowns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {costs.filter((c) => c.byService.length > 0).map((c) => {
              const top = [...c.byService].sort((a, b) => b.amount - a.amount).slice(0, 8);
              const maxSvc = Math.max(...top.map((s) => s.amount), 0.01);
              return (
                <div key={c.provider} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.color, marginBottom: 12 }}>{c.icon} {c.provider} — top services</div>
                  {top.map((s) => (
                    <div key={s.service} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b949e', marginBottom: 3 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{s.service}</span>
                        <span style={{ color: '#e6edf3', fontWeight: 600 }}>{s.currency} {s.amount.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 4, background: '#21262d', borderRadius: 2 }}>
                        <div style={{ width: `${(s.amount / maxSvc) * 100}%`, height: '100%', background: c.color, borderRadius: 2, opacity: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, icon, subtitle }: {
  label: string; value: string; color: string; icon: string; subtitle?: string;
}) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '14px 18px', minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {subtitle && <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{subtitle}</div>}
    </div>
  );
}
