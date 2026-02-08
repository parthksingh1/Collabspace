'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X, Send, Sparkles, Loader2, Trash2, Copy, Check,
  FileText, Code2, FolderKanban, PenTool, Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIStore } from '@/stores/ai-store';

const quickActions = [
  { label: 'Summarize document', icon: FileText, prompt: 'Summarize the current document concisely.' },
  { label: 'Review code', icon: Code2, prompt: 'Review the current code for bugs, security issues, and improvements.' },
  { label: 'Break down task', icon: FolderKanban, prompt: 'Break down the current task into actionable subtasks with estimates.' },
  { label: 'Generate diagram', icon: PenTool, prompt: 'Generate a diagram for the current context.' },
];

export function AISidebar() {
  const {
    messages, isStreaming, currentStreamContent,
    sendMessage, clearMessages, toggleSidebar,
  } = useAIStore();

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex w-[var(--panel-width)] shrink-0 flex-col border-l border-surface-200 bg-white animate-slide-in-right dark:border-surface-800 dark:bg-surface-950">
      {/* Header */}
      <div className="flex h-[var(--header-height)] items-center justify-between border-b border-surface-200 px-4 dark:border-surface-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50">
            <Sparkles className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-surface-900 dark:text-white">AI Assistant</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={clearMessages} className="btn-ghost rounded-lg p-1.5" title="Clear">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={toggleSidebar} className="btn-ghost rounded-lg p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center pt-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
              <Bot className="h-7 w-7 text-surface-400" />
            </div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">How can I help?</h3>
            <p className="mt-1.5 text-xs text-surface-400 max-w-[220px] leading-relaxed">
              I can assist with documents, code, projects, and more.
            </p>

            <div className="mt-6 w-full space-y-1.5">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.prompt)}
                    className="flex w-full items-center gap-3 rounded-lg border border-surface-200 px-3 py-2.5 text-[13px] text-surface-600 transition-all hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700 dark:border-surface-800 dark:text-surface-400 dark:hover:border-brand-800 dark:hover:bg-brand-950/30 dark:hover:text-brand-400"
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-60" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                message.role === 'user'
                  ? 'bg-surface-900 text-white rounded-br-md dark:bg-surface-100 dark:text-surface-900'
                  : 'bg-surface-100 text-surface-800 rounded-bl-md dark:bg-surface-800 dark:text-surface-200'
              )}
            >
              {message.role === 'assistant' ? (
                <div>
                  <div className="space-y-1.5 [&_pre]:rounded-lg [&_pre]:bg-surface-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-surface-200 [&_pre]:overflow-x-auto dark:[&_pre]:bg-surface-950">
                    {message.content.split('\n').map((line, i) => {
                      if (line.startsWith('```')) return <pre key={i}><code>{line.replace(/```\w*/, '').replace(/```$/, '')}</code></pre>;
                      if (line.startsWith('# ')) return <p key={i} className="font-semibold text-sm mt-2">{line.slice(2)}</p>;
                      if (line.startsWith('- ')) return <li key={i} className="ml-3 list-disc">{line.slice(2)}</li>;
                      if (!line.trim()) return <br key={i} />;
                      return <p key={i}>{line}</p>;
                    })}
                  </div>
                  <button
                    onClick={() => handleCopy(message.content, message.id)}
                    className="mt-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-surface-400 hover:bg-surface-200 hover:text-surface-600 transition-colors dark:hover:bg-surface-700"
                  >
                    {copiedId === message.id ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-surface-100 px-3.5 py-2.5 text-[13px] text-surface-800 dark:bg-surface-800 dark:text-surface-200">
              {currentStreamContent ? (
                <p>{currentStreamContent}<span className="inline-block w-0.5 h-4 bg-brand-500 animate-cursor-blink ml-0.5 align-middle" /></p>
              ) : (
                <div className="flex items-center gap-2 text-surface-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-surface-200 p-3 dark:border-surface-800">
        <div className="flex items-end gap-2 rounded-xl border border-surface-200 bg-surface-50 p-2 transition-colors focus-within:border-brand-400 focus-within:bg-white dark:border-surface-800 dark:bg-surface-900 dark:focus-within:border-brand-700 dark:focus-within:bg-surface-900">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-[13px] text-surface-900 placeholder:text-surface-400 focus:outline-none dark:text-surface-100"
            style={{ maxHeight: '100px' }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 100) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
              input.trim() && !isStreaming
                ? 'bg-surface-900 text-white hover:bg-surface-800 dark:bg-white dark:text-surface-900 dark:hover:bg-surface-200'
                : 'bg-surface-200 text-surface-400 dark:bg-surface-800'
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-2xs text-surface-400">
          Ctrl+Enter to send
        </p>
      </div>
    </div>
  );
}
