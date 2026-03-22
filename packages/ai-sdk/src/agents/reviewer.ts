import {
  BaseAgent,
  type AgentAction,
  type AgentObservation,
  type AgentPlan,
  type AgentContext,
  type AgentEventHandler,
  type AgentCapability,
} from './base.js';

const REVIEWER_CAPABILITIES: AgentCapability[] = [
  { name: 'code_review', description: 'Review code changes for quality, bugs, and best practices' },
  { name: 'security_audit', description: 'Identify security vulnerabilities in code' },
  { name: 'performance_review', description: 'Analyze code for performance issues' },
  { name: 'document_review', description: 'Review documents for clarity, completeness, and accuracy' },
  { name: 'pr_review', description: 'Review pull requests with actionable feedback' },
];

const REVIEWER_SYSTEM_PROMPT = `You are a senior code reviewer and security auditor AI agent. Your job is to:
1. Review code changes for bugs, security issues, and best practices
2. Provide actionable feedback with clear severity levels
3. Suggest improvements for performance and maintainability
4. Ensure code follows project conventions and standards
5. Identify potential security vulnerabilities

Be thorough but constructive. Categorize each finding by severity:
- critical: Must fix before merge (security vulnerabilities, data loss risks)
- high: Should fix before merge (bugs, logic errors)
- medium: Should fix soon (code quality, maintainability)
- low: Nice to have (style, minor improvements)
- info: Informational (suggestions, alternatives)

Respond with structured JSON.`;

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ReviewFinding {
  severity: ReviewSeverity;
  category: 'bug' | 'security' | 'performance' | 'quality' | 'style' | 'documentation';
  title: string;
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
  codeSnippet?: string;
}

export interface ReviewResult {
  summary: string;
  overallSeverity: ReviewSeverity;
  findings: ReviewFinding[];
  approved: boolean;
  approvalConditions?: string[];
  metrics: {
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}

/**
 * AI agent that reviews code, documents, and PRs with actionable feedback.
 */
export class ReviewerAgent extends BaseAgent {
  constructor(config: {
    id: string;
    context: AgentContext;
    eventHandler?: AgentEventHandler;
    maxIterations?: number;
  }) {
    super({
      id: config.id,
      name: 'Reviewer Agent',
      type: 'reviewer',
      capabilities: REVIEWER_CAPABILITIES,
      context: config.context,
      eventHandler: config.eventHandler,
      maxIterations: config.maxIterations ?? 5,
    });
  }

  async think(input: string): Promise<AgentAction[]> {
    // Determine what kind of review is needed
    const response = await this.context.router.chat('review', [
      {
        role: 'user',
        content: `Analyze this review request and determine what actions are needed:\n\n${input}\n\nRespond with JSON: { "actions": [{ "type": "review_code"|"review_security"|"review_performance"|"review_document", "description": "...", "params": { ... } }] }`,
      },
    ], {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.1,
    });

    const result = JSON.parse(response.content) as { actions: AgentAction[] };
    return result.actions.length > 0 ? result.actions : [{
      type: 'review_code',
      description: 'Perform a comprehensive code review',
      params: { content: input },
    }];
  }

  async act(action: AgentAction): Promise<unknown> {
    switch (action.type) {
      case 'review_code':
        return this.reviewCode(
          action.params['content'] as string,
          action.params['context'] as string | undefined,
        );

      case 'review_security':
        return this.reviewSecurity(action.params['content'] as string);

      case 'review_performance':
        return this.reviewPerformance(action.params['content'] as string);

      case 'review_document':
        return this.reviewDocument(action.params['content'] as string);

      default:
        throw new Error(`Unknown reviewer action: ${action.type}`);
    }
  }

  async observe(observation: AgentObservation): Promise<{
    continue: boolean;
    nextActions?: AgentAction[];
    result?: unknown;
  }> {
    if (!observation.success) {
      return { continue: false, result: { error: observation.error } };
    }

    const review = observation.result as ReviewResult;

    // If critical findings, do a deeper security review
    if (review.metrics.criticalCount > 0 && observation.action.type !== 'review_security') {
      return {
        continue: true,
        nextActions: [{
          type: 'review_security',
          description: 'Deep security review due to critical findings',
          params: { content: observation.action.params['content'] },
        }],
      };
    }

    await this.remember(
      `Reviewed code: ${review.summary}. Findings: ${review.metrics.totalFindings} (${review.metrics.criticalCount} critical, ${review.metrics.highCount} high)`,
      { type: 'review_completed', severity: review.overallSeverity },
    );

    return { continue: false, result: review };
  }

  async plan(goal: string): Promise<AgentPlan> {
    const actions = await this.think(goal);
    return { goal, steps: actions, currentStep: 0 };
  }

  private async reviewCode(code: string, additionalContext?: string): Promise<ReviewResult> {
    const ctx = additionalContext ? `\n\nAdditional context:\n${additionalContext}` : '';

    const response = await this.context.router.chat('review', [
      {
        role: 'user',
        content: `Review the following code for bugs, quality, security, and performance:\n\n\`\`\`\n${code}\n\`\`\`${ctx}\n\nRespond with JSON:\n{\n  "summary": "...",\n  "overallSeverity": "critical"|"high"|"medium"|"low"|"info",\n  "findings": [{ "severity", "category", "title", "description", "file?", "line?", "suggestion?", "codeSnippet?" }],\n  "approved": true|false,\n  "approvalConditions?": ["..."],\n  "metrics": { "totalFindings", "criticalCount", "highCount", "mediumCount", "lowCount", "infoCount" }\n}`,
      },
    ], {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.1,
      maxTokens: 8192,
    });

    return JSON.parse(response.content) as ReviewResult;
  }

  private async reviewSecurity(code: string): Promise<ReviewResult> {
    const response = await this.context.router.chat('review', [
      {
        role: 'user',
        content: `Perform a thorough security audit of the following code. Look for:\n- SQL injection, XSS, CSRF\n- Authentication/authorization issues\n- Sensitive data exposure\n- Input validation gaps\n- Cryptographic weaknesses\n- Dependency vulnerabilities\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nRespond with JSON matching the ReviewResult schema.`,
      },
    ], {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.1,
      maxTokens: 8192,
    });

    return JSON.parse(response.content) as ReviewResult;
  }

  private async reviewPerformance(code: string): Promise<ReviewResult> {
    const response = await this.context.router.chat('review', [
      {
        role: 'user',
        content: `Analyze the following code for performance issues. Look for:\n- N+1 queries, unnecessary computations\n- Memory leaks, large allocations\n- Blocking operations, missing async\n- Cache opportunities\n- Algorithm complexity\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nRespond with JSON matching the ReviewResult schema.`,
      },
    ], {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.1,
      maxTokens: 8192,
    });

    return JSON.parse(response.content) as ReviewResult;
  }

  private async reviewDocument(content: string): Promise<ReviewResult> {
    const response = await this.context.router.chat('review', [
      {
        role: 'user',
        content: `Review the following document for clarity, completeness, accuracy, and consistency:\n\n${content}\n\nRespond with JSON matching the ReviewResult schema (use category "documentation").`,
      },
    ], {
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: 4096,
    });

    return JSON.parse(response.content) as ReviewResult;
  }
}
