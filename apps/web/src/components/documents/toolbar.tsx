'use client';

import { useState, useCallback, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeSquare,
  Image,
  Link,
  Minus,
  Table,
  AtSign,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: ReactNode;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  tooltip,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        'disabled:cursor-not-allowed disabled:opacity-40',
        isActive && 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700" />;
}

function BlockTypeDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  const currentType = editor.isActive('heading', { level: 1 })
    ? 'Heading 1'
    : editor.isActive('heading', { level: 2 })
      ? 'Heading 2'
      : editor.isActive('heading', { level: 3 })
        ? 'Heading 3'
        : editor.isActive('bulletList')
          ? 'Bullet List'
          : editor.isActive('orderedList')
            ? 'Ordered List'
            : editor.isActive('taskList')
              ? 'Task List'
              : editor.isActive('blockquote')
                ? 'Quote'
                : editor.isActive('codeBlock')
                  ? 'Code Block'
                  : 'Paragraph';

  const blockTypes = [
    {
      label: 'Paragraph',
      icon: Pilcrow,
      action: () => editor.chain().focus().setParagraph().run(),
    },
    {
      label: 'Heading 1',
      icon: Heading1,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Heading 3',
      icon: Heading3,
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: 'Bullet List',
      icon: List,
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Ordered List',
      icon: ListOrdered,
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Task List',
      icon: ListChecks,
      action: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: 'Quote',
      icon: Quote,
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Code Block',
      icon: CodeSquare,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium',
          'hover:bg-gray-100 dark:hover:bg-gray-700',
          'min-w-[120px] justify-between'
        )}
      >
        <span className="truncate">{currentType}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border bg-white p-1 shadow-lg',
              'dark:border-gray-700 dark:bg-gray-800'
            )}
          >
            {blockTypes.map((block) => (
              <button
                key={block.label}
                type="button"
                onClick={() => {
                  block.action();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                  'hover:bg-gray-100 dark:hover:bg-gray-700',
                  currentType === block.label &&
                    'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400'
                )}
              >
                <block.icon className="h-4 w-4 shrink-0" />
                <span>{block.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function EditorToolbar({ editor }: ToolbarProps) {
  const [showOverflow, setShowOverflow] = useState(false);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-0.5 border-b bg-white px-2 py-1.5',
        'dark:border-gray-700 dark:bg-gray-900'
      )}
    >
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        tooltip="Undo (Ctrl+Z)"
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        tooltip="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block type dropdown */}
      <BlockTypeDropdown editor={editor} />

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        tooltip="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        tooltip="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        tooltip="Underline (Ctrl+U)"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        tooltip="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        tooltip="Inline Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive('highlight')}
        tooltip="Highlight"
      >
        <span className="flex h-4 w-4 items-center justify-center text-xs font-bold">
          <span className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">A</span>
        </span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        tooltip="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        tooltip="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        tooltip="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Insert items - visible on larger screens */}
      <div className="hidden items-center gap-0.5 md:flex">
        <ToolbarButton onClick={insertLink} isActive={editor.isActive('link')} tooltip="Link">
          <Link className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertImage} tooltip="Image">
          <Image className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="Divider"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertTable} tooltip="Table">
          <Table className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => {
            // Trigger mention by inserting @ character
            editor.chain().focus().insertContent('@').run();
          }}
          tooltip="Mention"
        >
          <AtSign className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Overflow menu for small screens */}
      <div className="relative md:hidden">
        <ToolbarButton onClick={() => setShowOverflow(!showOverflow)} tooltip="More options">
          <MoreHorizontal className="h-4 w-4" />
        </ToolbarButton>

        {showOverflow && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowOverflow(false)} />
            <div
              className={cn(
                'absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border bg-white p-1 shadow-lg',
                'dark:border-gray-700 dark:bg-gray-800'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  insertLink();
                  setShowOverflow(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Link className="h-4 w-4" />
                <span>Insert Link</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertImage();
                  setShowOverflow(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Image className="h-4 w-4" />
                <span>Insert Image</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setHorizontalRule().run();
                  setShowOverflow(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Minus className="h-4 w-4" />
                <span>Divider</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  insertTable();
                  setShowOverflow(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Table className="h-4 w-4" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().insertContent('@').run();
                  setShowOverflow(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <AtSign className="h-4 w-4" />
                <span>Mention</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
