import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ConnectMessage, ConnectConversation, ConnectChatProviderProps, OptimisticMessage } from '../types'
import { useConnectWebSocket } from '../hooks/useConnectWebSocket'
import { useConversations } from '../hooks/useConversations'
import { useMessages } from '../hooks/useMessages'

export interface ConnectChatContextValue {
  conversations: ConnectConversation[]
  activeConversationId: string | null
  setActiveConversation: (id: string | null) => void
  messages: (ConnectMessage)[]
  /** Unread count of the active conversation captured when it was opened, for the first-unread scroll anchor. */
  activeInitialUnread: number
  hasMore: boolean
  loadMore: () => Promise<void>
  sendMessage: (content: string, conversationId?: string) => void
  /** Re-fetch the active thread from Connect (Live hangup hydrates voice STT). */
  reloadMessages: () => Promise<void>
  /** CON-283: retry a failed optimistic message, reusing its client_message_id. */
  retryMessage: (msg: OptimisticMessage) => void
  typingUsers: Map<string, Set<string>>
  onlineUsers: Set<number>
  isConnected: boolean
  isLoadingConversations: boolean
  isLoadingMessages: boolean
  createDirectConversation: (participantId: number, details?: { name?: string; email?: string }) => Promise<ConnectConversation | null>
  createGroupConversation: (participantIds: number[], name: string) => Promise<ConnectConversation | null>
  fetchConversations: () => Promise<void>
  markConversationRead: (conversationId: string) => void
  currentUserId: number | undefined
  wsError: string | null
  /** Live talk-seat token buffer keyed by conversation id. */
  streamingByConv: Record<string, string>
}

const ConnectChatContext = createContext<ConnectChatContextValue | null>(null)

export function useConnectChat(): ConnectChatContextValue {
  const ctx = useContext(ConnectChatContext)
  if (!ctx) throw new Error('useConnectChat must be used within ConnectChatProvider')
  return ctx
}

function deriveWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/connect/ws/connect/user/`
}

export function ConnectChatProvider({
  getAuthToken,
  connectApiBase = '/connect/api',
  connectWsUrl,
  initialConversationId,
  currentUserId,
  children,
}: ConnectChatProviderProps) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId ?? null,
  )
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map())
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set())
  // Unread count captured AT THE MOMENT a conversation is opened, before it is
  // reset — drives the "open at first unread" anchor in MessageList (CON-22).
  const [activeInitialUnread, setActiveInitialUnread] = useState(0)
  const [streamingByConv, setStreamingByConv] = useState<Record<string, string>>({})
  const activeConvRef = useRef(activeConversationId)
  activeConvRef.current = activeConversationId
  // Which conversation we have already marked-read for the current open, so the
  // effect fires once per open (not on every conversation-list update).
  const markedReadRef = useRef<string | null>(null)

  const wsUrl = connectWsUrl ?? deriveWsUrl()

  const convState = useConversations({ apiBase: connectApiBase, getAuthToken })
  const msgState = useMessages({ apiBase: connectApiBase, getAuthToken, currentUserId })

  const onNewMessage = useCallback((conversationId: string, message: ConnectMessage) => {
    if (conversationId === activeConvRef.current) {
      msgState.addMessage(message)
    }
    convState.updateFromNewMessage(conversationId, message, activeConvRef.current ?? undefined)
  }, [msgState.addMessage, convState.updateFromNewMessage])

  const onTyping = useCallback((_convId: string, _userId: number, userName: string, isTyping: boolean) => {
    setTypingUsers((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(_convId) ?? [])
      if (isTyping) {
        set.add(userName)
      } else {
        set.delete(userName)
      }
      if (set.size === 0) {
        next.delete(_convId)
      } else {
        next.set(_convId, set)
      }
      return next
    })
  }, [])

  const onMessageEdited = useCallback((message: ConnectMessage) => {
    if (message.conversation_id === activeConvRef.current) {
      msgState.updateMessage({ id: message.id, content: message.content, is_edited: true, updated_at: message.updated_at })
    }
  }, [msgState.updateMessage])

  const onMessageDeleted = useCallback((messageId: string) => {
    msgState.markDeleted(messageId)
  }, [msgState.markDeleted])

  const onConversationCreated = useCallback((conversation: ConnectConversation) => {
    convState.addConversation(conversation)
  }, [convState.addConversation])

  const onSendError = useCallback((_convId: string, clientMessageId: string, _error: string) => {
    msgState.markFailed(clientMessageId)
  }, [msgState.markFailed])

  const onAgentStream = useCallback((conversationId: string, eventType: string, data: Record<string, unknown>) => {
    if (!conversationId) return
    if (eventType === 'content') {
      const text = typeof data.text === 'string' ? data.text : ''
      if (!text) return
      setStreamingByConv((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || '') + text,
      }))
    } else if (eventType === 'complete') {
      setStreamingByConv((prev) => {
        if (!(conversationId in prev)) return prev
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
    }
  }, [])

  const onPresence = useCallback((_entityType: string, entityId: string, status: string) => {
    const userId = parseInt(entityId, 10)
    if (isNaN(userId)) return
    setOnlineUsers((prev) => {
      const next = new Set(prev)
      if (status === 'online') next.add(userId)
      else next.delete(userId)
      return next
    })
  }, [])

  const ws = useConnectWebSocket({
    wsUrl,
    getAuthToken,
    onNewMessage,
    onTyping,
    onMessageEdited,
    onMessageDeleted,
    onConversationCreated,
    onSendError,
    onPresence,
    onAgentStream,
  })

  // Connect WS and fetch conversations on mount
  useEffect(() => {
    ws.connect()
    convState.fetchConversations()
    return () => ws.disconnect()
  }, [])

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      msgState.clearMessages()
      msgState.fetchMessages(activeConversationId)
    }
  }, [activeConversationId])

  // Mark a conversation read when it is opened (CON-22). This lives in the
  // context, reacting to activeConversationId, so it covers BOTH open paths:
  // a sidebar click (ChatLayout) and a URL-driven setActiveConversation (the
  // shizuha-home /c/:id route). It also depends on the conversation list so it
  // still fires when the active id is set from the URL on mount BEFORE the
  // conversations have loaded. markedReadRef guards it to once per open.
  useEffect(() => {
    if (!activeConversationId) {
      markedReadRef.current = null
      setActiveInitialUnread(0)
      return
    }
    const conv = convState.conversations.find((c) => c.id === activeConversationId)
    if (!conv) return // conversations not loaded yet — re-runs when they arrive
    if (markedReadRef.current === activeConversationId) return
    markedReadRef.current = activeConversationId
    setActiveInitialUnread(conv.unread_count || 0)
    convState.markConversationRead(activeConversationId)
    ws.sendMessageRead(activeConversationId, '')
  }, [activeConversationId, convState.conversations, convState.markConversationRead, ws.sendMessageRead])

  const setActiveConversation = useCallback((id: string | null) => {
    if (id !== activeConvRef.current) {
      msgState.clearMessages()
    }
    setActiveConversationId(id)
  }, [msgState.clearMessages])

  const sendMessage = useCallback((content: string, conversationId?: string) => {
    const dest = conversationId || activeConversationId
    if (!dest || !content.trim()) return
    msgState.sendMessage(dest, content, ws.sendMessage, ws.isConnected)
  }, [activeConversationId, msgState.sendMessage, ws.sendMessage, ws.isConnected])

  const reloadMessages = useCallback(async () => {
    if (!activeConversationId) return
    await msgState.fetchMessages(activeConversationId)
  }, [activeConversationId, msgState.fetchMessages])

  // CON-283: retry a failed message reusing the same client_message_id so the
  // server's unique_client_message_per_conversation idempotency dedupes any
  // duplicate that actually landed despite the perceived failure.
  const retryMessage = useCallback((msg: OptimisticMessage) => {
    const dest = msg.conversation_id || activeConversationId
    if (!dest || !msg.content || !msg.client_message_id) return
    msgState.retryMessage(dest, msg.content, msg.client_message_id, ws.sendMessage, ws.isConnected)
  }, [activeConversationId, msgState.retryMessage, ws.sendMessage, ws.isConnected])

  const loadMore = useCallback(async () => {
    if (!activeConversationId) return
    await msgState.loadMore(activeConversationId)
  }, [activeConversationId, msgState.loadMore])

  const markConversationRead = useCallback((conversationId: string) => {
    convState.markConversationRead(conversationId) // HTTP persist + local badge reset
    ws.sendMessageRead(conversationId, '')         // notify other clients
  }, [convState.markConversationRead, ws.sendMessageRead])

  const value: ConnectChatContextValue = {
    conversations: convState.conversations,
    activeConversationId,
    setActiveConversation,
    messages: msgState.messages,
    activeInitialUnread,
    hasMore: msgState.hasMore,
    loadMore,
    sendMessage,
    reloadMessages,
    retryMessage,
    typingUsers,
    onlineUsers,
    isConnected: ws.isConnected,
    isLoadingConversations: convState.isLoading,
    isLoadingMessages: msgState.isLoading,
    createDirectConversation: convState.createDirectConversation,
    createGroupConversation: convState.createGroupConversation,
    fetchConversations: convState.fetchConversations,
    markConversationRead,
    currentUserId,
    wsError: ws.wsError,
    streamingByConv,
  }

  return (
    <ConnectChatContext.Provider value={value}>
      {children}
    </ConnectChatContext.Provider>
  )
}
