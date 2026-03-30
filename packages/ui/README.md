# @collabspace/ui

Shared React component library and hooks for the CollabSpace frontend.

## Usage

```tsx
import {
  Button, Input, Avatar, Badge, Modal, Dropdown, Tooltip,
  Card, Spinner, Tabs, CommandPalette, PresenceAvatars,
  KanbanColumn, RichTextToolbar,
  useDebounce, useThrottle, useLocalStorage, useMediaQuery,
  useClickOutside, useKeyboardShortcut, useIntersectionObserver,
} from '@collabspace/ui';
```

## Components

| Component | Description |
|-----------|-------------|
| `Button` | Polymorphic button with 5 variants, 4 sizes, loading state, icon support |
| `Input` | Text input with label, error, helper text, prefix/suffix |
| `Avatar` | User avatar with fallback initials and status indicator |
| `Badge` | Color-coded badge with optional dot and remove button |
| `Modal` | Portal-rendered modal with backdrop, focus trap, size variants |
| `Dropdown` | Menu with keyboard navigation, icons, shortcuts |
| `Tooltip` | Positioned tooltip with configurable delay |
| `Card` | Card with header/body/footer sections |
| `Spinner` | SVG loading spinner |
| `Tabs` | Tabbed interface with underline/pills variants |
| `Toast` | Toast notification system with auto-dismiss and stacking |
| `CommandPalette` | Cmd+K palette with search, sections, keyboard nav |
| `PresenceAvatars` | Online collaborator avatars with cursor colors |
| `KanbanColumn` | Draggable task column for project boards |
| `RichTextToolbar` | Formatting toolbar for Tiptap editor |

## Hooks

| Hook | Description |
|------|-------------|
| `useDebounce` | Debounce a value with configurable delay |
| `useThrottle` | Throttle a value |
| `useLocalStorage` | SSR-safe localStorage with cross-tab sync |
| `useMediaQuery` | SSR-safe media query matching |
| `useClickOutside` | Detect clicks outside a ref |
| `useKeyboardShortcut` | Register keyboard shortcuts |
| `useIntersectionObserver` | Intersection observer with triggerOnce |

## Styling

All components use **TailwindCSS** classes. Add `@collabspace/ui` to your Tailwind `content` config:

```js
content: ['../../packages/ui/src/**/*.{ts,tsx}']
```
