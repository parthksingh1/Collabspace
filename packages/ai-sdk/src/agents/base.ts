import type { AIMemoryManager } from '../memory.js';
import type { AIRouter } from '../router.js';
import type { ToolRegistry } from '../tools.js';

// ─── Types ─────────────────────────────────────────────────────────

export type AgentType = 'planner' | 'developer' | 'reviewer' | 'meeting' | 'knowledge' | 'execution';
export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'observing' | 'error';

export interface AgentCapability {
  name: string;
  description: string;
}

export interface AgentAction {
  type: string;
  description: string;
  params: Record<string, unknown>;
}

export interface AgentObservation {
  action: AgentAction;
  result: unknown;
  success: boolean;
  error?: string;
}

export interface AgentPlan {
  goal: string;
  steps: AgentAction[];
  currentStep: number;
}

export interface AgentContext {
  router: AIRouter;
  tools: ToolRegistry;
  memory: AIMemoryManager;
}

export interface AgentEventHandler {
  onStatusChange?: (agentId: string, status: AgentStatus) => void;
  onThought?: (agentId: string, thought: string) => void;
  onAction?: (agentId: string, action: AgentAction) => void;
  onObservation?: (agentId: string, observation: AgentObservation) => void;
  onComplete?: (agentId: string, result: unknown) => void;
  onError?: (agentId: string, error: Error) => void;
}

// ─── Base Agent ────────────────────────────────────────────────────

/**
 * Abstract base class for AI agents.
 * Implements the Think-Act-Observe loop.
 */
export abstract class BaseAgent {
  public readonly id: string;
  public readonly name: string;
  public readonly type: AgentType;
  public readonly capabilities: AgentCapability[];

  protected status: AgentStatus = 'idle';
  protected context: AgentContext;
  protected eventHandler?: AgentEventHandler;
  protected plan: AgentPlan | null = null;
  protected maxIterations: number;

  constructor(config: {
    id: string;
    name: string;
    type: AgentType;
    capabilities: AgentCapability[];
    context: AgentContext;
    eventHandler?: AgentEventHandler;
    maxIterations?: number;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.capabilities = config.capabilities;
    this.context = config.context;
    this.eventHandler = config.eventHandler;
    this.maxIterations = config.maxIterations ?? 10;
  }

  /**
   * Get the current agent status.
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Set the agent status and emit event.
   */
  protected setStatus(status: AgentStatus): void {
    this.status = status;
    this.eventHandler?.onStatusChange?.(this.id, status);
  }

  /**
   * Think phase: analyze input and decide on actions.
   */
  abstract think(input: string): Promise<AgentAction[]>;

  /**
   * Act phase: execute an action using tools or the LLM.
   */
  abstract act(action: AgentAction): Promise<unknown>;

  /**
   * Observe phase: analyze the result of an action.
   */
  abstract observe(observation: AgentObservation): Promise<{
    continue: boolean;
    nextActions?: AgentAction[];
    result?: unknown;
  }>;

  /**
   * Plan phase: create a high-level plan to achieve a goal.
   */
  abstract plan(goal: string): Promise<AgentPlan>;

  /**
   * Run the full Think-Act-Observe loop for a given input.
   */
  async run(input: string): Promise<unknown> {
    this.setStatus('thinking');
    let iterations = 0;

    try {
      let actions = await this.think(input);
      this.eventHandler?.onThought?.(this.id, `Planned ${actions.length} action(s)`);

      while (actions.length > 0 && iterations < this.maxIterations) {
        iterations++;

        for (const action of actions) {
          // Act
          this.setStatus('acting');
          this.eventHandler?.onAction?.(this.id, action);

          let result: unknown;
          let success = true;
          let error: string | undefined;

          try {
            result = await this.act(action);
          } catch (err) {
            success = false;
            error = err instanceof Error ? err.message : String(err);
            result = null;
          }

          // Observe
          this.setStatus('observing');
          const observation: AgentObservation = { action, result, success, error };
          this.eventHandler?.onObservation?.(this.id, observation);

          const evaluation = await this.observe(observation);

          if (!evaluation.continue) {
            this.setStatus('idle');
            this.eventHandler?.onComplete?.(this.id, evaluation.result);
            return evaluation.result;
          }

          if (evaluation.nextActions) {
            actions = evaluation.nextActions;
          }
        }

        // If we ran through all actions without returning, think again
        this.setStatus('thinking');
        actions = await this.think(`Continue from iteration ${iterations}`);
      }

      // Max iterations reached
      this.setStatus('idle');
      const finalResult = { status: 'max_iterations_reached', iterations };
      this.eventHandler?.onComplete?.(this.id, finalResult);
      return finalResult;
    } catch (error) {
      this.setStatus('error');
      const err = error instanceof Error ? error : new Error(String(error));
      this.eventHandler?.onError?.(this.id, err);
      throw err;
    }
  }

  /**
   * Store a thought/result in agent memory.
   */
  protected async remember(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.context.memory.remember(content, {
      agentId: this.id,
      agentType: this.type,
      ...metadata,
    });
  }

  /**
   * Recall relevant memories.
   */
  protected async recall(query: string, topK: number = 5): Promise<string[]> {
    const results = await this.context.memory.recall(query, topK, { agentId: this.id });
    return results.map((r) => r.entry.content);
  }
}
