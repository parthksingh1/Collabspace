import {
  BaseAgent,
  type AgentAction,
  type AgentObservation,
  type AgentPlan,
  type AgentContext,
  type AgentEventHandler,
  type AgentCapability,
} from './base.js';

const PLANNER_CAPABILITIES: AgentCapability[] = [
  { name: 'goal_decomposition', description: 'Break high-level goals into actionable tasks' },
  { name: 'sprint_planning', description: 'Create sprint plans with priorities and estimates' },
  { name: 'dependency_analysis', description: 'Identify task dependencies and critical paths' },
  { name: 'resource_allocation', description: 'Suggest task assignments based on team context' },
];

const PLANNER_SYSTEM_PROMPT = `You are a project planning AI agent. Your job is to:
1. Break down high-level goals into concrete, actionable tasks
2. Prioritize tasks and estimate story points
3. Identify dependencies between tasks
4. Create sprint plans with clear goals
5. Consider the team's capacity and expertise

Respond with structured JSON containing your analysis and proposed actions.`;

export interface PlannerInput {
  goal: string;
  projectContext?: {
    projectId: string;
    existingTasks?: Array<{ id: string; title: string; status: string }>;
    teamMembers?: Array<{ id: string; name: string; skills: string[] }>;
    sprintCapacity?: number;
  };
}

export interface PlannerResult {
  tasks: Array<{
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    storyPoints: number;
    assigneeId?: string;
    dependencies: string[];
    labels: string[];
  }>;
  sprints: Array<{
    name: string;
    goals: string[];
    taskTitles: string[];
    durationDays: number;
  }>;
  risks: string[];
  recommendations: string[];
}

/**
 * AI agent that takes high-level goals and breaks them into tasks and sprint plans.
 */
export class PlannerAgent extends BaseAgent {
  constructor(config: {
    id: string;
    context: AgentContext;
    eventHandler?: AgentEventHandler;
    maxIterations?: number;
  }) {
    super({
      id: config.id,
      name: 'Planner Agent',
      type: 'planner',
      capabilities: PLANNER_CAPABILITIES,
      context: config.context,
      eventHandler: config.eventHandler,
      maxIterations: config.maxIterations ?? 5,
    });
  }

  async think(input: string): Promise<AgentAction[]> {
    // Use the router to analyze the goal
    const response = await this.context.router.chat('planning', [
      { role: 'user', content: input },
    ], {
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.3,
    });

    const analysis = JSON.parse(response.content) as {
      actions: Array<{ type: string; description: string; params: Record<string, unknown> }>;
    };

    await this.remember(`Planning analysis for: ${input}`, { type: 'analysis' });

    return analysis.actions?.map((a) => ({
      type: a.type,
      description: a.description,
      params: a.params,
    })) ?? [{
      type: 'create_plan',
      description: 'Create a plan based on the goal',
      params: { goal: input },
    }];
  }

  async act(action: AgentAction): Promise<unknown> {
    switch (action.type) {
      case 'create_plan':
        return this.createPlan(action.params['goal'] as string, action.params['context'] as PlannerInput['projectContext']);

      case 'create_tasks': {
        const tasks = action.params['tasks'] as Array<Record<string, unknown>>;
        const results = [];
        for (const task of tasks) {
          const result = await this.context.tools.execute('create_task', task);
          results.push(result);
        }
        return results;
      }

      case 'analyze_dependencies':
        return this.analyzeDependencies(action.params['tasks'] as Array<Record<string, unknown>>);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  async observe(observation: AgentObservation): Promise<{
    continue: boolean;
    nextActions?: AgentAction[];
    result?: unknown;
  }> {
    if (!observation.success) {
      // Retry with adjusted approach
      return {
        continue: true,
        nextActions: [{
          type: observation.action.type,
          description: `Retry: ${observation.action.description}`,
          params: { ...observation.action.params, retry: true },
        }],
      };
    }

    // If we just created a plan, the next step is to create tasks
    if (observation.action.type === 'create_plan') {
      const plan = observation.result as PlannerResult;
      return {
        continue: false,
        result: plan,
      };
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

  private async createPlan(
    goal: string,
    projectContext?: PlannerInput['projectContext'],
  ): Promise<PlannerResult> {
    const contextStr = projectContext
      ? `\n\nProject context:\n- Existing tasks: ${JSON.stringify(projectContext.existingTasks ?? [])}\n- Team: ${JSON.stringify(projectContext.teamMembers ?? [])}\n- Sprint capacity: ${projectContext.sprintCapacity ?? 'unknown'}`
      : '';

    const relevantMemories = await this.recall(goal, 3);
    const memoryContext = relevantMemories.length > 0
      ? `\n\nRelevant past context:\n${relevantMemories.map((m) => `- ${m}`).join('\n')}`
      : '';

    const response = await this.context.router.chat('planning', [
      {
        role: 'user',
        content: `Create a detailed project plan for the following goal:\n\n${goal}${contextStr}${memoryContext}\n\nRespond with JSON matching this schema:\n{\n  "tasks": [{ "title", "description", "priority", "storyPoints", "assigneeId?", "dependencies", "labels" }],\n  "sprints": [{ "name", "goals", "taskTitles", "durationDays" }],\n  "risks": ["..."],\n  "recommendations": ["..."]\n}`,
      },
    ], {
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.4,
      maxTokens: 8192,
    });

    const plan = JSON.parse(response.content) as PlannerResult;

    await this.remember(`Created plan for "${goal}" with ${plan.tasks.length} tasks and ${plan.sprints.length} sprints`, {
      type: 'plan_created',
      taskCount: plan.tasks.length,
      sprintCount: plan.sprints.length,
    });

    return plan;
  }

  private async analyzeDependencies(
    tasks: Array<Record<string, unknown>>,
  ): Promise<Record<string, string[]>> {
    const response = await this.context.router.chat('planning', [
      {
        role: 'user',
        content: `Analyze dependencies between these tasks and return a JSON map of task title to array of dependency titles:\n\n${JSON.stringify(tasks, null, 2)}`,
      },
    ], {
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      responseFormat: 'json',
      temperature: 0.2,
    });

    return JSON.parse(response.content) as Record<string, string[]>;
  }
}
