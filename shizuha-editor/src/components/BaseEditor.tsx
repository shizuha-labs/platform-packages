import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Extensions, JSONContent } from '@tiptap/core'
import { cn } from '../utils/cn'
import { useEditorSync } from '../hooks/useEditorSync'
import { Toolbar, type ToolbarPreset } from './Toolbar'
import { LinkModal } from './modals/LinkModal'
import { ImageModal } from './modals/ImageModal'
import { AttachmentModal } from './modals/AttachmentModal'

export interface EditorOutputData {
  json: JSONContent
  text: string
  html: string
}

export interface BaseEditorProps {
  /** Content to display in the editor */
  content?: JSONContent | null
  /** Callback when content changes */
  onChange?: (data: EditorOutputData) => void
  /** Callback when editor loses focus */
  onBlur?: (event: FocusEvent) => void
  /** Whether the editor is editable */
  editable?: boolean
  /** Additional CSS classes */
  className?: string
  /** TipTap extensions to use */
  extensions: Extensions
  /** Toolbar preset ('notes' or 'wiki') */
  toolbarPreset?: ToolbarPreset
  /** Whether to show the toolbar */
  showToolbar?: boolean
  /** Sticky toolbar (used in wiki) */
  stickyToolbar?: boolean
  /** ID of the parent entity for file uploads */
  entityId?: string | number | null
  /** Label for the entity (e.g., 'note', 'page') */
  entityLabel?: string
  /** Handler for image upload */
  onImageUpload?: (file: File) => Promise<string>
  /** Handler for attachment upload */
  onAttachmentUpload?: (file: File) => Promise<void>
  /** Callback after attachment is uploaded */
  onAttachmentUploaded?: () => void
  /** Auto-save callback for unsaved entities — returns new entity ID */
  onEnsureSaved?: () => Promise<string | number>
  /** Editor content container class */
  contentClassName?: string
  /** Minimum height for the editor */
  minHeight?: string
  /** Maximum file size for images (bytes) */
  maxImageSize?: number
}

/**
 * Base rich text editor component with configurable features
 */
export function BaseEditor({
  content,
  onChange,
  onBlur,
  editable = true,
  className,
  extensions,
  toolbarPreset = 'notes',
  showToolbar = true,
  stickyToolbar = false,
  entityId,
  entityLabel = 'item',
  onImageUpload,
  onAttachmentUpload,
  onAttachmentUploaded,
  onEnsureSaved,
  contentClassName,
  minHeight = '300px',
  maxImageSize = 10 * 1024 * 1024,
}: BaseEditorProps) {
  // Modal states
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [imageModalOpen, setImageModalOpen] = useState(false)
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Validate content - TipTap requires valid content or null
  const isValidContent = content && typeof content === 'object' && Object.keys(content).length > 0
  const validContent = isValidContent ? content : null

  const editor = useEditor({
    extensions,
    content: validContent,
    editable,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange({
          json: editor.getJSON(),
          text: editor.getText(),
          html: editor.getHTML(),
        })
      }
    },
    onBlur: ({ event }) => {
      if (onBlur) {
        onBlur(event)
      }
    },
  })

  // Sync external content changes
  useEditorSync(editor, validContent)

  // Handler for inserting links
  const handleInsertLink = (url: string) => {
    if (editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  // Handler for inserting images via URL
  const handleInsertImageUrl = (url: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  // Handler for uploading images
  const handleUploadImage = async (file: File) => {
    if (!onImageUpload) return

    setIsUploading(true)
    try {
      const fileUrl = await onImageUpload(file)
      if (editor) {
        editor.chain().focus().setImage({ src: fileUrl, alt: file.name }).run()
      }
      onAttachmentUploaded?.()
    } catch (error) {
      console.error('Failed to upload image:', error)
      alert('Failed to upload image. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  // Handler for uploading attachments
  const handleUploadAttachment = async (file: File) => {
    if (!onAttachmentUpload) return

    setIsUploading(true)
    try {
      await onAttachmentUpload(file)
      onAttachmentUploaded?.()
    } catch (error) {
      console.error('Failed to upload attachment:', error)
      alert('Failed to upload file. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div
      className={cn(
        'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden',
        className
      )}
    >
      {editable && showToolbar && (
        <Toolbar
          editor={editor}
          preset={toolbarPreset}
          sticky={stickyToolbar}
          onLinkClick={() => setLinkModalOpen(true)}
          onImageClick={() => setImageModalOpen(true)}
          onAttachmentClick={onAttachmentUpload ? () => setAttachmentModalOpen(true) : undefined}
          showAttachments={!!onAttachmentUpload}
        />
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none p-4 focus:outline-none',
          '[&_.ProseMirror]:outline-none',
          contentClassName
        )}
        style={{ minHeight }}
      />

      {/* Modals */}
      <LinkModal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onSubmit={handleInsertLink}
        initialUrl={editor?.getAttributes('link').href || ''}
      />
      <ImageModal
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        onInsertUrl={handleInsertImageUrl}
        onUploadFile={handleUploadImage}
        entityId={entityId}
        isUploading={isUploading}
        maxFileSize={maxImageSize}
        entityLabel={entityLabel}
        onEnsureSaved={onEnsureSaved}
      />
      {onAttachmentUpload && (
        <AttachmentModal
          isOpen={attachmentModalOpen}
          onClose={() => setAttachmentModalOpen(false)}
          onUpload={handleUploadAttachment}
          entityId={entityId}
          isUploading={isUploading}
          entityLabel={entityLabel}
          onEnsureSaved={onEnsureSaved}
        />
      )}
    </div>
  )
}

export default BaseEditor
