/**
 * @module pages/AIAssistantPage
 * @description Natural language AI DevOps assistant page.
 *
 * Lets users type free-form questions about their infrastructure. Queries
 * the configured data sources (Portainer, GitHub, Jenkins, Kibana, AWS,
 * GCP, Azure) in parallel and feeds the results to the AI provider for
 * analysis. Shows a chat-style history with:
 *   - AI answer text
 *   - Per-source availability badges (green = data returned, grey = unavailable)
 *   - Processing time
 *   - Clickable suggested follow-up questions
 *
 * Submit with the button or Ctrl+Enter / Cmd+Enter.
 */
import React, { useState, useRef, useEffect } from 'react';
import { queryApi } from '../services/api';
import { QueryResponse, DataSource } from '@shared/types';

const ALL_SOURCES: { key: DataSource; label: string; icon: string }[] = [
  { key: 'portainer', label: 'Portainer', icon: '🐳' },
  { key: 'github',    label: 'GitHub',    icon: '🐙' },
  { key: 'jenkins',   label: 'Jenkins',   icon: '🔧' },
  { key: 'kibana',    label: 'Kibana',    icon: '📋' },
  { key: 'aws',       label: 'AWS',       icon: '☁' },
  { key: 'gcp',       label: 'GCP',       icon: '🌐' },
  { key: 'azure',     label: 'Azure',     icon: '🔷' },
];

interface HistoryEntry {
  id: string;
  query: string;
  response: QueryResponse;
  timestamp: string;
}

const EXAMPLE_PROMPTS = [
  'Which containers are using the most memory?',
  'What failed in the last 24 hours?',
  'Are there any unhealthy services right now?',
  'Show me recent deployment issues on GitHub',
  'What is my cloud cost this month?',
];

