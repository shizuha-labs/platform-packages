/** First unread row when opening a thread at latest (CON-22 / CON-235). */
export function unreadDividerMessageIndex(messageCount: number, initialUnreadCount: number): number {
  if (initialUnreadCount <= 0 || messageCount <= 0) return -1
  return Math.max(0, messageCount - initialUnreadCount)
}

/**
 * The jump chip must not claim unread while the reader is looking at those
 * messages. Only offer "↑ N unread" when the unread start is above the
 * visible thread.
 */
export function shouldShowUnreadJump({
  hasUnreadMarker,
  dividerBottom,
  viewportTop,
}: {
  hasUnreadMarker: boolean
  dividerBottom: number
  viewportTop: number
}): boolean {
  if (!hasUnreadMarker) return false
  return dividerBottom < viewportTop
}

/** Keep a locally marked-read thread at 0 across a stale conversations GET. */
export function applyLocallyReadUnread<T extends { id: string; unread_count?: number }>(
  conversations: T[],
  locallyReadIds: Set<string>,
): T[] {
  if (!locallyReadIds.size) return conversations
  return conversations.map((conversation) => (
    locallyReadIds.has(conversation.id)
      ? { ...conversation, unread_count: 0 }
      : conversation
  ))
}
