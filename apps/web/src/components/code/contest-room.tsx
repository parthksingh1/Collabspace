'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Timer,
  Trophy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Send,
  ChevronRight,
  Crown,
  Medal,
  Clock,
  Play,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CodingRoom,
  TestCase,
  LeaderboardEntry,
  SubmissionResult,
} from '@/hooks/use-code';

// ─── Types ────────────────────────────────────────────────────────

interface ContestRoomProps {
  room: CodingRoom;
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
  code: string;
  language: string;
  onSubmit: () => void;
  submissionResult: SubmissionResult | null;
  isSubmitting: boolean;
  className?: string;
}

// ─── Timer ────────────────────────────────────────────────────────

function CountdownTimer({
  endTime,
  status,
}: {
  endTime: string | null;
  status: string;
}) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!endTime || status !== 'active') return;

    const update = () => {
      const diff = new Date(endTime).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime, status]);

  if (status === 'waiting') {
    return (
      <div className="flex items-center gap-2 text-amber-400">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">Waiting to start...</span>
      </div>
    );
  }

  if (status === 'finished' || remaining <= 0) {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <Timer className="w-4 h-4" />
        <span className="text-sm font-medium">Contest ended</span>
      </div>
    );
  }

  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  const isLowTime = remaining < 300000; // under 5 minutes

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        isLowTime ? 'text-red-400 animate-pulse-soft' : 'text-emerald-400'
      )}
    >
      <Timer className="w-4 h-4" />
      <span className="text-sm font-mono font-bold tabular-nums">
        {hours > 0 && `${hours.toString().padStart(2, '0')}:`}
        {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
}

// ─── Problem Panel ────────────────────────────────────────────────

