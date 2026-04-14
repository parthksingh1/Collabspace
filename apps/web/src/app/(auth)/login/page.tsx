'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, Copy, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';

const DEMO_EMAIL = 'demo@collabspace.io';
const DEMO_PASSWORD = 'Demo1234!';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const addToast = useToastStore((s) => s.addToast);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'email' | 'password' | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      addToast({ title: 'Welcome back!', description: 'You have been signed in successfully.', variant: 'success' });
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      setError(msg);
      addToast({ title: 'Sign in failed', description: msg, variant: 'error' });
    }
  };

  const fillDemo = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError('');
  };

  const tryDemo = async () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError('');
    try {
      await login(DEMO_EMAIL, DEMO_PASSWORD);
      addToast({ title: 'Welcome to the demo!', description: 'Exploring with the guest account.', variant: 'success' });
      router.push('/');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Demo sign-in failed';
      setError(msg);
    }
  };

  const copy = async (value: string, kind: 'email' | 'password') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard may be unavailable; ignore silently
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-surface-950">
      {/* Left -- Form */}
      <div className="flex w-full items-center justify-center px-6 lg:w-[520px] lg:shrink-0">
        <div className="w-full max-w-[380px]">
          {/* Logo */}
          <div className="mb-12">
            <div className="flex items-center gap-2.5 mb-12">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-900 dark:bg-white">
                <span className="text-base font-bold text-white dark:text-surface-900">C</span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-surface-900 dark:text-white">
                CollabSpace
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-surface-900 dark:text-white">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-surface-500 leading-relaxed">
              Sign in to your account to continue where you left off.
            </p>
          </div>

          {/* Demo credentials */}
          <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/20 dark:bg-brand-950/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
                Try the demo
              </h3>
            </div>
            <p className="text-xs text-surface-600 dark:text-surface-400 leading-relaxed mb-3">
              Explore every module with our read-only demo account — no signup required.
            </p>
            <div className="space-y-1.5 mb-3">
              <button
                type="button"
                onClick={() => copy(DEMO_EMAIL, 'email')}
                className="group flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-xs text-surface-700 transition-colors hover:bg-surface-50 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-surface-400 w-14">email</span>
                  <span className="font-mono">{DEMO_EMAIL}</span>
                </span>
                {copied === 'email' ? (
                  <Check className="h-3.5 w-3.5 text-success-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-surface-400 opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
              <button
                type="button"
                onClick={() => copy(DEMO_PASSWORD, 'password')}
                className="group flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-xs text-surface-700 transition-colors hover:bg-surface-50 dark:bg-surface-900 dark:text-surface-300 dark:hover:bg-surface-800"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-surface-400 w-14">password</span>
                  <span className="font-mono">{DEMO_PASSWORD}</span>
                </span>
                {copied === 'password' ? (
                  <Check className="h-3.5 w-3.5 text-success-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-surface-400 opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={fillDemo}
                className="flex-1 rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-500/30 dark:bg-surface-900 dark:text-brand-400 dark:hover:bg-brand-950/30"
              >
                Fill fields
              </button>
              <button
                type="button"
                onClick={tryDemo}
                disabled={isLoading}
                className="flex-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Sign in as Guest'
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/10 dark:bg-red-500/5 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="name@company.com"
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-surface-700 dark:text-surface-300"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
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
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="btn-primary w-full py-2.5 mt-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="h-4 w-4" />
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
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>

      {/* Right -- Visual Panel */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-surface-950">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/3 h-[500px] w-[500px] rounded-full bg-brand-500/20 blur-[150px]" />
        <div className="absolute bottom-1/3 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/15 blur-[120px]" />

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

          {/* Center -- App Mockup */}
          <div className="flex flex-col items-center">
            {/* Mock app window */}
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

              {/* Mock content grid */}
              <div className="p-5 space-y-4">
                {/* Top row -- stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Documents', value: '24' },
                    { label: 'Active now', value: '8' },
                    { label: 'This week', value: '156' },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg bg-surface-800/50 border border-surface-700/40 p-3"
                    >
                      <div className="text-lg font-semibold text-white">{stat.value}</div>
                      <div className="text-2xs text-surface-500 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Card rows */}
                <div className="space-y-2.5">
                  {[
                    { title: 'API Architecture Design', type: 'Doc', glow: true },
                    { title: 'auth-middleware.ts', type: 'Code', glow: false },
                    { title: 'System Design Board', type: 'Board', glow: true },
                    { title: 'Sprint v2.1 Tasks', type: 'Project', glow: false },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="flex items-center justify-between rounded-lg bg-surface-800/40 border border-surface-700/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            card.glow ? 'bg-brand-400 shadow-[0_0_6px_rgba(20,184,166,0.5)]' : 'bg-surface-600'
                          }`}
                        />
                        <span className="text-sm text-surface-300 truncate">{card.title}</span>
                      </div>
                      <span className="text-2xs text-surface-600 shrink-0 ml-3">{card.type}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar mockup */}
                <div className="rounded-lg bg-surface-800/50 border border-surface-700/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-surface-400">Sprint Progress</span>
                    <span className="text-xs font-medium text-brand-400">67%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden">
                    <div className="h-full w-[67%] rounded-full bg-gradient-to-r from-brand-500 to-brand-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom -- Testimonial */}
          <div className="max-w-md mt-12">
            <blockquote className="text-sm text-surface-400 leading-relaxed">
              &ldquo;CollabSpace replaced four different tools for our team. Real-time collaboration
              on docs, code, and boards in one place has been a game-changer.&rdquo;
            </blockquote>
            <div className="flex items-center gap-3 mt-4">
              <div className="h-8 w-8 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center">
                <span className="text-xs font-medium text-surface-400">SL</span>
              </div>
              <div>
                <p className="text-sm font-medium text-surface-300">Sarah Lin</p>
                <p className="text-xs text-surface-600">Engineering Lead, Acme Corp</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
