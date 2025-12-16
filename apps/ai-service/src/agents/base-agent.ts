import { aiRouter, TaskType } from '../gateway/ai-router.js';
import { toolRegistry, ToolContext, ToolResult } from '../tools/tool-registry.js';
import { LLMMessage, LLMOptions, ToolCall, ToolDefinition } from '../providers/base-provider.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'done' | 'error' | 'cancelled';

export interface AgentAction {
  type: 'tool_call' | 'respond' | 'delegate';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  response?: string;
  delegateTo?: string;
  delegateGoal?: string;
}

export interface AgentStep {
  iteration: number;
  status: AgentStatus;
  thought: string;
  action?: AgentAction;
  observation?: string;
  timestamp: number;
  durationMs: number;
}

export interface AgentResult {
  success: boolean;
  output: string;
  steps: AgentStep[];
  totalDurationMs: number;
  tokensUsed: number;
  error?: string;
}

export interface AgentContext {
  userId: string;
  workspaceId: string;
  authToken?: string;
  sharedMemory?: Map<string, unknown>;
  parentAgentId?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Base Agent
// ---------------------------------------------------------------------------

export abstract class BaseAgent {
  readonly id: string;
  abstract readonly name: string;
  abstract readonly type: string;
  abstract readonly capabilities: string[];
  protected abstract readonly systemPrompt: string;
  protected abstract readonly taskType: TaskType;

  status: AgentStatus = 'idle';
  protected steps: AgentStep[] = [];
  protected messages: LLMMessage[] = [];
  protected tokensUsed: number = 0;
  protected cancelled: boolean = false;
  protected maxIterations: number;

  constructor(id: string) {
    this.id = id;
    this.maxIterations = config.agentMaxIterations;
  }

  // -----------------------------------------------------------------------
  // Lifecycle methods
  // -----------------------------------------------------------------------

  protected async think(input: string, context: AgentContext): Promise<AgentAction> {
    this.status = 'thinking';

    const tools = this.getToolDefinitions();
    const options: LLMOptions = {
      systemPrompt: this.systemPrompt,
      temperature: 0.3,
      maxTokens: 4096,
      tools: tools.length > 0 ? tools : undefined,
    };

    this.messages.push({ role: 'user', content: input });

    const response = await aiRouter.chat(this.messages, options, this.taskType, context.userId);
    this.tokensUsed += response.usage.totalTokens;

    // Store assistant response
    this.messages.push({
      role: 'assistant',
      content: response.content,
      toolCalls: response.toolCalls,
    });

    if (response.finishReason === 'tool_calls' && response.toolCalls && response.toolCalls.length > 0) {
      const firstCall = response.toolCalls[0];
      return {
        type: 'tool_call',
        toolName: firstCall.name,
        toolArgs: firstCall.arguments,
      };
    }

    return {
      type: 'respond',
      response: response.content,
    };
  }

  protected async act(action: AgentAction, context: AgentContext): Promise<string> {
    this.status = 'acting';

    if (action.type === 'tool_call' && action.toolName) {
      const toolContext: ToolContext = {
        userId: context.userId,
        workspaceId: context.workspaceId,
        authToken: context.authToken,
        metadata: context.metadata,
      };

      const result: ToolResult = await toolRegistry.executeTool(
        action.toolName,
        action.toolArgs ?? {},
        toolContext,
      );

      const resultStr = JSON.stringify(result.data ?? result.error, null, 2);

      // Feed tool result back into message history
      const lastAssistantMsg = this.messages[this.messages.length - 1];
      const toolCallId = lastAssistantMsg?.toolCalls?.[0]?.id ?? `tc_${Date.now()}`;

      this.messages.push({
        role: 'tool',
        content: resultStr,
        name: action.toolName,
        toolCallId,
      });

      return result.success
        ? `Tool ${action.toolName} succeeded: ${resultStr.slice(0, 2000)}`
        : `Tool ${action.toolName} failed: ${result.error ?? 'Unknown error'}`;
    }

    if (action.type === 'respond') {
      return action.response ?? '';
    }

    return 'No action taken';
  }