function ProblemPanel({
  markdown,
  testCases,
}: {
  markdown: string;
  testCases: TestCase[];
}) {
  const [showHidden, setShowHidden] = useState(false);
  const visibleTests = testCases.filter((t) => !t.isHidden || showHidden);

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* Problem description */}
      <div className="p-4 border-b border-surface-700">
        <h3 className="text-sm font-semibold text-surface-100 mb-3">Problem Description</h3>
        <div className="prose prose-sm prose-invert max-w-none">
          <div
            className="text-surface-300 text-sm leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(markdown) }}
          />
        </div>
      </div>

      {/* Test cases */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-surface-100">Test Cases</h3>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-200 transition-colors"
          >
            {showHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showHidden ? 'Hide hidden' : 'Show hidden'}
          </button>
        </div>

        <div className="space-y-3">
          {visibleTests.map((tc, idx) => (
            <div
              key={tc.id}
              className="rounded-lg border border-surface-700 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800/50 border-b border-surface-700">
                <span className="text-xs font-medium text-surface-300">
                  Test Case {idx + 1}
                </span>
                {tc.isHidden && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-400">
                    Hidden
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-surface-700">
                <div className="p-2">
                  <span className="text-[10px] uppercase text-surface-500 font-semibold tracking-wider">
                    Input
                  </span>
                  <pre className="mt-1 text-xs font-mono text-surface-200 whitespace-pre-wrap">
                    {tc.input || '(empty)'}
                  </pre>
                </div>
                <div className="p-2">
                  <span className="text-[10px] uppercase text-surface-500 font-semibold tracking-wider">
                    Expected Output
                  </span>
                  <pre className="mt-1 text-xs font-mono text-surface-200 whitespace-pre-wrap">
                    {tc.expectedOutput}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────

function LeaderboardPanel({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
}) {
  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-4 h-4 text-amber-400" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-surface-300" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="w-4 text-center text-xs text-surface-500">{rank}</span>;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-700">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-surface-100">Leaderboard</h3>
        <span className="ml-auto text-xs text-surface-500">
          {entries.length} participant{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-surface-500">
            <Users className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs">No submissions yet</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {entries.map((entry) => (
              <div
                key={entry.userId}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors',
                  entry.userId === currentUserId
                    ? 'bg-brand-600/10 border-l-2 border-brand-500'
                    : 'hover:bg-surface-800/50'
                )}
              >
                <div className="w-6 flex justify-center shrink-0">
                  {getRankIcon(entry.rank)}
                </div>

                {entry.avatar ? (
                  <img
                    src={entry.avatar}
                    alt=""
                    className="w-6 h-6 rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-surface-700 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-medium text-surface-300">
                      {entry.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-200 truncate">
                    {entry.userName}
                    {entry.userId === currentUserId && (
                      <span className="ml-1 text-surface-500">(you)</span>
                    )}
                  </p>
                  <p className="text-[10px] text-surface-500">
                    {entry.submissionCount} submission{entry.submissionCount !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-surface-100">{entry.score}</p>
                  <p className="text-[10px] text-surface-500">pts</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Submission Result ────────────────────────────────────────────

function SubmissionResultDisplay({ result }: { result: SubmissionResult }) {
  const statusConfig: Record<
    string,
    { color: string; bg: string; icon: typeof CheckCircle2; label: string }
  > = {
    accepted: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: CheckCircle2,
      label: 'Accepted',
    },
    wrong_answer: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/30',
      icon: XCircle,
      label: 'Wrong Answer',
    },
    time_limit: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: AlertTriangle,
      label: 'Time Limit Exceeded',
    },
    runtime_error: {
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/30',
      icon: XCircle,
      label: 'Runtime Error',
    },
    compile_error: {
      color: 'text-orange-400',
      bg: 'bg-orange-500/10 border-orange-500/30',
      icon: XCircle,
      label: 'Compile Error',
    },
  };

  const config = statusConfig[result.status] || statusConfig.wrong_answer;
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border p-4 mx-4 mb-4', config.bg)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-5 h-5', config.color)} />
        <span className={cn('text-sm font-semibold', config.color)}>{config.label}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-surface-500">Tests Passed</span>
          <p className="text-surface-200 font-medium">
            {result.passedTests}/{result.totalTests}
          </p>
        </div>
        <div>
          <span className="text-surface-500">Score</span>
          <p className="text-surface-200 font-medium">{result.score}</p>
        </div>
        <div>
          <span className="text-surface-500">Time</span>
          <p className="text-surface-200 font-medium">{result.executionTime}ms</p>
        </div>
      </div>

      {/* Test details */}
      {result.details.length > 0 && (
        <div className="mt-3 space-y-1">
          {result.details.map((detail, i) => (
            <div key={detail.testId} className="flex items-center gap-2 text-xs">
              {detail.passed ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : (
                <XCircle className="w-3 h-3 text-red-400" />
              )}
              <span className="text-surface-300">Test {i + 1}</span>
              {!detail.passed && detail.expected && (
                <span className="text-surface-500 truncate">
                  Expected: {detail.expected}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Simple markdown formatting ───────────────────────────────────

function formatMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-surface-800 rounded text-brand-300 text-xs">$1</code>')
    .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold text-surface-100 mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold text-surface-100 mt-4 mb-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold text-surface-100 mt-4 mb-2">$1</h1>')
    .replace(/\n/g, '<br />');
}

// ─── Main Component ───────────────────────────────────────────────

export function ContestRoom({
  room,
  leaderboard,
  currentUserId,
  code,
  language,
  onSubmit,
  submissionResult,
  isSubmitting,
  className,
}: ContestRoomProps) {
  const [activePanel, setActivePanel] = useState<'problem' | 'leaderboard'>('problem');

  const isContestActive = room.status === 'active';
  const canSubmit = isContestActive && code.trim().length > 0 && !isSubmitting;

  return (
    <div className={cn('flex flex-col h-full bg-surface-900 text-surface-100', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-700 bg-surface-900/80">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-surface-100 truncate max-w-[200px]">
            {room.name}
          </h2>
          <span
            className={cn(
              'px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full',
              room.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400'
                : room.status === 'waiting'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-surface-700 text-surface-400'
            )}
          >
            {room.status}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <CountdownTimer endTime={room.endTime} status={room.status} />

          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs text-surface-400">
              {room.participants.length}
            </span>
          </div>
        </div>
      </div>

      {/* Panel tabs */}
      <div className="flex border-b border-surface-700">
        <button
          onClick={() => setActivePanel('problem')}
          className={cn(
            'flex-1 px-4 py-2 text-xs font-medium transition-colors border-b-2',
            activePanel === 'problem'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-surface-400 hover:text-surface-200'
          )}
        >
          Problem & Tests
        </button>
        <button
          onClick={() => setActivePanel('leaderboard')}
          className={cn(
            'flex-1 px-4 py-2 text-xs font-medium transition-colors border-b-2 relative',
            activePanel === 'leaderboard'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-surface-400 hover:text-surface-200'
          )}
        >
          Leaderboard
          {leaderboard.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-brand-500/20 text-brand-400">
              {leaderboard.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'problem' ? (
          <ProblemPanel markdown={room.problemMarkdown} testCases={room.testCases} />
        ) : (
          <LeaderboardPanel entries={leaderboard} currentUserId={currentUserId} />
        )}
      </div>

      {/* Submission result */}
      {submissionResult && <SubmissionResultDisplay result={submissionResult} />}

      {/* Submit button */}
      <div className="px-4 py-3 border-t border-surface-700 bg-surface-900/80">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all',
            canSubmit
              ? 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/20'
              : 'bg-surface-800 text-surface-500 cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running tests...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit Solution
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default ContestRoom;
