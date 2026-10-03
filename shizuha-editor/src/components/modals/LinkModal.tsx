import { useState, useRef } from 'react'
import { Link as LinkIcon, X, ExternalLink } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface LinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (url: string) => void
  initialUrl?: string
}

/**
 * Modal for inserting/editing links in the editor
 */
export function LinkModal({ isOpen, onClose, onSubmit, initialUrl = '' }: LinkModalProps) {
  const [url, setUrl] = useState(initialUrl)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      // Add https:// if no protocol specified
      let finalUrl = url.trim()
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl
      }
      onSubmit(finalUrl)
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Insert Link
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              URL
            </label>
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
              className={cn(
                'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg',
                'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
                'focus:ring-2 focus:ring-shizuha-500 focus:border-transparent'
              )}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className={cn(
                'px-4 py-2 text-sm bg-shizuha-600 text-white rounded-lg',
                'hover:bg-shizuha-700 disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              <ExternalLink className="h-4 w-4" />
              Insert Link
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LinkModal
