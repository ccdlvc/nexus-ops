// Content script — detects DevOps dashboards and injects a contextual assistant overlay

type PageContext = 'jenkins' | 'kibana' | 'github-actions' | 'portainer' | null;

function detectContext(): PageContext {
  const url = window.location.href;
  if (url.includes('/job/') || url.includes('/jenkins/') || document.title.includes('Jenkins')) return 'jenkins';
  if (url.includes('/kibana/') || url.includes('/app/kibana')) return 'kibana';
  if (url.includes('github.com') && url.includes('/actions')) return 'github-actions';
  if (url.includes('/portainer/') || url.includes(':9000')) return 'portainer';
  return null;
}

const context = detectContext();
if (context) injectButton(context);

function injectButton(ctx: PageContext) {
  // Floating assistant button
  const btn = document.createElement('div');
  btn.id = 'nexus-ops-fab';
  btn.innerHTML = '🤖';
  btn.title = 'Nexus Ops — Click to analyze this page';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: '999999',
    width: '48px', height: '48px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #1f6feb, #388bfd)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '22px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(31,111,235,0.5)',
    transition: 'transform 0.15s ease', userSelect: 'none',
  });

  btn.addEventListener('mouseenter', () => { btn.style.transform = 'scale(1.1)'; });
  btn.addEventListener('mouseleave', () => { btn.style.transform = 'scale(1.0)'; });

  btn.addEventListener('click', () => {
    const existing = document.getElementById('nexus-ops-panel');
    if (existing) { existing.remove(); return; }
    showPanel(ctx!);
  });

  document.body.appendChild(btn);
}

function showPanel(ctx: PageContext) {
  const panel = document.createElement('div');
  panel.id = 'nexus-ops-panel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '80px', right: '24px', zIndex: '999998',
    width: '340px', maxHeight: '480px', overflowY: 'auto',
    background: '#161b22', border: '1px solid #30363d', borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#e6edf3', padding: '16px',
  });

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <span style="font-size:16px">🤖</span>
      <span style="font-weight:700;font-size:13px">Nexus Ops</span>
      <span style="margin-left:auto;font-size:10px;color:#8b949e;background:#21262d;padding:2px 6px;border-radius:3px;">${ctx?.toUpperCase()}</span>
    </div>
    <div id="nexus-content" style="font-size:12px;color:#8b949e;line-height:1.5;">
      Analyzing current page context…
    </div>
    <div style="margin-top:12px;display:flex;gap:6px;">
      <input id="nexus-query" placeholder="Ask a question…"
        style="flex:1;padding:7px 9px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e6edf3;font-size:11px;outline:none;" />
      <button id="nexus-ask" style="padding:7px 10px;border-radius:6px;background:#1f6feb;color:#fff;border:none;cursor:pointer;font-size:11px;font-weight:600;">Ask</button>
    </div>
  `;

  document.body.appendChild(panel);
  analyzePageContext(ctx, panel);

  panel.querySelector('#nexus-ask')!.addEventListener('click', () => {
    const q = (panel.querySelector('#nexus-query') as HTMLInputElement)?.value;
    if (q) askQuestion(q, panel);
  });
  (panel.querySelector('#nexus-query') as HTMLInputElement)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = (e.target as HTMLInputElement).value;
      if (q) askQuestion(q, panel);
    }
  });
}

async function getApiUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'getApiUrl' }, (url: string) => {
      resolve(url ?? 'http://localhost:4000');
    });
  });
}

async function analyzePageContext(ctx: PageContext, panel: HTMLElement) {
  const contentDiv = panel.querySelector('#nexus-content')!;

  try {
    const apiUrl = await getApiUrl();
    let summary = '';

    if (ctx === 'jenkins') {
      const r = await fetch(`${apiUrl}/api/connectors/jenkins/jobs`);
      const j = await r.json() as { data?: string[] };
      const jobs = j.data ?? [];
      summary = `<strong>Jenkins:</strong> ${jobs.length} jobs detected.<br>Ask me about build failures, test results, or to trigger a retry.`;
    } else if (ctx === 'kibana') {
      const r = await fetch(`${apiUrl}/api/connectors/kibana/errors?minutes=15`);
      const j = await r.json() as { data?: unknown[] };
      summary = `<strong>Kibana:</strong> ${j.data?.length ?? 0} error logs in last 15 minutes.<br>Ask me to summarize errors, detect anomalies, or correlate with deploys.`;
    } else if (ctx === 'github-actions') {
      const r = await fetch(`${apiUrl}/api/connectors/github/runs?limit=5`);
      const j = await r.json() as { data?: Array<{ conclusion?: string }> };
      const failed = (j.data ?? []).filter((run) => run.conclusion === 'failure').length;
      summary = `<strong>GitHub Actions:</strong> ${failed} failed workflow runs recently.<br>Ask me to analyze failures or trigger reruns.`;
    } else if (ctx === 'portainer') {
      const r = await fetch(`${apiUrl}/api/connectors/portainer/containers`);
      const j = await r.json() as { data?: Array<{ health?: string; memoryPercent?: number }> };
      const containers = j.data ?? [];
      const unhealthy = containers.filter((c) => c.health === 'unhealthy').length;
      summary = `<strong>Portainer:</strong> ${containers.length} containers, ${unhealthy} unhealthy.<br>Ask me about resource usage, restarts, or container logs.`;
    }

    contentDiv.innerHTML = summary || 'Ready to assist. Ask me anything about this dashboard.';
  } catch {
    contentDiv.innerHTML = 'Could not connect to Nexus Ops backend.<br><span style="font-size:10px;color:#f85149;">Check that the backend is running on localhost:4000</span>';
  }
}

async function askQuestion(query: string, panel: HTMLElement) {
  const contentDiv = panel.querySelector('#nexus-content')!;
  contentDiv.innerHTML = '<span style="color:#58a6ff">Thinking…</span>';
  try {
    const apiUrl = await getApiUrl();
    const r = await fetch(`${apiUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const j = await r.json() as { data?: { answer?: string } };
    contentDiv.innerHTML = j.data?.answer?.replace(/\n/g, '<br>') ?? 'No response.';
  } catch {
    contentDiv.innerHTML = '<span style="color:#f85149">Error contacting backend.</span>';
  }
}
