import { useState, useCallback, useRef, useEffect } from 'react'
import { authHeaders as buildAuthHeaders } from '../auth'
import type { ConnectMessage, OptimisticMessage } from '../types'
import { mergeFetchedMessages } from '../utils/mergeFetchedMessages'
import { shouldRestFallback } from '../utils/socketSend'
import { markAckTimedOut, markRetrying } from '../utils/ackTimeout'

const PAGE_SIZE = 50

// CON-283: how long an optimistic WS send may remain unacknowledged before it
// is marked failed. The server echoes `new_message` (reconciled via addMessage);
// if that echo never arrives (dropped frame / dying connection), the optimistic
// bubble must not hang as _sending forever — it becomes _failed so the user can
// retry instead of silently losing the message.
const ACK_TIMEOUT_MS = 10000

export interface UseMessagesOptions {
  apiBase: string
  getAuthToken: () => string | Promise<string>
  currentUserId?: number
}

export function useMessages(options: UseMessagesOptions) {
  const { apiBase, getAuthToken, currentUserId } = options

  const [messages, setMessages] = useState<(ConnectMessage | OptimisticMessage)[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  // In-flight WS sends awaiting a new_message echo, keyed by client_message_id.
  const pendingAckRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearAckTimer = useCallback((clientMessageId: string) => {
    const timer = pendingAckRef.current.get(clientMessageId)
    if (timer) {
      clearTimeout(timer)
      pendingAckRef.current.delete(clientMessageId)
    }
  }, [])

  const armAckTimer = useCallback((clientMessageId: string) => {
    clearAckTimer(clientMessageId)
    const timer = setTimeout(() => {
      pendingAckRef.current.delete(clientMessageId)
      // Only fail if still an unconfirmed optimistic send — a new_message echo
      // (addMessage) or a send_error already reconciled/cleared it.
      setMessages((prev) => markAckTimedOut(prev, clientMessageId))
    }, ACK_TIMEOUT_MS)
    pendingAckRef.current.set(clientMessageId, timer)
  }, [clearAckTimer])

  const authHeaders = useCallback(
    (options?: { forceRefresh?: boolean }) => buildAuthHeaders(getAuthToken, options),
    [getAuthToken],
  )

  const fetchMessages = useCallback(async (conversationId: string, before?: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)

    try {
      let headers = await authHeaders()
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (before) params.set('before', before)

      let res = await fetch(
        `${apiBase}/conversations/${conversationId}/messages/?${params}`,
        { headers, signal: controller.signal },
      )
      if (res.status === 401) {
        headers = await authHeaders({ forceRefresh: true })
        res = await fetch(
          `${apiBase}/conversations/${conversationId}/messages/?${params}`,
          { headers, signal: controller.signal },
        )
      }
      if (!res.ok) {
        if (res.status === 404) {
          // Conversation deleted or doesn't exist — clear messages silently
          setMessages([])
          setHasMore(false)
          return
        }
        throw new Error(`Failed to fetch messages: ${res.status}`)
      }

      const data = await res.json()
      const fetched: ConnectMessage[] = Array.isArray(data) ? data : data.messages ?? data.results ?? []
      setHasMore(fetched.length >= PAGE_SIZE)

      if (before) {
        setMessages((prev) => [...fetched, ...prev])
      } else {
        setMessages((prev) => mergeFetchedMessages(fetched, prev))
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        throw err
      }
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, authHeaders])

  const sendMessage = useCallback(async (
    conversationId: string,
    content: string,
    wsSend: (conversationId: string, content: string, clientMessageId: string) => boolean | void,
    wsConnected?: boolean,
  ) => {
    // Generate UUID v4 — crypto.randomUUID() requires secure context (HTTPS)
    let clientMessageId: string
    if (typeof crypto.randomUUID === 'function') {
      clientMessageId = crypto.randomUUID()
    } else {
      // Fallback UUID v4 generator for HTTP contexts
      clientMessageId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
    }

    const optimistic: OptimisticMessage = {
      id: clientMessageId,
      conversation_id: conversationId,
      sender_id: currentUserId ?? 0,
      sender_email: '',
      sender_name: '',
      sender_username: '',
      sender_is_agent: false,
      agent_id: null,
      message_type: 'text',
      content,
      media_url: '',
      media_metadata: {},
      reply_to: null,
      reply_to_content: null,
      reply_to_sender_name: null,
      reply_to_message_type: null,
      reply_to_media_url: null,
      forwarded_from: null,
      forwarded_from_content: null,
      forwarded_from_sender_name: null,
      reactions: {},
      is_edited: false,
      is_deleted: false,
      is_starred: false,
      read_by: [],
      delivered_to: [],
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _optimistic: true,
      _sending: true,
    }

    setMessages((prev) => [...prev, optimistic])

    const accepted = Boolean(wsConnected) && wsSend(conversationId, content, clientMessageId) !== false
    if (shouldRestFallback(Boolean(wsConnected), accepted)) {
      // Socket down, or isConnected was stale while the socket was not OPEN.
      try {
        let headers = await authHeaders()
        const body = JSON.stringify({ content, message_type: 'text', client_message_id: clientMessageId })
        let res = await fetch(`${apiBase}/conversations/${conversationId}/messages/`, {
          method: 'POST',
          headers,
          body,
        })
        if (res.status === 401) {
          headers = await authHeaders({ forceRefresh: true })
          res = await fetch(`${apiBase}/conversations/${conversationId}/messages/`, {
            method: 'POST',
            headers,
            body,
          })
        }
        if (res.ok) {
          const serverMsg = await res.json()
          setMessages((prev) =>
            prev.map(m => m.client_message_id === clientMessageId ? { ...serverMsg, _optimistic: false, _sending: false } : m)
          )
        } else {
          setMessages((prev) =>
            prev.map(m => m.client_message_id === clientMessageId ? { ...m, _sending: false, _failed: true } as OptimisticMessage : m)
          )
        }
      } catch {
        setMessages((prev) =>
          prev.map(m => m.client_message_id === clientMessageId ? { ...m, _sending: false, _failed: true } as OptimisticMessage : m)
        )
      }
    } else {
      // CON-283: WS accepted the frame — arm an ack timeout so a dropped frame
      // (no new_message echo) surfaces as _failed instead of silent message loss.
      armAckTimer(clientMessageId)
    }

    return clientMessageId
  }, [currentUserId, apiBase, authHeaders, armAckTimer])

  const addMessage = useCallback((msg: ConnectMessage) => {
    if (msg.client_message_id) clearAckTimer(msg.client_message_id)
    setMessages((prev) => {
      if (msg.client_message_id) {
        const idx = prev.findIndex(
          (m) => (m as OptimisticMessage)._optimistic && m.client_message_id === msg.client_message_id,
        )
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = msg
          return next
        }
      }
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [clearAckTimer])

  const updateMessage = useCallback((partial: Partial<ConnectMessage> & { id: string }) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === partial.id ? { ...m, ...partial } : m)),
    )
  }, [])

  const markDeleted = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, is_deleted: true, content: '' } : m,
      ),
    )
  }, [])

  const markFailed = useCallback((clientMessageId: string) => {
    clearAckTimer(clientMessageId)
    setMessages((prev) =>
      prev.map((m) =>
        m.client_message_id === clientMessageId
          ? { ...m, _sending: false, _failed: true } as OptimisticMessage
          : m,
      ),
    )
  }, [clearAckTimer])

  // CON-283: retry a failed message reusing the SAME client_message_id so the
  // server's unique_client_message_per_conversation idempotency dedupes any
  // duplicate that may have actually landed despite the perceived failure.
  const retryMessage = useCallback(async (
    conversationId: string,
    content: string,
    clientMessageId: string,
    wsSend: (conversationId: string, content: string, clientMessageId: string) => boolean | void,
    wsConnected?: boolean,
  ) => {
    setMessages((prev) => markRetrying(prev, clientMessageId))

    const accepted = Boolean(wsConnected) && wsSend(conversationId, content, clientMessageId) !== false
    if (shouldRestFallback(Boolean(wsConnected), accepted)) {
      try {
        const headers = await authHeaders()
        const res = await fetch(`${apiBase}/conversations/${conversationId}/messages/`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ content, message_type: 'text', client_message_id: clientMessageId }),
        })
        if (res.ok) {
          const serverMsg = await res.json()
          setMessages((prev) =>
            prev.map(m => m.client_message_id === clientMessageId ? { ...serverMsg, _optimistic: false, _sending: false } : m)
          )
        } else {
          setMessages((prev) =>
            prev.map(m => m.client_message_id === clientMessageId ? { ...m, _sending: false, _failed: true } as OptimisticMessage : m)
          )
        }
      } catch {
        setMessages((prev) =>
          prev.map(m => m.client_message_id === clientMessageId ? { ...m, _sending: false, _failed: true } as OptimisticMessage : m)
        )
      }
    } else {
      armAckTimer(clientMessageId)
    }
  }, [apiBase, authHeaders, armAckTimer])

  const loadMore = useCallback(async (conversationId: string) => {
    if (!hasMore || isLoading) return
    const oldest = messages[0]
    if (oldest) {
      await fetchMessages(conversationId, oldest.id)
    }
  }, [hasMore, isLoading, messages, fetchMessages])

  const clearMessages = useCallback(() => {
    setMessages([])
    setHasMore(true)
  }, [])

  // Clear any pending ack timers on unmount so a dropped component never
  // mutates state after teardown.
  useEffect(() => {
    return () => {
      pendingAckRef.current.forEach((timer) => clearTimeout(timer))
      pendingAckRef.current.clear()
    }
  }, [])

  return {
    messages,
    isLoading,
    hasMore,
    fetchMessages,
    sendMessage,
    retryMessage,
    addMessage,
    updateMessage,
    markDeleted,
    markFailed,
    loadMore,
    clearMessages,
  }
}
