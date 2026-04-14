'use client';

import { useState } from 'react';
import {
  Check, Sparkles, Zap, Crown, Users, Download, CreditCard,
  AlertCircle, TrendingUp, Receipt, HardDrive, MessageSquare,
  Bot, Shield, Loader2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

type PlanId = 'free' | 'pro' | 'business' | 'enterprise';
type Billing = 'monthly' | 'annual';

type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  price: { monthly: number; annual: number };
  icon: typeof Sparkles;
  accent: string;
  features: string[];
  limits: { members: string; storage: string; aiCredits: string };
  popular?: boolean;
  enterprise?: boolean;
};

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Get started with the essentials.',
    price: { monthly: 0, annual: 0 },
    icon: Sparkles,
    accent: 'text-surface-600',
    features: [
      'Up to 5 members',
      '3 workspaces',
      '1 GB storage',
      'Real-time collaboration',
      'Core docs, code & boards',
      '200 AI credits/month',
    ],
    limits: { members: '5', storage: '1 GB', aiCredits: '200 / mo' },
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing teams that need more power.',
    price: { monthly: 12, annual: 10 },
    icon: Zap,
    accent: 'text-brand-600',
    popular: true,
    features: [
      'Up to 25 members',
      'Unlimited workspaces',
      '100 GB storage',
      'Advanced AI agents',
      'Version history (90 days)',
      'Priority support',
      '5,000 AI credits/month',
      'Custom templates',
    ],
    limits: { members: '25', storage: '100 GB', aiCredits: '5,000 / mo' },
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Scale collaboration with advanced controls.',
    price: { monthly: 24, annual: 20 },
    icon: Crown,
    accent: 'text-amber-600',
    features: [
      'Unlimited members',
      'Unlimited workspaces',
      '1 TB storage',
      'SSO & SCIM provisioning',
      'Advanced permissions',
      'Audit logs & compliance',
      '25,000 AI credits/month',
      'Dedicated onboarding',
      'SLA guarantee',
    ],
    limits: { members: 'Unlimited', storage: '1 TB', aiCredits: '25,000 / mo' },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom-built for the world\u2019s largest teams.',
    price: { monthly: 0, annual: 0 },
    icon: Shield,
    accent: 'text-info-600',
    enterprise: true,
    features: [
      'Everything in Business',
      'On-premise deployment option',
      'Custom AI model fine-tuning',
      'Dedicated CSM',
      'HIPAA, SOC 2, GDPR',
      'Custom SLA & contract',
      'Unlimited AI credits',
      'White-glove migration',
    ],
    limits: { members: 'Custom', storage: 'Unlimited', aiCredits: 'Unlimited' },
  },
];

const INVOICES = [
  { id: 'INV-2026-0412', date: 'Apr 12, 2026', amount: 120, status: 'paid', description: 'Pro plan — Annual (10 seats)' },
  { id: 'INV-2026-0312', date: 'Mar 12, 2026', amount: 120, status: 'paid', description: 'Pro plan — Annual (10 seats)' },
  { id: 'INV-2026-0212', date: 'Feb 12, 2026', amount: 96, status: 'paid', description: 'Pro plan — Annual (8 seats)' },
  { id: 'INV-2026-0112', date: 'Jan 12, 2026', amount: 96, status: 'paid', description: 'Pro plan — Annual (8 seats)' },
  { id: 'INV-2025-1212', date: 'Dec 12, 2025', amount: 96, status: 'paid', description: 'Pro plan — Annual (8 seats)' },
];

