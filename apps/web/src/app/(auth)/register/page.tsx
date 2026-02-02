'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Check, X, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

const passwordRules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Contains lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'Contains number', test: (p: string) => /[0-9]/.test(p) },
];

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  const passed = passwordRules.filter((rule) => rule.test(password)).length;
  if (passed <= 1) return { score: 25, label: 'Weak', color: 'bg-red-500' };
  if (passed === 2) return { score: 50, label: 'Fair', color: 'bg-orange-500' };
  if (passed === 3) return { score: 75, label: 'Good', color: 'bg-blue-500' };
  return { score: 100, label: 'Strong', color: 'bg-emerald-500' };
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const allRulesPassed = passwordRules.every((rule) => rule.test(password));
  const strength = password.length > 0 ? getPasswordStrength(password) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed || !agreed) return;
    setError('');
    try {
      await register(email, password, name);
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-surface-950">
      {/* Left -- Form */}
      <div className="flex w-full items-center justify-center px-6 lg:w-[520px] lg:shrink-0">
        <div className="w-full max-w-[380px]">
          {/* Logo */}
          <div className="mb-10">
            <div className="flex items-center gap-2.5 mb-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-900 dark:bg-white">
                <span className="text-base font-bold text-white dark:text-surface-900">C</span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-surface-900 dark:text-white">
                CollabSpace
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-surface-500 leading-relaxed">
              Start collaborating with your team in minutes.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/10 dark:bg-red-500/5 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="John Doe"
                required
                autoFocus
                autoComplete="name"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
              >
                Work email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="name@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Create a strong password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password strength indicator */}
              {strength && (
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 rounded-full bg-surface-200 dark:bg-surface-800 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-300', strength.color)}
                        style={{ width: `${strength.score}%` }}
                      />
                    </div>
                    <span className="text-2xs font-medium text-surface-500 w-12 text-right">
                      {strength.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {passwordRules.map((rule, i) => {
                      const passed = rule.test(password);
                      return (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          {passed ? (
                            <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="h-3 w-3 text-surface-300 dark:text-surface-600 shrink-0" />
                          )}
                          <span
                            className={cn(
                              passed
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-surface-400'
                            )}
                          >
                            {rule.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-surface-500 leading-relaxed">
                I agree to the{' '}
                <Link
                  href="/terms"
                  className="text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  className="text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
                >
                  Privacy Policy
                </Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={isLoading || !allRulesPassed || !agreed}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Create account <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-200 dark:border-surface-800" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-surface-400 dark:bg-surface-950">
                or continue with
              </span>
            </div>
          </div>

          {/* OAuth */}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-secondary py-2.5 text-sm">
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
            <button className="btn-secondary py-2.5 text-sm">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-surface-500">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right -- Visual Panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-surface-950">
        {/* Gradient orbs */}
        <div className="absolute top-1/3 left-1/4 h-[500px] w-[500px] rounded-full bg-brand-500/20 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/3 h-[400px] w-[400px] rounded-full bg-blue-500/15 blur-[120px]" />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Top spacer */}
          <div />

          {/* Center -- Feature showcase */}
          <div className="flex flex-col items-center">
            {/* Collaboration mockup */}
            <div className="w-full max-w-[520px] rounded-2xl border border-surface-800/60 bg-surface-900/80 backdrop-blur-sm shadow-2xl overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800/60">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-surface-700" />
                  <div className="h-2.5 w-2.5 rounded-full bg-surface-700" />
                  <div className="h-2.5 w-2.5 rounded-full bg-surface-700" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="h-5 w-40 rounded-md bg-surface-800/80 flex items-center justify-center">
                    <span className="text-2xs text-surface-500">collabspace.io</span>
                  </div>
                </div>
                <div className="w-12" />
              </div>

              <div className="p-5 space-y-4">
                {/* Online collaborators */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {['bg-brand-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-surface-600'].map(
                        (color, i) => (
                          <div
                            key={i}
                            className={cn(
                              'h-7 w-7 rounded-full border-2 border-surface-900 flex items-center justify-center text-2xs font-medium text-white',
                              color
                            )}
                          >
                            {['SL', 'JD', 'MK', 'AR', '+3'][i]}
                          </div>
                        )
                      )}
                    </div>
                    <span className="text-xs text-surface-500">8 online</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-2xs text-surface-500">Live</span>
                  </div>
                </div>

                {/* Document mockup */}
                <div className="rounded-lg bg-surface-800/40 border border-surface-700/30 p-4 space-y-3">
                  <div className="h-3 w-3/4 rounded bg-surface-700/50" />
                  <div className="h-2 w-full rounded bg-surface-800/80" />
                  <div className="h-2 w-5/6 rounded bg-surface-800/80" />
                  <div className="h-2 w-2/3 rounded bg-surface-800/80" />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-5 w-5 rounded-full bg-brand-500/30 border border-brand-500/40 flex items-center justify-center">
                      <span className="text-[8px] text-brand-400">S</span>
                    </div>
                    <div className="h-2 w-20 rounded bg-brand-500/20 animate-pulse" />
                    <span className="text-[9px] text-surface-600">typing...</span>
                  </div>
                </div>

                {/* Code editor mockup */}
                <div className="rounded-lg bg-surface-800/40 border border-surface-700/30 p-4 font-mono text-xs space-y-1.5">
                  <div className="flex">
                    <span className="text-surface-600 w-6 shrink-0">1</span>
                    <span className="text-blue-400">export</span>
                    <span className="text-surface-400 mx-1">async</span>
                    <span className="text-brand-400">function</span>
                    <span className="text-surface-300 ml-1">handler()</span>
                  </div>
                  <div className="flex">
                    <span className="text-surface-600 w-6 shrink-0">2</span>
                    <span className="text-surface-500 ml-2">// Real-time sync enabled</span>
                  </div>
                  <div className="flex">
                    <span className="text-surface-600 w-6 shrink-0">3</span>
                    <span className="text-surface-400 ml-2">const data =</span>
                    <span className="text-brand-400 ml-1">await</span>
                    <span className="text-surface-300 ml-1">fetch()</span>
                  </div>
                </div>

                {/* Kanban mockup */}
                <div className="grid grid-cols-3 gap-2.5">
                  {['To Do', 'In Progress', 'Done'].map((col) => (
                    <div key={col} className="space-y-2">
                      <div className="text-2xs text-surface-500 font-medium">{col}</div>
                      {[1, 2].map((n) => (
                        <div
                          key={n}
                          className="h-8 rounded-md bg-surface-800/50 border border-surface-700/30"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom -- Social proof */}
          <div className="max-w-md mt-12">
            <blockquote className="text-sm text-surface-400 leading-relaxed">
              &ldquo;We onboarded our entire 40-person engineering team in a single afternoon.
              The collaboration features are second to none.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3 mt-4">
              <div className="h-8 w-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center">
                <span className="text-xs font-medium text-surface-400">JR</span>
              </div>
              <div>
                <p className="text-sm font-medium text-surface-300">James Ruiz</p>
                <p className="text-xs text-surface-600">CTO, Vertex Labs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
