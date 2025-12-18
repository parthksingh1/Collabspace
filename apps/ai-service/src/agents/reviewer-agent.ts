import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import { TaskType } from '../gateway/ai-router.js';

const REVIEWER_SYSTEM_PROMPT = `You are a senior code reviewer and security analyst. You provide thorough, constructive, and actionable feedback.

Your review categories:
1. **Bugs** — Logic errors, race conditions, off-by-one errors
2. **Security** — Injection, XSS, CSRF, auth bypass, secrets exposure
3. **Performance** — N+1 queries, memory leaks, unnecessary re-renders, expensive operations
4. **Code Quality** — DRY violations, naming, complexity, error handling
5. **Architecture** — Coupling, separation of concerns, API design
6. **Testing** — Missing tests, edge cases, test quality
7. **Documentation** — Missing or outdated comments, unclear APIs

For each issue found, provide:
- **Severity**: critical | major | minor | suggestion
- **Category**: one of the categories above
- **Location**: file path and line range (if applicable)
- **Issue**: clear description of the problem
- **Why it matters**: impact explanation
- **Fix**: specific code suggestion

Your review should also:
- Acknowledge good patterns and practices you see
- Suggest improvements even if there are no bugs
- Consider edge cases and error scenarios
- Check for consistent coding style

Output format:
{
  "summary": "Overall assessment in 2-3 sentences",
  "score": number (1-10),
  "issues": [
    {
      "severity": "major",
      "category": "security",
      "location": "path/file.ts:15-20",
      "issue": "Description",
      "impact": "Why this matters",
      "suggestion": "How to fix"
    }
  ],
  "positives": ["Good things noticed"],
  "recommendations": ["High-level improvement suggestions"]
}`;

export class ReviewerAgent extends BaseAgent {
  readonly name = 'Reviewer Agent';
  readonly type = 'reviewer';
  readonly capabilities = [
    'review_code',
    'find_bugs',
    'security_audit',
    'performance_review',
    'suggest_improvements',
    'check_best_practices',
  ];
  protected readonly systemPrompt = REVIEWER_SYSTEM_PROMPT;
  protected readonly taskType: TaskType = 'complex_reasoning';

  constructor(id: string) {
    super(id);
  }

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    const enrichedGoal = `Review the following code or document:

${goal}

Steps:
1. Search the codebase for the relevant files and context.
2. Understand the purpose and architecture of the code.
3. Perform a thorough review covering all categories (bugs, security, performance, code quality, architecture, testing, documentation).
4. Search for any related documentation or specs.
5. Provide a structured review with specific, actionable feedback.

Begin by searching for the relevant code.`;

    return super.run(enrichedGoal, context);
  }

  protected observe(result: string): string {
    // Extract key details from search results for review context
    try {
      const cleaned = result.replace(/^Tool \w+ succeeded: /, '');
      const data = JSON.parse(cleaned);
      if (data?.results && Array.isArray(data.results)) {
        return data.results
          .slice(0, 15)
          .map((r: Record<string, unknown>) => {
            const path = r.filePath ?? r.title ?? '';
            const content = (r.content ?? r.excerpt ?? '').toString();
            return `--- ${path} ---\n${content}`;
          })
          .join('\n\n');
      }
    } catch {
      // Return as-is
    }
    return result;
  }
}
