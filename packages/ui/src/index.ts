// ─── Components ────────────────────────────────────────────────────

export { Button } from './components/button.js';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/button.js';

export { Input } from './components/input.js';
export type { InputProps } from './components/input.js';

export { Avatar } from './components/avatar.js';
export type { AvatarProps, AvatarSize, AvatarStatus } from './components/avatar.js';

export { Badge } from './components/badge.js';
export type { BadgeProps, BadgeColor, BadgeSize } from './components/badge.js';

export { Modal } from './components/modal.js';
export type { ModalProps, ModalSize } from './components/modal.js';

export { Dropdown } from './components/dropdown.js';
export type {
  DropdownProps,
  DropdownItem,
  DropdownSeparator,
  DropdownEntry,
} from './components/dropdown.js';

export { Tooltip } from './components/tooltip.js';
export type { TooltipProps, TooltipPosition } from './components/tooltip.js';

export { Card, CardHeader, CardBody, CardFooter } from './components/card.js';
export type { CardProps, CardHeaderProps } from './components/card.js';

export { Spinner } from './components/spinner.js';
export type { SpinnerProps, SpinnerSize, SpinnerColor } from './components/spinner.js';

export { ToastProvider, useToast } from './components/toast.js';
export type { Toast, ToastVariant } from './components/toast.js';

export { Tabs, TabPanel } from './components/tabs.js';
export type { Tab, TabsProps, TabPanelProps } from './components/tabs.js';

export { CommandPalette, useCommandPalette } from './components/command-palette.js';
export type { CommandItem, CommandPaletteProps } from './components/command-palette.js';

export { PresenceAvatars } from './components/presence-avatars.js';
export type { PresenceUser, PresenceAvatarsProps } from './components/presence-avatars.js';

export { KanbanColumn } from './components/kanban-column.js';
export type {
  KanbanTask,
  KanbanColumnProps,
} from './components/kanban-column.js';

export { RichTextToolbar, createDefaultToolbarGroups } from './components/rich-text-toolbar.js';
export type {
  ToolbarAction,
  ToolbarGroup,
  RichTextToolbarProps,
} from './components/rich-text-toolbar.js';

// ─── Hooks ─────────────────────────────────────────────────────────

export { useDebounce, useDebouncedCallback } from './hooks/use-debounce.js';
export { useThrottle } from './hooks/use-throttle.js';
export { useLocalStorage } from './hooks/use-local-storage.js';
export { useMediaQuery } from './hooks/use-media-query.js';
export { useClickOutside } from './hooks/use-click-outside.js';
export { useKeyboardShortcut, useKeyboardShortcuts } from './hooks/use-keyboard-shortcut.js';
export type { KeyboardShortcut } from './hooks/use-keyboard-shortcut.js';
export { useIntersectionObserver } from './hooks/use-intersection-observer.js';
export type {
  UseIntersectionObserverOptions,
  UseIntersectionObserverResult,
} from './hooks/use-intersection-observer.js';
