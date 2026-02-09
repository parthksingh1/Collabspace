'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Trash2,
  Clock,
  MemoryStick,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/utils';
import type { ExecutionResult } from '@/hooks/use-code';

// ─── Types ────────────────────────────────────────────────────────

interface ExecutionPanelProps {
  onRun: (stdin: string) => void;
  onStop?: () => void;
  isRunning: boolean;
  result: ExecutionResult | null;
  executionHistory: ExecutionResult[];
  className?: string;
}

type Tab = 'input' | 'output' | 'errors';

// ─── Component ────────────────────────────────────────────────────

export function ExecutionPanel({
  onRun,
  onStop,
  isRunning,
  result,
  executionHistory,
  className,
}: ExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('output');
  const [stdin, setStdin] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-switch to output/errors tab when result arrives
  useEffect(() => {
    if (result) {
      if (result.stderr && result.status !== 'success') {
        setActiveTab('errors');
      } else {
        setActiveTab('output');
      }
    }
  }, [result]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [result]);

  const statusIcon = () => {
    if (isRunning) return <Loader2 className="w-4 h-4 animate-spin text-amber-400" />;
    if (!result) return <Terminal className="w-4 h-4 text-surface-400" />;
    switch (result.status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'error':
      case 'runtime_error':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'timeout':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Terminal className="w-4 h-4 text-surface-400" />;
    }
  };

  const statusText = () => {
    if (isRunning) return 'Running...';
    if (!result) return 'Ready';
    switch (result.status) {
      case 'success':
        return `Exited with code ${result.exitCode}`;
      case 'error':
        return 'Compilation Error';
      case 'runtime_error':
        return `Runtime Error (exit code ${result.exitCode})`;
      case 'timeout':
        return 'Time Limit Exceeded';
      default:
        return 'Unknown';
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'input', label: 'Input' },
    { id: 'output', label: 'Output' },
    {
      id: 'errors',
      label: 'Errors',
      count: result?.stderr ? 1 : 0,
    },
  ];

  return (
    <div
      className={cn(
        'flex flex-col bg-surface-900 border-t border-surface-700 text-surface-100',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-700 bg-surface-900/80">
        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  activeTab === tab.id
                    ? 'bg-surface-700 text-surface-100'
                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
                )}
              >
                {tab.label}
                {tab.count ? (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400">
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex items-center gap-1.5 text-xs text-surface-400 border-l border-surface-700 pl-3">
            {statusIcon()}
            <span>{statusText()}</span>
          </div>

          {/* Metrics */}
          {result && !isRunning && (
            <div className="flex items-center gap-3 text-xs text-surface-500 border-l border-surface-700 pl-3">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {result.executionTime}ms
              </span>
              <span className="flex items-center gap-1">
                <MemoryStick className="w-3 h-3" />
                {formatBytes(result.memoryUsage)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* History dropdown */}
          {executionHistory.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-surface-400 hover:text-surface-200 rounded hover:bg-surface-800 transition-colors"
              >
                History ({executionHistory.length})
                <ChevronDown className="w-3 h-3" />
              </button>
              {showHistory && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-surface-800 border border-surface-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto scrollbar-thin">
                  {executionHistory.map((entry, i) => (
                    <div
                      key={entry.id || i}
                      className="flex items-center gap-2 px-3 py-2 text-xs border-b border-surface-700 last:border-0 hover:bg-surface-700/50"
                    >
                      {entry.status === 'success' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className="text-surface-300 truncate flex-1">
                        {entry.stdout?.slice(0, 50) || entry.stderr?.slice(0, 50) || 'No output'}
                      </span>
                      <span className="text-surface-500 shrink-0">{entry.executionTime}ms</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setStdin('');
            }}
            className="p-1.5 text-surface-400 hover:text-surface-200 rounded hover:bg-surface-800 transition-colors"
            title="Clear output"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {isRunning ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => onRun(stdin)}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <Play className="w-3 h-3" />
              Run
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'input' && (
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Enter stdin input here..."
            className="w-full h-full resize-none bg-transparent p-3 font-mono text-sm text-surface-200 placeholder:text-surface-600 focus:outline-none scrollbar-thin"
            spellCheck={false}
          />
        )}

        {activeTab === 'output' && (
          <pre
            ref={outputRef}
            className="w-full h-full p-3 font-mono text-sm text-surface-200 overflow-auto scrollbar-thin whitespace-pre-wrap"
          >
            {isRunning ? (
              <span className="flex items-center gap-2 text-surface-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing code...
              </span>
            ) : result?.stdout ? (
              result.stdout
            ) : result ? (
              <span className="text-surface-500 italic">No output</span>
            ) : (
              <span className="text-surface-500 italic">
                Run your code to see output here. Press Ctrl+Enter to run.
              </span>
            )}
          </pre>
        )}

        {activeTab === 'errors' && (
          <pre className="w-full h-full p-3 font-mono text-sm text-red-400 overflow-auto scrollbar-thin whitespace-pre-wrap">
            {result?.stderr ? (
              result.stderr
            ) : (
              <span className="text-surface-500 italic">No errors</span>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

export default ExecutionPanel;
