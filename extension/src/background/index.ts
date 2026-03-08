// Background service worker — handles periodic polling and push notifications

const API_URL_KEY = 'apiUrl';
const DEFAULT_API = 'http://localhost:4000';

let ws: WebSocket | null = null;

async function getApiUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_URL_KEY], (r) => resolve(r[API_URL_KEY] ?? DEFAULT_API));
  });
}

async function connectWebSocket() {
  const apiUrl = await getApiUrl();
  const wsUrl = apiUrl.replace(/^http/, 'ws');
  try {
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; data?: Record<string, unknown> };
        if (payload.type === 'alert' && payload.data) {
          const alert = payload.data;
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: `DevOps Alert: ${alert['ruleName'] as string ?? 'Unknown'}`,
            message: alert['message'] as string ?? '',
            priority: alert['severity'] === 'critical' ? 2 : 1,
          });
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      ws = null;
      // Reconnect after 30s
      setTimeout(connectWebSocket, 30_000);
    };

    ws.onerror = () => { ws?.close(); };
  } catch { /* WebSocket unavailable */ }
}

// Poll for new incidents every 5 minutes and badge the icon
async function pollIncidents() {
  try {
    const apiUrl = await getApiUrl();
    const r = await fetch(`${apiUrl}/api/incidents?status=open&limit=100`);
    const j = await r.json() as { data?: { total?: number } };
    const count = j.data?.total ?? 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#da3633' });
  } catch {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Set up alarms
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pollIncidents', { periodInMinutes: 5 });
  connectWebSocket();
  pollIncidents();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollIncidents') pollIncidents();
});

chrome.runtime.onStartup.addListener(() => {
  connectWebSocket();
  pollIncidents();
});

// Handle messages from popup/content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getApiUrl') {
    getApiUrl().then(sendResponse);
    return true;
  }
  if (msg.type === 'setApiUrl') {
    chrome.storage.local.set({ [API_URL_KEY]: msg.url });
    sendResponse({ ok: true });
  }
});
