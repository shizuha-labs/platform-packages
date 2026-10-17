import { useState, useCallback, useRef, useEffect } from 'react'
import { getFreshAuthToken } from '../auth'
import type { ConnectMessage, ConnectConversation, ConnectParticipant } from '../types'
import { isCurrentSocket, socketIsOpen } from '../utils/socketSend'

export interface UseConnectWebSocketOptions {
  wsUrl: string
  getAuthToken: () => string | Promise<string>
  onNewMessage?: (conversationId: string, message: ConnectMessage) => void
  onTyping?: (conversationId: string, userId: number, userName: string, isTyping: boolean) => void
  onMessageRead?: (conversationId: string, messageId: string, userId: number) => void
  onMessageDelivered?: (conversationId: string, messageId: string, userId: number) => void
  onMessageEdited?: (message: ConnectMessage) => void
  onMessageDeleted?: (messageId: string) => void
  onConversationCreated?: (conversation: ConnectConversation) => void
  onParticipantAdded?: (conversationId: string, participant: ConnectParticipant) => void
  onParticipantRemoved?: (conversationId: string, userId: number) => void
  onSendError?: (conversationId: string, clientMessageId: string, error: string) => void
  onPresence?: (entityType: string, entityId: string, status: string) => void
  onAgentStream?: (conversationId: string, eventType: string, data: Record<string, unknown>) => void
}

const MAX_RECONNECT_DELAY = 30000
const BASE_RECONNECT_DELAY = 1000
const JITTER_FACTOR = 0.2
const PING_INTERVAL = 30000
const PONG_TIMEOUT = 60000

export function useConnectWebSocket(options: UseConnectWebSocketOptions) {
  const { wsUrl, getAuthToken } = options

  const [isConnected, setIsConnected] = useState(false)
  const [wsError, setWsError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastPongRef = useRef<number>(Date.now())
  const intentionalDisconnectRef = useRef(false)

  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) return
    reconnectAttemptsRef.current++
    const attempt = reconnectAttemptsRef.current
    const baseDelay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY)
    const jitter = baseDelay * JITTER_FACTOR * (Math.random() * 2 - 1)
    const delay = Math.max(500, baseDelay + jitter)
    reconnectTimerRef.current = setTimeout(() => {
      connect()
    }, delay)
  }, []) // connect added below via mutation

  const connect = useCallback(async () => {
    intentionalDisconnectRef.current = false

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    let token: string
    try {
      token = await getFreshAuthToken(getAuthToken)
    } catch {
      setWsError('Failed to get auth token')
      scheduleReconnect()
      return
    }

    const url = `${wsUrl}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0
      lastPongRef.current = Date.now()
      setIsConnected(true)
      setWsError(null)

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          if (Date.now() - lastPongRef.current > PONG_TIMEOUT) {
            wsRef.current.close(4000, 'pong timeout')
            return
          }
          wsRef.current.send(JSON.stringify({ type: 'ping' }))
        }
      }, PING_INTERVAL)
    }

    ws.onclose = () => {
      // A newer connect() may already own wsRef. Do not null that socket or
      // flip isConnected off — that left send thinking WS was up with no socket.
      if (!isCurrentSocket(wsRef.current, ws)) return
      setIsConnected(false)
      wsRef.current = null

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }

      if (!intentionalDisconnectRef.current) {
        setWsError('Connection lost')
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      setWsError('WebSocket connection error')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const cb = callbacksRef.current

        switch (msg.type) {
          case 'new_message':
          case 'missed_message': {
            const message = msg.message as ConnectMessage
            const convId = msg.conversation_id || message?.conversation_id || ''
            cb.onNewMessage?.(convId, message)
            break
          }

          case 'typing': {
            cb.onTyping?.(
              msg.conversation_id || '',
              msg.user_id,
              msg.user_name || '',
              msg.is_typing ?? true,
            )
            break
          }

          case 'message_read': {
            cb.onMessageRead?.(
              msg.conversation_id || '',
              msg.message_id,
              msg.user_id,
            )
            break
          }

          case 'message_delivered': {
            cb.onMessageDelivered?.(
              msg.conversation_id || '',
              msg.message_id,
              msg.user_id,
            )
            break
          }

          case 'message_edited': {
            cb.onMessageEdited?.(msg.message as ConnectMessage)
            break
          }

          case 'message_deleted': {
            cb.onMessageDeleted?.(msg.message_id)
            break
          }

          case 'conversation_created': {
            cb.onConversationCreated?.(msg.conversation as ConnectConversation)
            break
          }

          case 'participant_added': {
            cb.onParticipantAdded?.(
              msg.conversation_id || '',
              msg.participant as ConnectParticipant,
            )
            break
          }

          case 'participant_removed': {
            cb.onParticipantRemoved?.(
              msg.conversation_id || '',
              msg.user_id,
            )
            break
          }

          case 'send_error': {
            cb.onSendError?.(
              msg.conversation_id || '',
              msg.client_message_id || '',
              msg.error || 'Unknown error',
            )
            break
          }

          case 'agent_stream': {
            cb.onAgentStream?.(
              msg.conversation_id || '',
              msg.event_type || '',
              (msg.data && typeof msg.data === 'object') ? msg.data : {},
            )
            break
          }

          case 'presence': {
            const data = msg.data || {}
            cb.onPresence?.(
              data.entity_type || 'user',
              data.entity_id || '',
              data.status || 'offline',
            )
            break
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong' }))
            break
          }

          case 'pong': {
            lastPongRef.current = Date.now()
            break
          }
        }
      } catch {
        // Malformed message — ignore
      }
    }

    wsRef.current = ws
  }, [wsUrl, getAuthToken, scheduleReconnect])

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    clearTimers()
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
  }, [clearTimers])

  const sendMessage = useCallback((conversationId: string, content: string, clientMessageId: string) => {
    const socket = wsRef.current
    if (!socketIsOpen(socket)) return false
    socket.send(JSON.stringify({
      type: 'send_message',
      conversation_id: conversationId,
      content,
      client_message_id: clientMessageId,
    }))
    return true
  }, [])

  const sendTypingStart = useCallback((conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'typing_start',
      conversation_id: conversationId,
    }))
  }, [])

  const sendTypingStop = useCallback((conversationId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'typing_stop',
      conversation_id: conversationId,
    }))
  }, [])

  const sendMessageRead = useCallback((conversationId: string, messageId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type: 'message_read',
      conversation_id: conversationId,
      message_id: messageId,
    }))
  }, [])

  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true
      clearTimers()
      wsRef.current?.close()
    }
  }, [clearTimers])

  return {
    isConnected,
    wsError,
    connect,
    disconnect,
    sendMessage,
    sendTypingStart,
    sendTypingStop,
    sendMessageRead,
  }
}
