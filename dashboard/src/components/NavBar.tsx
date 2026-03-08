import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';
import { queryApi } from '../services/api';

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149',
  high: '#ff7b72',
  medium: '#d29922',
  low: '#3fb950',
  info: '#58a6ff',
};

export default function NavBar() {
  const navigate = useNavigate();
  const { unread, alerts, acknowledge, resolve } = useAlerts();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bellOpen]);

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await queryApi.ask(query);
      setAnswer(r.answer);
    } catch { setAnswer('Error contacting backend.'); }
    finally { setLoading(false); }
  }

  const activeAlerts = alerts.filter((a) => !a.acknowledged).slice(0, 10);

  return (
    <>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 24px', height: 58, background: '#161b22',
        borderBottom: '1px solid #30363d', flexShrink: 0,
      }}>
        <span style={{ fontSize: 22 }}>🤖</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#e6edf3', whiteSpace: 'nowrap' }}>Nexus Ops</span>
        <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
          {[
            { label: 'Jenkins', color: '#d4913a' },
            { label: 'Kibana', color: '#00bfb3' },
            { label: 'Actions', color: '#2ea043' },
            { label: 'Portainer', color: '#13bef9' },
          ].map(({ label, color }) => (
            <span key={label} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: color + '22', color, border: `1px solid ${color}55` }}>{label}</span>
          ))}
        </div>

        <form onSubmit={handleQuery} style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 600, marginLeft: 'auto' }}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder='Ask AI: "Show failed builds last week" or "Why is memory spiking?"'
            style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3', fontSize: 13, outline: 'none' }}
          />
          <button type="submit" disabled={loading} style={{
            padding: '7px 16px', borderRadius: 8, background: '#1f6feb', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>{loading ? '...' : 'Ask'}</button>
        </form>

        {/* Bell with notification dropdown */}
        <div ref={bellRef} style={{ position: 'relative', marginLeft: 12 }}>
          <button
            onClick={() => setBellOpen((o) => !o)}
            title={`${unread} unacknowledged alert${unread !== 1 ? 's' : ''}`}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, display: 'flex', alignItems: 'center', position: 'relative',
              color: unread > 0 ? '#e6edf3' : '#8b949e',
            }}
          >
            <span style={{ fontSize: 20 }}>🔔</span>
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 0, right: 0, background: '#da3633',
                color: '#fff', borderRadius: '50%', width: 16, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, pointerEvents: 'none',
              }}>{unread > 99 ? '99+' : unread}</span>
            )}
          </button>

          {bellOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340,
              background: '#161b22', border: '1px solid #30363d', borderRadius: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid #30363d',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>
                  Alerts {unread > 0 && <span style={{ color: '#da3633' }}>({unread} unread)</span>}
                </span>
                <button onClick={() => { setBellOpen(false); navigate('/incidents'); }}
                  style={{ fontSize: 12, color: '#58a6ff', textDecoration: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  View all →
                </button>
              </div>

              {/* Alert list */}
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {activeAlerts.length === 0 ? (
                  <p style={{ padding: '20px 14px', color: '#8b949e', fontSize: 13, margin: 0, textAlign: 'center' }}>
                    ✓ No active alerts
                  </p>
                ) : (
                  activeAlerts.map((a) => (
                    <div key={a.id}
                      onClick={() => { setBellOpen(false); navigate(`/incidents/inc-${a.id}`); }}
                      style={{
                        padding: '10px 14px', borderBottom: '1px solid #21262d',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2937')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: SEV_COLOR[a.severity] ?? '#8b949e', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', flex: 1 }}>{a.ruleName}</span>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 4,
                          background: '#21262d', color: '#8b949e',
                        }}>{a.source}</span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8b949e', lineHeight: 1.4 }}>
                        {a.message}
                      </p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!a.acknowledged && (
                          <button onClick={(e) => { e.stopPropagation(); acknowledge(a.id); }} style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4,
                            background: '#1f6feb22', border: '1px solid #1f6feb55',
                            color: '#58a6ff', cursor: 'pointer',
                          }}>Ack</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); resolve(a.id); }} style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 4,
                          background: '#da363322', border: '1px solid #da363355',
                          color: '#f85149', cursor: 'pointer',
                        }}>Resolve</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer: overflow hint */}
              {alerts.filter((a) => !a.acknowledged).length > 10 && (
                <div style={{
                  padding: '8px 14px', borderTop: '1px solid #30363d',
                  fontSize: 12, color: '#8b949e', textAlign: 'center',
                }}>
                  +{alerts.filter((a) => !a.acknowledged).length - 10} more —{' '}
                  <button onClick={() => { setBellOpen(false); navigate('/incidents'); }}
                    style={{ color: '#58a6ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>view all</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {answer && (
        <div style={{
          padding: '10px 24px', background: '#1f6feb22', borderBottom: '1px solid #1f6feb44',
          fontSize: 13, color: '#c9d1d9', lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span>🤖</span>
          <span style={{ flex: 1 }}>{answer}</span>
          <button onClick={() => { setAnswer(''); setQuery(''); }} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
      )}
    </>
  );
}
