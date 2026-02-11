'use client';

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { useEditor, EditorContent, ReactRenderer, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Mention from '@tiptap/extension-mention';
import Highlight from '@tiptap/extension-highlight';
import ImageExtension from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { cn, generateColor } from '@/lib/utils';
import { EditorToolbar } from './toolbar';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Minus,
  Image as ImageIcon,
  Table as TableIcon,
} from 'lucide-react';

// ---- Slash Command Menu Extension ----

interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ElementType;
  command: (editor: Editor) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: Heading1,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: Heading2,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: Heading3,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bullet List',
    description: 'Create a simple bullet list',
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Ordered List',
    description: 'Create a numbered list',
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Track tasks with checkboxes',
    icon: ListChecks,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Quote',
    description: 'Capture a quote',
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Code Block',
    description: 'Display code with syntax highlighting',
    icon: CodeSquare,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    description: 'Horizontal line separator',
    icon: Minus,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Image',
    description: 'Insert an image from URL',
    icon: ImageIcon,
    command: (editor) => {
      const url = window.prompt('Enter image URL:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a table',
    icon: TableIcon,
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

function SlashCommandMenu({
  items,
  selectedIndex,
  onSelect,
}: {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-3 text-sm text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        No matching commands
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-72 w-64 overflow-y-auto rounded-lg border bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          data-index={index}
          onClick={() => onSelect(index)}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
            index === selectedIndex
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          )}
        >
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
              'bg-gray-50 dark:border-gray-600 dark:bg-gray-700'
            )}
          >
            <item.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{item.title}</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// Create the slash command extension
function createSlashCommandExtension() {
  let popup: HTMLDivElement | null = null;
  let reactRenderer: ReactRenderer | null = null;
  let query = '';
  let selectedIndex = 0;

  function getFilteredItems() {
    return SLASH_COMMANDS.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  function updatePopup(editor: Editor) {
    const items = getFilteredItems();

    if (reactRenderer) {
      reactRenderer.updateProps({
        items,
        selectedIndex,
        onSelect: (index: number) => {
          const item = items[index];
          if (item) {
            // Delete the slash command text
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(
              Math.max(0, from - query.length - 1),
              from,
              '\0'
            );
            const slashPos = textBefore.lastIndexOf('/');
            if (slashPos >= 0) {
              const deleteFrom = from - (textBefore.length - slashPos);
              editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
            }
            item.command(editor);
            destroyPopup();
          }
        },
      });
    }
  }

  function destroyPopup() {
    if (reactRenderer) {
      reactRenderer.destroy();
      reactRenderer = null;
    }
    if (popup) {
      popup.remove();
      popup = null;
    }
    query = '';
    selectedIndex = 0;
  }

  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      const editor = this.editor;

      return [
        new Plugin({
          key: new PluginKey('slashCommand'),
          props: {
            handleKeyDown(_view, event) {
              if (!popup) return false;

              const items = getFilteredItems();

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                selectedIndex = (selectedIndex + 1) % Math.max(items.length, 1);
                updatePopup(editor);
                return true;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                selectedIndex =
                  (selectedIndex - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
                updatePopup(editor);
                return true;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                const item = items[selectedIndex];
                if (item) {
                  const { from } = editor.state.selection;
                  const textBefore = editor.state.doc.textBetween(
                    Math.max(0, from - query.length - 1),
                    from,
                    '\0'
                  );
                  const slashPos = textBefore.lastIndexOf('/');
                  if (slashPos >= 0) {
                    const deleteFrom = from - (textBefore.length - slashPos);
                    editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
                  }
                  item.command(editor);
                }
                destroyPopup();
                return true;
              }
              if (event.key === 'Escape') {
                destroyPopup();
                return true;
              }
              return false;
            },
          },
          view() {
            return {
              update(view, prevState) {
                const { state } = view;
                const { from } = state.selection;

                // Get text before cursor on the current line
                const textBefore = state.doc.textBetween(
                  Math.max(0, from - 50),
                  from,
                  '\0'
                );

                // Check if we have a slash command pattern
                const slashMatch = textBefore.match(/(?:^|\s)\/(\w*)$/);

                if (!slashMatch) {
                  if (popup) destroyPopup();
                  return;
                }

                query = slashMatch[1] || '';
                selectedIndex = 0;

                if (!popup) {
                  popup = document.createElement('div');
                  popup.style.position = 'absolute';
                  popup.style.zIndex = '9999';
                  document.body.appendChild(popup);

                  reactRenderer = new ReactRenderer(SlashCommandMenu, {
                    props: {
                      items: getFilteredItems(),
                      selectedIndex: 0,
                      onSelect: (index: number) => {
                        const items = getFilteredItems();
                        const item = items[index];
                        if (item) {
                          const { from: curFrom } = editor.state.selection;
                          const curTextBefore = editor.state.doc.textBetween(
                            Math.max(0, curFrom - query.length - 1),
                            curFrom,
                            '\0'
                          );
                          const sp = curTextBefore.lastIndexOf('/');
                          if (sp >= 0) {
                            const dFrom = curFrom - (curTextBefore.length - sp);
                            editor
                              .chain()
                              .focus()
                              .deleteRange({ from: dFrom, to: curFrom })
                              .run();
                          }
                          item.command(editor);
                          destroyPopup();
                        }
                      },
                    },
                    editor,
                  });

                  popup.appendChild(reactRenderer.element);
                }

                // Position popup
                const coords = view.coordsAtPos(from - query.length - 1);
                popup.style.left = `${coords.left}px`;
                popup.style.top = `${coords.bottom + 8}px`;

                updatePopup(editor);
              },
              destroy() {
                destroyPopup();
              },
            };
          },
        }),
      ];
    },
  });
}

