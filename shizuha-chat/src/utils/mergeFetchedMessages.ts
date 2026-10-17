/**
 * Initial history fetch must not wipe a turn the user just sent.
 *
 * Homepage Live attaches a thread and immediately lets the operator type.
 * `fetchMessages` used to `setMessages(fetched)`, which dropped the
 * optimistic bubble if the GET raced the POST. The operator then saw
 * Ena answer "what's up" with no "what's up" in the strip.
 */
export function mergeFetchedMessages<T extends {
  id?: string
  client_message_id?: string | null
  created_at?: string
  _optimistic?: boolean
  _sending?: boolean
  _failed?: boolean
}>(fetched: T[], prev: T[]): T[] {
  if (!Array.isArray(fetched)) return Array.isArray(prev) ? prev : []
  if (!prev?.length) return fetched

  const incomingIds = new Set(fetched.map((m) => m?.id).filter(Boolean) as string[])
  const incomingClients = new Set(
    fetched.map((m) => m?.client_message_id).filter(Boolean) as string[],
  )
  const newestFetched = fetched.reduce((acc, m) => {
    const t = Date.parse(m?.created_at || '')
    return Number.isFinite(t) && t > acc ? t : acc
  }, 0)

  const extras = prev.filter((m) => {
    if (m?.id && incomingIds.has(m.id)) return false
    if (m?.client_message_id && incomingClients.has(m.client_message_id)) return false
    if (m?._optimistic || m?._sending || m?._failed) return true
    const t = Date.parse(m?.created_at || '')
    return Number.isFinite(t) && newestFetched > 0 && t >= newestFetched
  })

  return extras.length ? [...fetched, ...extras] : fetched
}
