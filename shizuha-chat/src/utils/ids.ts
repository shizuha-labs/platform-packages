/** JWT / localStorage ids are sometimes strings; Connect user_id is a number. */
export function sameUserId(a: unknown, b: unknown): boolean {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function conversationPeer<T extends { user_id?: unknown; has_left?: boolean }>(
  conv: { participants?: T[]; conversation_type?: string } | null | undefined,
  currentUserId: unknown,
): T | null {
  if (!conv || currentUserId == null || currentUserId === '') return null
  return (conv.participants || []).find(
    (p) => !sameUserId(p.user_id, currentUserId) && !p.has_left,
  ) || null
}
