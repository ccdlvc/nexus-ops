/**
 * @module ai/rootCause
 * @description AI-powered root cause analysis engine.
 *
 * RootCauseAnalyzer.analyze() accepts raw context from any combination of
 * Jenkins, Kibana, GitHub Actions, and Portainer, then asks the configured
 * AI provider to return a structured JSON incident card with title, summary,
 * severity, root cause, suggested fixes, and correlations.
 *
 * The response is parsed and validated; missing fields fall back to sensible
 * defaults so an IncidentCard is always returned even if AI generation fails.
 */
import { AIAgent } from './agent';
import { IncidentCard, BuildResult, LogEntry, WorkflowRun, ContainerHealth, IncidentCorrelation, SuggestedFix, Severity } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class RootCauseAnalyzer {
  constructor(private readonly agent: AIAgent) {}

  /** Main entrypoint: correlate data from all sources and produce an incident card */
  async analyze(context: {
    build?: BuildResult;
    logs?: LogEntry[];
    workflowRun?: WorkflowRun;
    containers?: ContainerHealth[];
    prNumber?: number;
  }): Promise<IncidentCard> {
    const { build, logs, workflowRun, containers } = context;

    const systemPrompt = `You are an expert DevOps incident analyst. Given build failures, error logs, workflow runs, and container health data, produce a structured root cause analysis. Be precise, mention specific file paths, error messages, or PR numbers where relevant. Output a JSON object with these exact fields:
{
  "title": "short incident title",
  "summary": "2-3 sentence executive summary",
  "rootCause": "detailed root cause explanation",
  "severity": "critical|high|medium|low",
  "affectedServices": ["service1", "service2"],
  "tags": ["tag1", "tag2"],
  "suggestedFixes": [
    { "title": "fix title", "description": "step-by-step description", "command": "optional CLI command", "priority": 1 }
  ],
  "correlations": [
    { "source": "jenkins|kibana|github|portainer", "entityId": "id", "entityType": "type", "description": "why this is correlated", "confidence": 0.9 }
  ]
}`;

    const userMessage = this.buildUserMessage(context);

    let parsed: Partial<IncidentCard> = {};
    try {
      const raw = await this.agent.chat(systemPrompt, userMessage, 2000);
      // Extract JSON even if surrounded by markdown
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      logger.error('RootCauseAnalyzer failed to parse AI response', { err });
    }

    const now = new Date().toISOString();
    return {
      id: uuidv4(),
      title: parsed.title ?? `Build Failure: ${build?.jobName ?? 'Unknown Job'}`,
      summary: parsed.summary ?? 'An incident was detected and requires investigation.',
      severity: (parsed.severity ?? 'high') as Severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      rootCause: parsed.rootCause ?? 'Root cause analysis pending.',
      suggestedFixes: this.validateFixes(parsed.suggestedFixes ?? []),
      correlations: this.validateCorrelations(parsed.correlations ?? [], context),
      affectedServices: parsed.affectedServices ?? this.inferAffectedServices(context),
      tags: parsed.tags ?? this.inferTags(context),
      rawData: { build, logsCount: logs?.length, workflowRunId: workflowRun?.id, containerCount: containers?.length },
    };
  }

  private buildUserMessage(context: { build?: BuildResult; logs?: LogEntry[]; workflowRun?: WorkflowRun; containers?: ContainerHealth[]; prNumber?: number }): string {
    const parts: string[] = [];

    if (context.build) {
      parts.push(`## Jenkins Build
- Job: ${context.build.jobName} #${context.build.buildNumber}
- Status: ${context.build.status}
- Duration: ${Math.round(context.build.duration / 1000)}s
- Commit: ${context.build.commitSha ?? 'N/A'}
- Branch: ${context.build.branch ?? 'N/A'}
${context.build.testReport ? `- Tests: ${context.build.testReport.failed} failed / ${context.build.testReport.total} total` : ''}
${context.build.logs ? `\n### Last 3000 chars of build log:\n${context.build.logs.slice(-3000)}` : ''}`);
    }

    if (context.logs?.length) {
      const errorLogs = context.logs.filter((l) => l.level === 'ERROR').slice(0, 20);
      parts.push(`## Kibana Error Logs (last ${errorLogs.length}):
${errorLogs.map((l) => `[${l.timestamp}] ${l.service ?? ''}: ${l.message}`).join('\n')}`);
    }

    if (context.workflowRun) {
      parts.push(`## GitHub Actions
- Workflow: ${context.workflowRun.name}
- Branch: ${context.workflowRun.headBranch}
- SHA: ${context.workflowRun.headSha.slice(0, 8)}
- Status: ${context.workflowRun.status} / ${context.workflowRun.conclusion ?? 'N/A'}`);
    }

    if (context.containers?.length) {
      const unhealthy = context.containers.filter((c) => c.health === 'unhealthy' || c.restartCount > 3 || c.memoryPercent > 80);
      if (unhealthy.length) {
        parts.push(`## Unhealthy Containers:
${unhealthy.map((c) => `- ${c.name}: mem=${c.memoryPercent.toFixed(1)}%, cpu=${c.cpuPercent.toFixed(1)}%, restarts=${c.restartCount}, health=${c.health ?? 'none'}`).join('\n')}`);
      }
    }

    if (context.prNumber) parts.push(`## Related PR: #${context.prNumber}`);

    return parts.join('\n\n') + '\n\nAnalyze the above and return a JSON root cause analysis.';
  }

  private validateFixes(fixes: unknown[]): SuggestedFix[] {
    return fixes.map((f, i) => {
      const fix = f as Partial<SuggestedFix>;
      return {
        title: fix.title ?? `Fix ${i + 1}`,
        description: fix.description ?? '',
        command: fix.command,
        link: fix.link,
        priority: fix.priority ?? i + 1,
      };
    });
  }

  private validateCorrelations(correlations: unknown[], context: { build?: BuildResult; workflowRun?: WorkflowRun }): IncidentCorrelation[] {
    const result = correlations.map((c) => {
      const corr = c as Partial<IncidentCorrelation>;
      return {
        source: corr.source ?? 'jenkins',
        entityId: corr.entityId ?? '',
        entityType: corr.entityType ?? 'build',
        description: corr.description ?? '',
        timestamp: corr.timestamp ?? new Date().toISOString(),
        confidence: corr.confidence ?? 0.7,
      } as IncidentCorrelation;
    });

    // Auto-add correlations from known data
    if (context.build && !result.find((c) => c.source === 'jenkins')) {
      result.push({
        source: 'jenkins', entityId: context.build.id, entityType: 'build',
        description: `Build ${context.build.jobName} #${context.build.buildNumber} failed with status ${context.build.status}`,
        timestamp: context.build.timestamp, confidence: 1.0,
      });
    }
    if (context.workflowRun && !result.find((c) => c.source === 'github')) {
      result.push({
        source: 'github', entityId: String(context.workflowRun.id), entityType: 'workflow_run',
        description: `GitHub Actions workflow "${context.workflowRun.name}" ${context.workflowRun.conclusion ?? 'running'} on ${context.workflowRun.headBranch}`,
        timestamp: context.workflowRun.updatedAt, confidence: 0.85,
      });
    }
    return result;
  }

  private inferAffectedServices(context: { build?: BuildResult; containers?: ContainerHealth[] }): string[] {
    const services = new Set<string>();
    if (context.build?.jobName) services.add(context.build.jobName);
    context.containers?.filter((c) => c.health === 'unhealthy').forEach((c) => services.add(c.name));
    return [...services];
  }

  private inferTags(context: { build?: BuildResult; workflowRun?: WorkflowRun }): string[] {
    const tags: string[] = [];
    if (context.build?.status === 'FAILURE') tags.push('build-failure');
    if (context.build?.branch) tags.push(`branch:${context.build.branch}`);
    if (context.workflowRun?.conclusion === 'failure') tags.push('ci-failure');
    return tags;
  }
}
