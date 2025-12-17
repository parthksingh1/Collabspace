import { BaseAgent, AgentContext, AgentResult, AgentStatus } from './base-agent.js';
import { PlannerAgent } from './planner-agent.js';
import { DeveloperAgent } from './developer-agent.js';
import { ReviewerAgent } from './reviewer-agent.js';
import { MeetingAgent } from './meeting-agent.js';
import { KnowledgeAgent } from './knowledge-agent.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentType = 'planner' | 'developer' | 'reviewer' | 'meeting' | 'knowledge';

export interface WorkflowStep {
  id: string;
  agentType: AgentType;
  goal: string;
  dependsOn?: string[];
  condition?: (previousResults: Map<string, AgentResult>) => boolean;
  transformGoal?: (goal: string, previousResults: Map<string, AgentResult>) => string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  mode: 'sequential' | 'parallel' | 'conditional';
}

export interface ExecutionRecord {
  executionId: string;
  agentType: AgentType;
  goal: string;
  status: AgentStatus;
  result?: AgentResult;
  startedAt: number;
  completedAt?: number;
  agent: BaseAgent;
}

type OrchestratorEvent = 'agent_started' | 'agent_completed' | 'agent_failed' | 'workflow_completed';
type OrchestratorListener = (data: {
  executionId: string;
  agentType: AgentType;
  event: OrchestratorEvent;
  result?: AgentResult;
  error?: string;
}) => void;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class AgentOrchestrator {
  private executions: Map<string, ExecutionRecord> = new Map();
  private activeCount: number = 0;
  private executionCounter: number = 0;
  private listeners: Map<OrchestratorEvent, OrchestratorListener[]> = new Map();

  // -----------------------------------------------------------------------
  // Event system
  // -----------------------------------------------------------------------

  on(event: OrchestratorEvent, listener: OrchestratorListener): void {
    const existing = this.listeners.get(event) ?? [];
    existing.push(listener);
    this.listeners.set(event, existing);
  }

  private emit(event: OrchestratorEvent, data: Parameters<OrchestratorListener>[0]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (err) {
        logger.error('Orchestrator listener error', {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Agent factory
  // -----------------------------------------------------------------------

  private createAgent(type: AgentType, executionId: string): BaseAgent {
    switch (type) {
      case 'planner':
        return new PlannerAgent(executionId);
      case 'developer':
        return new DeveloperAgent(executionId);
      case 'reviewer':
        return new ReviewerAgent(executionId);
      case 'meeting':
        return new MeetingAgent(executionId);
      case 'knowledge':
        return new KnowledgeAgent(executionId);
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  private generateExecutionId(): string {
    this.executionCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.executionCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).slice(2, 8);
    return `exec_${timestamp}_${counter}_${random}`;
  }

  // -----------------------------------------------------------------------
  // Single agent execution
  // -----------------------------------------------------------------------

  async executeAgent(
    type: AgentType,
    goal: string,
    context: AgentContext,
  ): Promise<{ executionId: string; result: AgentResult }> {
    if (this.activeCount >= config.agentConcurrencyLimit) {
      throw new Error(
        `Agent concurrency limit reached (${config.agentConcurrencyLimit}). Try again later.`,
      );
    }

    const executionId = this.generateExecutionId();
    const agent = this.createAgent(type, executionId);

    const record: ExecutionRecord = {
      executionId,
      agentType: type,
      goal,
      status: 'thinking',
      startedAt: Date.now(),
      agent,
    };

    this.executions.set(executionId, record);
    this.activeCount++;

    logger.info('Agent execution started', { executionId, type, goal: goal.slice(0, 200) });
    this.emit('agent_started', { executionId, agentType: type, event: 'agent_started' });

    try {
      const result = await agent.run(goal, context);

      record.status = result.success ? 'done' : 'error';
      record.result = result;
      record.completedAt = Date.now();

      logger.info('Agent execution completed', {
        executionId,
        type,
        success: result.success,
        durationMs: result.totalDurationMs,
        tokensUsed: result.tokensUsed,
      });

      this.emit('agent_completed', {
        executionId,
        agentType: type,
        event: 'agent_completed',
        result,
      });

      return { executionId, result };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      record.status = 'error';
      record.result = {
        success: false,
        output: '',
        steps: [],
        totalDurationMs: Date.now() - record.startedAt,
        tokensUsed: 0,
        error: errorMsg,
      };
      record.completedAt = Date.now();

      logger.error('Agent execution failed', { executionId, type, error: errorMsg });
      this.emit('agent_failed', {
        executionId,
        agentType: type,
        event: 'agent_failed',
        error: errorMsg,
      });

      return { executionId, result: record.result };
    } finally {
      this.activeCount--;
    }
  }

  // -----------------------------------------------------------------------
  // Multi-agent workflow
  // -----------------------------------------------------------------------

  async executeWorkflow(
    workflow: Workflow,
    context: AgentContext,
  ): Promise<{ workflowId: string; results: Map<string, AgentResult> }> {
    const results = new Map<string, AgentResult>();
    const workflowId = `wf_${this.generateExecutionId()}`;

    logger.info('Workflow started', {
      workflowId,
      name: workflow.name,
      mode: workflow.mode,
      steps: workflow.steps.length,
    });

    try {
      switch (workflow.mode) {
        case 'sequential':
          await this.executeSequential(workflow.steps, context, results);
          break;
        case 'parallel':
          await this.executeParallel(workflow.steps, context, results);
          break;
        case 'conditional':
          await this.executeConditional(workflow.steps, context, results);
          break;
      }

      logger.info('Workflow completed', { workflowId, name: workflow.name });
      this.emit('workflow_completed', {
        executionId: workflowId,
        agentType: 'planner', // workflow-level event
        event: 'workflow_completed',
      });

      return { workflowId, results };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('Workflow failed', { workflowId, error: errorMsg });
      throw err;
    }
  }

  private async executeSequential(
    steps: WorkflowStep[],
    context: AgentContext,
    results: Map<string, AgentResult>,
  ): Promise<void> {
    for (const step of steps) {
      const goal = step.transformGoal
        ? step.transformGoal(step.goal, results)
        : step.goal;

      const { result } = await this.executeAgent(step.agentType, goal, context);
      results.set(step.id, result);

      if (!result.success) {
        logger.warn(`Sequential workflow step failed: ${step.id}`, {
          error: result.error,
        });
        // Continue — allow subsequent steps to handle the failure
      }
    }
  }

  private async executeParallel(
    steps: WorkflowStep[],
    context: AgentContext,
    results: Map<string, AgentResult>,
  ): Promise<void> {
    // Group steps by dependency level
    const levels = this.topologicalSort(steps);

    for (const level of levels) {
      const promises = level.map(async (step) => {
        const goal = step.transformGoal
          ? step.transformGoal(step.goal, results)
          : step.goal;

        const { result } = await this.executeAgent(step.agentType, goal, context);
        results.set(step.id, result);
      });

      await Promise.allSettled(promises);
    }
  }

  private async executeConditional(
    steps: WorkflowStep[],
    context: AgentContext,
    results: Map<string, AgentResult>,
  ): Promise<void> {
    for (const step of steps) {
      // Check condition if present
      if (step.condition && !step.condition(results)) {
        logger.info(`Skipping conditional step: ${step.id}`);
        continue;
      }

      // Check dependencies
      if (step.dependsOn) {
        const depsReady = step.dependsOn.every((dep) => results.has(dep));
        if (!depsReady) {
          logger.warn(`Dependencies not met for step: ${step.id}`, {
            dependsOn: step.dependsOn,
            completed: [...results.keys()],
          });
          continue;
        }
      }

      const goal = step.transformGoal
        ? step.transformGoal(step.goal, results)
        : step.goal;

      const { result } = await this.executeAgent(step.agentType, goal, context);
      results.set(step.id, result);
    }
  }

  private topologicalSort(steps: WorkflowStep[]): WorkflowStep[][] {
    const stepMap = new Map(steps.map((s) => [s.id, s]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, step.dependsOn?.length ?? 0);
      for (const dep of step.dependsOn ?? []) {
        const existing = adjacency.get(dep) ?? [];
        existing.push(step.id);
        adjacency.set(dep, existing);
      }
    }

    const levels: WorkflowStep[][] = [];
    const remaining = new Set(steps.map((s) => s.id));

    while (remaining.size > 0) {
      const level: WorkflowStep[] = [];

      for (const id of remaining) {
        if ((inDegree.get(id) ?? 0) <= 0) {
          const step = stepMap.get(id);
          if (step) level.push(step);
        }
      }

      if (level.length === 0) {
        // Circular dependency — add remaining steps as a single level
        for (const id of remaining) {
          const step = stepMap.get(id);
          if (step) level.push(step);
        }
        levels.push(level);
        break;
      }

      for (const step of level) {
        remaining.delete(step.id);
        for (const neighbor of adjacency.get(step.id) ?? []) {
          inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
        }
      }

      levels.push(level);
    }

    return levels;
  }

  // -----------------------------------------------------------------------
  // Agent delegation
  // -----------------------------------------------------------------------

  async delegateToAgent(
    parentExecutionId: string,
    childType: AgentType,
    subGoal: string,
    context: AgentContext,
  ): Promise<AgentResult> {
    const parentRecord = this.executions.get(parentExecutionId);
    if (!parentRecord) {
      throw new Error(`Parent execution not found: ${parentExecutionId}`);
    }

    const childContext: AgentContext = {
      ...context,
      parentAgentId: parentExecutionId,
      sharedMemory: context.sharedMemory ?? new Map(),
    };

    logger.info('Agent delegation', {
      parentId: parentExecutionId,
      childType,
      subGoal: subGoal.slice(0, 200),
    });

    const { result } = await this.executeAgent(childType, subGoal, childContext);
    return result;
  }

  // -----------------------------------------------------------------------
  // Status & management
  // -----------------------------------------------------------------------

  getExecutionStatus(executionId: string): ExecutionRecord | undefined {
    return this.executions.get(executionId);
  }

  cancelExecution(executionId: string): boolean {
    const record = this.executions.get(executionId);
    if (!record) return false;

    if (record.status === 'done' || record.status === 'error' || record.status === 'cancelled') {
      return false;
    }

    record.agent.cancel();
    record.status = 'cancelled';
    record.completedAt = Date.now();

    logger.info('Agent execution cancelled', { executionId });
    return true;
  }

  getExecutionHistory(opts?: {
    agentType?: AgentType;
    limit?: number;
    offset?: number;
  }): {
    executions: Omit<ExecutionRecord, 'agent'>[];
    total: number;
  } {
    let records = [...this.executions.values()];

    if (opts?.agentType) {
      records = records.filter((r) => r.agentType === opts.agentType);
    }

    // Sort by start time descending
    records.sort((a, b) => b.startedAt - a.startedAt);

    const total = records.length;
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 20;
    const sliced = records.slice(offset, offset + limit);

    return {
      executions: sliced.map(({ agent: _agent, ...rest }) => rest),
      total,
    };
  }

  getActiveExecutions(): Omit<ExecutionRecord, 'agent'>[] {
    return [...this.executions.values()]
      .filter((r) => r.status === 'thinking' || r.status === 'acting')
      .map(({ agent: _agent, ...rest }) => rest);
  }

  getStats(): {
    activeExecutions: number;
    totalExecutions: number;
    concurrencyLimit: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const record of this.executions.values()) {
      byType[record.agentType] = (byType[record.agentType] ?? 0) + 1;
      byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
    }

    return {
      activeExecutions: this.activeCount,
      totalExecutions: this.executions.size,
      concurrencyLimit: config.agentConcurrencyLimit,
      byType,
      byStatus,
    };
  }

  // Clean up old execution records to prevent memory leaks
  cleanup(maxAgeMs: number = 3_600_000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const [id, record] of this.executions) {
      if (record.completedAt && record.completedAt < cutoff) {
        this.executions.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info(`Cleaned up ${removed} old execution records`);
    }

    return removed;
  }
}

export const orchestrator = new AgentOrchestrator();

// Periodic cleanup every 30 minutes
setInterval(() => {
  orchestrator.cleanup();
}, 30 * 60 * 1000);
