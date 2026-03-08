import React, { useState } from 'react';

const QUICK_QUERIES = [
  'Show me failed builds last week',
  'Which containers have high memory usage?',
  'Correlate errors with recent commits',
  'What caused the latest incident?',
  'Show slow test execution in the last 24 hours',
];

export default function QueryInput({ apiUrl }: { apiUrl: string }) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function submit(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setAnswer('');
    setFollowUps([]);
    try {
      const r = await fetch(`${apiUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const j = await r.json();
      const data = j.data ?? {};
      setAnswer(data.answer ?? 'No response.');
      setFollowUps(data.suggestedFollowUps ?? []);
    } catch {
      setAnswer('Error: Could not reach the backend. Check that the Nexus Ops backend is running.');
    }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit(query)}
            placeholder="Ask anything about your DevOps stack…"
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #30363d',
              background: '#0d1117', color: '#e6edf3', fontSize: 12, outline: 'none',
            }}
          />
          <button onClick={() => submit(query)} disabled={loading || !query.trim()} style={{
            padding: '8px 12px', borderRadius: 6, background: loading ? '#21262d' : '#1f6feb',
            color: '#e6edf3', border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
          }}>{loading ? '…' : 'Ask'}</button>
        </div>
      </div>

      {!answer && !loading && (
        <div>
          <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quick Queries</div>
          {QUICK_QUERIES.map((q) => (
            <button key={q} onClick={() => { setQuery(q); submit(q); }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
              marginBottom: 4, borderRadius: 6, background: '#21262d', border: '1px solid #30363d',
              color: '#8b949e', cursor: 'pointer', fontSize: 11,
            }}>{q}</button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#58a6ff', fontSize: 12 }}>
          Querying all data sources…
        </div>
      )}

      {answer && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Answer</div>
          <div style={{
            padding: '10px 12px', borderRadius: 6, background: '#161b22',
            border: '1px solid #21262d', fontSize: 12, color: '#c9d1d9', lineHeight: 1.6,
            maxHeight: 200, overflowY: 'auto',
          }}>
            {answer}
          </div>

          {followUps.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Suggested Follow-ups</div>
              {followUps.map((fq) => (
                <button key={fq} onClick={() => { setQuery(fq); submit(fq); }} style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
                  marginBottom: 3, borderRadius: 4, background: '#1f6feb22',
                  border: '1px solid #1f6feb44', color: '#58a6ff', cursor: 'pointer', fontSize: 11,
                }}>→ {fq}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
