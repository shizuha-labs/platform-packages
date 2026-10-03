import { useState, useRef } from 'react'
import { Image as ImageIcon, X, Upload, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface ImageModalProps {
  isOpen: boolean
  onClose: () => void
  onInsertUrl: (url: string) => void
  onUploadFile: (file: File) => Promise<void>
  /** ID of the parent entity (note, page, etc.) - required for uploads */
  entityId?: string | number | null
  isUploading?: boolean
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number
  /** Label to show when entity is not saved yet */
  entityLabel?: string
  /** Auto-save callback for unsaved entities */
  onEnsureSaved?: () => Promise<string | number>
}

/**
 * Modal for inserting images via URL or upload
 */
export function ImageModal({
  isOpen,
  onClose,
  onInsertUrl,
  onUploadFile,
  entityId,
  isUploading = false,
  maxFileSize = 10 * 1024 * 1024,
  entityLabel = 'item',
  onEnsureSaved,
}: ImageModalProps) {
  const [url, setUrl] = useState('')
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload')
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      onInsertUrl(url.trim())
      setUrl('')
    }
    onClose()
  }

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
    await onUploadFile(file)
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
    if (file && file.type.startsWith('image/')) {
      await doUpload(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb}MB`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Insert Image
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'upload'
                ? 'border-shizuha-600 text-shizuha-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Upload className="h-4 w-4 inline mr-2" />
            Upload
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
              activeTab === 'url'
                ? 'border-shizuha-600 text-shizuha-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <ExternalLink className="h-4 w-4 inline mr-2" />
            URL
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
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
                'transition-colors',
                isBusy && 'cursor-wait'
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
                  <Upload className="h-10 w-10 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    <span className="text-shizuha-600 font-medium">Click to upload</span>
                    {' '}or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    PNG, JPG, GIF up to {formatSize(maxFileSize)}
                  </p>
                </>
              )}
            </div>
            {!entityId && !onEnsureSaved && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Save the {entityLabel} first to upload images
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleUrlSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Image URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
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
                  'hover:bg-shizuha-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Insert Image
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ImageModal
