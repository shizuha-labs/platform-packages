// Context and provider
export { ConnectChatProvider, useConnectChat } from './context/ConnectChatContext'
export type { ConnectChatContextValue } from './context/ConnectChatContext'

// Layout
export { ChatLayout } from './components/ChatLayout'

// Individual components
export { Avatar } from './components/Avatar'
export { ConversationList } from './components/ConversationList'
export { ConversationItem } from './components/ConversationItem'
export { MessageList, computePrependScrollTop } from './components/MessageList'
export { MarkdownBubble } from './components/MarkdownBubble'
export { MessageInput } from './components/MessageInput'
export { TypingIndicator } from './components/TypingIndicator'
export { NewChatModal } from './components/NewChatModal'

// Hooks
export { useConnectWebSocket } from './hooks/useConnectWebSocket'
export { useConversations } from './hooks/useConversations'
export { useMessages } from './hooks/useMessages'

// Types
export type {
  ConnectMessage,
  OptimisticMessage,
  ConnectConversation,
  ConnectParticipant,
  ConnectChatProviderProps,
  ConnectWsEvent,
  ConnectWsEventType,
  MessageType,
} from './types'
