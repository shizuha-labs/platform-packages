/**
 * Open-thread unread chip: sitting on the last message must not say "6 unread".
 * Run: node --experimental-strip-types tests/unread_jump.test.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/unreadJump.ts')
const {
  unreadDividerMessageIndex,
  shouldShowUnreadJump,
  applyLocallyReadUnread,
} = await import(pathToFileURL(src).href)

assert.equal(unreadDividerMessageIndex(20, 6), 14)
assert.equal(unreadDividerMessageIndex(6, 6), 0)
assert.equal(unreadDividerMessageIndex(20, 0), -1)

assert.equal(shouldShowUnreadJump({
  hasUnreadMarker: true,
  dividerBottom: 400,
  viewportTop: 120,
}), false, 'divider in/below the viewport is already on screen')

assert.equal(shouldShowUnreadJump({
  hasUnreadMarker: true,
  dividerBottom: 40,
  viewportTop: 120,
}), true, 'divider above the fold keeps the CON-22 jump')

assert.equal(shouldShowUnreadJump({
  hasUnreadMarker: false,
  dividerBottom: 0,
  viewportTop: 120,
}), false)

const merged = applyLocallyReadUnread(
  [{ id: 'open', unread_count: 6 }, { id: 'other', unread_count: 2 }],
  new Set(['open']),
)
assert.equal(merged[0].unread_count, 0, 'stale GET must not restore unread on the open thread')
assert.equal(merged[1].unread_count, 2)

console.log('unread_jump.test.mjs ok')
