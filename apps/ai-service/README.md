# AI Service

Multi-LLM gateway, agent orchestration, and predictive intelligence for CollabSpace.

## Port
`4008`

## Responsibilities
- **Multi-LLM Gateway**: Gemini (primary) + OpenAI (fallback) with dynamic routing
- **6 Specialized Agents**: Planner, Developer, Reviewer, Meeting, Knowledge, Execution
- **Agent Orchestrator**: Sequential/parallel/conditional workflows
- **Tool-Calling Framework**: 6 built-in tools (search codebase, execute code, manage tasks, query docs, web search, send notification)
- **Memory System**: Short-term (Redis with TTL) + Long-term (vector embeddings)
- **Predictive Engine**: Conflict prediction, intent detection, proactive suggestions
- Circuit breaker per LLM provider
- Per-user and per-provider rate limiting
- Prompt template management with versioning

## Key Endpoints

### Chat & Completion
| Method | Path | Description |
|--------|------|-------------|
| POST | /ai/chat | Chat with streaming (SSE) |
| POST | /ai/complete | Text completion |
| POST | /ai/embed | Generate embeddings |
| POST | /ai/summarize | Summarize content |
| POST | /ai/generate-code | Generate code |
| POST | /ai/review-code | Review code for issues |
| POST | /ai/explain | Explain code/concept |
| POST | /ai/suggest-tasks | Break down work |
| POST | /ai/diagram | Generate diagram |

### Agents
| Method | Path | Description |
|--------|------|-------------|
| POST | /ai/agents/run | Execute agent with goal |
| GET | /ai/agents/:id | Get execution status |
| POST | /ai/agents/:id/cancel | Cancel running agent |
| POST | /ai/agents/plan | Run planner agent |
| POST | /ai/agents/review | Run reviewer agent |
| POST | /ai/agents/develop | Run developer agent |

### Memory
| Method | Path | Description |
|--------|------|-------------|
| POST | /ai/memory/store | Store memory |
| POST | /ai/memory/recall | Semantic recall |
| DELETE | /ai/memory/:id | Forget memory |
| GET | /ai/memory/context/:wsId | Workspace context |

## Model Routing

| Task Type | Primary Model | Fallback |
|-----------|--------------|----------|
| `code_generation` | Gemini Pro | GPT-4o |
| `long_context` | Gemini Pro (1M tokens) | GPT-4o |
| `fast_response` | Gemini Flash | GPT-4o-mini |
| `complex_reasoning` | Gemini Pro | GPT-4o |
| `embedding` | text-embedding-004 | text-embedding-3-small |

## Agent Lifecycle
```
idle → thinking → acting → observing → (repeat or done)
```
Max 10 iterations per execution to prevent infinite loops.

## Key Files
```
src/
├── providers/          # LLM provider implementations
│   ├── base-provider.ts
│   ├── gemini-provider.ts
│   └── openai-provider.ts
├── gateway/            # AI routing and management
│   ├── ai-router.ts
│   ├── circuit-breaker.ts
│   ├── rate-limiter.ts
│   └── prompt-manager.ts
├── agents/             # Specialized AI agents
│   ├── base-agent.ts
│   ├── planner-agent.ts
│   ├── developer-agent.ts
│   ├── reviewer-agent.ts
│   ├── meeting-agent.ts
│   ├── knowledge-agent.ts
│   └── orchestrator.ts
├── tools/              # Agent tool implementations
├── memory/             # Short-term + long-term memory
├── predictive/         # Conflict prediction, intent detection
├── routes/             # API endpoints
└── kafka/              # Event consumption and publishing
```
