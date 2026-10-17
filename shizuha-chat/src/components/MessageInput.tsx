import React, { useState, useRef, useCallback, useEffect } from 'react'

interface MessageInputProps {
  onSend: (content: string) => void
  onTypingStart?: () => void
  onTypingStop?: () => void
  disabled?: boolean
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
}

const TYPING_DEBOUNCE_MS = 3000

export function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  placeholder = 'Type a message...',
  value: valueProp,
  onChange,
}: MessageInputProps) {
  const [inner, setInner] = useState('')
  const controlled = valueProp !== undefined
  const value = controlled ? String(valueProp || '') : inner
  const setValue = useCallback((next: string) => {
    if (!controlled) setInner(next)
    onChange?.(next)
  }, [controlled, onChange])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
    }
  }, [])

  const stopTyping = useCallback(() => {
    clearTypingTimer()
    if (isTypingRef.current) {
      isTypingRef.current = false
      onTypingStop?.()
    }
  }, [clearTypingTimer, onTypingStop])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value as string)

    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`

    // Typing indicator
    if (!isTypingRef.current) {
      isTypingRef.current = true
      onTypingStart?.()
    }
    clearTypingTimer()
    typingTimerRef.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS)
  }, [onTypingStart, clearTypingTimer, setValue, stopTyping])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    stopTyping()

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend, setValue, stopTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // Cleanup typing timer on unmount
  useEffect(() => {
    return () => {
      clearTypingTimer()
    }
  }, [clearTypingTimer])

  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={stopTyping}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label={placeholder || 'Message'}
        className="flex-1 resize-none rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 px-4 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 max-h-40"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        data-testid="thread-send-button"
        aria-label="Send message"
        className="flex-shrink-0 w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </button>
    </div>
  )
}
