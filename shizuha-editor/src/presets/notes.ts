import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import type { Extensions } from '@tiptap/core'

export interface NotesPresetOptions {
  placeholder?: string
}

/**
 * Extension preset for shizuha-notes (personal note-taking)
 * Features: basic formatting, headings (1-3), lists, task lists, links, images, highlight
 */
export function createNotesExtensions(options: NotesPresetOptions = {}): Extensions {
  const { placeholder = 'Start writing...' } = options

  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Placeholder.configure({
      placeholder,
    }),
    Image.configure({
      inline: true,
      allowBase64: true,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-shizuha-600 dark:text-shizuha-400 underline',
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Highlight.configure({
      multicolor: false,
    }),
  ]
}

export default createNotesExtensions
