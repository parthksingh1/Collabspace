# CollabSpace Web

Next.js 14 frontend for the CollabSpace collaboration platform.

## Tech Stack
- **Next.js 14** with App Router
- **React 18** with TypeScript
- **TailwindCSS** for styling
- **Zustand** for global state management
- **React Query** (TanStack Query) for server state
- **Tiptap** for rich-text document editing
- **Monaco Editor** for code editing
- **Canvas API / Konva** for whiteboard
- **@hello-pangea/dnd** for drag-and-drop
- **Recharts** for data visualization
- **Framer Motion** for animations
- **Lucide React** for icons
- **cmdk** for command palette

## Running

```bash
npm run dev        # Start dev server on port 3000
npm run build      # Production build (standalone output)
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # Type-check with TypeScript
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout with providers
│   ├── globals.css               # Global styles + Tailwind
│   ├── (auth)/                   # Auth pages (no sidebar)
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── (dashboard)/              # Dashboard pages (with sidebar)
│       ├── layout.tsx            # Dashboard shell (sidebar + header + AI)
│       ├── page.tsx              # Dashboard home
│       ├── documents/
│       │   ├── page.tsx          # Document list
│       │   └── [id]/page.tsx     # Document editor
│       ├── code/
│       │   ├── page.tsx          # Code file list
│       │   └── [id]/page.tsx     # Code editor
│       ├── boards/
│       │   ├── page.tsx          # Whiteboard list
│       │   └── [id]/page.tsx     # Whiteboard canvas
│       ├── projects/
│       │   ├── page.tsx          # Project list
│       │   └── [id]/page.tsx     # Project board (Kanban/List/Timeline)
│       ├── analytics/page.tsx    # Analytics dashboard
│       ├── team/page.tsx         # Team management
│       ├── notifications/page.tsx
│       └── settings/page.tsx
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx           # Main navigation sidebar
│   │   └── header.tsx            # Top header with search, notifications
│   ├── documents/
│   │   ├── editor.tsx            # Tiptap editor with CRDT
│   │   ├── toolbar.tsx           # Formatting toolbar
│   │   ├── comments-panel.tsx    # Comments sidebar
│   │   └── version-history.tsx   # Version history panel
│   ├── code/
│   │   ├── monaco-editor.tsx     # Monaco editor wrapper
│   │   ├── execution-panel.tsx   # Code output panel
│   │   ├── contest-room.tsx      # Contest mode UI
│   │   └── file-tree.tsx         # File explorer
│   ├── whiteboard/
│   │   ├── canvas.tsx            # Infinite canvas
│   │   └── shape-toolbar.tsx     # Shape tool selector
│   ├── projects/
│   │   ├── kanban-board.tsx      # Drag-and-drop Kanban
│   │   ├── task-card.tsx         # Task card component
│   │   ├── task-detail.tsx       # Task detail modal
│   │   ├── list-view.tsx         # Table view
│   │   ├── timeline-view.tsx     # Gantt view
│   │   ├── backlog-view.tsx      # Backlog management
│   │   └── sprint-panel.tsx      # Sprint info + burndown
│   ├── ai/
│   │   ├── ai-sidebar.tsx        # AI chat panel
│   │   ├── agent-status.tsx      # Running agents display
│   │   └── command-palette.tsx   # Ctrl+K command palette
│   └── providers.tsx             # React Query, Theme, WebSocket providers
├── stores/
│   ├── auth-store.ts             # Auth state (Zustand + persist)
│   ├── workspace-store.ts        # Workspace state
│   ├── presence-store.ts         # Online users + cursors
│   └── ai-store.ts               # AI chat + agents state
├── hooks/
│   ├── use-documents.ts          # Document React Query hooks
│   ├── use-code.ts               # Code file hooks
│   ├── use-whiteboard.ts         # Whiteboard hooks
│   ├── use-projects.ts           # Project/task hooks
│   └── use-collaboration.ts      # CRDT + WebSocket hook
└── lib/
    ├── api-client.ts             # Typed HTTP client
    ├── websocket-context.tsx      # WebSocket provider with reconnect
    ├── theme-context.tsx          # Dark/light/system theme
    └── utils.ts                   # cn(), formatRelativeTime, etc.
```

## Key Features

### Command Palette (Ctrl+K)
- Quick navigation to any page
- AI commands (summarize, review, plan)
- Fuzzy search across commands
- Keyboard navigation (arrows + enter)

### AI Sidebar (Ctrl+J)
- Chat with streaming responses
- Quick action buttons
- Markdown rendering in responses
- Copy code blocks
- Context-aware suggestions

### Real-Time Collaboration
- WebSocket connection with auto-reconnect (exponential backoff)
- Message queuing during disconnection
- Latency indicator in header
- Presence avatars showing online collaborators

### Theme System
- Light, dark, and system (auto) modes
- Persisted to localStorage
- Smooth transitions
- Custom brand color palette (indigo-based)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | API Gateway URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4001` | WebSocket Gateway URL |
