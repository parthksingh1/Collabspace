import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics for ai-service.
 *
 * These are the metrics I actually want on a dashboard: how often each agent
 * runs, how often it fails, how long it takes, and what it costs in tokens.
 * Token counts in particular are the only real-time signal for spend — the
 * provider's own billing page lags by hours.
 *
 * Every metric is incremented from a real code path, named in its comment.
 *
 * Cardinality note: `agent` and `model` are both bounded small sets (five
 * agents, a handful of models). Neither takes user input, so neither can blow
 * up the series count.
 */

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'collabspace_ai_' });

// ── Agent execution ───────────────────────────────────────────────────────────

/**
 * status: success | error | cancelled | max_iterations
 *
 * "max_iterations" is deliberately distinct from "error": the agent ran without
 * throwing but never reached a final answer within `agentMaxIterations`. That
 * usually means a bad prompt or a tool loop, and it needs a different response
 * from a provider failure — so it gets its own label rather than being folded
 * into a generic failure bucket.
 *
 * Incremented in BaseAgent.run() on every exit path.
 */
export const agentCallsTotal = new Counter({
  name: 'collabspace_ai_agent_calls_total',
  help: 'Agent runs by agent type and terminal status',
  labelNames: ['agent', 'status'] as const,
  registers: [registry],
});

/**
 * Token usage, split by model and agent.
 *
 * Counts what the provider reported in `response.usage.totalTokens`, summed
 * across every LLM call an agent makes. It is NOT a cost figure — prompt and
 * completion tokens are priced differently and this collapses them. Use it for
 * relative comparison between agents and for spotting runaway loops, not for
 * reconciling a bill.
 *
 * Incremented in BaseAgent.think() after each provider response.
 */
export const aiTokensUsedTotal = new Counter({
  name: 'collabspace_ai_tokens_used_total',
  help: 'Total LLM tokens consumed (prompt + completion), by model and agent',
  labelNames: ['model', 'agent'] as const,
  registers: [registry],
});

/** Prompt vs completion split, for the cases where the distinction matters. */
export const aiTokensByKind = new Counter({
  name: 'collabspace_ai_tokens_by_kind_total',
  help: 'LLM tokens by model, agent and kind (prompt or completion)',
  labelNames: ['model', 'agent', 'kind'] as const,
  registers: [registry],
});

/** Wall-clock duration of a full agent run. Observed in BaseAgent.run(). */
export const agentDurationMs = new Histogram({
  name: 'collabspace_ai_agent_duration_ms',
  help: 'End-to-end agent run duration in ms',
  labelNames: ['agent', 'status'] as const,
  // Agent runs are slow and long-tailed; buckets span 100ms to 5 minutes.
  buckets: [100, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 120_000, 300_000],
  registers: [registry],
});

/** Think→act→observe iterations used. Observed in BaseAgent.run(). */
export const agentIterations = new Histogram({
  name: 'collabspace_ai_agent_iterations',
  help: 'Reasoning iterations consumed by an agent run',
  labelNames: ['agent'] as const,
  buckets: [1, 2, 3, 5, 8, 12, 20, 30],
  registers: [registry],
});

/** Agents currently mid-run. Adjusted at both ends of BaseAgent.run(). */
export const agentsRunning = new Gauge({
  name: 'collabspace_ai_agents_running',
  help: 'Agent runs currently in progress',
  labelNames: ['agent'] as const,
  registers: [registry],
});

// ── Tools ─────────────────────────────────────────────────────────────────────

/**
 * Tool invocations by name and outcome. Incremented in BaseAgent.act().
 *
 * Tool names come from the internal registry, not from user input, so the label
 * is bounded.
 */
export const toolCallsTotal = new Counter({
  name: 'collabspace_ai_tool_calls_total',
  help: 'Tool invocations by tool name and outcome',
  labelNames: ['tool', 'status'] as const,
  registers: [registry],
});
