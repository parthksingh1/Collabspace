'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, PenTool, FolderKanban, Code2, Sparkles,
  Search, Star, ChevronRight, Users, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/toast-store';

type Category = 'all' | 'doc' | 'board' | 'project' | 'code';

type Template = {
  id: string;
  title: string;
  description: string;
  category: Exclude<Category, 'all'>;
  tags: string[];
  featured?: boolean;
  uses: number;
  gradient: string;
};

const TEMPLATES: Template[] = [
  // Documents
  {
    id: 't-prd',
    title: 'Product Requirements Doc',
    description: 'Structured PRD with problem, goals, users, scope, and success metrics.',
    category: 'doc',
    tags: ['Product', 'Writing'],
    featured: true,
    uses: 2481,
    gradient: 'from-sky-400 to-indigo-500',
  },
  {
    id: 't-meeting',
    title: 'Meeting Notes',
    description: 'Agenda, decisions, and action items with owners and deadlines.',
    category: 'doc',
    tags: ['Meetings', 'Collaboration'],
    uses: 8421,
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    id: 't-rfc',
    title: 'Engineering RFC',
    description: 'Propose a technical change with context, alternatives, and risks.',
    category: 'doc',
    tags: ['Engineering', 'Design'],
    uses: 1203,
    gradient: 'from-amber-400 to-orange-500',
  },
  {
    id: 't-postmortem',
    title: 'Incident Postmortem',
    description: 'Blameless postmortem: timeline, root cause, action items.',
    category: 'doc',
    tags: ['Engineering', 'SRE'],
    uses: 917,
    gradient: 'from-rose-400 to-pink-500',
  },
  {
    id: 't-onepager',
    title: 'Strategy One-Pager',
    description: 'Concise strategic brief with objectives, context, and next steps.',
    category: 'doc',
    tags: ['Leadership', 'Strategy'],
    uses: 624,
    gradient: 'from-violet-400 to-fuchsia-500',
  },

  // Boards
  {
    id: 't-flowchart',
    title: 'System Flowchart',
    description: 'Flowchart template with shapes, swimlanes, and smart connectors.',
    category: 'board',
    tags: ['Diagram', 'Architecture'],
    featured: true,
    uses: 3184,
    gradient: 'from-blue-400 to-cyan-500',
  },
  {
    id: 't-customerjourney',
    title: 'Customer Journey Map',
    description: 'Map touchpoints, emotions, and opportunities across the journey.',
    category: 'board',
    tags: ['UX', 'Research'],
    uses: 1452,
    gradient: 'from-pink-400 to-rose-500',
  },
  {
    id: 't-brainstorm',
    title: 'Brainstorm Canvas',
    description: 'Sticky-note brainstorming with grouping and voting.',
    category: 'board',
    tags: ['Ideation', 'Team'],
    uses: 2974,
    gradient: 'from-yellow-400 to-amber-500',
  },
  {
    id: 't-retro',
    title: 'Sprint Retrospective',
    description: 'Start, Stop, Continue board with voting dots and takeaways.',
    category: 'board',
    tags: ['Agile', 'Meetings'],
    uses: 1879,
    gradient: 'from-emerald-400 to-green-500',
  },

  // Projects
  {
    id: 't-sprint',
    title: '2-Week Sprint',
    description: 'Pre-configured sprint with backlog, in-progress, review, done.',
    category: 'project',
    tags: ['Agile', 'Kanban'],
    featured: true,
    uses: 4213,
    gradient: 'from-brand-400 to-brand-600',
  },
  {
    id: 't-launch',
    title: 'Product Launch',
    description: 'Cross-functional launch checklist with pre/during/post phases.',
    category: 'project',
    tags: ['Launch', 'Marketing'],
    uses: 892,
    gradient: 'from-orange-400 to-red-500',
  },
  {
    id: 't-bugtracker',
    title: 'Bug Tracker',
    description: 'Triage, investigate, fix, verify pipeline with severity labels.',
    category: 'project',
    tags: ['Engineering', 'QA'],
    uses: 1563,
    gradient: 'from-red-400 to-rose-500',
  },
  {
    id: 't-roadmap',
    title: 'Quarterly Roadmap',
    description: 'Timeline-based roadmap with epics, milestones, and dependencies.',
    category: 'project',
    tags: ['Planning', 'Strategy'],
    uses: 782,
    gradient: 'from-indigo-400 to-blue-500',
  },

  // Code
  {
    id: 't-nextjs',
    title: 'Next.js Starter',
    description: 'App Router, TypeScript, Tailwind, and ESLint pre-configured.',
    category: 'code',
    tags: ['Web', 'React'],
    uses: 5271,
    gradient: 'from-surface-700 to-surface-900',
  },
  {
    id: 't-api',
    title: 'Express + Postgres API',
    description: 'REST API with auth, migrations, validation, and tests.',
    category: 'code',
    tags: ['Backend', 'Node'],
    uses: 2394,
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    id: 't-algorithms',
    title: 'Algorithms Notebook',
    description: 'LeetCode-ready notebook with test runner and complexity table.',
    category: 'code',
    tags: ['Practice', 'Interview'],
    uses: 1128,
    gradient: 'from-amber-500 to-orange-600',
  },
];

