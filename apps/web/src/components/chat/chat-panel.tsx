'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Hash, Lock, ChevronDown, Send, Smile, Paperclip,
  Video, Users, Search, Plus, AtSign, MessageCircle,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useChatStore, type ChatMessage, type ChatChannel } from '@/stores/chat-store';
import { VideoCallModal } from '@/components/chat/video-call-modal';

// ─── Emoji Picker (quick) ─────────────────────────────────────────

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🚀', '👀', '✅', '🙏'];

function ReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 mb-1 flex gap-0.5 rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-800 z-20"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// ─── Single message ───────────────────────────────────────────────

function MessageBubble({
  message,
  channelId,
  isConsecutive,
}: {
  message: ChatMessage;
  channelId: string;
  isConsecutive: boolean;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const { addReaction } = useChatStore();
  const isOwn = message.senderId === 'u1';

  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'group relative flex gap-3 px-4 py-0.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors',
        !isConsecutive && 'mt-3 pt-1',
        message.type === 'system' && 'justify-center'
      )}
    >
      {message.type === 'system' ? (
        <div className="text-xs text-surface-400 italic">{message.content}</div>
      ) : (
        <>
          {/* Avatar */}
          {!isConsecutive ? (
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: isOwn ? '#0d9488' : stringToColor(message.senderName) }}
            >
              {getInitials(message.senderName)}
            </div>
          ) : (
            <div className="w-9 shrink-0" />
          )}

          {/* Content */}
          <div className="min-w-0 flex-1">
            {!isConsecutive && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className={cn('text-sm font-semibold', isOwn ? 'text-brand-700 dark:text-brand-400' : 'text-surface-900 dark:text-white')}>
                  {message.senderName}
                </span>
                <span className="text-[11px] text-surface-400">{timeStr}</span>
              </div>
            )}
            <p className="text-[13.5px] text-surface-700 dark:text-surface-300 leading-relaxed break-words">
              {message.content}
            </p>

            {/* Reactions */}
            {message.reactions && message.reactions.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {message.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    onClick={() => addReaction(channelId, message.id, r.emoji, 'u1')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                      r.users.includes('u1')
                        ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-400'
                        : 'border-surface-200 bg-surface-50 text-surface-600 hover:border-surface-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400'
                    )}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-medium">{r.users.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hover actions */}
          <div className="absolute right-3 top-0 hidden group-hover:flex items-center gap-0.5 -translate-y-1/2 rounded-lg border border-surface-200 bg-white p-0.5 shadow-sm dark:border-surface-700 dark:bg-surface-800">
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-surface-400 hover:bg-surface-100 hover:text-surface-600 dark:hover:bg-surface-700 dark:hover:text-surface-300 transition-colors"
                title="Add reaction"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              {showReactions && (
                <ReactionPicker
                  onSelect={(emoji) => addReaction(channelId, message.id, emoji, 'u1')}
                  onClose={() => setShowReactions(false)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Channel sidebar item ─────────────────────────────────────────

function ChannelItem({
  channel,
  isActive,
  onClick,
}: {
  channel: ChatChannel;
  isActive: boolean;
  onClick: () => void;
}) {
  const isOnline = channel.type === 'direct' && channel.members.some((m) => m.id !== 'u1' && m.online);

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
        isActive
          ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
      )}
    >
      {channel.type === 'direct' ? (
        <div className="relative">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
            style={{ backgroundColor: stringToColor(channel.name) }}
          >
            {getInitials(channel.name)}
          </div>
          {isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-surface-900" />
          )}
        </div>
      ) : (
        <Hash className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400')} />
      )}
      <span className={cn('flex-1 truncate text-[13px]', channel.unreadCount > 0 && 'font-semibold')}>{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function stringToColor(str: string): string {
  const colors = [
    '#0d9488', '#0284c7', '#d97706', '#059669', '#dc2626',
    '#7c3aed', '#2563eb', '#c026d3', '#ea580c', '#0891b2',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// ─── Main ChatPanel ───────────────────────────────────────────────

export function ChatPanel() {
  const {
    channels,
    activeChannelId,
    messagesByChannel,
    typingUsers,
    switchChannel,
    sendMessage,
  } = useChatStore();

  const [inputValue, setInputValue] = useState('');
  const [showVideoCall, setShowVideoCall] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChannel = channels.find((ch) => ch.id === activeChannelId);
  const messages = messagesByChannel[activeChannelId] ?? [];
  const typing = typingUsers[activeChannelId] ?? [];
  const totalUnread = channels.reduce((sum, ch) => sum + ch.unreadCount, 0);

  const projectChannels = channels.filter((ch) => ch.type === 'general' || ch.type === 'project');
  const directChannels = channels.filter((ch) => ch.type === 'direct');

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input when switching channels
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChannelId]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    sendMessage(activeChannelId, text);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, activeChannelId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSend();
      }
      // Also send on plain Enter (no Shift)
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <>
      <div className="flex h-full w-full overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-950">
        {/* ── Left sidebar ── */}
        <div className="flex w-[220px] shrink-0 flex-col border-r border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900">
          {/* Sidebar header */}
          <div className="flex h-[52px] items-center justify-between border-b border-surface-200 px-3 dark:border-surface-800">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-semibold text-surface-900 dark:text-white">Chat</span>
              {totalUnread > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </div>
            <button className="rounded-md p-1 text-surface-400 hover:bg-surface-200 hover:text-surface-600 dark:hover:bg-surface-800 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="px-2 pt-2 pb-1">
            <div className="flex items-center gap-1.5 rounded-md border border-surface-200 bg-white px-2 py-1.5 text-xs text-surface-400 dark:border-surface-700 dark:bg-surface-800">
              <Search className="h-3 w-3" />
              <span>Search messages...</span>
            </div>
          </div>

          {/* Channel list */}
          <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
            {/* Channels section */}
            <div className="mb-3">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                  Channels
                </span>
                <ChevronDown className="h-3 w-3 text-surface-400" />
              </div>
              <div className="space-y-px">
                {projectChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    isActive={ch.id === activeChannelId}
                    onClick={() => switchChannel(ch.id)}
                  />
                ))}
              </div>
            </div>

            {/* Direct messages section */}
            <div>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">
                  Direct Messages
                </span>
                <Plus className="h-3 w-3 text-surface-400 cursor-pointer hover:text-surface-600" />
              </div>
              <div className="space-y-px">
                {directChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    isActive={ch.id === activeChannelId}
                    onClick={() => switchChannel(ch.id)}
                  />
                ))}
              </div>
            </div>
          </nav>
        </div>

        {/* ── Right: message area ── */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Channel header */}
          <div className="flex h-[52px] items-center justify-between border-b border-surface-200 px-4 dark:border-surface-800">
            <div className="flex items-center gap-2">
              {activeChannel?.type === 'direct' ? (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                  style={{ backgroundColor: stringToColor(activeChannel.name) }}
                >
                  {getInitials(activeChannel.name)}
                </div>
              ) : (
                <Hash className="h-4 w-4 text-surface-400" />
              )}
              <div>
                <h2 className="text-sm font-semibold text-surface-900 dark:text-white">
                  {activeChannel?.name ?? 'Select a channel'}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <Users className="h-3.5 w-3.5" />
                <span>{activeChannel?.members.length ?? 0}</span>
              </button>
              <button
                onClick={() => setShowVideoCall(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
                title="Start video call"
              >
                <Video className="h-3.5 w-3.5" />
              </button>
              <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800 mb-3">
                  <MessageCircle className="h-6 w-6 text-surface-400" />
                </div>
                <p className="text-sm font-medium text-surface-600 dark:text-surface-300">No messages yet</p>
                <p className="mt-1 text-xs text-surface-400">Start the conversation!</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const isConsecutive =
                  prev !== null &&
                  prev.senderId === msg.senderId &&
                  msg.timestamp - prev.timestamp < 5 * 60_000;

                return (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    channelId={activeChannelId}
                    isConsecutive={isConsecutive}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator */}
          {typing.length > 0 && (
            <div className="px-4 pb-1">
              <span className="text-xs text-surface-400">
                <span className="font-medium text-surface-500">{typing.join(', ')}</span>
                {' '}
                {typing.length === 1 ? 'is' : 'are'} typing
                <span className="inline-flex ml-0.5 gap-0.5">
                  <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-surface-400" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-surface-400" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block h-1 w-1 animate-bounce rounded-full bg-surface-400" style={{ animationDelay: '300ms' }} />
                </span>
              </span>
            </div>
          )}

          {/* Message input */}
          <div className="border-t border-surface-200 p-3 dark:border-surface-800">
            <div className="flex items-end gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400/30 dark:border-surface-700 dark:bg-surface-800 transition-all">
              <button className="mb-0.5 rounded-md p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message #${activeChannel?.name ?? ''}...`}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-surface-900 placeholder-surface-400 outline-none dark:text-white"
                style={{ minHeight: 24, maxHeight: 120 }}
              />
              <div className="mb-0.5 flex items-center gap-1">
                <button className="rounded-md p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
                  <AtSign className="h-4 w-4" />
                </button>
                <button className="rounded-md p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                    inputValue.trim()
                      ? 'bg-brand-600 text-white hover:bg-brand-700'
                      : 'bg-surface-200 text-surface-400 dark:bg-surface-700'
                  )}
                  title="Send (Enter or Ctrl+Enter)"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-surface-400 text-right">
              Press <kbd className="rounded bg-surface-200 px-1 py-0.5 text-[9px] font-mono dark:bg-surface-700">Enter</kbd> to send
            </p>
          </div>
        </div>
      </div>

      {/* Video call modal */}
      {showVideoCall && activeChannel && (
        <VideoCallModal
          channelName={activeChannel.name}
          onClose={() => setShowVideoCall(false)}
        />
      )}
    </>
  );
}

export default ChatPanel;
