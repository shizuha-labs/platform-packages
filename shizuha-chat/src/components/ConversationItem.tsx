import type { ConnectConversation } from '../types'
import { Avatar } from './Avatar'
import { conversationPeer, sameUserId } from '../utils/ids'

interface ConversationItemProps {
  conversation: ConnectConversation
  isActive: boolean
  onClick: () => void
  currentUserId?: number
  isOnline?: boolean
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 60000) return 'now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getDisplayName(conv: ConnectConversation, currentUserId?: number): string {
  if (conv.conversation_type === 'group') return conv.name || 'Group'
  const other = conversationPeer(conv, currentUserId)
  if (other?.user_name) return other.user_name
  const selfName = (conv.participants || []).find((p) => sameUserId(p.user_id, currentUserId))?.user_name
  return conv.participant_names?.find((n) => n && n !== selfName) || 'Chat'
}

export function ConversationItem({ conversation, isActive, onClick, currentUserId, isOnline }: ConversationItemProps) {
  const displayName = getDisplayName(conversation, currentUserId)
  const isGroup = conversation.conversation_type === 'group'
  const hasUnread = conversation.unread_count > 0

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors rounded-lg ${
        isActive
          ? 'bg-brand-50 dark:bg-brand-950/30'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <Avatar
        name={isGroup ? (conversation.name || 'Group') : displayName}
        size="md"
        isOnline={isOnline}
        showStatus={!isGroup}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-sm truncate ${
            isActive ? 'font-semibold text-brand-700 dark:text-brand-300'
            : hasUnread ? 'font-semibold text-gray-900 dark:text-gray-100'
            : 'font-medium text-gray-600 dark:text-gray-400'
          }`}>
            {displayName}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
            {relativeTime(conversation.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className={`text-xs truncate ${
            hasUnread ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
          }`}>
            {conversation.last_message_preview || 'No messages yet'}
          </p>
          {hasUnread && !isActive && (
            <span className="flex-shrink-0 ml-2 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-brand-600 text-white text-[10px] font-bold">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
