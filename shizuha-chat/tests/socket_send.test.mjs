/**
 * Full-thread send used to drop when isConnected was true but the socket
 * ref had already been wiped by a superseded onclose (reconnect race).
 * Run: node --experimental-strip-types tests/socket_send.test.mjs
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/utils/socketSend.ts')
const { isCurrentSocket, socketIsOpen, shouldRestFallback, WS_OPEN } = await import(pathToFileURL(src).href)

const older = { readyState: WS_OPEN }
const newer = { readyState: WS_OPEN }
assert.equal(isCurrentSocket(newer, older), false, 'superseded socket must not own onclose')
assert.equal(isCurrentSocket(newer, newer), true)
assert.equal(isCurrentSocket(null, older), false)

assert.equal(socketIsOpen(null), false)
assert.equal(socketIsOpen({ readyState: 0 }), false)
assert.equal(socketIsOpen({ readyState: WS_OPEN }), true)

assert.equal(shouldRestFallback(true, true), false)
assert.equal(shouldRestFallback(true, false), true, 'connected flag with a dead socket must REST')
assert.equal(shouldRestFallback(false, false), true)

console.log('socket_send.test.mjs ok')