  protected observe(result: string): string {
    // Subclasses can override to process observations
    return result;
  }

  protected async plan(goal: string, context: AgentContext): Promise<string> {
    const planPrompt = `Create a step-by-step plan to accomplish the following goal. Be specific and actionable.

Goal: ${goal}

Available tools: ${this.getToolDefinitions().map((t) => t.name).join(', ')}

Return a numbered list of steps.`;

    const response = await aiRouter.chat(
      [{ role: 'user', content: planPrompt }],
      {
        systemPrompt: this.systemPrompt,
        temperature: 0.3,
        maxTokens: 2048,
      },
      this.taskType,
      context.userId,
    );

    this.tokensUsed += response.usage.totalTokens;
    return response.content;
  }

  // -----------------------------------------------------------------------
  // Main execution loop
  // -----------------------------------------------------------------------

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.status = 'thinking';
    this.steps = [];
    this.messages = [];
    this.tokensUsed = 0;
    this.cancelled = false;

    logger.info(`Agent [${this.name}] starting`, { id: this.id, goal: goal.slice(0, 200) });

    try {
      // Initial plan
      const plan = await this.plan(goal, context);
      logger.debug(`Agent [${this.name}] plan`, { plan: plan.slice(0, 500) });

      let currentInput = `Goal: ${goal}\n\nPlan:\n${plan}\n\nBegin executing the plan. Use available tools to accomplish each step. When all steps are complete, provide a final comprehensive response.`;

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        if (this.cancelled) {
          this.status = 'cancelled';
          return this.buildResult(false, 'Agent execution was cancelled', startTime);
        }

        const stepStart = Date.now();

        // Think
        const action = await this.think(currentInput, context);

        const step: AgentStep = {
          iteration,
          status: 'thinking',
          thought: action.type === 'respond' ? 'Formulating response' : `Using tool: ${action.toolName}`,
          action,
          timestamp: Date.now(),
          durationMs: 0,
        };

        if (action.type === 'respond') {
          step.status = 'done';
          step.durationMs = Date.now() - stepStart;
          this.steps.push(step);
          this.status = 'done';

          logger.info(`Agent [${this.name}] completed`, {
            id: this.id,
            iterations: iteration + 1,
            tokensUsed: this.tokensUsed,
          });

          return this.buildResult(true, action.response ?? '', startTime);
        }

        // Act
        const observation = await this.act(action, context);
        step.observation = observation;

        // Observe
        const processed = this.observe(observation);

        step.status = 'acting';
        step.durationMs = Date.now() - stepStart;
        this.steps.push(step);

        // Next iteration uses the observation as context
        currentInput = `Continue executing the plan. Previous action result:\n${processed}\n\nProceed to the next step, or provide the final response if all steps are complete.`;
      }

      // Max iterations reached
      this.status = 'error';
      const finalResponse = this.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .pop() ?? 'Agent reached maximum iterations without completing the goal.';

      return this.buildResult(false, finalResponse, startTime, 'Maximum iterations reached');
    } catch (err) {
      this.status = 'error';
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Agent [${this.name}] error`, { id: this.id, error: errorMsg });
      return this.buildResult(false, '', startTime, errorMsg);
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  cancel(): void {
    this.cancelled = true;
    this.status = 'cancelled';
    logger.info(`Agent [${this.name}] cancel requested`, { id: this.id });
  }

  protected getToolDefinitions(): ToolDefinition[] {
    return toolRegistry.getDefinitions(this.type);
  }

  private buildResult(success: boolean, output: string, startTime: number, error?: string): AgentResult {
    return {
      success,
      output,
      steps: [...this.steps],
      totalDurationMs: Date.now() - startTime,
      tokensUsed: this.tokensUsed,
      error,
    };
  }

  getStatus(): {
    id: string;
    name: string;
    type: string;
    status: AgentStatus;
    currentStep: number;
    totalSteps: number;
    tokensUsed: number;
  } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      currentStep: this.steps.length,
      totalSteps: this.maxIterations,
      tokensUsed: this.tokensUsed,
    };
  }
}
