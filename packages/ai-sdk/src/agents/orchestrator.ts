import { BaseAgent, type AgentStatus, type AgentEventHandler } from './base.js';

// ─── Types ─────────────────────────────────────────────────────────

export interface AgentMessage {
  fromAgentId: string;
  toAgentId: string;
  type: 'request' | 'response' | 'notification';
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface OrchestratedTask {
  id: string;
  description: string;
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  dependencies: string[]; // task IDs
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface OrchestrationPlan {
  tasks: OrchestratedTask[];
  parallelGroups: string[][]; // groups of task IDs that can run in parallel
}

export interface OrchestratorOptions {
  /** Maximum parallel agent executions. Default: 3. */
  maxParallel?: number;
  /** Timeout for individual agent tasks (ms). Default: 300000 (5 min). */
  taskTimeoutMs?: number;
  /** Event handler for orchestration events. */
  eventHandler?: AgentEventHandler;
}

/**
 * Orchestrates multiple AI agents, managing lifecycle, communication,
 * task delegation, and result aggregation.
 */
export class AgentOrchestrator {
  private readonly agents: Map<string, BaseAgent> = new Map();
  private readonly messageQueue: AgentMessage[] = [];
  private readonly taskResults: Map<string, unknown> = new Map();
  private readonly maxParallel: number;
  private readonly taskTimeoutMs: number;
  private readonly eventHandler?: AgentEventHandler;

  constructor(options?: OrchestratorOptions) {
    this.maxParallel = options?.maxParallel ?? 3;
    this.taskTimeoutMs = options?.taskTimeoutMs ?? 300_000;
    this.eventHandler = options?.eventHandler;
  }

  /**
   * Register an agent with the orchestrator.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent.
   */
  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Get a registered agent by ID.
   */
  getAgent(agentId: string): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all registered agents with their status.
   */
  listAgents(): Array<{ id: string; name: string; type: string; status: AgentStatus }> {
    return Array.from(this.agents.values()).map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.getStatus(),
    }));
  }

  /**
   * Send a message between agents.
   */
  sendMessage(message: Omit<AgentMessage, 'timestamp'>): void {
    this.messageQueue.push({
      ...message,
      timestamp: Date.now(),
    });
  }

  /**
   * Get pending messages for an agent.
   */
  getMessages(agentId: string): AgentMessage[] {
    const messages: AgentMessage[] = [];
    const remaining: AgentMessage[] = [];

    for (const msg of this.messageQueue) {
      if (msg.toAgentId === agentId) {
        messages.push(msg);
      } else {
        remaining.push(msg);
      }
    }

    this.messageQueue.length = 0;
    this.messageQueue.push(...remaining);

    return messages;
  }

  /**
   * Execute a single task by delegating to the appropriate agent.
   */
  async executeTask(task: OrchestratedTask): Promise<OrchestratedTask> {
    const agent = this.agents.get(task.agentId);
    if (!agent) {
      return {
        ...task,
        status: 'failed',
        error: `Agent "${task.agentId}" not found`,
        completedAt: Date.now(),
      };
    }

    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const result = await Promise.race([
        agent.run(task.description),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Task "${task.id}" timed out after ${this.taskTimeoutMs}ms`)),
            this.taskTimeoutMs,
          ),
        ),
      ]);

      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      this.taskResults.set(task.id, result);

      return task;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = Date.now();
      return task;
    }
  }

  /**
   * Execute an orchestration plan, respecting dependencies and parallelism.
   */
  async executePlan(plan: OrchestrationPlan): Promise<OrchestratedTask[]> {
    const completedTasks: OrchestratedTask[] = [];
    const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));

    for (const group of plan.parallelGroups) {
      // Wait for dependencies
      const readyTasks: OrchestratedTask[] = [];
      for (const taskId of group) {
        const task = taskMap.get(taskId);
        if (!task) continue;

        // Check all dependencies are completed
        const allDepsCompleted = task.dependencies.every((depId) => {
          const dep = taskMap.get(depId);
          return dep && dep.status === 'completed';
        });

        if (!allDepsCompleted) {
          task.status = 'failed';
          task.error = 'Dependency not met';
          completedTasks.push(task);
          continue;
        }

        readyTasks.push(task);
      }

      // Execute ready tasks in parallel batches
      const batches = this.createBatches(readyTasks, this.maxParallel);
      for (const batch of batches) {
        // Share context: attach dependency results to task descriptions
        const enrichedTasks = batch.map((task) => {
          const depResults = task.dependencies
            .map((depId) => {
              const result = this.taskResults.get(depId);
              return result ? `[Result from ${depId}]: ${JSON.stringify(result)}` : '';
            })
            .filter(Boolean)
            .join('\n');

          if (depResults) {
            return {
              ...task,
              description: `${task.description}\n\nContext from previous tasks:\n${depResults}`,
            };
          }
          return task;
        });

        const results = await Promise.allSettled(
          enrichedTasks.map((task) => this.executeTask(task)),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            completedTasks.push(result.value);
          }
        }
      }
    }

    return completedTasks;
  }

  /**
   * Create a simple plan from a goal by delegating to agents.
   */
  async planAndExecute(
    goal: string,
    agentIds: string[],
  ): Promise<{
    plan: OrchestrationPlan;
    results: OrchestratedTask[];
  }> {
    // Build a sequential plan using the specified agents
    const tasks: OrchestratedTask[] = agentIds.map((agentId, index) => ({
      id: `task_${index}`,
      description: index === 0
        ? goal
        : `Continue working on: ${goal} (building on previous results)`,
      agentId,
      status: 'pending' as const,
      dependencies: index > 0 ? [`task_${index - 1}`] : [],
    }));

    // First task is standalone, rest are sequential
    const parallelGroups = tasks.map((t) => [t.id]);

    const plan: OrchestrationPlan = { tasks, parallelGroups };
    const results = await this.executePlan(plan);

    return { plan, results };
  }

  /**
   * Get the result of a completed task.
   */
  getTaskResult(taskId: string): unknown | undefined {
    return this.taskResults.get(taskId);
  }

  /**
   * Clear all stored results and messages.
   */
  reset(): void {
    this.taskResults.clear();
    this.messageQueue.length = 0;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}
