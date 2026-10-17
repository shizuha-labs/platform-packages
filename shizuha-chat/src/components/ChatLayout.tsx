import { useState, useCallback } from 'react'
import { useConnectChat } from '../context/ConnectChatContext'
import { ConversationList } from './ConversationList'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { NewChatModal } from './NewChatModal'
import { conversationPeer, sameUserId } from '../utils/ids'

interface ChatLayoutProps {
  apiBase: string
  getAuthToken: () => string | Promise<string>
  onNavigateConversation?: (id: string | null) => void
}

export function ChatLayout({ apiBase, getAuthToken, onNavigateConversation }: ChatLayoutProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    messages,
    activeInitialUnread,
    hasMore,
    loadMore,
    sendMessage,
    typingUsers,
    isConnected,
    isLoadingConversations,
    isLoadingMessages,
    createDirectConversation,
    currentUserId,
    wsError,
  } = useConnectChat()

  const [showNewChat, setShowNewChat] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id)
    onNavigateConversation?.(id)
    // Hide sidebar on mobile
    if (window.innerWidth < 768) {
      setShowSidebar(false)
    }
  }, [setActiveConversation, onNavigateConversation])

  const handleNewChat = useCallback(async (userId: number) => {
    const conv = await createDirectConversation(userId)
    if (conv) {
      handleSelectConversation(conv.id)
    }
  }, [createDirectConversation, handleSelectConversation])

  const handleBack = useCallback(() => {
    setShowSidebar(true)
    setActiveConversation(null)
    onNavigateConversation?.(null)
  }, [setActiveConversation, onNavigateConversation])

  const activeConv = conversations.find((c) => c.id === activeConversationId)
  const activeTyping = activeConversationId ? typingUsers.get(activeConversationId) : undefined

  // Get display name for active conversation
  const getConvDisplayName = () => {
    if (!activeConv) return ''
    if (activeConv.conversation_type === 'group') return activeConv.name || 'Group'
    const other = conversationPeer(activeConv, currentUserId)
    if (other?.user_name) return other.user_name
    const selfName = (activeConv.participants || []).find((p) => sameUserId(p.user_id, currentUserId))?.user_name
    return activeConv.participant_names?.find((n) => n && n !== selfName) || 'Chat'
  }

  return (
    <div className="flex h-full bg-white dark:bg-zinc-950">
      {/* Sidebar */}
      <div className={`w-full md:w-80 lg:w-96 flex-shrink-0 ${
        !showSidebar && activeConversationId ? 'hidden md:flex' : 'flex'
      } flex-col`}>
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={handleSelectConversation}
          onNewChat={() => setShowNewChat(true)}
          currentUserId={currentUserId}
          isLoading={isLoadingConversations}
        />
      </div>

      {/* Main chat area */}
      <div className={`flex-1 flex flex-col min-w-0 ${
        showSidebar && !activeConversationId ? 'hidden md:flex' : 'flex'
      }`}>
        {activeConversationId ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              {/* Back button (mobile) */}
              <button
                type="button"
                onClick={handleBack}
                aria-label="Back to conversations"
                className="md:hidden p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {getConvDisplayName()}
                </h3>
                {!isConnected && (
                  <p className="text-xs text-amber-500">
                    {wsError || 'Reconnecting...'}
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <MessageList
              key={activeConversationId}
              conversationId={activeConversationId}
              messages={messages}
              currentUserId={currentUserId}
              typingUsers={activeTyping}
              hasMore={hasMore}
              isLoadingMore={isLoadingMessages}
              onLoadMore={loadMore}
              initialUnreadCount={activeInitialUnread}
            />

            {/* Input */}
            <MessageInput
              onSend={sendMessage}
              placeholder={isConnected ? 'Type a message...' : 'Connecting… send still works'}
            />
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
              Welcome to Shizuha Chat
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 max-w-sm">
              Select a conversation or start a new chat with any of our agents.
            </p>
            <button
              onClick={() => setShowNewChat(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
            >
              Start a new chat
            </button>
          </div>
        )}
      </div>

      {/* New chat modal */}
      <NewChatModal
        isOpen={showNewChat}
        onClose={() => setShowNewChat(false)}
        onSelectUser={handleNewChat}
        apiBase={apiBase}
        getAuthToken={getAuthToken}
      />
    </div>
  )
}