const ICONS: Record<Exclude<Category, 'all'>, typeof FileText> = {
  doc: FileText,
  board: PenTool,
  project: FolderKanban,
  code: Code2,
};

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All templates' },
  { id: 'doc', label: 'Documents' },
  { id: 'board', label: 'Whiteboards' },
  { id: 'project', label: 'Projects' },
  { id: 'code', label: 'Code' },
];

export default function TemplatesPage() {
  const router = useRouter();
  const addToast = useToastStore((s) => s.addToast);
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => category === 'all' || t.category === category)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
  }, [category, query]);

  const featured = filtered.filter((t) => t.featured);
  const rest = filtered.filter((t) => !t.featured);

  const useTemplate = (t: Template) => {
    addToast({
      title: 'Template applied',
      description: `${t.title} — creating your new ${t.category}.`,
      variant: 'success',
    });
    const route =
      t.category === 'doc' ? '/documents' :
      t.category === 'board' ? '/boards' :
      t.category === 'project' ? '/projects' : '/code';
    router.push(route);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-surface-200 bg-gradient-to-br from-brand-50 via-white to-white p-8 dark:border-surface-700 dark:from-brand-950/20 dark:via-surface-900 dark:to-surface-900">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-white/60 px-2.5 py-1 text-2xs font-medium text-brand-700 backdrop-blur dark:border-brand-500/30 dark:bg-surface-900/60 dark:text-brand-400">
            <Sparkles className="h-3 w-3" /> Start fast with templates
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-surface-900 dark:text-white">
            Templates gallery
          </h1>
          <p className="mt-2 text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
            Skip the blank page. Pick a battle-tested template crafted by the CollabSpace team and community.
            Every template works across docs, boards, projects, and code.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates..."
                className="input pl-9 pr-3 py-2 w-full text-sm"
              />
            </div>
            <button className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Filters
            </button>
          </div>
        </div>

        <div className="absolute right-0 top-0 h-full w-1/3 pointer-events-none opacity-60">
          <div className="absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-brand-500/20 blur-3xl" />
        </div>
      </section>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 border-b border-surface-200 pb-3 dark:border-surface-700">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              category === c.id
                ? 'bg-surface-900 text-white dark:bg-white dark:text-surface-900'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Featured */}
      {featured.length > 0 && category === 'all' && !query && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400">Featured</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((t) => (
              <TemplateCard key={t.id} t={t} onUse={useTemplate} featured />
            ))}
          </div>
        </section>
      )}

      {/* All results */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-400">
            {query ? `Results (${filtered.length})` : 'All templates'}
          </h2>
          <span className="text-xs text-surface-400 tabular-nums">{rest.length + featured.length} total</span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-300 p-12 text-center dark:border-surface-700">
            <p className="text-sm text-surface-500">No templates match your search.</p>
            <button
              onClick={() => { setQuery(''); setCategory('all'); }}
              className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(query || category !== 'all' ? filtered : rest).map((t) => (
              <TemplateCard key={t.id} t={t} onUse={useTemplate} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TemplateCard({
  t,
  onUse,
  featured = false,
}: {
  t: Template;
  onUse: (t: Template) => void;
  featured?: boolean;
}) {
  const Icon = ICONS[t.category];
  return (
    <button
      onClick={() => onUse(t)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-elevated dark:bg-surface-900',
        featured
          ? 'border-brand-300 dark:border-brand-500/30'
          : 'border-surface-200 dark:border-surface-700'
      )}
    >
      {/* Preview area */}
      <div
        className={cn(
          'relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br',
          t.gradient
        )}
      >
        <div className="absolute inset-0 bg-grid-white/5" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-10 w-10 text-white/80" />
        </div>
        {t.featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-2xs font-semibold text-surface-900">
            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Featured
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {t.title}
        </h3>
        <p className="mt-1 text-xs text-surface-500 leading-relaxed line-clamp-2">{t.description}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          {t.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-surface-100 px-1.5 py-0.5 text-2xs font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-400"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-2xs text-surface-400">
          <span className="flex items-center gap-1 tabular-nums">
            <Users className="h-3 w-3" /> {t.uses.toLocaleString()} uses
          </span>
          <span className="inline-flex items-center gap-0.5 font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-400">
            Use template <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </button>
  );
}
