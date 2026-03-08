/**
 * @module ai/agent
 * @description Provider-agnostic AI wrapper for Nexus Ops.
 *
 * Selects the active AI provider at construction time based on environment
 * variables:
 *   - ANTHROPIC_API_KEY → uses Claude (default model: claude-opus-4-6)
 *   - OPENAI_API_KEY    → uses GPT-4o (default model: gpt-4o)
 *   - neither set       → stub mode (returns a JSON hint to configure a key)
 *
 * Consumed by: RootCauseAnalyzer, AnomalyDetector, ReportGenerator, query route.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { QueryResponse, DataSource } from '../../../shared/types';
import { logger } from '../utils/logger';

export class AIAgent {
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private model: string;

  constructor() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      this.model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6';
      logger.info('AI Agent using Anthropic Claude');
    } else if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      this.model = process.env.OPENAI_MODEL ?? 'gpt-4o';
      logger.info('AI Agent using OpenAI GPT-4o');
    } else {
      this.model = 'stub';
      logger.warn('No AI API key configured — responses will be stubbed');
    }
  }

  /** Send a chat message to the configured AI provider */
  async chat(systemPrompt: string, userMessage: string, maxTokens = 1500): Promise<string> {
    const start = Date.now();
    try {
      if (this.anthropic) {
        const resp = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });
        const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
        logger.debug(`Anthropic response in ${Date.now() - start}ms (${text.length} chars)`);
        return text;
      }

      if (this.openai) {
        const resp = await this.openai.chat.completions.create({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        });
        const text = resp.choices[0].message.content ?? '';
        logger.debug(`OpenAI response in ${Date.now() - start}ms (${text.length} chars)`);
        return text;
      }

      // Stub (no API key)
      return JSON.stringify({ stub: true, message: 'Configure ANTHROPIC_API_KEY or OPENAI_API_KEY for live AI responses.' });
    } catch (err) {
      logger.error('AIAgent.chat failed', { err });
      throw err;
    }
  }

  /** Answer a natural-language DevOps query given context data */
  async answerQuery(
    query: string,
    context: Array<{ source: DataSource; summary: string; data: unknown }>,
    processingStart: number,
  ): Promise<QueryResponse> {
    const systemPrompt = `You are an expert DevOps AI assistant for Nexus Ops. You have access to real-time data from Jenkins, Kibana, GitHub Actions, Portainer, AWS, GCP, and Azure. Answer questions accurately, concisely, and with actionable insights. Always suggest follow-up questions. Return your answer as plain prose (not JSON).`;

    const contextText = context.map((c) =>
      `### ${c.source.toUpperCase()}:\n${c.summary}\n\nData:\n${JSON.stringify(c.data, null, 2)}`
    ).join('\n\n---\n\n');

    const userMessage = `User query: "${query}"\n\nAvailable context:\n${contextText}\n\nProvide a clear, actionable answer.`;

    const answer = await this.chat(systemPrompt, userMessage, 800);

    return {
      query,
      answer,
      sources: context,
      suggestedFollowUps: this.generateFollowUps(query),
      processingMs: Date.now() - processingStart,
    };
  }

  private generateFollowUps(query: string): string[] {
    const followUps: Record<string, string[]> = {
      'build': ['Show me the build logs', 'Which tests are failing?', 'Compare with last week\'s failure rate'],
      'error': ['Show error trend over 24h', 'Which service has the most errors?', 'Correlate errors with recent deploys'],
      'memory': ['Show all containers above 80% memory', 'What\'s causing the memory spike?', 'Suggest memory optimization steps'],
      'test': ['Which tests are slowest?', 'Show flaky tests over last week', 'Compare test duration before/after PR #128'],
      'deploy': ['Show rollback options', 'Compare container health before and after deploy', 'Were there any log spikes post-deploy?'],
      'aws': ['Show my EC2 instances', 'Which Lambda functions are cold starting?', 'What is my AWS cost this month?'],
      'ec2': ['Show stopped EC2 instances', 'What instance types do I have?', 'Which instances are in us-east-1?'],
      'lambda': ['Which Lambda functions are failing?', 'Show Lambda runtimes by version', 'What are my largest Lambda packages?'],
      'ecs': ['Show ECS service health', 'Which ECS tasks are pending?', 'Show ECS clusters with low capacity'],
      'gcp': ['Show running GCE instances', 'How many GKE clusters do I have?', 'Show Cloud Run service URLs'],
      'gke': ['What Kubernetes version are my clusters on?', 'Show node counts by cluster', 'Which clusters are not running?'],
      'azure': ['Show Azure VM power states', 'List AKS clusters', 'What is my Azure spend this month?'],
      'aks': ['What Kubernetes version are my AKS clusters on?', 'Show AKS node counts', 'Which AKS clusters are provisioning?'],
      'cost': ['Compare AWS vs Azure costs', 'Which service is my biggest cost driver?', 'Show daily cost trend for last 14 days'],
    };

    const queryLower = query.toLowerCase();
    for (const [keyword, suggestions] of Object.entries(followUps)) {
      if (queryLower.includes(keyword)) return suggestions;
    }
    return [
      'Show me all open incidents',
      'What failed in the last 24 hours?',
      'Which services have the most alerts?',
    ];
  }
}
