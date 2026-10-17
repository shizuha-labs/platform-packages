import type { ReactNode } from 'react'

// ── Message types ──

export type MessageType = 'text' | 'image' | 'video' | 'file' | 'voice' | 'system' | 'shared_post'

export interface ConnectMessage {
  id: string
  conversation_id: string
  sender_id: number
  sender_email: string
  sender_name: string
  sender_username: string
  sender_is_agent: boolean
  agent_id: string | null
  message_type: MessageType
  content: string
  media_url: string
  media_metadata: Record<string, unknown>
  reply_to: string | null
  reply_to_content: string | null
  reply_to_sender_name: string | null
  reply_to_message_type: string | null
  reply_to_media_url: string | null
  forwarded_from: string | null
  forwarded_from_content: string | null
  forwarded_from_sender_name: string | null
  reactions: Record<string, number[]>
  is_edited: boolean
  is_deleted: boolean
  is_starred: boolean
  read_by: number[]
  delivered_to: number[]
  client_message_id: string | null
  created_at: string
  updated_at: string
}

export interface OptimisticMessage extends ConnectMessage {
  _optimistic?: boolean
  _failed?: boolean
  _sending?: boolean
}

// ── Conversation types ──

export interface ConnectParticipant {
  id: string
  user_id: number
  user_email: string
  user_name: string
  participant_type: 'human' | 'agent' | 'system'
  agent_id: string | null
  agent_role: string | null
  is_admin: boolean
  unread_count: number
  is_muted: boolean
  is_pinned: boolean
  is_archived: boolean
  has_left: boolean
  joined_at: string
}

export interface ConnectConversation {
  id: string
  conversation_type: 'direct' | 'group'
  name: string
  description: string
  avatar_url: string
  participants: ConnectParticipant[]
  last_message: { content: string; created_at: string } | null
  last_message_at: string | null
  last_message_preview: string
  unread_count: number
  message_count: number
  participant_names: string[]
  is_muted: boolean
  is_pinned: boolean
  is_archived: boolean
  created_at: string
  updated_at: string
}

// ── Provider props ──

export interface ConnectChatProviderProps {
  getAuthToken: () => string | Promise<string>
  connectApiBase?: string
  connectWsUrl?: string
  initialConversationId?: string
  currentUserId?: number
  children: ReactNode
}

// ── WebSocket event types ──

export type ConnectWsEventType =
  | 'new_message'
  | 'missed_message'
  | 'typing'
  | 'message_read'
  | 'message_delivered'
  | 'message_edited'
  | 'message_deleted'
  | 'conversation_created'
  | 'participant_added'
  | 'participant_removed'
  | 'send_error'
  | 'presence'
  | 'agent_stream'
  | 'ping'
  | 'pong'

export interface ConnectWsEvent {
  type: ConnectWsEventType
  [key: string]: unknown
}
