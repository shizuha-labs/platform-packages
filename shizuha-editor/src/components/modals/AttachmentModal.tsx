import { useRef, useState } from 'react'
import { Paperclip, X, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface AttachmentModalProps {
  isOpen: boolean
  onClose: () => void
  onUpload: (file: File) => Promise<void>
  /** ID of the parent entity (note, page, etc.) - required for uploads */
  entityId?: string | number | null
  isUploading?: boolean
  /** Label to show when entity is not saved yet */
  entityLabel?: string
  /** Auto-save callback for unsaved entities */
  onEnsureSaved?: () => Promise<string | number>
}

/**
 * Modal for attaching files (non-images)
 */
export function AttachmentModal({
  isOpen,
  onClose,
  onUpload,
  entityId,
  isUploading = false,
  entityLabel = 'item',
  onEnsureSaved,
}: AttachmentModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)

  const canUpload = entityId || onEnsureSaved
  const isBusy = isUploading || isAutoSaving

  const doUpload = async (file: File) => {
    if (!entityId && onEnsureSaved) {
      setIsAutoSaving(true)
      try {
        await onEnsureSaved()
      } finally {
        setIsAutoSaving(false)
      }
    }
    await onUpload(file)
    onClose()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await doUpload(file)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      await doUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Attach File
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div
          onClick={() => !isBusy && canUpload && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8',
            'flex flex-col items-center justify-center',
            canUpload && !isBusy
              ? 'cursor-pointer hover:border-shizuha-500 hover:bg-shizuha-50 dark:hover:bg-shizuha-900/20'
              : 'opacity-50',
            'transition-colors'
          )}
        >
          {isBusy ? (
            <>
              <Loader2 className="h-10 w-10 text-shizuha-600 animate-spin mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isAutoSaving ? 'Saving...' : 'Uploading...'}
              </p>
            </>
          ) : (
            <>
              <Paperclip className="h-10 w-10 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                <span className="text-shizuha-600 font-medium">Click to select</span>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                PDF, DOC, TXT, and more
              </p>
            </>
          )}
        </div>
        {!entityId && !onEnsureSaved && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Save the {entityLabel} first to attach files
          </p>
        )}
      </div>
    </div>
  )
}

export default AttachmentModal
