/**
 * CON-295 — static a11y-name contract for icon-only controls and the New Chat dialog.
 * Source-level so it runs without a React test harness in package CI.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'components')

function src(name) {
  return readFileSync(join(root, name), 'utf8')
}

const messageInput = src('MessageInput.tsx')
assert.match(messageInput, /aria-label=["']Send message["']/, 'Send button must expose an accessible name')
assert.match(messageInput, /aria-label=\{placeholder/, 'Message textarea must expose an accessible name')

const messageList = src('MessageList.tsx')
assert.match(messageList, /aria-label=["']Jump to latest message["']/, 'Jump-to-latest must expose an accessible name')
assert.match(messageList, /aria-label=["']Jump to first unread message["']/, 'Jump-to-unread must expose an accessible name')

const newChat = src('NewChatModal.tsx')
assert.match(newChat, /role=["']dialog["']/, 'NewChatModal must use role=dialog')
assert.match(newChat, /aria-modal=["']true["']/, 'NewChatModal must set aria-modal=true')
assert.match(newChat, /aria-labelledby=["']new-chat-modal-title["']/, 'NewChatModal must be labelled by its title')
assert.match(newChat, /id=["']new-chat-modal-title["']/, 'NewChatModal title id must exist')
assert.match(newChat, /aria-label=["']Close["']/, 'NewChatModal close control must be named')

const conversationList = src('ConversationList.tsx')
assert.match(conversationList, /aria-label=["']New chat["']/, 'New-chat icon button must be named')

const chatLayout = src('ChatLayout.tsx')
assert.match(chatLayout, /aria-label=["']Back to conversations["']/, 'Mobile back control must be named')

console.log('a11y_names.test.mjs: all CON-295 contracts passed')
