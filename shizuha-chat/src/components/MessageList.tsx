import React, { useLayoutEffect, useRef, useCallback, useState } from 'react'
import type { ConnectMessage, OptimisticMessage } from '../types'
import { TypingIndicator } from './TypingIndicator'
import { Avatar } from './Avatar'
import { MarkdownBubble } from './MarkdownBubble'
import { computePrependScrollTop } from '../utils/prependScroll'
import { shouldShowUnreadJump, unreadDividerMessageIndex } from '../utils/unreadJump'
import { sameUserId } from '../utils/ids'

export { computePrependScrollTop } from '../utils/prependScroll'
export { shouldShowUnreadJump, unreadDividerMessageIndex } from '../utils/unreadJump'

interface MessageListProps {
  messages: (ConnectMessage | OptimisticMessage)[]
  currentUserId?: number
  typingUsers?: Set<string>
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void | Promise<void>
  /** Stable identity for the active conversation. Consumers should also use it
   *  as the component key so the previous thread can never flash on a switch. */
  conversationId?: string | number | null
  /** Unread count captured when the conversation opened. The list now opens at
   *  latest (CON-235), while retaining the divider and an explicit jump back to
   *  the first unread message (CON-22). */
  initialUnreadCount?: number
  /** CON-283: called with a failed optimistic message so the consumer can retry
   *  it (reusing the same client_message_id for server-side idempotency). */
  onRetry?: (msg: OptimisticMessage) => void
}

const AT_BOTTOM_THRESHOLD = 80

