import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import type { Extensions } from '@tiptap/core'
import { Callout, TableOfContents } from '../extensions'

export interface WikiPresetOptions {
  placeholder?: string
}

/**
 * Extension preset for shizuha-wiki (team documentation)
 * Features: all Notes features + underline, tables, callouts, table of contents
 */
export function createWikiExtensions(options: WikiPresetOptions = {}): Extensions {
  const { placeholder = 'Start writing your page content...' } = options

  return [
    StarterKit,
    Placeholder.configure({
      placeholder,
    }),
    Link.configure({
      openOnClick: false,
    }),
    Image,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Highlight,
    Underline,
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableCell,
    TableHeader,
    Callout,
    TableOfContents,
  ]
}

export default createWikiExtensions
