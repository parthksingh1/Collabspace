import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
}

export const executeCodeTool: Tool = {
  name: 'execute_code',
  description:
    'Execute a code snippet in a sandboxed environment via the code execution service. Returns stdout, stderr, and exit code. Supports multiple languages.',
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'The code to execute',
      },
      language: {
        type: 'string',
        enum: ['javascript', 'typescript', 'python', 'bash', 'go', 'rust'],
        description: 'Programming language of the code',
      },
      timeoutMs: {
        type: 'number',
        description: 'Maximum execution time in milliseconds (default: 10000, max: 30000)',
      },
      stdin: {
        type: 'string',
        description: 'Standard input to provide to the program',
      },
    },
    required: ['code', 'language'],
  },
  agentTypes: ['developer', 'reviewer'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const code = String(args.code ?? '');
    const language = String(args.language ?? 'javascript');
    const timeoutMs = Math.min(Number(args.timeoutMs ?? 10_000), 30_000);
    const stdin = args.stdin ? String(args.stdin) : undefined;

    if (!code) {
      return { success: false, data: null, error: 'Code is required' };
    }

    // Basic safety check — reject obviously dangerous patterns
    const dangerousPatterns = [
      /process\.exit/i,
      /rm\s+-rf\s+\//,
      /format\s+c:/i,
      /eval\s*\(\s*require/i,
      /child_process/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          success: false,
          data: null,
          error: 'Code contains potentially dangerous operations and was blocked',
        };
      }
    }

    try {
      const response = await fetch(`${config.codeServiceUrl}/code/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(context.authToken && { Authorization: `Bearer ${context.authToken}` }),
        },
        body: JSON.stringify({
          workspaceId: context.workspaceId,
          code,
          language,
          timeoutMs,
          stdin,
        }),
        signal: AbortSignal.timeout(timeoutMs + 5_000), // Allow extra time for service overhead
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          data: null,
          error: `Code service error: ${response.status} ${errText}`,
        };
      }

      const result = (await response.json()) as ExecutionResult;

      return {
        success: true,
        data: {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
          timedOut: result.timedOut,
          language,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('execute_code tool error', { error: errorMsg, language });

      if (errorMsg.includes('timeout')) {
        return {
          success: true,
          data: {
            stdout: '',
            stderr: 'Execution timed out',
            exitCode: 124,
            executionTimeMs: timeoutMs,
            timedOut: true,
            language,
          } satisfies ExecutionResult & { language: string },
        };
      }

      return { success: false, data: null, error: errorMsg };
    }
  },
};
