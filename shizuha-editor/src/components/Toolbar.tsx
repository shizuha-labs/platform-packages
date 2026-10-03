import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Minus, Link as LinkIcon, Image as ImageIcon, Paperclip,
  Highlighter, Table as TableIcon, ListTree,
  Info, FileText, Lightbulb, AlertTriangle, XCircle, ChevronDown,
  Undo, Redo,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { CALLOUT_TYPES, type CalloutType } from '../extensions/Callout'

// Toolbar button component
interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  icon: LucideIcon
  title?: string
  children?: ReactNode
}

function ToolbarButton({ onClick, active, disabled, icon: Icon, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50',
        'text-gray-600 dark:text-gray-400',
        active && 'bg-shizuha-100 dark:bg-shizuha-900 text-shizuha-600 dark:text-shizuha-400'
      )}
    >
      {children ?? <Icon className="h-4 w-4" />}
    </button>
  )
}

// Divider component
function Divider() {
  return <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
}

// Callout menu item component
interface CalloutMenuItemProps {
  type: CalloutType
  icon: LucideIcon
  onClick: () => void
}

function CalloutMenuItem({ type, icon: Icon, onClick }: CalloutMenuItemProps) {
  const config = CALLOUT_TYPES[type]
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      <Icon className={`h-4 w-4 ${config.iconClass}`} />
      <span className="text-sm text-gray-900 dark:text-white">{config.label}</span>
    </button>
  )
}

export type ToolbarPreset = 'notes' | 'wiki' | 'custom'

export interface ToolbarProps {
  editor: Editor | null
  /** Preset configuration - 'notes' for basic, 'wiki' for full features */
  preset?: ToolbarPreset
  /** Handler for link insertion */
  onLinkClick?: () => void
  /** Handler for image insertion */
  onImageClick?: () => void
  /** Handler for attachment insertion */
  onAttachmentClick?: () => void
  /** Whether to show the attachment button */
  showAttachments?: boolean
  /** Custom class name */
  className?: string
  /** Sticky positioning (wiki style) */
  sticky?: boolean
}

/**
 * Configurable toolbar for the rich text editor
 */
export function Toolbar({
  editor,
  preset = 'notes',
  onLinkClick,
  onImageClick,
  onAttachmentClick,
  showAttachments = true,
  className,
  sticky = false,
}: ToolbarProps) {
  const [showCalloutMenu, setShowCalloutMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const calloutMenuRef = useRef<HTMLDivElement>(null)
  const calloutButtonRef = useRef<HTMLButtonElement>(null)

  // Update menu position when it opens
  useEffect(() => {
    if (showCalloutMenu && calloutButtonRef.current) {
      const rect = calloutButtonRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4, // 4px gap
        left: rect.left,
      })
    }
  }, [showCalloutMenu])

  if (!editor) return null

  const isWiki = preset === 'wiki'

  const handleInsertLink = () => {
    if (onLinkClick) {
      onLinkClick()
    } else {
      // Fallback to prompt
      const url = window.prompt('Enter URL')
      if (url) editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const handleInsertImage = () => {
    if (onImageClick) {
      onImageClick()
    } else {
      // Fallback to prompt
      const url = window.prompt('Enter image URL')
      if (url) editor.chain().focus().setImage({ src: url }).run()
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700',
        'bg-gray-50 dark:bg-gray-800/50',
        !sticky && 'rounded-t-lg',
        sticky && 'sticky top-20 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg',
        className
      )}
    >
      {/* Undo/Redo - Notes only (Wiki has auto-save) */}
      {!isWiki && (
        <>
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            icon={Undo}
            title="Undo"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            icon={Redo}
            title="Redo"
          />
          <Divider />
        </>
      )}

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        icon={Bold}
        title="Bold"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        icon={Italic}
        title="Italic"
      />
      {isWiki && (
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          icon={UnderlineIcon}
          title="Underline"
        />
      )}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        icon={Strikethrough}
        title="Strikethrough"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        icon={Code}
        title="Code"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive('highlight')}
        icon={Highlighter}
        title="Highlight"
      />

      <Divider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        icon={Heading1}
        title="Heading 1"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        icon={Heading2}
        title="Heading 2"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        icon={Heading3}
        title="Heading 3"
      />

      <Divider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        icon={List}
        title="Bullet List"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        icon={ListOrdered}
        title="Numbered List"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive('taskList')}
        icon={CheckSquare}
        title="Task List"
      />

      <Divider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        icon={Quote}
        title="Quote"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        icon={Minus}
        title="Horizontal Rule"
      />

      {/* Links and Images */}
      <ToolbarButton
        onClick={handleInsertLink}
        active={editor.isActive('link')}
        icon={LinkIcon}
        title="Insert Link"
      />
      <ToolbarButton
        onClick={handleInsertImage}
        icon={ImageIcon}
        title="Insert Image"
      />

      {/* Table (Wiki only) */}
      {isWiki && (
        <ToolbarButton
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()}
          icon={TableIcon}
          title="Insert Table"
        />
      )}

      {/* Wiki-specific features */}
      {isWiki && (
        <>
          <Divider />

          {/* Table of Contents */}
          <ToolbarButton
            onClick={() => editor.chain().focus().insertTableOfContents().run()}
            icon={ListTree}
            title="Insert Table of Contents"
          />

          {/* Callout dropdown */}
          <div className="relative" ref={calloutMenuRef}>
            <button
              ref={calloutButtonRef}
              onClick={() => setShowCalloutMenu(!showCalloutMenu)}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1 text-gray-600 dark:text-gray-400"
              title="Insert Callout Panel"
            >
              <Info className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>

            {showCalloutMenu && (
              <>
                <div
                  className="fixed inset-0 z-[9998]"
                  onClick={() => setShowCalloutMenu(false)}
                />
                <div
                  className="fixed z-[9999] w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Callout Panels
                  </div>
                  <CalloutMenuItem
                    type="info"
                    icon={Info}
                    onClick={() => {
                      editor.chain().focus().insertCallout('info').run()
                      setShowCalloutMenu(false)
                    }}
                  />
                  <CalloutMenuItem
                    type="note"
                    icon={FileText}
                    onClick={() => {
                      editor.chain().focus().insertCallout('note').run()
                      setShowCalloutMenu(false)
                    }}
                  />
                  <CalloutMenuItem
                    type="tip"
                    icon={Lightbulb}
                    onClick={() => {
                      editor.chain().focus().insertCallout('tip').run()
                      setShowCalloutMenu(false)
                    }}
                  />
                  <CalloutMenuItem
                    type="warning"
                    icon={AlertTriangle}
                    onClick={() => {
                      editor.chain().focus().insertCallout('warning').run()
                      setShowCalloutMenu(false)
                    }}
                  />
                  <CalloutMenuItem
                    type="error"
                    icon={XCircle}
                    onClick={() => {
                      editor.chain().focus().insertCallout('error').run()
                      setShowCalloutMenu(false)
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Attachments */}
      {showAttachments && onAttachmentClick && (
        <>
          <Divider />
          <ToolbarButton
            onClick={onAttachmentClick}
            icon={Paperclip}
            title="Attachments"
          />
        </>
      )}
    </div>
  )
}

export default Toolbar
