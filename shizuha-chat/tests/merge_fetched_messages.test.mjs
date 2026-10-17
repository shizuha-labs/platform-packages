/**
 * Typed-turn hydrate race: history GET must keep an in-flight optimistic send.
 * Run: node --experimental-strip-types packages/shizuha-chat/tests/merge_fetched_messages.test.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/mergeFetchedMessages.ts')
const { mergeFetchedMessages } = await import(pathToFileURL(src).href)

const history = [
  { id: 'old-1', content: 'Hey. I am here.', created_at: '2026-08-16T10:00:00.000Z' },
]

const optimistic = {
  id: 'client-1',
  client_message_id: 'client-1',
  content: "Yo, what's up?",
  created_at: '2026-08-16T12:00:00.000Z',
  _optimistic: true,
  _sending: true,
}

const merged = mergeFetchedMessages(history, [optimistic])
assert.equal(merged.length, 2, 'history fetch must keep the in-flight typed turn')
assert.equal(merged[1].content, "Yo, what's up?")

const alreadyOnServer = mergeFetchedMessages(
  [...history, { id: 'srv-1', client_message_id: 'client-1', content: "Yo, what's up?", created_at: optimistic.created_at }],
  [optimistic],
)
assert.equal(alreadyOnServer.length, 2)
assert.ok(!alreadyOnServer.some((m) => m._optimistic), 'dedupe optimistic once the GET has it')

const emptyPrev = mergeFetchedMessages(history, [])
assert.deepEqual(emptyPrev, history)

console.log('merge_fetched_messages.test.mjs ok')
