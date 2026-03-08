import { AIAgent } from './agent';
import { IncidentCard, IncidentReport } from '../../../shared/types';
import { logger } from '../utils/logger';

export class ReportGenerator {
  constructor(private readonly agent: AIAgent) {}

  /** Generate a full incident report in multiple formats */
  async generate(incident: IncidentCard): Promise<IncidentReport> {
    const [markdownReport, githubIssueBody] = await Promise.all([
      this.generateMarkdown(incident),
      this.generateGithubIssue(incident),
    ]);

    return {
      incident,
      markdownReport,
      githubIssueBody,
      githubIssueLabels: this.deriveLabels(incident),
      slackBlocks: this.generateSlackBlocks(incident),
      teamsAdaptiveCard: this.generateTeamsCard(incident),
    };
  }

  private async generateMarkdown(incident: IncidentCard): Promise<string> {
    const systemPrompt = `You are a DevOps incident reporter. Write a professional, structured incident report in Markdown. Use clear sections, bullet points, and code blocks where appropriate.`;
    const userMessage = `Write a Markdown incident report for:\n${JSON.stringify(incident, null, 2)}`;

    try {
      return await this.agent.chat(systemPrompt, userMessage, 1200);
    } catch {
      return this.fallbackMarkdown(incident);
    }
  }

  private async generateGithubIssue(incident: IncidentCard): Promise<string> {
    const systemPrompt = `You are creating a GitHub issue for a DevOps incident. Write a clear, actionable issue body using GitHub Markdown. Include reproduction steps, environment details, and acceptance criteria for resolution.`;
    const userMessage = `Create a GitHub issue body for this incident:\n${JSON.stringify(incident, null, 2)}`;

    try {
      return await this.agent.chat(systemPrompt, userMessage, 1000);
    } catch {
      return this.fallbackGithubIssue(incident);
    }
  }

