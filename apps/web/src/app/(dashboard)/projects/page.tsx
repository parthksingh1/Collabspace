'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, FolderKanban, Users, X } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';

interface Project {
  id: string;
  name: string;
  description: string;
  keyPrefix: string;
  taskCount: number;
  completedCount: number;
  memberCount: number;
  updatedAt: string;
}

const templates = [
  { id: 'blank', name: 'Blank Project', description: 'Start from scratch', icon: '📋' },
  { id: 'scrum', name: 'Scrum', description: 'Sprints with backlog and board', icon: '🏃' },
  { id: 'kanban', name: 'Kanban', description: 'Visual flow with columns', icon: '📊' },
  { id: 'bugs', name: 'Bug Tracking', description: 'Track and resolve issues', icon: '🐛' },
];

const INITIAL_PROJECTS: Project[] = [
  { id: 'p1', name: 'CollabSpace Core', description: 'Main platform development', keyPrefix: 'CS', taskCount: 42, completedCount: 28, memberCount: 6, updatedAt: '2026-04-13T04:00:00Z' },
  { id: 'p2', name: 'AI Agents', description: 'Multi-agent system implementation', keyPrefix: 'AI', taskCount: 18, completedCount: 7, memberCount: 3, updatedAt: '2026-04-12T15:00:00Z' },
  { id: 'p3', name: 'Infrastructure', description: 'K8s, Terraform, CI/CD', keyPrefix: 'INF', taskCount: 15, completedCount: 12, memberCount: 2, updatedAt: '2026-04-11T10:00:00Z' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [newName, setNewName] = useState('');
  const [newPrefix, setNewPrefix] = useState('');

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [projects, search]
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    const newProject: Project = {
      id: `p-${Date.now()}`,
      name: newName.trim(),
      description: `${selectedTemplate} project`,
      keyPrefix: newPrefix || newName.substring(0, 3).toUpperCase(),
      taskCount: 0,
      completedCount: 0,
      memberCount: 1,
      updatedAt: new Date().toISOString(),
    };
    setProjects((prev) => [newProject, ...prev]);
    setShowCreate(false);
    setNewName('');
    setNewPrefix('');
    setSelectedTemplate('blank');
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Projects</h1>
          <p className="mt-1 text-sm text-surface-500">Manage your tasks, sprints, and team progress.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary gap-2 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg animate-scale-in rounded-2xl border border-surface-200 bg-white p-6 shadow-elevated dark:border-surface-700 dark:bg-surface-900 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Create Project</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all',
                    selectedTemplate === t.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                      : 'border-surface-200 hover:border-surface-300 dark:border-surface-700 dark:hover:border-surface-600'
                  )}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-surface-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-surface-500">{t.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setNewPrefix(e.target.value.substring(0, 3).toUpperCase()); }}
                  className="input"
                  placeholder="My Project"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Key</label>
                <input
                  type="text"
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value.toUpperCase().substring(0, 5))}
                  className="input font-mono"
                  placeholder="PRJ"
                  maxLength={5}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary px-4 py-2 text-sm">Create Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mt-6 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
          placeholder="Search projects..."
        />
      </div>

      {/* Project Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((project) => {
          const progress = project.taskCount > 0 ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
          return (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <div className="card-hover p-5 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-950">
                      <FolderKanban className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-surface-900 dark:text-white">{project.name}</h3>
                      <p className="text-xs text-surface-500">{project.keyPrefix} &middot; {project.description}</p>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-surface-500">{project.completedCount}/{project.taskCount} tasks</span>
                    <span className="text-xs font-medium text-surface-700 dark:text-surface-300">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between text-xs text-surface-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {project.memberCount} members
                  </span>
                  <span>{formatRelativeTime(project.updatedAt)}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
            <FolderKanban className="h-10 w-10 text-surface-300 dark:text-surface-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-surface-900 dark:text-white">No projects found</h3>
          <p className="mt-1.5 max-w-sm text-sm text-surface-500">
            {search ? 'Try adjusting your search query.' : 'Create your first project to start managing tasks.'}
          </p>
        </div>
      )}
    </div>
  );
}
