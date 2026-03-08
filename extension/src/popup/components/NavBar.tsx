import React from 'react';

export default function NavBar() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px',
      background: '#161b22', borderBottom: '1px solid #21262d',
    }}>
      <span style={{ fontSize: 18 }}>🤖</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#e6edf3' }}>Nexus Ops</span>
      <div style={{ flex: 1 }} />
      {[
        { label: 'Jenkins', color: '#d4913a' },
        { label: 'Kibana', color: '#00bfb3' },
        { label: 'Actions', color: '#2ea043' },
        { label: 'Portainer', color: '#13bef9' },
      ].map(({ label, color }) => (
        <span key={label} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 5px',
          borderRadius: 4, background: color + '22', color, border: `1px solid ${color}55`,
        }}>{label}</span>
      ))}
    </div>
  );
}
