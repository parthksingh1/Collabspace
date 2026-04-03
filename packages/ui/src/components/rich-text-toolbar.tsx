'use client';

import React from 'react';

export interface ToolbarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
}

export interface ToolbarGroup {
  id: string;
  actions: ToolbarAction[];
}

export interface RichTextToolbarProps {
  groups: ToolbarGroup[];
  className?: string;
}

export function RichTextToolbar({ groups, className = '' }: RichTextToolbarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-sm ${className}`}
      role="toolbar"
      aria-label="Text formatting"
    >
      {groups.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          {groupIndex > 0 && (
            <div className="mx-1 h-5 w-px bg-gray-200" role="separator" />
          )}
          {group.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
              aria-label={action.label}
              aria-pressed={action.active}
              disabled={action.disabled}
              onClick={action.onClick}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors ${
                action.active
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              } ${action.disabled ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              {action.icon}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Create a default set of toolbar groups for a rich text editor.
 */
export function createDefaultToolbarGroups(handlers: {
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onStrikethrough?: () => void;
  onCode?: () => void;
  onH1?: () => void;
  onH2?: () => void;
  onH3?: () => void;
  onBulletList?: () => void;
  onOrderedList?: () => void;
  onBlockquote?: () => void;
  onLink?: () => void;
  onImage?: () => void;
  onCodeBlock?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}, activeStates?: Record<string, boolean>): ToolbarGroup[] {
  const active = activeStates ?? {};

  return [
    {
      id: 'history',
      actions: [
        {
          id: 'undo',
          label: 'Undo',
          shortcut: 'Ctrl+Z',
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M2.22 4.22a.75.75 0 011.06 0L6 6.94l2.72-2.72a.75.75 0 011.06 1.06L6.53 8.53a.75.75 0 01-1.06 0L2.22 5.28a.75.75 0 010-1.06z" /><path d="M6 7V2.75a.75.75 0 00-1.5 0v4.5A2.25 2.25 0 006.75 9.5h5.5a.75.75 0 000-1.5h-5.5A.75.75 0 016 7z" /></svg>,
          onClick: handlers.onUndo ?? (() => {}),
        },
        {
          id: 'redo',
          label: 'Redo',
          shortcut: 'Ctrl+Y',
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" style={{ transform: 'scaleX(-1)' }}><path fillRule="evenodd" d="M2.22 4.22a.75.75 0 011.06 0L6 6.94l2.72-2.72a.75.75 0 011.06 1.06L6.53 8.53a.75.75 0 01-1.06 0L2.22 5.28a.75.75 0 010-1.06z" /><path d="M6 7V2.75a.75.75 0 00-1.5 0v4.5A2.25 2.25 0 006.75 9.5h5.5a.75.75 0 000-1.5h-5.5A.75.75 0 016 7z" /></svg>,
          onClick: handlers.onRedo ?? (() => {}),
        },
      ],
    },
    {
      id: 'headings',
      actions: [
        {
          id: 'h1',
          label: 'Heading 1',
          active: active['h1'],
          icon: <span className="text-xs font-bold">H1</span>,
          onClick: handlers.onH1 ?? (() => {}),
        },
        {
          id: 'h2',
          label: 'Heading 2',
          active: active['h2'],
          icon: <span className="text-xs font-bold">H2</span>,
          onClick: handlers.onH2 ?? (() => {}),
        },
        {
          id: 'h3',
          label: 'Heading 3',
          active: active['h3'],
          icon: <span className="text-xs font-bold">H3</span>,
          onClick: handlers.onH3 ?? (() => {}),
        },
      ],
    },
    {
      id: 'marks',
      actions: [
        {
          id: 'bold',
          label: 'Bold',
          shortcut: 'Ctrl+B',
          active: active['bold'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.75A.75.75 0 014.75 2h4.5a3.25 3.25 0 012.165 5.677A3.25 3.25 0 019.75 14h-5A.75.75 0 014 13.25V2.75zm1.5.75v3.5h3.75a1.75 1.75 0 000-3.5H5.5zm0 5v3.5h4.25a1.75 1.75 0 000-3.5H5.5z" /></svg>,
          onClick: handlers.onBold ?? (() => {}),
        },
        {
          id: 'italic',
          label: 'Italic',
          shortcut: 'Ctrl+I',
          active: active['italic'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2.75A.75.75 0 016.75 2h6.5a.75.75 0 010 1.5h-2.505l-3.858 9H9.25a.75.75 0 010 1.5h-6.5a.75.75 0 010-1.5h2.505l3.858-9H6.75A.75.75 0 016 2.75z" /></svg>,
          onClick: handlers.onItalic ?? (() => {}),
        },
        {
          id: 'underline',
          label: 'Underline',
          shortcut: 'Ctrl+U',
          active: active['underline'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 2a.75.75 0 01.75.75v5.5a2.5 2.5 0 005 0v-5.5a.75.75 0 011.5 0v5.5a4 4 0 01-8 0v-5.5A.75.75 0 014.75 2zM3 13.25a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75z" /></svg>,
          onClick: handlers.onUnderline ?? (() => {}),
        },
        {
          id: 'strikethrough',
          label: 'Strikethrough',
          active: active['strikethrough'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 7.25a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z" /><path d="M5.622 3.037A3.361 3.361 0 018.003 2c1.032 0 1.96.42 2.603 1.098.641.676.933 1.562.784 2.462a.75.75 0 01-1.48-.24c.076-.458-.068-.87-.393-1.213A1.863 1.863 0 008.003 3.5c-.517 0-.975.184-1.295.443-.318.258-.458.57-.458.868 0 .09.013.178.04.263h-1.5a2.206 2.206 0 01-.04-.263c0-.79.364-1.41.872-1.774zM10.18 10.5c.101.266.152.552.152.852 0 .775-.37 1.403-.887 1.773a3.344 3.344 0 01-2.38 1.037c-1.04 0-1.972-.42-2.617-1.099a2.917 2.917 0 01-.774-2.46.75.75 0 111.48.24c-.08.459.065.873.389 1.214.325.343.78.555 1.3.555.517 0 .97-.184 1.288-.443.315-.258.453-.57.453-.867a.916.916 0 00-.054-.301h1.65z" /></svg>,
          onClick: handlers.onStrikethrough ?? (() => {}),
        },
        {
          id: 'code',
          label: 'Inline Code',
          active: active['code'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06l-4.25-4.25z" clipRule="evenodd" /></svg>,
          onClick: handlers.onCode ?? (() => {}),
        },
      ],
    },
    {
      id: 'blocks',
      actions: [
        {
          id: 'bulletList',
          label: 'Bullet List',
          active: active['bulletList'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M2 4a1 1 0 100-2 1 1 0 000 2zm3.75-1.5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zM3 8a1 1 0 11-2 0 1 1 0 012 0zm-1 5a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>,
          onClick: handlers.onBulletList ?? (() => {}),
        },
        {
          id: 'orderedList',
          label: 'Ordered List',
          active: active['orderedList'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M2.003 2.5a.5.5 0 00-.723-.447l-1.003.5a.5.5 0 00.446.895l.28-.14V5h-.5a.5.5 0 000 1h2a.5.5 0 000-1h-.5V2.5zM5.75 2.5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5zm0 5a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z" /></svg>,
          onClick: handlers.onOrderedList ?? (() => {}),
        },
        {
          id: 'blockquote',
          label: 'Blockquote',
          active: active['blockquote'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V3.25a.75.75 0 01.75-.75zm3 2a.75.75 0 000 1.5h9.5a.75.75 0 000-1.5h-9.5zm0 3a.75.75 0 000 1.5h9.5a.75.75 0 000-1.5h-9.5zm0 3a.75.75 0 000 1.5h5.5a.75.75 0 000-1.5h-5.5z" /></svg>,
          onClick: handlers.onBlockquote ?? (() => {}),
        },
        {
          id: 'codeBlock',
          label: 'Code Block',
          active: active['codeBlock'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM7.25 8a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 11-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 011.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" /></svg>,
          onClick: handlers.onCodeBlock ?? (() => {}),
        },
      ],
    },
    {
      id: 'insert',
      actions: [
        {
          id: 'link',
          label: 'Insert Link',
          shortcut: 'Ctrl+K',
          active: active['link'],
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M4.715 6.542L3.343 7.914a3 3 0 104.243 4.243l1.828-1.829A3 3 0 008.586 5.5L8 6.086a1.002 1.002 0 00-.154.199 2 2 0 01.861 3.337L6.88 11.45a2 2 0 11-2.83-2.83l.793-.792a4.018 4.018 0 01-.128-1.287z" /><path d="M6.586 4.672A3 3 0 007.414 9.5l.775-.776a2 2 0 01-.86-3.346L9.12 3.55a2 2 0 112.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 10-4.243-4.243L6.586 4.672z" /></svg>,
          onClick: handlers.onLink ?? (() => {}),
        },
        {
          id: 'image',
          label: 'Insert Image',
          icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h.94a.76.76 0 01.03-.03l6.077-6.078a1.75 1.75 0 012.412-.06L14.5 10.31V2.75a.25.25 0 00-.25-.25H1.75zm12.5 12H4.81l5.048-5.047a.25.25 0 01.344-.009l4.298 3.889v.917a.25.25 0 01-.25.25zm1.75-12v12A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75zM5.5 6a.5.5 0 11-1 0 .5.5 0 011 0zM7 6a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
          onClick: handlers.onImage ?? (() => {}),
        },
      ],
    },
  ];
}
