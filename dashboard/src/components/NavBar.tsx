/**
 * @module components/NavBar
 * @description Top navigation bar with brand, AI quick-query, alert bell, and theme toggle.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts';
import { useTheme } from '../context/ThemeContext';
import { queryApi } from '../services/api';

const SEV_COLOR: Record<string, string> = {
  critical: '#f85149', high: '#ff7b72', medium: '#d29922', low: '#3fb950', info: '#58a6ff',
};

function IconBell({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5A4 4 0 0 0 4 5.5v2L2.5 10h11L12 7.5v-2A4 4 0 0 0 8 1.5z" />
      <path d="M6.5 12a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" /><line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" /><line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3.3" y1="3.3" x2="4.4" y2="4.4" /><line x1="11.6" y1="11.6" x2="12.7" y2="12.7" />
      <line x1="12.7" y1="3.3" x2="11.6" y2="4.4" /><line x1="4.4" y1="11.6" x2="3.3" y2="12.7" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 10A6 6 0 0 1 6 4a6 6 0 1 0 6 6z" />
    </svg>
  );
}

export default function NavBar() {
  const navigate = useNavigate();
  const { theme, tokens, toggle } = useTheme();
  const { unread, alerts, acknowledge, resolve } = useAlerts();
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
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
        padding: '0 20px', height: 56,
        background: tokens.bgSecondary,
        borderBottom: `1px solid ${tokens.border}`,
        flexShrink: 0,
      }}>
        {/* Brand mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6, background: tokens.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <circle cx="7" cy="7" r="2.5" />
              <line x1="7" y1="1" x2="7" y2="3.5" />
              <line x1="7" y1="10.5" x2="7" y2="13" />
              <line x1="1" y1="7" x2="3.5" y2="7" />
              <line x1="10.5" y1="7" x2="13" y2="7" />
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: tokens.textPrimary, letterSpacing: '-0.2px' }}>Nexus Ops</span>
        </div>

        <div style={{ width: 1, height: 22, background: tokens.border, flexShrink: 0 }} />

        {/* Integration badges */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {([['Jenkins','#d4913a'], ['Kibana','#00bfb3'], ['Actions','#2ea043'], ['Portainer','#13bef9']] as const).map(([label, color]) => (
            <span key={label} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: color + '18', color, border: `1px solid ${color}40` }}>{label}</span>
          ))}
        </div>

        {/* AI query */}
        <form onSubmit={handleQuery} style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 540, marginLeft: 'auto' }}>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask AI about your infrastructure…"
            style={{
              flex: 1, padding: '6px 12px', borderRadius: 7,
              border: `1px solid ${tokens.border}`,
              background: tokens.bgTertiary, color: tokens.textPrimary,
              fontSize: 13, outline: 'none',
            }}
          />
          <button type="submit" disabled={loading} style={{
            padding: '6px 14px', borderRadius: 7, background: tokens.accent,
            color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            flexShrink: 0, opacity: loading ? 0.7 : 1,
          }}>{loading ? '…' : 'Ask'}</button>
        </form>

        {/* Theme toggle */}
        <button onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} style={{
          background: tokens.bgTertiary, border: `1px solid ${tokens.border}`,
          borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', color: tokens.textSecondary, flexShrink: 0,
        }}>
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>

        {/* Bell */}
        <div ref={bellRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setBellOpen((o) => !o)} title={`${unread} alert${unread !== 1 ? 's' : ''}`} style={{
            background: unread > 0 ? tokens.dangerMuted : 'transparent',
            border: `1px solid ${unread > 0 ? tokens.danger + '44' : tokens.border}`,
            borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', position: 'relative',
            color: unread > 0 ? tokens.danger : tokens.textSecondary,
          }}>
            <IconBell color="currentColor" />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: tokens.danger, color: '#fff', borderRadius: '50%',
                width: 15, height: 15, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 9, fontWeight: 700,
              }}>{unread > 99 ? '99+' : unread}</span>
            )}
          </button>

          {bellOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340,
              background: tokens.bgSecondary, border: `1px solid ${tokens.border}`,
              borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 200, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>
                  Alerts {unread > 0 && <span style={{ color: tokens.danger }}>({unread})</span>}
                </span>
                <button onClick={() => { setBellOpen(false); navigate('/incidents'); }} style={{ fontSize: 12, color: tokens.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View all →</button>
              </div>

              <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                {activeAlerts.length === 0
                  ? <p style={{ padding: '20px 14px', color: tokens.textSecondary, fontSize: 13, margin: 0, textAlign: 'center' }}>No active alerts</p>
                  : activeAlerts.map((a) => (
                    <div key={a.id} onClick={() => { setBellOpen(false); navigate(`/incidents/inc-${a.id}`); }}
                      style={{ padding: '10px 14px', borderBottom: `1px solid ${tokens.borderSubtle}`, cursor: 'pointer' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = tokens.bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[a.severity] ?? '#8b949e', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary, flex: 1 }}>{a.ruleName}</span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: tokens.bgTertiary, color: tokens.textSecondary }}>{a.source}</span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: tokens.textSecondary, lineHeight: 1.4 }}>{a.message}</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!a.acknowledged && (
                          <button onClick={(e) => { e.stopPropagation(); acknowledge(a.id); }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: tokens.accentMuted, border: `1px solid ${tokens.accent}44`, color: tokens.accent, cursor: 'pointer' }}>Ack</button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); resolve(a.id); }} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: tokens.dangerMuted, border: `1px solid ${tokens.danger}44`, color: tokens.danger, cursor: 'pointer' }}>Resolve</button>
                      </div>
                    </div>
                  ))
                }
              </div>

              {alerts.filter((a) => !a.acknowledged).length > 10 && (
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${tokens.border}`, fontSize: 12, color: tokens.textSecondary, textAlign: 'center' }}>
                  +{alerts.filter((a) => !a.acknowledged).length - 10} more —{' '}
                  <button onClick={() => { setBellOpen(false); navigate('/incidents'); }} style={{ color: tokens.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>view all</button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {answer && (
        <div style={{
          padding: '10px 20px', background: tokens.accentMuted,
          borderBottom: `1px solid ${tokens.accent}33`,
          fontSize: 13, color: tokens.textPrimary, lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ color: tokens.accent, flexShrink: 0 }}>▸</span>
          <span style={{ flex: 1 }}>{answer}</span>
          <button onClick={() => { setAnswer(''); setQuery(''); }} style={{ background: 'none', border: 'none', color: tokens.textSecondary, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>✕</button>
        </div>
      )}
    </>
  );
}