export default function BillingPage() {
  const addToast = useToastStore((s) => s.addToast);
  const [billing, setBilling] = useState<Billing>('annual');
  const [currentPlan] = useState<PlanId>('pro');
  const [loading, setLoading] = useState<PlanId | null>(null);

  const handlePlan = async (plan: PlanId) => {
    if (plan === currentPlan) return;
    setLoading(plan);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(null);
    addToast({
      title: plan === 'enterprise' ? 'Sales contacted' : 'Plan change scheduled',
      description:
        plan === 'enterprise'
          ? 'Our team will reach out within one business day.'
          : `You\u2019ll switch to the ${PLANS.find((p) => p.id === plan)?.name} plan at the next billing cycle.`,
      variant: 'success',
    });
  };

  const usage = [
    { label: 'Team members', value: 12, max: 25, icon: Users, unit: '' },
    { label: 'Storage', value: 48.6, max: 100, icon: HardDrive, unit: 'GB' },
    { label: 'AI credits used', value: 3420, max: 5000, icon: Bot, unit: '' },
    { label: 'Messages sent', value: 18432, max: 50000, icon: MessageSquare, unit: '' },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Billing & Plans</h1>
          <p className="mt-1 text-sm text-surface-500">
            Manage your subscription, seats, and invoices. Switch plans anytime.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-surface-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-900">
          <button
            onClick={() => setBilling('monthly')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              billing === 'monthly'
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              billing === 'annual'
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            )}
          >
            Annual
            <span className="rounded-full bg-brand-500/10 px-1.5 py-0.5 text-2xs font-semibold text-brand-600 dark:text-brand-400">
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Current plan banner */}
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6 dark:border-brand-500/20 dark:from-brand-950/30 dark:to-surface-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Pro plan</h2>
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-2xs font-semibold text-brand-600 dark:text-brand-400">
                  Active
                </span>
              </div>
              <p className="text-sm text-surface-600 dark:text-surface-400 mt-0.5">
                10 seats · Annual billing · Renews May 12, 2026
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-3 py-1.5 text-xs">Manage seats</button>
            <button className="btn-primary px-3 py-1.5 text-xs">Change plan</button>
          </div>
        </div>
      </div>

      {/* Usage this period */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400 mb-3">
          Usage this period
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {usage.map((u) => {
            const Icon = u.icon;
            const pct = Math.min(100, (u.value / u.max) * 100);
            const warn = pct > 80;
            return (
              <div
                key={u.label}
                className="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900"
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className="h-4 w-4 text-surface-400" />
                  {warn && (
                    <span className="flex items-center gap-1 text-2xs font-medium text-warning-700 dark:text-warning-500">
                      <AlertCircle className="h-3 w-3" /> Near limit
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">{u.label}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl font-semibold text-surface-900 dark:text-white tabular-nums">
                    {u.value.toLocaleString()}
                  </span>
                  <span className="text-xs text-surface-400 tabular-nums">
                    {u.unit && `${u.unit} `}/ {u.max.toLocaleString()}{u.unit ? ` ${u.unit}` : ''}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-500',
                      warn
                        ? 'bg-gradient-to-r from-warning-500 to-danger-500'
                        : 'bg-gradient-to-r from-brand-500 to-brand-400'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Plans */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400 mb-3">
          Available plans
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const price = plan.price[billing];
            const isCurrent = plan.id === currentPlan;

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-white p-6 transition-all dark:bg-surface-900',
                  plan.popular
                    ? 'border-brand-500 ring-1 ring-brand-500/20 shadow-elevated'
                    : 'border-surface-200 dark:border-surface-700'
                )}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-2xs font-semibold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}

                <div className="flex items-center gap-2 mb-3">
                  <Icon className={cn('h-5 w-5', plan.accent)} />
                  <h3 className="text-base font-semibold text-surface-900 dark:text-white">{plan.name}</h3>
                </div>
                <p className="text-xs text-surface-500 leading-relaxed min-h-[32px]">{plan.tagline}</p>

                <div className="mt-4 mb-5">
                  {plan.enterprise ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-surface-900 dark:text-white">Custom</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-surface-900 dark:text-white tabular-nums">
                        ${price}
                      </span>
                      <span className="text-sm text-surface-500">/ seat / {billing === 'annual' ? 'mo' : 'mo'}</span>
                    </div>
                  )}
                  {!plan.enterprise && billing === 'annual' && price > 0 && (
                    <p className="mt-1 text-2xs text-brand-600 dark:text-brand-400">
                      Billed ${price * 12}/yr per seat
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handlePlan(plan.id)}
                  disabled={isCurrent || loading === plan.id}
                  className={cn(
                    'w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    isCurrent
                      ? 'bg-surface-100 text-surface-500 cursor-default dark:bg-surface-800'
                      : plan.popular
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'bg-surface-900 text-white hover:bg-surface-800 dark:bg-white dark:text-surface-900 dark:hover:bg-surface-100'
                  )}
                >
                  {loading === plan.id ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    'Current plan'
                  ) : plan.enterprise ? (
                    'Contact sales'
                  ) : (
                    'Choose plan'
                  )}
                </button>

                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-surface-600 dark:text-surface-400">
                      <Check className="h-3.5 w-3.5 text-brand-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Payment method */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-surface-400">
              Payment method
            </h3>
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              Update
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-surface-200 p-4 dark:border-surface-700">
            <div className="flex h-10 w-14 items-center justify-center rounded-md bg-gradient-to-br from-surface-800 to-surface-950 text-white">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-surface-900 dark:text-white tabular-nums">
                Visa ending in 4242
              </p>
              <p className="text-xs text-surface-500">Expires 08/2028</p>
            </div>
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-500">
              Default
            </span>
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-300 py-2.5 text-xs font-medium text-surface-500 hover:border-surface-400 hover:text-surface-700 transition-colors dark:border-surface-700">
            + Add payment method
          </button>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-surface-400">
              Billing contact
            </h3>
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              Edit
            </button>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-surface-500">Company</dt>
              <dd className="font-medium text-surface-900 dark:text-white">CollabSpace Inc.</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-surface-500">Billing email</dt>
              <dd className="font-medium text-surface-900 dark:text-white">billing@company.com</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-surface-500">Tax ID</dt>
              <dd className="font-medium text-surface-900 dark:text-white tabular-nums">US-XX-1234567</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-surface-500">Address</dt>
              <dd className="font-medium text-right text-surface-900 dark:text-white">
                548 Market St, SF CA 94104
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Invoices */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400">Invoices</h2>
          <button className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
            <TrendingUp className="h-3.5 w-3.5" />
            View full history
          </button>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700">
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400">Invoice</th>
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400">Date</th>
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400 hidden md:table-cell">Description</th>
                <th className="px-4 py-2.5 text-right text-2xs font-semibold uppercase tracking-wider text-surface-400">Amount</th>
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-surface-400">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv) => (
                <tr key={inv.id} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-surface-700 dark:text-surface-300">{inv.id}</td>
                  <td className="px-4 py-3 text-xs text-surface-500">{inv.date}</td>
                  <td className="px-4 py-3 text-xs text-surface-600 dark:text-surface-400 hidden md:table-cell">{inv.description}</td>
                  <td className="px-4 py-3 text-right font-medium text-surface-900 dark:text-white tabular-nums">${inv.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-2xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-500">
                      <span className="h-1 w-1 rounded-full bg-success-500" />
                      Paid
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors dark:hover:bg-surface-800"
                      title="Download invoice"
                    >
                      <Download className="h-3 w-3" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cancel */}
      <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900/50">
        <div className="flex items-start gap-3">
          <Receipt className="h-5 w-5 text-surface-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-surface-900 dark:text-white">Need to cancel or pause?</p>
            <p className="text-xs text-surface-500 mt-0.5">
              You can cancel anytime and keep access until the end of your billing period.
            </p>
          </div>
        </div>
        <button className="flex items-center gap-1 text-xs font-medium text-danger-600 hover:text-danger-700 dark:text-danger-400">
          Cancel subscription
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
