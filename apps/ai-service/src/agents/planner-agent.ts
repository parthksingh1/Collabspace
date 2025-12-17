import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import { TaskType } from '../gateway/ai-router.js';
import { aiRouter } from '../gateway/ai-router.js';
import { logger } from '../utils/logger.js';

const PLANNER_SYSTEM_PROMPT = `You are an expert project manager and sprint planner for a collaborative software development team.

Your responsibilities:
1. Analyze high-level goals and requirements thoroughly.
2. Break down work into well-defined, actionable tasks.
3. Estimate effort using story points (1, 2, 3, 5, 8, 13).
4. Identify dependencies between tasks.
5. Prioritize tasks by business value, technical risk, and dependencies.
6. Organize tasks into logical sprints.

For each task you create, include:
- A clear, concise title
- A detailed description with acceptance criteria
- Story point estimate
- Priority (low / medium / high / urgent)
- Dependencies on other tasks (if any)
- Suggested assignee type (frontend / backend / fullstack / devops / designer)
- Labels/tags for categorization

When searching the codebase, look for:
- Existing implementations that relate to the goal
- Patterns and conventions used in the project
- Potential areas of conflict or integration points

When querying documents, look for:
- Existing specs or design docs
- Previous sprint retrospectives for estimation calibration
- Technical decision records

Always output a structured plan in JSON format at the end with the following shape:
{
  "summary": "brief summary of the plan",
  "totalEstimate": number,
  "sprints": [
    {
      "name": "Sprint name",
      "goal": "Sprint goal",
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed description with AC",
          "estimate": number,
          "priority": "high",
          "dependencies": [],
          "assigneeType": "fullstack",
          "labels": ["feature"]
        }
      ]
    }
  ],
  "risks": ["Identified risks"],
  "assumptions": ["Key assumptions"]
}`;

export class PlannerAgent extends BaseAgent {
  readonly name = 'Planner Agent';
  readonly type = 'planner';
  readonly capabilities = [
    'analyze_requirements',
    'break_into_tasks',
    'estimate_effort',
    'prioritize_tasks',
    'create_sprints',
    'identify_dependencies',
  ];
  protected readonly systemPrompt = PLANNER_SYSTEM_PROMPT;
  protected readonly taskType: TaskType = 'complex_reasoning';

  constructor(id: string) {
    super(id);
  }

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    // First, gather context from workspace
    const enrichedGoal = await this.enrichGoalWithContext(goal, context);
    return super.run(enrichedGoal, context);
  }

  private async enrichGoalWithContext(goal: string, context: AgentContext): Promise<string> {
    try {
      // Ask the LLM to help form the enriched goal
      const response = await aiRouter.chat(
        [
          {
            role: 'user',
            content: `I need to plan the following goal for my team. Help me articulate it more precisely by identifying key areas to investigate:

Goal: ${goal}

List 3-5 specific questions I should answer before creating a detailed plan. Keep it brief.`,
          },
        ],
        { temperature: 0.3, maxTokens: 512 },
        'fast_response',
        context.userId,
      );

      this.tokensUsed += response.usage.totalTokens;

      return `${goal}

Key considerations identified:
${response.content}

Please create a comprehensive project plan addressing the goal and these considerations. Use available tools to search the codebase and documents for relevant context before creating the plan.`;
    } catch (err) {
      logger.warn('Failed to enrich planner goal', {
        error: err instanceof Error ? err.message : String(err),
      });
      return goal;
    }
  }

  protected observe(result: string): string {
    // Parse any task-related data from tool results to inform next steps
    try {
      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === 'object') {
        if ('results' in parsed && Array.isArray(parsed.results)) {
          return `Found ${parsed.results.length} relevant items. Key findings:\n${
            parsed.results
              .slice(0, 5)
              .map((r: Record<string, unknown>) => `- ${r.title ?? r.filePath ?? JSON.stringify(r).slice(0, 100)}`)
              .join('\n')
          }`;
        }
      }
    } catch {
      // Not JSON, return as-is
    }
    return result;
  }
}