  private generateSlackBlocks(incident: IncidentCard): unknown[] {
    const severityEmoji: Record<string, string> = {
      critical: ':red_circle:', high: ':orange_circle:', medium: ':yellow_circle:', low: ':white_circle:', info: ':blue_circle:',
    };
    const emoji = severityEmoji[incident.severity] ?? ':white_circle:';

    const blocks: unknown[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} ${incident.title}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${incident.severity.toUpperCase()}` },
          { type: 'mrkdwn', text: `*Status:*\n${incident.status}` },
          { type: 'mrkdwn', text: `*Detected:*\n${new Date(incident.createdAt).toUTCString()}` },
          { type: 'mrkdwn', text: `*Affected:*\n${incident.affectedServices.join(', ') || 'Unknown'}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Summary:*\n${incident.summary}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Root Cause:*\n${incident.rootCause.slice(0, 300)}${incident.rootCause.length > 300 ? '...' : ''}` },
      },
    ];

    if (incident.suggestedFixes.length) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Suggested Fixes:*\n${incident.suggestedFixes.slice(0, 3).map((f, i) => `${i + 1}. *${f.title}*: ${f.description.slice(0, 100)}`).join('\n')}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'View Incident' }, style: 'primary', value: incident.id },
        ...(incident.githubIssueUrl
          ? [{ type: 'button', text: { type: 'plain_text', text: 'GitHub Issue' }, url: incident.githubIssueUrl }]
          : []),
      ],
    } as unknown);

    return blocks;
  }

  private generateTeamsCard(incident: IncidentCard): unknown {
    const colorMap: Record<string, string> = {
      critical: 'attention', high: 'warning', medium: 'accent', low: 'good', info: 'default',
    };

    const card = {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'Container',
          style: colorMap[incident.severity] ?? 'default',
          items: [
            { type: 'TextBlock', text: incident.title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: `Severity: ${incident.severity.toUpperCase()} | Status: ${incident.status}`, isSubtle: true },
          ],
        },
        { type: 'TextBlock', text: incident.summary, wrap: true },
        { type: 'TextBlock', text: '**Root Cause**', weight: 'Bolder' },
        { type: 'TextBlock', text: incident.rootCause.slice(0, 400), wrap: true },
        {
          type: 'FactSet',
          facts: [
            { title: 'Affected Services', value: incident.affectedServices.join(', ') || 'N/A' },
            { title: 'Detected At', value: new Date(incident.createdAt).toUTCString() },
            { title: 'Tags', value: incident.tags.join(', ') || 'N/A' },
          ],
        },
        ...(incident.suggestedFixes.length
          ? [
            { type: 'TextBlock', text: '**Suggested Fixes**', weight: 'Bolder' },
            ...incident.suggestedFixes.slice(0, 3).map((f) => ({ type: 'TextBlock', text: `• **${f.title}**: ${f.description.slice(0, 120)}`, wrap: true })),
          ]
          : []),
      ],
      actions: [
        { type: 'Action.OpenUrl', title: 'View Incident', url: `${process.env.DASHBOARD_URL ?? 'http://localhost:3000'}/incidents/${incident.id}` },
        ...(incident.githubIssueUrl ? [{ type: 'Action.OpenUrl', title: 'View GitHub Issue', url: incident.githubIssueUrl }] : []),
      ],
    };

    return card;
  }

  private deriveLabels(incident: IncidentCard): string[] {
    const labels = ['nexus-ops', `severity:${incident.severity}`];
    if (incident.tags.includes('build-failure')) labels.push('ci-failure');
    if (incident.tags.some((t) => t.startsWith('branch:'))) labels.push('branch-issue');
    if (incident.correlations.some((c) => c.source === 'portainer')) labels.push('infrastructure');
    if (incident.correlations.some((c) => c.source === 'kibana')) labels.push('observability');
    return labels;
  }

  private fallbackMarkdown(incident: IncidentCard): string {
    return `# Incident: ${incident.title}

**Severity:** ${incident.severity.toUpperCase()}
**Status:** ${incident.status}
**Detected:** ${incident.createdAt}

## Summary
${incident.summary}

## Root Cause
${incident.rootCause}

## Affected Services
${incident.affectedServices.map((s) => `- ${s}`).join('\n') || 'N/A'}

## Suggested Fixes
${incident.suggestedFixes.map((f, i) => `### ${i + 1}. ${f.title}\n${f.description}${f.command ? `\n\`\`\`bash\n${f.command}\n\`\`\`` : ''}`).join('\n\n') || 'No fixes suggested.'}

## Correlations
${incident.correlations.map((c) => `- **${c.source.toUpperCase()}**: ${c.description} (confidence: ${(c.confidence * 100).toFixed(0)}%)`).join('\n') || 'No correlations found.'}

---
*Generated by Nexus Ops AI at ${new Date().toISOString()}*
`;
  }

  private fallbackGithubIssue(incident: IncidentCard): string {
    return `## Incident Report: ${incident.title}

**Severity:** ${incident.severity}
**Detected:** ${incident.createdAt}
**Auto-generated by:** Nexus Ops AI

---

### Summary
${incident.summary}

### Root Cause
${incident.rootCause}

### Affected Services
${incident.affectedServices.map((s) => `- \`${s}\``).join('\n') || 'Unknown'}

### Steps to Reproduce
1. Check the correlated data sources listed below
2. Review logs around ${incident.createdAt}
3. Compare with previous successful runs

### Suggested Resolution Steps
${incident.suggestedFixes.map((f, i) => `${i + 1}. **${f.title}**: ${f.description}${f.command ? `\n   \`\`\`bash\n   ${f.command}\n   \`\`\`` : ''}`).join('\n\n')}

### Related Resources
${incident.correlations.map((c) => `- ${c.source.toUpperCase()}: ${c.description}`).join('\n')}

### Acceptance Criteria
- [ ] Root cause confirmed
- [ ] Fix applied and verified
- [ ] Monitoring alerts resolved
- [ ] Post-mortem scheduled

---
*🤖 Auto-generated by Nexus Ops — Incident ID: \`${incident.id}\`*
`;
  }
}
