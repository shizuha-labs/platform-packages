import { useState } from 'react'
import type { ConnectConversation } from '../types'
import { ConversationItem } from './ConversationItem'
import { conversationPeer, sameUserId } from '../utils/ids'

interface ConversationListProps {
  conversations: ConnectConversation[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  currentUserId?: number
  onlineUsers?: Set<number>
  isLoading?: boolean
}

function getOtherUserId(conv: ConnectConversation, currentUserId?: number): number | undefined {
  if (conv.conversation_type === 'group') return undefined
  const other = conversationPeer(conv, currentUserId)
  const id = other?.user_id
  return typeof id === 'number' ? id : (id != null ? Number(id) : undefined)
}

function isSelfDirect(conv: ConnectConversation, currentUserId?: number): boolean {
  if (conv.conversation_type === 'group') return false
  if (currentUserId == null) return false
  const active = (conv.participants || []).filter((p) => !p.has_left)
  return active.length > 0 && active.every((p) => sameUserId(p.user_id, currentUserId))
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  currentUserId,
  onlineUsers,
  isLoading,
}: ConversationListProps) {
  const [search, setSearch] = useState('')

  const visible = conversations.filter((c) => !isSelfDirect(c, currentUserId))
  const filtered = search.trim()
    ? visible.filter((c) => {
        const q = search.toLowerCase()
        return (
          c.name?.toLowerCase().includes(q) ||
          c.participant_names?.some((n) => n.toLowerCase().includes(q)) ||
          c.last_message_preview?.toLowerCase().includes(q)
        )
      })
    : visible

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chats</h2>
        <button
          type="button"
          onClick={onNewChat}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="New chat"
          aria-label="New chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            aria-label="Search conversations"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">
        {isLoading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {search ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!search && (
              <button
                onClick={onNewChat}
                className="mt-3 text-sm text-brand-600 dark:text-brand-400 hover:underline"
              >
                Start a new chat
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const otherUserId = getOtherUserId(conv, currentUserId)
            return (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => onSelect(conv.id)}
                currentUserId={currentUserId}
                isOnline={otherUserId != null ? onlineUsers?.has(otherUserId) : undefined}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