// ---- Mention suggestion ----

const mentionUsers = [
  { id: '1', label: 'John Doe' },
  { id: '2', label: 'Jane Smith' },
  { id: '3', label: 'Alex Johnson' },
  { id: '4', label: 'Sarah Williams' },
];

function getMentionSuggestion() {
  return {
    items: ({ query }: { query: string }) =>
      mentionUsers
        .filter((user) => user.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5),

    render: () => {
      let popup: HTMLDivElement | null = null;
      let selectedIndex = 0;
      let items: typeof mentionUsers = [];
      let onCommand: ((item: (typeof mentionUsers)[0]) => void) | null = null;

      function updateList() {
        if (!popup) return;
        popup.innerHTML = '';
        const container = document.createElement('div');
        container.className =
          'w-52 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800';

        items.forEach((item, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-left transition-colors ${
            index === selectedIndex
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`;

          const avatar = document.createElement('div');
          avatar.className =
            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium text-white';
          avatar.style.backgroundColor = generateColor(item.id);
          avatar.textContent = item.label.charAt(0);

          const name = document.createElement('span');
          name.textContent = item.label;

          btn.appendChild(avatar);
          btn.appendChild(name);
          btn.addEventListener('click', () => onCommand?.(item));
          container.appendChild(btn);
        });

        if (items.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'p-2 text-sm text-gray-500 dark:text-gray-400';
          empty.textContent = 'No users found';
          container.appendChild(empty);
        }

        popup.appendChild(container);
      }

      return {
        onStart: (props: {
          clientRect: (() => DOMRect) | null;
          items: typeof mentionUsers;
          command: (item: (typeof mentionUsers)[0]) => void;
        }) => {
          items = props.items;
          onCommand = props.command;
          selectedIndex = 0;

          popup = document.createElement('div');
          popup.style.position = 'absolute';
          popup.style.zIndex = '9999';

          if (props.clientRect) {
            const rect = props.clientRect();
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 8}px`;
          }

          document.body.appendChild(popup);
          updateList();
        },
        onUpdate: (props: {
          clientRect: (() => DOMRect) | null;
          items: typeof mentionUsers;
        }) => {
          items = props.items;
          selectedIndex = 0;

          if (props.clientRect && popup) {
            const rect = props.clientRect();
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 8}px`;
          }
          updateList();
        },
        onKeyDown: (props: { event: KeyboardEvent }) => {
          if (props.event.key === 'ArrowDown') {
            selectedIndex = (selectedIndex + 1) % Math.max(items.length, 1);
            updateList();
            return true;
          }
          if (props.event.key === 'ArrowUp') {
            selectedIndex =
              (selectedIndex - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1);
            updateList();
            return true;
          }
          if (props.event.key === 'Enter') {
            const item = items[selectedIndex];
            if (item && onCommand) onCommand(item);
            return true;
          }
          if (props.event.key === 'Escape') {
            popup?.remove();
            popup = null;
            return true;
          }
          return false;
        },
        onExit: () => {
          popup?.remove();
          popup = null;
        },
      };
    },
  };
}

// ---- Editor Component ----

export interface DocumentEditorRef {
  getEditor: () => Editor | null;
}

interface DocumentEditorProps {
  ydoc: Y.Doc;
  awareness: Awareness;
  editable?: boolean;
  className?: string;
  onUpdate?: (editor: Editor) => void;
}

export const DocumentEditor = forwardRef<DocumentEditorRef, DocumentEditorProps>(
  function DocumentEditor({ ydoc, awareness, editable = true, className, onUpdate }, ref) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
      setIsMounted(true);
    }, []);

    const editor = useEditor(
      {
        immediatelyRender: false,
        editable,
        extensions: [
          StarterKit.configure({
            history: false, // Disable history since collaboration handles it
            codeBlock: false, // Using CodeBlockLowlight instead
          }),
          Collaboration.configure({
            document: ydoc,
          }),
          CollaborationCursor.configure({
            provider: { awareness } as unknown as Parameters<
              typeof CollaborationCursor.configure
            >[0] extends { provider?: infer P } ? P : never,
            user: awareness.getLocalState()?.user || {
              name: 'Anonymous',
              color: '#14b8a6',
            },
          }),
          Placeholder.configure({
            placeholder: ({ node }) => {
              if (node.type.name === 'heading') {
                return `Heading ${node.attrs.level}`;
              }
              return 'Type "/" for commands, or start writing...';
            },
          }),
          TaskList.configure({
            HTMLAttributes: {
              class: 'task-list',
            },
          }),
          TaskItem.configure({
            nested: true,
            HTMLAttributes: {
              class: 'task-item',
            },
          }),
          Mention.configure({
            HTMLAttributes: {
              class:
                'mention inline-flex items-center rounded bg-brand-100 px-1 py-0.5 text-sm font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
            },
            suggestion: getMentionSuggestion() as any,
          }),
          Highlight.configure({
            multicolor: true,
          }),
          ImageExtension.configure({
            inline: false,
            allowBase64: true,
            HTMLAttributes: {
              class: 'rounded-lg max-w-full h-auto',
            },
          }),
          Link.configure({
            openOnClick: false,
            HTMLAttributes: {
              class: 'text-brand-600 underline dark:text-brand-400',
            },
          }),
          CodeBlockLowlight.configure({
            HTMLAttributes: {
              class:
                'rounded-lg bg-gray-900 p-4 font-mono text-sm text-gray-100 overflow-x-auto',
            },
          }),
          TextAlign.configure({
            types: ['heading', 'paragraph'],
          }),
          Underline,
          Table.configure({
            resizable: true,
            HTMLAttributes: {
              class: 'border-collapse table-auto w-full',
            },
          }),
          TableRow,
          TableCell.configure({
            HTMLAttributes: {
              class: 'border border-gray-300 px-3 py-2 dark:border-gray-600',
            },
          }),
          TableHeader.configure({
            HTMLAttributes: {
              class:
                'border border-gray-300 bg-gray-50 px-3 py-2 font-semibold dark:border-gray-600 dark:bg-gray-800',
            },
          }),
          createSlashCommandExtension(),
        ],
        editorProps: {
          attributes: {
            class: cn(
              'prose prose-sm sm:prose-base max-w-none dark:prose-invert',
              'focus:outline-none min-h-[calc(100vh-220px)] px-8 py-6',
              'prose-headings:font-semibold',
              'prose-p:leading-relaxed',
              'prose-code:rounded prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono',
              'dark:prose-code:bg-gray-800',
              'prose-img:rounded-lg prose-img:shadow-md',
              'prose-a:text-brand-600 prose-a:no-underline hover:prose-a:underline',
              'dark:prose-a:text-brand-400'
            ),
          },
          handleKeyDown: (_view, event) => {
            // Ctrl/Cmd + S to save
            if ((event.metaKey || event.ctrlKey) && event.key === 's') {
              event.preventDefault();
              // Save is handled by auto-save via CRDT, but we can trigger a manual save event
              document.dispatchEvent(new CustomEvent('document:save'));
              return true;
            }
            return false;
          },
        },
        onUpdate: ({ editor: ed }) => {
          onUpdate?.(ed as Editor);
        },
      },
      [ydoc, awareness, editable]
    );

    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
    }));

    if (!isMounted) {
      return (
        <div className={cn('animate-pulse', className)}>
          <div className="h-10 border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-900" />
          <div className="space-y-4 p-8">
            <div className="h-8 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      );
    }

    return (
      <div className={cn('flex flex-col', className)}>
        {editable && <EditorToolbar editor={editor} />}
        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        {/* Global editor styles */}
        <style jsx global>{`
          .ProseMirror {
            outline: none;
          }

          .ProseMirror p.is-editor-empty:first-child::before {
            color: #9ca3af;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }

          .ProseMirror .is-empty::before {
            color: #9ca3af;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }

          /* Collaboration cursor styles */
          .collaboration-cursor__caret {
            border-left: 1px solid;
            border-right: 1px solid;
            margin-left: -1px;
            margin-right: -1px;
            pointer-events: none;
            position: relative;
            word-break: normal;
          }

          .collaboration-cursor__label {
            border-radius: 6px 6px 6px 0;
            color: #fff;
            font-size: 11px;
            font-weight: 600;
            left: -1px;
            line-height: 1;
            padding: 2px 6px;
            position: absolute;
            top: -1.5em;
            user-select: none;
            white-space: nowrap;
          }

          /* Task list styles */
          .task-list {
            list-style: none;
            padding-left: 0;
          }

          .task-item {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
          }

          .task-item > label {
            flex-shrink: 0;
            margin-top: 0.25rem;
          }

          .task-item > label input[type='checkbox'] {
            cursor: pointer;
            width: 1rem;
            height: 1rem;
            accent-color: #14b8a6;
          }

          .task-item > div {
            flex: 1;
          }

          /* Table resize handle */
          .tableWrapper {
            overflow-x: auto;
            margin: 1rem 0;
          }

          .resize-cursor {
            cursor: col-resize;
          }

          /* Selection styles for collaboration */
          .ProseMirror .selection {
            background-color: rgba(99, 102, 241, 0.2);
          }
        `}</style>
      </div>
    );
  }
);