interface PrependSnapshot {
  scrollHeight: number
  scrollTop: number
  /** Message count when loadMore was invoked. */
  count: number
  /** first message id when loadMore was invoked. */
  firstId: string
  loadingObserved: boolean
  /** True once we successfully applied a height-delta restore. */
  adjusted: boolean
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

function shouldShowDateSeparator(messages: (ConnectMessage)[], index: number): boolean {
  if (index === 0) return true
  const prev = messages[index - 1]
  const curr = messages[index]
  if (!prev || !curr) return false
  return new Date(prev.created_at).toDateString() !== new Date(curr.created_at).toDateString()
}

export function MessageList({
  messages,
  currentUserId,
  typingUsers,
  hasMore,
  isLoadingMore,
  onLoadMore,
  conversationId,
  initialUnreadCount = 0,
  onRetry,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const unreadDividerRef = useRef<HTMLDivElement>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [firstUnreadId, setFirstUnreadId] = useState('')
  const [showUnreadJump, setShowUnreadJump] = useState(false)
  const wasAtBottomRef = useRef(true)
  const anchoredRef = useRef(false)
  const previousRef = useRef({ firstId: '', lastId: '', count: 0, lastContent: '' })
  const prependSnapshotRef = useRef<PrependSnapshot | null>(null)
  const prependSettleFrameRef = useRef<number | null>(null)

  const applyPrependCompensation = useCallback((el: HTMLDivElement, snapshot: PrependSnapshot) => {
    const delta = el.scrollHeight - snapshot.scrollHeight
    if (!Number.isFinite(delta) || delta <= 0) {
      // No growth yet (loading spinner only, or still waiting on DOM). Do not
      // mark adjusted — that would clear the pending snapshot before prepend.
      return false
    }
    const nextTop = computePrependScrollTop(
      snapshot.scrollTop,
      snapshot.scrollHeight,
      el.scrollHeight,
    )
    if (nextTop !== el.scrollTop) {
      el.scrollTop = nextTop
    }
    snapshot.scrollHeight = el.scrollHeight
    snapshot.scrollTop = el.scrollTop
    snapshot.adjusted = true
    // Keep wasAtBottom false — the reader was at the top edge loading history.
    wasAtBottomRef.current = false
    return true
  }, [])

  const schedulePrependSettlement = useCallback((el: HTMLDivElement) => {
    if (prependSettleFrameRef.current !== null) {
      cancelAnimationFrame(prependSettleFrameRef.current)
    }
    // Two rAFs: let late layout (markdown/images) settle, re-apply delta if the
    // height grew again, then release the overflowAnchor lock.
    prependSettleFrameRef.current = requestAnimationFrame(() => {
      prependSettleFrameRef.current = requestAnimationFrame(() => {
        const snap = prependSnapshotRef.current
        if (listRef.current === el && snap) {
          // Last-chance / late-layout restore (markdown, images).
          applyPrependCompensation(el, snap)
          if (snap.adjusted) {
            // Compensated — release overflowAnchor so native anchoring can
            // handle any further micro-growth; clear the pending snapshot.
            el.style.overflowAnchor = ''
            prependSnapshotRef.current = null
          }
          // If not yet adjusted, keep the snapshot. The layout effect's
          // empty-page branch (loadingObserved && !isLoadingMore && !prepended)
          // is the only other release path.
        } else if (listRef.current === el && !snap) {
          el.style.overflowAnchor = ''
        }
        prependSettleFrameRef.current = null
      })
    })
  }, [applyPrependCompensation])

  const scrollToBottom = useCallback(() => {
    wasAtBottomRef.current = true
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
    setShowJumpToLatest(false)
    setNewMessageCount(0)
  }, [])

  const scrollToUnreadDivider = useCallback(() => {
    const divider = unreadDividerRef.current
    if (!divider) return
    wasAtBottomRef.current = false
    divider.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setShowUnreadJump(false)
    setShowJumpToLatest(true)
  }, [])

  const syncUnreadJumpVisibility = useCallback((unreadId = firstUnreadId) => {
    const list = listRef.current
    const divider = unreadDividerRef.current
    if (!unreadId || !list) {
      setShowUnreadJump(false)
      return
    }
    if (!divider) return
    const listBox = list.getBoundingClientRect()
    const dividerBox = divider.getBoundingClientRect()
    setShowUnreadJump(shouldShowUnreadJump({
      hasUnreadMarker: true,
      dividerBottom: dividerBox.bottom,
      viewportTop: listBox.top,
    }))
  }, [firstUnreadId])

  const firstMessageId = messages[0]?.id ?? ''
  const lastMessage = messages[messages.length - 1]
  const lastMessageId = lastMessage?.id ?? ''
  const lastMessageContent = lastMessage?.content ?? ''

  // All scroll mutations happen in a layout effect so the browser never paints
  // the thread at the top before it is anchored at latest. The same effect
  // preserves the visible item when older history is prepended and follows
  // streaming/variable-height content only while the reader remains pinned.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return

    if (messages.length === 0) {
      anchoredRef.current = false
      previousRef.current = { firstId: '', lastId: '', count: 0, lastContent: '' }
      prependSnapshotRef.current = null
      el.scrollTop = 0
      return
    }

    const previous = previousRef.current
    if (prependSnapshotRef.current && isLoadingMore) {
      prependSnapshotRef.current.loadingObserved = true
    }
    const unreadIndex = unreadDividerMessageIndex(messages.length, initialUnreadCount)
    const unreadId = unreadIndex >= 0 ? messages[unreadIndex]?.id ?? '' : ''
    if (!anchoredRef.current) {
      setFirstUnreadId(unreadId)
      scrollToBottom()
      anchoredRef.current = true
    } else {
      // The conversation list and message history hydrate independently. If
      // history wins the race, install the captured unread marker when the
      // conversation metadata arrives instead of silently losing CON-22.
      if (!firstUnreadId && unreadId) {
        setFirstUnreadId(unreadId)
      }

      // CON-293: detect prepend by first-id change OR count growth past the
      // snapshot baseline. Production still saw scrollTop stuck at 0 when the
      // first-id-only check missed a frame; count growth is the durable signal.
      const snapshot = prependSnapshotRef.current
      const prepended = Boolean(
        snapshot
        && messages.length > snapshot.count
        && firstMessageId
        && String(firstMessageId) !== snapshot.firstId,
      )
      if (snapshot && prepended) {
        applyPrependCompensation(el, snapshot)
        schedulePrependSettlement(el)
      } else if (
        snapshot?.loadingObserved
        && !isLoadingMore
        && !prepended
        && !snapshot.adjusted
      ) {
        // A final/empty page (or a recovered request) did not prepend anything.
        // Also covers the case where height grew from the spinner alone then
        // shrank back — release so a later top-edge visit can retry.
        if (prependSettleFrameRef.current !== null) {
          cancelAnimationFrame(prependSettleFrameRef.current)
          prependSettleFrameRef.current = null
        }
        prependSnapshotRef.current = null
        el.style.overflowAnchor = ''
      }

      const appendedCount = Math.max(0, messages.length - previous.count)
      const latestChanged = lastMessageId !== previous.lastId || lastMessageContent !== previous.lastContent
      if (latestChanged) {
        if (wasAtBottomRef.current) {
          scrollToBottom()
        } else {
          setShowJumpToLatest(true)
          if (appendedCount > 0) setNewMessageCount((count) => count + appendedCount)
        }
      }
    }

    previousRef.current = {
      firstId: firstMessageId,
      lastId: lastMessageId,
      count: messages.length,
      lastContent: lastMessageContent,
    }
    // Divider mounts on the next paint after firstUnreadId lands.
    requestAnimationFrame(() => syncUnreadJumpVisibility(unreadId || firstUnreadId))
  }, [
    conversationId,
    firstMessageId,
    firstUnreadId,
    initialUnreadCount,
    isLoadingMore,
    lastMessageContent,
    lastMessageId,
    messages,
    applyPrependCompensation,
    schedulePrependSettlement,
    scrollToBottom,
    syncUnreadJumpVisibility,
  ])

