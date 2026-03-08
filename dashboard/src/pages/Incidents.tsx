import React, { useState } from 'react';
import { useIncidents } from '../hooks/useIncidents';
import IncidentCard from '../components/IncidentCard';

const STATUSES = ['all', 'open', 'investigating', 'resolved', 'suppressed'];
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low', 'info'];

export default function Incidents() {
  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('all');
  const { incidents, total, loading, refresh } = useIncidents({
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
  }, 20);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e6edf3', marginBottom: 4 }}>Incidents</h1>
          <p style={{ fontSize: 13, color: '#8b949e' }}>{total} incident{total !== 1 ? 's' : ''} total</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={refresh} style={{
            padding: '7px 14px', borderRadius: 6, background: '#21262d', color: '#e6edf3',
            border: '1px solid #30363d', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterGroup label="Status" options={STATUSES} selected={status} onSelect={setStatus} />
        <FilterGroup label="Severity" options={SEVERITIES} selected={severity} onSelect={setSeverity} />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>Loading incidents…</div>}
      {!loading && incidents.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>No incidents found</div>
          <div style={{ fontSize: 13 }}>Adjust filters or wait for new incidents to be detected</div>
        </div>
      )}
      {incidents.map((inc) => <IncidentCard key={inc.id} incident={inc} onUpdate={refresh} />)}
    </div>
  );
}

function FilterGroup({ label, options, selected, onSelect }: {
  label: string; options: string[]; selected: string; onSelect: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 600 }}>{label}:</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map((opt) => (
          <button key={opt} onClick={() => onSelect(opt)} style={{
            padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: selected === opt ? '#1f6feb' : '#21262d',
            color: selected === opt ? '#fff' : '#8b949e',
            fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
          }}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
