import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import { TaskType } from '../gateway/ai-router.js';
import { logger } from '../utils/logger.js';

const DEVELOPER_SYSTEM_PROMPT = `You are an expert full-stack software developer working on a collaborative workspace application.

Your responsibilities:
1. Understand feature requirements or bug descriptions thoroughly.
2. Search the existing codebase to understand patterns and conventions.
3. Write clean, production-quality code that follows the project's style.
4. Test your code by executing it when possible.
5. Update related tasks with progress.

Coding standards:
- TypeScript with strict mode
- Use modern ES2022+ features
- Proper error handling with typed errors
- Input validation using zod or similar
- Descriptive variable names, no abbreviations
- JSDoc comments for public functions
- Follow existing patterns in the codebase

When implementing a feature:
1. First search the codebase for related code and patterns
2. Understand the existing architecture
3. Write the implementation following existing conventions
4. Test the code if possible
5. Provide the complete code with clear file paths

When fixing a bug:
1. Search for the relevant code
2. Understand the root cause
3. Write a minimal fix that does not break other functionality
4. Verify the fix if possible

Your output should be well-structured with:
- Summary of changes
- File-by-file code changes with complete file paths
- Explanation of key decisions
- Any follow-up items or known limitations

Format code changes as:
\`\`\`typescript
// File: path/to/file.ts
// Description of changes

<complete code>
\`\`\``;

export class DeveloperAgent extends BaseAgent {
  readonly name = 'Developer Agent';
  readonly type = 'developer';
  readonly capabilities = [
    'write_code',
    'fix_bugs',
    'implement_features',
    'refactor_code',
    'write_tests',
    'debug_issues',
  ];
  protected readonly systemPrompt = DEVELOPER_SYSTEM_PROMPT;
  protected readonly taskType: TaskType = 'code_generation';

  constructor(id: string) {
    super(id);
  }

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    const enrichedGoal = `Implement the following:

${goal}

Steps:
1. Search the codebase to understand existing patterns and related code.
2. Plan the implementation approach.
3. Write the code, file by file.
4. If possible, test the code using the execute_code tool.
5. Update any related tasks.
6. Provide a comprehensive summary of all changes.

Begin by searching the codebase for relevant context.`;

    return super.run(enrichedGoal, context);
  }

  protected observe(result: string): string {
    // Detect execution results and format them clearly
    if (result.includes('exitCode')) {
      try {
        const data = JSON.parse(result.replace(/^Tool \w+ succeeded: /, ''));
        if (data && typeof data === 'object') {
          const parts: string[] = [];
          if (data.stdout) parts.push(`stdout:\n${data.stdout}`);
          if (data.stderr) parts.push(`stderr:\n${data.stderr}`);
          parts.push(`Exit code: ${data.exitCode}`);
          if (data.timedOut) parts.push('WARNING: Execution timed out');
          return parts.join('\n\n');
        }
      } catch {
        // Not parseable, return as-is
      }
    }

    // Detect search results and summarize
    if (result.includes('"filePath"') || result.includes('"results"')) {
      try {
        const data = JSON.parse(result.replace(/^Tool \w+ succeeded: /, ''));
        if (data?.results && Array.isArray(data.results)) {
          const summary = data.results
            .slice(0, 10)
            .map((r: Record<string, unknown>) => {
              const path = r.filePath ?? r.title ?? 'unknown';
              const snippet = (r.content ?? r.excerpt ?? '').toString().slice(0, 200);
              return `- ${path}: ${snippet}`;
            })
            .join('\n');
          return `Found ${data.results.length} results:\n${summary}`;
        }
      } catch {
        // Not parseable
      }
    }

    return result;
  }
}