  // Images, expanded markdown, tool output, typing indicators, and streamed
  // content can change height without changing the message array. ResizeObserver
  // keeps a pinned reader at latest while native scroll anchoring preserves an
  // older-history reader's viewport.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const el = listRef.current
      const snapshot = prependSnapshotRef.current
      if (el && snapshot && (snapshot.adjusted || snapshot.loadingObserved)) {
        // Only reschedule settlement when height actually moved; otherwise a
        // spinner-only resize would thrash rAF and clear the pending snapshot.
        if (applyPrependCompensation(el, snapshot)) {
          schedulePrependSettlement(el)
        }
      } else if (anchoredRef.current && wasAtBottomRef.current) {
        scrollToBottom()
      }
    })
    observer.observe(content)
    return () => {
      observer.disconnect()
      if (prependSettleFrameRef.current !== null) {
        cancelAnimationFrame(prependSettleFrameRef.current)
        prependSettleFrameRef.current = null
      }
    }
  }, [conversationId, applyPrependCompensation, schedulePrependSettlement, scrollToBottom])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight

    const atBottom = distanceFromBottom <= AT_BOTTOM_THRESHOLD
    wasAtBottomRef.current = atBottom
    setShowJumpToLatest(!atBottom)
    if (atBottom) {
      setNewMessageCount(0)
    }
    syncUnreadJumpVisibility()

    if (
      el.scrollTop < 50 &&
      hasMore &&
      !isLoadingMore &&
      onLoadMore &&
      !prependSnapshotRef.current
    ) {
      // Disable native scroll anchoring only for the prepend transaction. It
      // can otherwise race our exact height-delta restoration and apply a
      // second, browser-chosen correction to a different message anchor.
      el.style.overflowAnchor = 'none'
      const firstId = messages[0]?.id ?? ''
      prependSnapshotRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        count: messages.length,
        firstId: String(firstId),
        loadingObserved: false,
        adjusted: false,
      }
      onLoadMore()
    }
  }, [hasMore, isLoadingMore, messages, onLoadMore, syncUnreadJumpVisibility])

  return (
    <div className="relative flex-1 min-h-0">
      {isLoadingMore && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center" aria-label="Loading older messages">
          <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        data-testid="connect-message-list"
        className="h-full overflow-y-auto px-4 pb-16 pt-4"
      >
        <div ref={contentRef} className="space-y-1">

      {messages.map((msg, i) => {
        const isOwn = sameUserId(msg.sender_id, currentUserId)
        const isSystem = msg.message_type === 'system'
        const isDeleted = msg.is_deleted
        const isOptimistic = (msg as OptimisticMessage)._optimistic
        const isFailed = (msg as OptimisticMessage)._failed

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center py-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                {msg.content}
              </span>
            </div>
          )
        }

        const showUnreadDivider = firstUnreadId !== '' && msg.id === firstUnreadId

        return (
          <React.Fragment key={msg.id}>
            {showUnreadDivider && (
              <div ref={unreadDividerRef} className="flex items-center gap-3 py-2" aria-label="Unread messages">
                <div className="flex-1 h-px bg-brand-400/50" />
                <span className="text-[11px] font-medium text-brand-500 uppercase tracking-wide">Unread</span>
                <div className="flex-1 h-px bg-brand-400/50" />
              </div>
            )}
            {shouldShowDateSeparator(messages, i) && (
              <div className="flex items-center justify-center py-3">
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                  {formatDateSeparator(msg.created_at)}
                </span>
              </div>
            )}

            <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}>
              {!isOwn && (
                <div className="mr-2 mt-1">
                  <Avatar name={msg.sender_name} size="sm" />
                </div>
              )}

              <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                {!isOwn && (i === 0 || messages[i - 1]?.sender_id !== msg.sender_id) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 ml-1">
                    {msg.sender_name}
                  </p>
                )}

                <div
                  className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                    isDeleted
                      ? 'italic text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
                      : isOwn
                        ? `bg-brand-600 text-white ${isFailed ? 'opacity-60' : ''} ${isOptimistic ? 'opacity-80' : ''}`
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {isDeleted ? (
                    <span>This message was deleted</span>
                  ) : (
                    <MarkdownBubble
                      content={msg.content}
                      variant={isOwn ? 'own' : 'other'}
                    />
                  )}
                  {msg.is_edited && !isDeleted && (
                    <span className="text-[10px] opacity-60 ml-1">(edited)</span>
                  )}
                </div>

                <div className={`flex items-center gap-1.5 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'} ml-1`}>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatTime(msg.created_at)}
                  </span>
                  {isFailed && (
                    <>
                      <span className="text-[10px] text-red-500 font-medium">Failed</span>
                      {onRetry && (
                        <button
                          type="button"
                          data-testid={`retry-message-${msg.id}`}
                          onClick={() => onRetry(msg as OptimisticMessage)}
                          className="text-[10px] text-brand-500 font-semibold hover:underline"
                        >
                          Retry
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </React.Fragment>
        )
      })}

      {typingUsers && typingUsers.size > 0 && (
        <TypingIndicator names={Array.from(typingUsers)} />
      )}

        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
      {showUnreadJump && firstUnreadId && (
        <button
          type="button"
          data-testid="unread-jump-button"
          onClick={scrollToUnreadDivider}
          aria-label="Jump to first unread message"
          className="rounded-full border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50 dark:border-brand-800 dark:bg-gray-900 dark:text-brand-300"
        >
          ↑ {initialUnreadCount} unread
        </button>
      )}
      {showJumpToLatest && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Jump to latest message"
          className="rounded-full bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-brand-700"
        >
          ↓ {newMessageCount > 0 ? `${newMessageCount} new` : 'Latest'}
        </button>
      )}
      </div>
    </div>
  )
}
