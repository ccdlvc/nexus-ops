import { Router } from 'express';
import axios from 'axios';

const router = Router();

// POST /api/integrations/slack — direct Slack webhook post
router.post('/slack', async (req, res) => {
  const { text, blocks } = req.body;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return res.status(400).json({ success: false, error: 'SLACK_WEBHOOK_URL not set', timestamp: new Date().toISOString() });
  try {
    await axios.post(webhookUrl, { text, blocks });
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ success: false, error: 'Slack webhook failed', timestamp: new Date().toISOString() });
  }
});

// POST /api/integrations/teams — direct Teams webhook post
router.post('/teams', async (req, res) => {
  const { card } = req.body;
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return res.status(400).json({ success: false, error: 'TEAMS_WEBHOOK_URL not set', timestamp: new Date().toISOString() });
  try {
    await axios.post(webhookUrl, { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }] });
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch {
    res.status(502).json({ success: false, error: 'Teams webhook failed', timestamp: new Date().toISOString() });
  }
});

// GET /api/integrations/status — check all integration connectivity
router.get('/status', async (_req, res) => {
  const checks = await Promise.allSettled([
    axios.get(`${process.env.JENKINS_URL ?? 'http://jenkins:8080'}/api/json`, { auth: { username: process.env.JENKINS_USER ?? 'admin', password: process.env.JENKINS_TOKEN ?? '' }, timeout: 5000 }).then(() => ({ service: 'jenkins', status: 'ok' })),
    axios.get(`${process.env.KIBANA_URL ?? 'http://kibana:5601'}/api/status`, { auth: { username: process.env.KIBANA_USER ?? 'elastic', password: process.env.KIBANA_PASSWORD ?? '' }, timeout: 5000 }).then(() => ({ service: 'kibana', status: 'ok' })),
    axios.get('https://api.github.com/rate_limit', { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ''}` }, timeout: 5000 }).then(() => ({ service: 'github', status: 'ok' })),
    axios.get(`${process.env.PORTAINER_URL ?? 'http://portainer:9000'}/api/status`, { headers: { 'X-API-Key': process.env.PORTAINER_TOKEN ?? '' }, timeout: 5000 }).then(() => ({ service: 'portainer', status: 'ok' })),
  ]);

  const results = checks.map((r, i) => {
    const services = ['jenkins', 'kibana', 'github', 'portainer'];
    return r.status === 'fulfilled' ? r.value : { service: services[i], status: 'error', error: (r.reason as Error).message };
  });

  res.json({ success: true, data: results, timestamp: new Date().toISOString() });
});

export default router;
