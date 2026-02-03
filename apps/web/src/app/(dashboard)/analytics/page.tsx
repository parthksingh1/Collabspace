'use client';

import { useState, useEffect } from 'react';
import {
  Users, FileText, Code2, FolderKanban, TrendingUp,
  Clock, Activity, ArrowUp, ArrowDown, Sparkles, Zap,
  Trophy, Award, Medal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const metrics = [
  { label: 'Active Users', value: '2,847', change: '+12%', trend: 'up' as const, icon: Users },
  { label: 'Documents', value: '1,234', change: '+8%', trend: 'up' as const, icon: FileText },
  { label: 'Code Files', value: '856', change: '+15%', trend: 'up' as const, icon: Code2 },
  { label: 'Tasks Completed', value: '342', change: '-3%', trend: 'down' as const, icon: FolderKanban },
];

const activityData = [
  { day: 'Mon', docs: 32, code: 28, tasks: 18 },
  { day: 'Tue', docs: 48, code: 35, tasks: 24 },
  { day: 'Wed', docs: 65, code: 42, tasks: 31 },
  { day: 'Thu', docs: 52, code: 38, tasks: 28 },
  { day: 'Fri', docs: 41, code: 32, tasks: 22 },
  { day: 'Sat', docs: 18, code: 12, tasks: 8 },
  { day: 'Sun', docs: 14, code: 9, tasks: 5 },
];

const topContributors = [
  { name: 'Sarah Chen', avatar: 'SC', color: 'bg-blue-500', contributions: 247, change: '+18%' },
  { name: 'Alex Rivera', avatar: 'AR', color: 'bg-emerald-500', contributions: 198, change: '+12%' },
  { name: 'James Kim', avatar: 'JK', color: 'bg-amber-500', contributions: 174, change: '+7%' },
  { name: 'Maria Lin', avatar: 'ML', color: 'bg-cyan-500', contributions: 142, change: '+5%' },
  { name: 'Chris Patel', avatar: 'CP', color: 'bg-orange-500', contributions: 128, change: '-2%' },
];

const teamPulse = [
  { name: 'Sarah Chen', activity: 95, level: 'High' },
  { name: 'Alex Rivera', activity: 82, level: 'High' },
  { name: 'James Kim', activity: 67, level: 'Medium' },
  { name: 'Maria Lin', activity: 54, level: 'Medium' },
  { name: 'Chris Patel', activity: 32, level: 'Low' },
];

// Sparkline data for "Time Saved by AI"
const sparklineData = [3, 5, 4, 7, 8, 6, 9, 11, 10, 12, 14, 12, 13, 15];

function Sparkline({ data, color = '#20af9c' }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 200;
  const height = 50;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="spark-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#spark-gradient)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={(i / (data.length - 1)) * width}
          cy={height - ((v - min) / range) * height}
          r={i === data.length - 1 ? 3 : 0}
          fill={color}
        />
      ))}
    </svg>
  );
}

