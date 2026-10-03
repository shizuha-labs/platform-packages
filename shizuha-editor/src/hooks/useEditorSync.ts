import { useEffect, useRef } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'

/**
 * Hook to synchronize external content changes to the TipTap editor
 * without causing cursor jumps when the user is typing.
 *
 * This hook tracks the last synced content and only updates the editor
 * when the content actually changes from an external source.
 *
 * @param editor - The TipTap editor instance
 * @param content - The external content to sync (can be null/undefined for empty)
 */
export function useEditorSync(
  editor: Editor | null,
  content: JSONContent | null | undefined
): void {
  const lastSyncedContentRef = useRef<string | null>(null)

  useEffect(() => {
    // Validate content - must be a non-empty object
    const isValidContent = content && typeof content === 'object' && Object.keys(content).length > 0
    const validContent = isValidContent ? content : null

    if (editor && validContent) {
      const newContentStr = JSON.stringify(validContent)

      // Only sync if the content actually changed from what we last synced
      // This prevents cursor jumps when the user is typing
      if (lastSyncedContentRef.current !== newContentStr) {
        // Check if editor content is actually different
        const editorContent = editor.getJSON()
        const editorContentStr = JSON.stringify(editorContent)

        // Only update if editor content is actually different
        if (editorContentStr !== newContentStr) {
          editor.commands.setContent(validContent, { emitUpdate: false })
        }

        lastSyncedContentRef.current = newContentStr
      }
    }
  }, [editor, content])
}

export default useEditorSync
