/**
 * CON-283: CI-runnable unit test for the WS ack-timeout / retry state
 * transitions in @shizuha/chat (extracted pure logic in utils/ackTimeout.ts).
 *
 * Covers the reviewer's required cases (PLAT-1305 test evidence):
 *   - ack timeout marks _failed (guarded to _optimistic && _sending)
 *   - echo/reconcile clears the timer -> reconciled message is NOT double-marked
 *   - retry reuses the SAME client_message_id and reconciles
 *   - no double-mark after reconcile
 *
 * Run: node --experimental-strip-types tests/ack_timeout.test.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/ackTimeout.ts')
const { markAckTimedOut, markRetrying } = await import(pathToFileURL(src).href)

const CID = 'cmsg-1'

function optimistic(overrides = {}) {
  return {
    id: 'm1',
    client_message_id: CID,
    content: 'hello',
    _optimistic: true,
    _sending: true,
    ...overrides,
  }
}

function serverMsg(overrides = {}) {
  return { id: 'm1', client_message_id: CID, content: 'hello', ...overrides }
}

// ---- ack timeout marks _failed (guarded to optimistic+sending) ----
{
  const out = markAckTimedOut([optimistic()], CID)
  assert.equal(out[0]._failed, true, 'ack timeout must mark the optimistic send failed')
  assert.equal(out[0]._sending, false, 'ack timeout must clear _sending')
}

// ---- echo/reconciled message is NOT double-marked ----
{
  const reconciled = serverMsg({ _optimistic: false, _sending: false })
  const out = markAckTimedOut([reconciled], CID)
  assert.equal(out[0]._failed, undefined, 'reconciled echo must not be marked failed')
  assert.equal(out[0]._sending, false, 'reconciled echo keeps _sending false')
}

// ---- ack timeout leaves non-matching messages untouched ----
{
  const other = optimistic({ id: 'm2', client_message_id: 'cmsg-2' })
  const out = markAckTimedOut([other], CID)
  assert.equal(out[0]._failed, undefined, 'non-matching message must not be touched')
  assert.equal(out[0]._sending, true, 'non-matching message keeps _sending true')
}

// ---- ack timeout does not double-mark an already-failed message ----
{
  const alreadyFailed = optimistic({ _failed: true, _sending: false })
  const out = markAckTimedOut([alreadyFailed], CID)
  assert.equal(out[0]._failed, true, 'already-failed message stays failed')
  assert.equal(out[0]._sending, false, 'already-failed message stays not sending')
}

// ---- retry reuses the SAME client_message_id and flips back to sending ----
{
  const failed = optimistic({ _failed: true, _sending: false })
  const out = markRetrying([failed], CID)
  assert.equal(out[0]._failed, false, 'retry must clear _failed')
  assert.equal(out[0]._sending, true, 'retry must set _sending true')
  assert.equal(out[0].client_message_id, CID, 'retry keeps the SAME client_message_id for idempotency')
}

// ---- retry leaves non-matching messages untouched ----
{
  const other = optimistic({ id: 'm2', client_message_id: 'cmsg-2', _failed: true, _sending: false })
  const out = markRetrying([other], CID)
  assert.equal(out[0]._failed, true, 'retry must not touch a different message')
  assert.equal(out[0]._sending, false, 'retry must not touch a different message')
}

// ---- empty list is safe ----
{
  assert.deepEqual(markAckTimedOut([], CID), [])
  assert.deepEqual(markRetrying([], CID), [])
}

console.log('ack_timeout.test.mjs ok')
