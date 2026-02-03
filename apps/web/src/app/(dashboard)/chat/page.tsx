'use client';

import { ChatPanel } from '@/components/chat/chat-panel';

export default function ChatPage() {
  return (
    <div className="h-[calc(100vh-theme(spacing.20))]">
      <ChatPanel />
    </div>
  );
}
