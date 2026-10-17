import { useState, useCallback, useRef } from 'react'
import { authHeaders as buildAuthHeaders } from '../auth'
import type { ConnectConversation, ConnectMessage } from '../types'
import { applyLocallyReadUnread } from '../utils/unreadJump'

export interface UseConversationsOptions {
  apiBase: string
  getAuthToken: () => string | Promise<string>
}

export function useConversations(options: UseConversationsOptions) {
  const { apiBase, getAuthToken } = options

  const [conversations, setConversations] = useState<ConnectConversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const locallyReadIdsRef = useRef<Set<string>>(new Set())

  const authHeaders = useCallback(
    (options?: { forceRefresh?: boolean }) => buildAuthHeaders(getAuthToken, options),
    [getAuthToken],
  )

  const fetchConversations = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      let headers = await authHeaders()
      let res = await fetch(`${apiBase}/conversations/`, {
        headers,
        signal: controller.signal,
      })
      if (res.status === 401) {
        headers = await authHeaders({ forceRefresh: true })
        res = await fetch(`${apiBase}/conversations/`, {
          headers,
          signal: controller.signal,
        })
      }
      if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.status}`)
      const data = await res.json()
      const list: ConnectConversation[] = Array.isArray(data) ? data : data.results ?? []
      setConversations(applyLocallyReadUnread(list, locallyReadIdsRef.current))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err as Error)
      }
    } finally {
      setIsLoading(false)
    }
  }, [apiBase, authHeaders])

  const createDirectConversation = useCallback(async (
    participantId: number,
    participantDetails?: { name?: string; email?: string },
  ): Promise<ConnectConversation | null> => {
    setError(null)
    try {
      let headers = await authHeaders()
      const body: Record<string, unknown> = {
        conversation_type: 'direct',
        participant_ids: [participantId],
      }
      const rawName = (participantDetails?.name || '').trim()
      const placeholder = new RegExp(`^user[_\\s-]${participantId}$`, 'i').test(rawName)
      const name = placeholder ? '' : rawName
      if (name || participantDetails?.email) {
        body.participant_details = {
          [String(participantId)]: {
            name,
            email: participantDetails?.email || '',
          },
        }
      }
      let res = await fetch(`${apiBase}/conversations/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        headers = await authHeaders({ forceRefresh: true })
        res = await fetch(`${apiBase}/conversations/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`)
      const conv: ConnectConversation = await res.json()
      setConversations((prev) => [conv, ...prev])
      return conv
    } catch (err) {
      setError(err as Error)
      return null
    }
  }, [apiBase, authHeaders])

  const createGroupConversation = useCallback(async (participantIds: number[], name: string): Promise<ConnectConversation | null> => {
    setError(null)
    try {
      let headers = await authHeaders()
      const groupBody = JSON.stringify({
        conversation_type: 'group',
        participant_ids: participantIds,
        name,
      })
      let res = await fetch(`${apiBase}/conversations/`, {
        method: 'POST',
        headers,
        body: groupBody,
      })
      if (res.status === 401) {
        headers = await authHeaders({ forceRefresh: true })
        res = await fetch(`${apiBase}/conversations/`, {
          method: 'POST',
          headers,
          body: groupBody,
        })
      }
      if (!res.ok) throw new Error(`Failed to create group: ${res.status}`)
      const conv: ConnectConversation = await res.json()
      setConversations((prev) => [conv, ...prev])
      return conv
    } catch (err) {
      setError(err as Error)
      return null
    }
  }, [apiBase, authHeaders])

  const updateFromNewMessage = useCallback((conversationId: string, message: ConnectMessage, activeConversationId?: string) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conversationId)
      if (idx === -1) return prev

      const updated = { ...prev[idx] }
      updated.last_message_preview = message.content.slice(0, 100)
      updated.last_message_at = message.created_at
      updated.last_message = { content: message.content, created_at: message.created_at }

      if (conversationId !== activeConversationId) {
        updated.unread_count = (updated.unread_count || 0) + 1
        locallyReadIdsRef.current.delete(conversationId)
      }

      const next = [...prev]
      next.splice(idx, 1)
      return [updated, ...next]
    })
  }, [])

  const addConversation = useCallback((conversation: ConnectConversation) => {
    setConversations((prev) => {
      if (prev.some((c) => c.id === conversation.id)) return prev
      return [conversation, ...prev]
    })
  }, [])

  // Mark a conversation read when the user opens it: optimistically zero the
  // local unread badge (so it clears instantly, and any derived global counter
  // decrements), then durably persist via the backend read endpoint. The POST is
  // idempotent and best-effort — a transient failure must not wedge the UI, and
  // the optimistic reset already fixed the badge the user can see (CON-22).
  const markConversationRead = useCallback(async (conversationId: string) => {
    locallyReadIdsRef.current.add(conversationId)
    setConversations((prev) =>
      prev.map((c) => (
        c.id === conversationId && (c.unread_count || 0) > 0
          ? { ...c, unread_count: 0 }
          : c
      )),
    )
    try {
      let headers = await authHeaders()
      let res = await fetch(`${apiBase}/conversations/${conversationId}/read/`, {
        method: 'POST',
        headers,
      })
      if (res.status === 401) {
        headers = await authHeaders({ forceRefresh: true })
        await fetch(`${apiBase}/conversations/${conversationId}/read/`, {
          method: 'POST',
          headers,
        })
      }
    } catch {
      // best-effort: the optimistic local reset already cleared the badge; the
      // WS message_read path and the next fetchConversations reconcile state.
    }
  }, [apiBase, authHeaders])

  return {
    conversations,
    isLoading,
    error,
    fetchConversations,
    createDirectConversation,
    createGroupConversation,
    updateFromNewMessage,
    addConversation,
    markConversationRead,
  }
}
