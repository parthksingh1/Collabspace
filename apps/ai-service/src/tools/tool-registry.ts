import { logger } from '../utils/logger.js';
import { ToolDefinition } from '../providers/base-provider.js';

// ---------------------------------------------------------------------------
// Tool interface
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  workspaceId: string;
  authToken?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  agentTypes?: string[]; // which agent types can use this tool
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, Tool> = new Map();

  private constructor() {}

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool already registered, overwriting: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name}`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return [...this.tools.values()];
  }

  getForAgent(agentType: string): Tool[] {
    return [...this.tools.values()].filter((tool) => {
      if (!tool.agentTypes || tool.agentTypes.length === 0) return true;
      return tool.agentTypes.includes(agentType);
    });
  }

  getDefinitions(agentType?: string): ToolDefinition[] {
    const tools = agentType ? this.getForAgent(agentType) : this.getAll();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      logger.error(`Tool not found: ${name}`);
      return { success: false, data: null, error: `Tool not found: ${name}` };
    }

    const startTime = Date.now();
    try {
      const result = await tool.execute(args, context);
      const duration = Date.now() - startTime;
      logger.info(`Tool executed: ${name}`, {
        success: result.success,
        durationMs: duration,
      });
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Tool execution failed: ${name}`, {
        error: errorMsg,
        durationMs: duration,
      });
      return { success: false, data: null, error: errorMsg };
    }
  }

  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.info(`Unregistered tool: ${name}`);
    }
    return existed;
  }

  clear(): void {
    this.tools.clear();
  }
}

export const toolRegistry = ToolRegistry.getInstance();
