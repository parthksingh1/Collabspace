// ─── Types ─────────────────────────────────────────────────────────

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result: unknown;
  durationMs: number;
  error?: string;
}

export interface ToolRegistryOptions {
  /** Default timeout for tool execution in ms. Default: 30000. */
  defaultTimeoutMs?: number;
}

/**
 * Registry for AI-callable tools with execution, timeout, and sandboxing support.
 */
export class ToolRegistry {
  private readonly tools: Map<string, ToolDefinition> = new Map();
  private readonly defaultTimeoutMs: number;

  constructor(options?: ToolRegistryOptions) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 30_000;
  }

  /**
   * Register a tool.
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool definition by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool definitions in the format expected by LLM providers.
   */
  getSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Execute a tool by name with arguments and timeout.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        result: null,
        durationMs: 0,
        error: `Tool "${name}" not found`,
      };
    }

    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const start = Date.now();

    try {
      const result = await Promise.race([
        tool.execute(args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeout}ms`)), timeout),
        ),
      ]);

      return {
        toolName: name,
        success: true,
        result,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: name,
        success: false,
        result: null,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel.
   */
  async executeMany(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(calls.map((call) => this.execute(call.name, call.args)));
  }
}

// ─── Built-in Tool Factories ───────────────────────────────────────

/**
 * Create a search_codebase tool definition.
 */
export function createSearchCodebaseTool(
  handler: (args: { query: string; path?: string; language?: string }) => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'search_codebase',
    description: 'Search through the codebase for relevant code, files, or patterns.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query or regex pattern' },
        path: { type: 'string', description: 'Optional path filter (glob pattern)' },
        language: { type: 'string', description: 'Optional language filter' },
      },
      required: ['query'],
    },
    execute: (args) =>
      handler(args as { query: string; path?: string; language?: string }),
  };
}

/**
 * Create an execute_code tool definition.
 */
export function createExecuteCodeTool(
  handler: (args: { code: string; language: string; timeout?: number }) => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'execute_code',
    description: 'Execute code in a sandboxed environment and return the output.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Code to execute' },
        language: { type: 'string', description: 'Programming language', enum: ['javascript', 'typescript', 'python', 'go', 'rust'] },
        timeout: { type: 'number', description: 'Execution timeout in ms (default 30000)' },
      },
      required: ['code', 'language'],
    },
    execute: (args) =>
      handler(args as { code: string; language: string; timeout?: number }),
  };
}

/**
 * Create a query_database tool definition.
 */
export function createQueryDatabaseTool(
  handler: (args: { query: string; params?: unknown[] }) => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'query_database',
    description: 'Execute a read-only SQL query against the database.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query (read-only)' },
        params: { type: 'array', description: 'Query parameters', items: { type: 'string', description: 'Parameter value' } },
      },
      required: ['query'],
    },
    execute: (args) =>
      handler(args as { query: string; params?: unknown[] }),
  };
}

/**
 * Create a create_task tool definition.
 */
export function createCreateTaskTool(
  handler: (args: {
    title: string;
    description?: string;
    projectId: string;
    assigneeId?: string;
    priority?: string;
  }) => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'create_task',
    description: 'Create a new task in a project.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        projectId: { type: 'string', description: 'Project ID' },
        assigneeId: { type: 'string', description: 'Assignee user ID' },
        priority: { type: 'string', description: 'Task priority', enum: ['critical', 'high', 'medium', 'low'] },
      },
      required: ['title', 'projectId'],
    },
    execute: (args) =>
      handler(
        args as {
          title: string;
          description?: string;
          projectId: string;
          assigneeId?: string;
          priority?: string;
        },
      ),
  };
}

/**
 * Create a send_notification tool definition.
 */
export function createSendNotificationTool(
  handler: (args: { recipientId: string; title: string; body: string; type?: string }) => Promise<unknown>,
): ToolDefinition {
  return {
    name: 'send_notification',
    description: 'Send a notification to a user.',
    parameters: {
      type: 'object',
      properties: {
        recipientId: { type: 'string', description: 'Recipient user ID' },
        title: { type: 'string', description: 'Notification title' },
        body: { type: 'string', description: 'Notification body' },
        type: { type: 'string', description: 'Notification type', enum: ['mention', 'assignment', 'comment', 'status_change', 'system', 'ai_suggestion'] },
      },
      required: ['recipientId', 'title', 'body'],
    },
    execute: (args) =>
      handler(args as { recipientId: string; title: string; body: string; type?: string }),
  };
}
