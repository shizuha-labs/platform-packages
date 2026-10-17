/**
 * Inbox rows must not use the current user as the peer just because they
 * are listed first, or because JWT ids are strings.
 * Run: node --experimental-strip-types tests/peer_ids.test.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/ids.ts')
const { conversationPeer, sameUserId } = await import(pathToFileURL(src).href)

assert.equal(sameUserId(3, '3'), true)
assert.equal(sameUserId('3', 3), true)
assert.equal(sameUserId(3, 4), false)
assert.equal(sameUserId(3, null), false)

const conv = {
  conversation_type: 'direct',
  participants: [
    { user_id: 3, user_name: 'Hritik Soni', has_left: false },
    { user_id: 17, user_name: 'Aoi', has_left: false },
  ],
}

assert.equal(conversationPeer(conv, 3)?.user_name, 'Aoi')
assert.equal(conversationPeer(conv, '3')?.user_name, 'Aoi')
assert.equal(conversationPeer(conv, undefined), null)

console.log('peer_ids.test.mjs ok')
