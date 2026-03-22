// Providers
export { LLMProvider } from './providers/base.js';
export type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  EmbeddingResponse,
  ToolCallResponse,
  ToolDefinition as ProviderToolDefinition,
} from './providers/base.js';

export { GeminiProvider } from './providers/gemini.js';
export { OpenAIProvider } from './providers/openai.js';

// Router
export { AIRouter } from './router.js';
export type {
  TaskType,
  RouteConfig,
  CircuitBreakerState,
  AIRouterOptions,
} from './router.js';

// Tools
export {
  ToolRegistry,
  createSearchCodebaseTool,
  createExecuteCodeTool,
  createQueryDatabaseTool,
  createCreateTaskTool,
  createSendNotificationTool,
} from './tools.js';
export type {
  ToolDefinition,
  ToolParameter,
  ToolExecutionResult,
  ToolRegistryOptions,
} from './tools.js';

// Memory
export { AIMemoryManager } from './memory.js';
export type {
  MemoryEntry,
  MemorySearchResult,
  ShortTermStore,
  LongTermStore,
  EmbeddingProvider,
  SummarizationProvider,
  AIMemoryManagerOptions,
} from './memory.js';

// Agents
export { BaseAgent } from './agents/base.js';
export type {
  AgentType,
  AgentStatus,
  AgentCapability,
  AgentAction,
  AgentObservation,
  AgentPlan,
  AgentContext,
  AgentEventHandler,
} from './agents/base.js';

export { PlannerAgent } from './agents/planner.js';
export type { PlannerInput, PlannerResult } from './agents/planner.js';

export { DeveloperAgent } from './agents/developer.js';
export type { CodeGenerationResult, BugFixResult } from './agents/developer.js';

export { ReviewerAgent } from './agents/reviewer.js';
export type {
  ReviewSeverity,
  ReviewFinding,
  ReviewResult,
} from './agents/reviewer.js';

export { AgentOrchestrator } from './agents/orchestrator.js';
export type {
  AgentMessage,
  OrchestratedTask,
  OrchestrationPlan,
  OrchestratorOptions,
} from './agents/orchestrator.js';