export default function AIAssistantPage() {
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<DataSource[]>(['portainer', 'github']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (history.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const toggleSource = (src: DataSource) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    );
  };

  const submit = async (override?: string) => {
    const text = (override ?? query).trim();
    if (!text || loading || selectedSources.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await queryApi.ask(text, selectedSources);
      setHistory((prev) => [...prev, {
        id: `${Date.now()}`,
        query: text,
        response,
        timestamp: new Date().toISOString(),
      }]);
      setQuery('');
    } catch (err) {
      setError((err as Error).message ?? 'AI query failed');
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
  };

  const card: React.CSSProperties = {
    background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ color: '#e6edf3', marginBottom: 4, fontSize: 20 }}>🤖 AI DevOps Assistant</h2>
      <p style={{ color: '#8b949e', marginBottom: 24, fontSize: 13, margin: '0 0 24px' }}>
        Ask anything about your infrastructure. The AI queries your connected services in real time.
      </p>

      {/* ── Source selector ─────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          Data Sources
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALL_SOURCES.map(({ key, label, icon }) => {
            const active = selectedSources.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleSource(key)}
                style={{
                  padding: '5px 12px', borderRadius: 20,
                  border: `1px solid ${active ? '#1f6feb' : '#30363d'}`,
                  background: active ? '#1f6feb22' : 'transparent',
                  color: active ? '#58a6ff' : '#8b949e',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {icon} {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Query input ──────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: 16, marginBottom: 24 }}>
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={'Ask about your infrastructure... (Ctrl+Enter to submit)\n\nExamples:\n• Which containers are using the most memory?\n• What failed in the last 24 hours?\n• Show me recent deployment issues'}
          rows={5}
          style={{
            width: '100%', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6,
            color: '#e6edf3', fontSize: 13, padding: '10px 12px', resize: 'vertical',
            fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', lineHeight: 1.6,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: selectedSources.length === 0 ? '#f85149' : '#8b949e' }}>
            {selectedSources.length === 0
              ? '⚠ Select at least one source'
              : `Querying ${selectedSources.length} source${selectedSources.length > 1 ? 's' : ''}: ${selectedSources.join(', ')}`}
          </span>
          <button
            onClick={() => submit()}
            disabled={loading || !query.trim() || selectedSources.length === 0}
            style={{
              padding: '8px 20px', borderRadius: 6, border: 'none',
              background: loading || !query.trim() || selectedSources.length === 0 ? '#30363d' : '#1f6feb',
              color: loading || !query.trim() || selectedSources.length === 0 ? '#8b949e' : '#fff',
              cursor: loading || !query.trim() || selectedSources.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {loading ? '⏳ Analyzing…' : '🤖 Ask AI'}
          </button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          background: '#ff000022', border: '1px solid #f85149', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, color: '#f85149', fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* ── Empty state with example prompts ────────────────────────────── */}
      {history.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 14, color: '#8b949e', marginBottom: 24 }}>Ask a question to get started</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => submit(p)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid #30363d',
                  background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 12,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading indicator (while first entry is loading) ─────────────── */}
      {loading && history.length === 0 && (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: '#8b949e', fontSize: 13 }}>
          ⏳ Querying sources and analyzing…
        </div>
      )}

      {/* ── Chat history ─────────────────────────────────────────────────── */}
      {history.map((entry) => (
        <div key={entry.id} style={{ marginBottom: 28 }}>

          {/* User bubble */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <div style={{
              background: '#1f6feb22', border: '1px solid #1f6feb44', borderRadius: 8,
              padding: '10px 14px', maxWidth: '72%', color: '#58a6ff', fontSize: 13, lineHeight: 1.5,
            }}>
              {entry.query}
            </div>
          </div>

          {/* AI response card */}
          <div style={card}>

            {/* Header */}
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid #21262d',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 13, color: '#3fb950', fontWeight: 600 }}>🤖 AI Analysis</span>
              <span style={{
                fontSize: 11, color: '#8b949e', background: '#21262d',
                padding: '2px 8px', borderRadius: 10,
              }}>
                {entry.response.processingMs}ms
              </span>
              <span style={{ fontSize: 11, color: '#8b949e', marginLeft: 'auto' }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Answer */}
            <div style={{
              padding: '16px', color: '#e6edf3', fontSize: 13, lineHeight: 1.8,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {entry.response.answer}
            </div>

            {/* Sources queried */}
            {entry.response.sources.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #21262d' }}>
                <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Sources Queried
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entry.response.sources.map((s) => (
                    <span
                      key={s.source}
                      title={s.summary}
                      style={{
                        padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 500,
                        background: s.data ? '#23863622' : '#30363d',
                        color: s.data ? '#3fb950' : '#8b949e',
                        border: `1px solid ${s.data ? '#238636' : '#30363d'}`,
                        cursor: 'default',
                      }}
                    >
                      {s.source}{!s.data && ' (unavailable)'}
                    </span>
                  ))}
                </div>
                {/* Per-source summaries */}
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entry.response.sources.filter((s) => s.data).map((s) => (
                    <div key={s.source} style={{ fontSize: 11, color: '#8b949e' }}>
                      <span style={{ color: '#58a6ff', fontWeight: 600 }}>{s.source}:</span> {s.summary}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested follow-ups */}
            {entry.response.suggestedFollowUps.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid #21262d' }}>
                <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Suggested Follow-ups
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {entry.response.suggestedFollowUps.map((followUp) => (
                    <button
                      key={followUp}
                      onClick={() => submit(followUp)}
                      disabled={loading}
                      style={{
                        padding: '4px 12px', borderRadius: 6, border: '1px solid #30363d',
                        background: 'transparent', color: '#8b949e', cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: 11, textAlign: 'left',
                      }}
                    >
                      {followUp} →
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Loading indicator while follow-up is processing */}
      {loading && history.length > 0 && (
        <div style={{ ...card, padding: 16, textAlign: 'center', color: '#8b949e', fontSize: 13, marginBottom: 24 }}>
          ⏳ Analyzing…
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
