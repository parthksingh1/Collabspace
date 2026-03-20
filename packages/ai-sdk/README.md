# @collabspace/ai-sdk

AI abstraction layer with multi-LLM support, agent framework, and memory system.

## Usage

```typescript
import {
  // Providers
  GeminiProvider, OpenAIProvider,
  // Router
  AIRouter,
  // Agents
  PlannerAgent, DeveloperAgent, ReviewerAgent,
  AgentOrchestrator,
  // Tools
  ToolRegistry,
  // Memory
  AIMemoryManager,
} from '@collabspace/ai-sdk';

// Route AI requests to the best model
const router = new AIRouter();
const response = await router.route({
  task: 'code_generation',
  messages: [{ role: 'user', content: 'Write a REST API endpoint' }],
});

// Run an agent
const orchestrator = new AgentOrchestrator();
const result = await orchestrator.executeAgent('planner', 'Plan sprint for v2.1');
```

## Components

| Module | Description |
|--------|-------------|
| `providers/gemini.ts` | Gemini API with chat, streaming, embeddings, function calling |
| `providers/openai.ts` | OpenAI API with chat, streaming, embeddings, function calling |
| `router.ts` | Task-based model routing with fallback chains and circuit breaker |
| `tools.ts` | Tool registry with 6 built-in tools and timeout enforcement |
| `memory.ts` | Short-term (Redis) + long-term (vector DB) memory management |
| `agents/base.ts` | Base agent with think → act → observe lifecycle |
| `agents/planner.ts` | Sprint planning and task decomposition |
| `agents/developer.ts` | Code generation and bug fixing |
| `agents/reviewer.ts` | Code review with severity levels |
| `agents/orchestrator.ts` | Multi-agent workflow management |

## Model Routing

| Task Type | Primary | Fallback |
|-----------|---------|----------|
| `code_generation` | Gemini Pro | GPT-4o |
| `long_context` | Gemini Pro (1M) | GPT-4o |
| `fast_response` | Gemini Flash | GPT-4o-mini |
| `embedding` | text-embedding-004 | text-embedding-3-small |
