import {
  BaseAgent,
  type AgentAction,
  type AgentObservation,
  type AgentPlan,
  type AgentContext,
  type AgentEventHandler,
  type AgentCapability,
} from './base.js';

const DEVELOPER_CAPABILITIES: AgentCapability[] = [
  { name: 'code_generation', description: 'Generate code from requirements or specifications' },
  { name: 'bug_fixing', description: 'Diagnose and fix bugs in existing code' },
  { name: 'feature_implementation', description: 'Implement features based on task descriptions' },
  { name: 'code_refactoring', description: 'Refactor code for better quality and performance' },
  { name: 'code_execution', description: 'Execute code in sandbox and verify results' },
];

const DEVELOPER_SYSTEM_PROMPT = `You are a senior software developer AI agent. Your job is to:
1. Understand code requirements and specifications
2. Generate clean, well-documented, production-ready code
3. Fix bugs with clear explanations
4. Follow best practices and design patterns
5. Write tests for your code

When analyzing or generating code, think step by step:
- Understand the context and requirements
- Identify relevant files and patterns
- Implement the solution
- Verify correctness

Respond with structured JSON for actions, or code blocks for implementations.`;

export interface CodeGenerationResult {
  files: Array<{
    path: string;
    content: string;
    language: string;
    action: 'create' | 'modify' | 'delete';
  }>;
  explanation: string;
  tests?: Array<{
    path: string;
    content: string;
  }>;
}

export interface BugFixResult {
  diagnosis: string;
  rootCause: string;
  fix: CodeGenerationResult;
  preventionSuggestions: string[];
}

/**
 * AI agent that generates code, fixes bugs, and implements features.
 */
export class DeveloperAgent extends BaseAgent {
  constructor(config: {
    id: string;
    context: AgentContext;
    eventHandler?: AgentEventHandler;
    maxIterations?: number;
  }) {
    super({
      id: config.id,
      name: 'Developer Agent',
      type: 'developer',
      capabilities: DEVELOPER_CAPABILITIES,
      context: config.context,
      eventHandler: config.eventHandler,
      maxIterations: config.maxIterations ?? 8,
    });
  }

  async think(input: string): Promise<AgentAction[]> {
    // Search codebase for context
    const searchResult = await this.context.tools.execute('search_codebase', {
      query: input,
    });

    // Recall relevant memories
    const memories = await this.recall(input, 3);

    const response = await this.context.router.chat('code_generation', [
      {
        role: 'user',
        content: `Task: ${input}\n\nCodebase context:\n${JSON.stringify(searchResult.result)}\n\nRelevant memories:\n${memories.join('\n')}\n\nAnalyze this task and return a JSON array of actions to take. Each action should have: type (search_code, generate_code, fix_bug, execute_code, refactor), description, and params.`,
      },
    ], {
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.2,
    });

    const actions = JSON.parse(response.content) as AgentAction[];
    return Array.isArray(actions) ? actions : [actions];
  }

  async act(action: AgentAction): Promise<unknown> {
    switch (action.type) {
      case 'search_code':
        return this.context.tools.execute('search_codebase', {
          query: action.params['query'] as string,
          path: action.params['path'] as string | undefined,
          language: action.params['language'] as string | undefined,
        });

      case 'generate_code':
        return this.generateCode(
          action.params['requirement'] as string,
          action.params['context'] as string | undefined,
        );

      case 'fix_bug':
        return this.fixBug(
          action.params['description'] as string,
          action.params['code'] as string,
          action.params['error'] as string | undefined,
        );

      case 'execute_code':
        return this.context.tools.execute('execute_code', {
          code: action.params['code'] as string,
          language: action.params['language'] as string,
          timeout: action.params['timeout'] as number | undefined,
        });

      case 'refactor':
        return this.refactorCode(
          action.params['code'] as string,
          action.params['goals'] as string[],
        );

      default:
        throw new Error(`Unknown developer action: ${action.type}`);
    }
  }

  async observe(observation: AgentObservation): Promise<{
    continue: boolean;
    nextActions?: AgentAction[];
    result?: unknown;
  }> {
    if (!observation.success) {
      // Try to understand the error and fix it
      if (observation.action.type === 'execute_code') {
        return {
          continue: true,
          nextActions: [{
            type: 'fix_bug',
            description: 'Fix the execution error',
            params: {
              description: 'Code execution failed',
              code: observation.action.params['code'],
              error: observation.error,
            },
          }],
        };
      }

      // Generic retry
      return { continue: false, result: { error: observation.error } };
    }

    // For code generation or bug fixing, optionally verify by executing
    if (observation.action.type === 'generate_code' || observation.action.type === 'fix_bug') {
      const result = observation.result as CodeGenerationResult | BugFixResult;
      await this.remember(
        `Completed ${observation.action.type}: ${observation.action.description}`,
        { type: observation.action.type },
      );
      return { continue: false, result };
    }

    // For search, continue with the information
    if (observation.action.type === 'search_code') {
      return { continue: true };
    }

    return { continue: false, result: observation.result };
  }

  async plan(goal: string): Promise<AgentPlan> {
    const actions = await this.think(goal);
    return {
      goal,
      steps: actions,
      currentStep: 0,
    };
  }

  private async generateCode(
    requirement: string,
    additionalContext?: string,
  ): Promise<CodeGenerationResult> {
    const prompt = additionalContext
      ? `${requirement}\n\nAdditional context:\n${additionalContext}`
      : requirement;

    const response = await this.context.router.chat('code_generation', [
      {
        role: 'user',
        content: `Generate production-ready code for the following requirement:\n\n${prompt}\n\nRespond with JSON:\n{\n  "files": [{ "path", "content", "language", "action": "create"|"modify"|"delete" }],\n  "explanation": "...",\n  "tests": [{ "path", "content" }]\n}`,
      },
    ], {
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: 16384,
    });

    return JSON.parse(response.content) as CodeGenerationResult;
  }

  private async fixBug(
    description: string,
    code: string,
    errorMessage?: string,
  ): Promise<BugFixResult> {
    const errorCtx = errorMessage ? `\n\nError message:\n${errorMessage}` : '';

    const response = await this.context.router.chat('code_generation', [
      {
        role: 'user',
        content: `Fix the following bug:\n\n${description}\n\nCode:\n\`\`\`\n${code}\n\`\`\`${errorCtx}\n\nRespond with JSON:\n{\n  "diagnosis": "...",\n  "rootCause": "...",\n  "fix": { "files": [...], "explanation": "..." },\n  "preventionSuggestions": ["..."]\n}`,
      },
    ], {
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.1,
      maxTokens: 8192,
    });

    return JSON.parse(response.content) as BugFixResult;
  }

  private async refactorCode(
    code: string,
    goals: string[],
  ): Promise<CodeGenerationResult> {
    const response = await this.context.router.chat('code_generation', [
      {
        role: 'user',
        content: `Refactor the following code with these goals: ${goals.join(', ')}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nRespond with JSON:\n{\n  "files": [{ "path", "content", "language", "action" }],\n  "explanation": "..."\n}`,
      },
    ], {
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.2,
      maxTokens: 8192,
    });

    return JSON.parse(response.content) as CodeGenerationResult;
  }
}
