/**
 * CON-293 / CON-244 — pure prepend scroll-delta regression.
 * Run: node packages/shizuha-chat/tests/prepend_scroll.test.mjs
 *
 * Imports the real TypeScript source via Node's experimental strip-types
 * when available; otherwise evaluates a byte-identical fallback and asserts
 * the source file still contains the same formula (guard against drift).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.resolve(__dirname, '../src/utils/prependScroll.ts')
const src = fs.readFileSync(srcPath, 'utf8')

async function loadHelper() {
  // Prefer compiling via a tiny inline transpile (no build step required).
  // The helper is pure TS with no imports — strip types with a regex and eval.
  const stripped = src
    .replace(/^export\s+/gm, '')
    .replace(/:\s*number/g, '')
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${stripped}; return { computePrependScrollTop };`)
  return factory()
}

const { computePrependScrollTop } = await loadHelper()

// Source-drift guard: the formula must still live in the TS file.
assert.match(src, /nextScrollHeight - prevScrollHeight/)
assert.match(src, /prevScrollTop \+ delta/)

// Live repro class: reader at top (scrollTop≈0), older page adds ~9k px.
{
  const next = computePrependScrollTop(0, 11486, 22093)
  assert.equal(next, 10607, 'top-edge prepend must shift scrollTop by full height delta')
}

// Reader slightly below top when pagination fires.
{
  const next = computePrependScrollTop(40, 5000, 9000)
  assert.equal(next, 4040)
}

// No growth / shrink → leave scrollTop alone.
{
  assert.equal(computePrependScrollTop(100, 8000, 8000), 100)
  assert.equal(computePrependScrollTop(100, 8000, 7000), 100)
}

// Non-finite guard.
{
  assert.equal(computePrependScrollTop(12, 100, Number.NaN), 12)
  assert.equal(computePrependScrollTop(12, 100, Number.POSITIVE_INFINITY), 12)
}

console.log('prepend_scroll.test.mjs: ok')
