'use client';

import { useState } from 'react';
import {
  Bot, ChevronDown, ChevronRight, X, Loader2,
  CheckCircle2, XCircle, Clock, Brain, Code2,
  Search, MessageSquare, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIStore } from '@/stores/ai-store';

const agentIcons: Record<string, typeof Bot> = {
  planner: Brain,
  developer: Code2,
  reviewer: Search,
  meeting: MessageSquare,
  knowledge: BookOpen,
  execution: Bot,
};

const statusConfig = {
  running: { label: 'Running', color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-950', borderColor: 'border-blue-200 dark:border-blue-800', icon: Loader2 },
  completed: { label: 'Completed', color: 'text-emerald-500', bgColor: 'bg-emerald-50 dark:bg-emerald-950', borderColor: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-950', borderColor: 'border-red-200 dark:border-red-800', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-surface-400', bgColor: 'bg-surface-50 dark:bg-surface-800', borderColor: 'border-surface-200 dark:border-surface-700', icon: X },
};

export function AgentStatus() {
  const { activeAgents, cancelAgent } = useAIStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (activeAgents.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Bot className="h-4 w-4 text-brand-500" />
        <span className="text-xs font-medium text-surface-500">AI Agents</span>
        <span className="badge-brand text-2xs">
          {activeAgents.filter((a) => a.status === 'running').length} active
        </span>
      </div>

      {activeAgents.map((agent) => {
        const AgentIcon = agentIcons[agent.agentType] || Bot;
        const status = statusConfig[agent.status];
        const StatusIcon = status.icon;
        const isExpanded = expandedId === agent.id;
        const elapsed = agent.completedAt
          ? Math.round((agent.completedAt - agent.startedAt) / 1000)
          : Math.round((Date.now() - agent.startedAt) / 1000);

        return (
          <div
            key={agent.id}
            className={cn(
              'rounded-xl border overflow-hidden transition-colors',
              status.borderColor,
              status.bgColor
            )}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : agent.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <AgentIcon className={cn('h-4 w-4 shrink-0', status.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900 dark:text-white capitalize truncate">
                  {agent.agentType} Agent
                </p>
                <p className="text-2xs text-surface-500 truncate">{agent.goal}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <StatusIcon className={cn('h-3.5 w-3.5', status.color, agent.status === 'running' && 'animate-spin')} />
                <span className="text-2xs text-surface-400 tabular-nums">{elapsed}s</span>
                {isExpanded ? <ChevronDown className="h-3 w-3 text-surface-400" /> : <ChevronRight className="h-3 w-3 text-surface-400" />}
              </div>
            </button>

            {/* Expanded: Step log */}
            {isExpanded && (
              <div className="border-t border-surface-200 dark:border-surface-700 px-3 py-2.5 space-y-1.5">
                {agent.steps.length > 0 ? (
                  agent.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                      <div className={cn(
                        'mt-0.5 h-1.5 w-1.5 rounded-full shrink-0',
                        i === agent.steps.length - 1 && agent.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-surface-300 dark:bg-surface-600'
                      )} />
                      <div className="min-w-0">
                        <span className="font-medium text-surface-700 dark:text-surface-300">{step.action}</span>
                        {step.result && (
                          <p className="mt-0.5 text-surface-500 line-clamp-2">{step.result}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-surface-400">Initializing...</p>
                )}

                {/* Result for completed agents */}
                {agent.result && (
                  <div className="mt-2 rounded-lg bg-white/60 p-2.5 text-xs text-surface-700 dark:bg-surface-800/60 dark:text-surface-300">
                    {agent.result}
                  </div>
                )}

                {/* Cancel button for running agents */}
                {agent.status === 'running' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelAgent(agent.id); }}
                    className="mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-2xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
