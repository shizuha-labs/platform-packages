// Components
export {
  BaseEditor,
  Toolbar,
  LinkModal,
  ImageModal,
  AttachmentModal,
  type BaseEditorProps,
  type EditorOutputData,
  type ToolbarProps,
  type ToolbarPreset,
  type LinkModalProps,
  type ImageModalProps,
  type AttachmentModalProps,
} from './components'

// Extensions
export {
  Callout,
  CalloutComponent,
  TableOfContents,
  TableOfContentsComponent,
  CALLOUT_TYPES,
  type CalloutType,
  type CalloutTypeConfig,
} from './extensions'

// Presets
export {
  createNotesExtensions,
  createWikiExtensions,
  type NotesPresetOptions,
  type WikiPresetOptions,
} from './presets'

// Hooks
export { useEditorSync } from './hooks/useEditorSync'

// Utilities
export { cn } from './utils/cn'
export {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  getFileIcon,
  formatFileSize,
  validateFile,
} from './utils/file'

// Re-export commonly used TipTap exports for convenience
export { useEditor, EditorContent } from '@tiptap/react'
export type { Editor, JSONContent, Extensions } from '@tiptap/core'