function DonutChart({ value, max = 100, size = 120 }: { value: number; max?: number; size?: number }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / max) * circumference;
  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedOffset(offset), 100);
    return () => clearTimeout(timer);
  }, [offset]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-surface-100 dark:text-surface-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#donut-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <defs>
          <linearGradient id="donut-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#20af9c" />
            <stop offset="100%" stopColor="#3ec9b4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-surface-900 dark:text-white tabular-nums">{value}</span>
        <span className="text-2xs uppercase tracking-wider text-surface-400 mt-0.5">/ {max}</span>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm">
        <Trophy className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-surface-300 to-surface-400">
        <Medal className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600">
        <Award className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800 text-xs font-semibold text-surface-500">
      {rank}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const maxActivity = Math.max(...activityData.flatMap((d) => [d.docs, d.code, d.tasks]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-surface-500">Workspace activity and team performance insights.</p>
        </div>
        <div className="flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors',
                period === p
                  ? 'bg-brand-600 text-white'
                  : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
              )}
            >
              {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : 'Last 90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <span className={cn(
                  'flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md',
                  m.trend === 'up' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' : 'text-red-600 bg-red-50 dark:bg-red-500/10'
                )}>
                  {m.trend === 'up' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {m.change}
                </span>
              </div>
              <p className="text-2xl font-bold text-surface-900 dark:text-white tracking-tight">{m.value}</p>
              <p className="mt-0.5 text-xs text-surface-500">{m.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Productivity Score */}
        <div className="card p-5 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-4 self-start">
            <Sparkles className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Productivity Score</h3>
          </div>
          <DonutChart value={87} />
          <p className="mt-4 text-sm text-surface-600 dark:text-surface-400">Above team average</p>
          <p className="text-xs text-emerald-600 mt-1">↑ 12% from last period</p>
        </div>

        {/* Time Saved by AI */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Time Saved by AI</h3>
          </div>
          <div className="flex-1 flex flex-col">
            <p className="text-3xl font-bold text-surface-900 dark:text-white tracking-tight">12.5h</p>
            <p className="text-xs text-surface-500 mb-4">this week · vs 8.2h last week</p>
            <div className="mt-auto">
              <Sparkline data={sparklineData} />
            </div>
            <p className="mt-2 text-xs text-emerald-600">↑ 52% productivity boost</p>
          </div>
        </div>

        {/* Top Contributors */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-4">Top Contributors</h3>
          <div className="space-y-3">
            {topContributors.map((person, i) => (
              <div key={person.name} className="flex items-center gap-3">
                <RankBadge rank={i + 1} />
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-2xs font-bold text-white', person.color)}>
                  {person.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{person.name}</p>
                  <p className="text-xs text-surface-500">{person.contributions} contributions</p>
                </div>
                <span className={cn(
                  'text-xs font-medium',
                  person.change.startsWith('+') ? 'text-emerald-600' : 'text-red-500'
                )}>
                  {person.change}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Weekly Activity</h3>
            <p className="text-xs text-surface-500 mt-0.5">Engagement across documents, code, and tasks</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Documents</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Code</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Tasks</span>
          </div>
        </div>

        <div className="flex items-end gap-4 h-56">
          {activityData.map((day, i) => (
            <div key={day.day} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full gap-1 items-end" style={{ height: '180px' }}>
                <div className="flex-1 group relative">
                  <div
                    className="rounded-t bg-brand-500 transition-all duration-700 hover:bg-brand-600 cursor-pointer"
                    style={{
                      height: animated ? `${(day.docs / maxActivity) * 100}%` : '0%',
                      transitionDelay: `${i * 60}ms`,
                    }}
                  />
                  <div className="invisible group-hover:visible absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-900 dark:bg-white px-1.5 py-0.5 text-2xs text-white dark:text-surface-900">
                    {day.docs}
                  </div>
                </div>
                <div className="flex-1 group relative">
                  <div
                    className="rounded-t bg-emerald-500 transition-all duration-700 hover:bg-emerald-600 cursor-pointer"
                    style={{
                      height: animated ? `${(day.code / maxActivity) * 100}%` : '0%',
                      transitionDelay: `${i * 60 + 100}ms`,
                    }}
                  />
                  <div className="invisible group-hover:visible absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-900 dark:bg-white px-1.5 py-0.5 text-2xs text-white dark:text-surface-900">
                    {day.code}
                  </div>
                </div>
                <div className="flex-1 group relative">
                  <div
                    className="rounded-t bg-amber-500 transition-all duration-700 hover:bg-amber-600 cursor-pointer"
                    style={{
                      height: animated ? `${(day.tasks / maxActivity) * 100}%` : '0%',
                      transitionDelay: `${i * 60 + 200}ms`,
                    }}
                  />
                  <div className="invisible group-hover:visible absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-900 dark:bg-white px-1.5 py-0.5 text-2xs text-white dark:text-surface-900">
                    {day.tasks}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium text-surface-500">{day.day}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Team Pulse */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-500" />
              <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Team Pulse</h3>
            </div>
            <span className="text-xs text-surface-500">Activity level today</span>
          </div>
          <div className="space-y-4">
            {teamPulse.map((member) => (
              <div key={member.name} className="flex items-center gap-3">
                <div className="w-32 text-sm text-surface-700 dark:text-surface-300 truncate">{member.name}</div>
                <div className="flex-1 flex items-center gap-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-5 flex-1 rounded transition-all duration-700',
                        i < Math.floor(member.activity / 10)
                          ? member.activity > 80 ? 'bg-emerald-500'
                            : member.activity > 50 ? 'bg-amber-500'
                            : 'bg-surface-300 dark:bg-surface-700'
                          : 'bg-surface-100 dark:bg-surface-800'
                      )}
                      style={{
                        opacity: animated ? 1 : 0,
                        transitionDelay: `${i * 30}ms`,
                      }}
                    />
                  ))}
                </div>
                <span className={cn(
                  'text-xs font-medium w-14 text-right',
                  member.level === 'High' && 'text-emerald-600',
                  member.level === 'Medium' && 'text-amber-600',
                  member.level === 'Low' && 'text-surface-500',
                )}>
                  {member.activity}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">AI Insights</h3>
            <span className="badge-brand text-2xs">Powered by Gemini</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <p className="text-sm font-medium text-surface-900 dark:text-white">Productivity Trend</p>
              <p className="mt-1 text-xs text-surface-500 leading-relaxed">Team velocity increased 15% this sprint. Document collaboration peaks on Wednesdays — consider scheduling key meetings then.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-surface-900 dark:text-white">Bottleneck Alert</p>
              <p className="mt-1 text-xs text-surface-500 leading-relaxed">3 tasks in &quot;Review&quot; for 5+ days. Consider redistributing review load across the team.</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
              <p className="text-sm font-medium text-surface-900 dark:text-white">Sprint Forecast</p>
              <p className="mt-1 text-xs text-surface-500 leading-relaxed">Based on velocity, 82% chance of completing sprint goals by deadline. On track to deliver early.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
