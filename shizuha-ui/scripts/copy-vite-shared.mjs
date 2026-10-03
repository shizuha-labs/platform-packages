/**
 * ORIG-232: emit vite.shared.js into the packed dist as dist/vite.shared.mjs so
 * the package.json `./vite` export resolves without importing a second source
 * file. The file is already a thin ESM module; we copy it verbatim (`.mjs`
 * extension forces ESM resolution regardless of the package "type" field).
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, 'dist'), { recursive: true })
copyFileSync(join(root, 'vite.shared.js'), join(root, 'dist', 'vite.shared.mjs'))
console.log('ORIG-232: copied vite.shared.js -> dist/vite.shared.mjs')
