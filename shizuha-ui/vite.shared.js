/**
 * Shared Vite configuration for Shizuha frontend services
 *
 * Usage in service's vite.config.js:
 *
 * ```js
 * import { defineConfig, mergeConfig } from 'vite'
 * import react from '@vitejs/plugin-react'
 * import { createShizuhaConfig } from '@shizuha/ui/vite'
 *
 * export default mergeConfig(
 *   createShizuhaConfig({ port: 5173, serviceName: 'pulse' }),
 *   defineConfig({
 *     plugins: [react()],
 *     // service-specific config...
 *   })
 * )
 * ```
 */
import { existsSync } from 'node:fs'

/**
 * Monorepo source aliases for HMR, guarded so a STANDALONE product checkout
 * (no /packages mount, dependencies installed from the registry) resolves the
 * @shizuha/* packages to their installed copies instead of a nonexistent path.
 * Each alias is added only when its /packages/<name>/src directory actually
 * exists; the standalone alias map is therefore empty (ORIG-232 / ORIG-231).
 */
function guardedMonorepoAliases() {
  const candidates = {
    '@shizuha/ui': '/packages/shizuha-ui/src',
    '@shizuha/chat': '/packages/shizuha-chat/src',
    '@shizuha/editor': '/packages/shizuha-editor/src',
  }
  const aliases = {}
  for (const [name, sourcePath] of Object.entries(candidates)) {
    if (existsSync(sourcePath)) {
      aliases[name] = sourcePath
    }
  }
  return aliases
}
export function createShizuhaConfig({ port, serviceName }) {
  // Base path for deployment - services run at /{serviceName}/ behind nginx
  const basePath = process.env.VITE_BASE_PATH || '/'

  // Common allowed hosts for all services
  const allowedHosts = [
    'localhost',
    `shizuha-${serviceName}-frontend`,
    'nginx',
    'shizuha-nginx',
    'shizuha-nginx-dev',
    // All *.shizuha.com subdomains (Tailscale, production, staging, etc.)
    '.shizuha.com',
    // K8s service names
    `shizuha-shizuha-${serviceName}-frontend`,
    '.svc.cluster.local',
  ]

  return {
    base: basePath,
    resolve: {
      alias: {
        // Monorepo-only source aliases for HMR; empty in standalone checkouts
        // (see guardedMonorepoAliases).
        ...guardedMonorepoAliases(),
      },
      // HIVE-694 (2026-07-12): force ONE React copy. Dockerfile.prod runs
      // `npm install` inside /packages/shizuha-ui|chat and npm>=7 auto-installs
      // peerDependencies — each package gets its OWN nested react/react-dom.
      // The aliases above point at package SOURCE, so imports of 'react' from
      // inside /packages/... resolve to that nested copy under vite 6 (vite 5
      // deduped incidentally), shipping TWO reacts. The second copy's hooks
      // dispatcher is null outside its own renderer → "Cannot read properties
      // of null (reading 'useState')" crash on shizuha.com (AppSwitcher /
      // ConnectChatContext, PLAT-4316-4330 vite-6 bump fallout). dedupe pins
      // every react import to the consuming app's root copy.
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['lucide-react'],
    },
    server: {
      host: '0.0.0.0',
      port,
      allowedHosts,
      // HMR: enabled by default. Nginx proxies WebSocket upgrades for all
      // frontend locations, so HMR works through the reverse proxy.
      // Set VITE_HMR_DISABLE=true in production to disable.
      hmr: process.env.VITE_HMR_DISABLE === 'true' ? false : true,
      watch: {
        usePolling: true, // Required for Docker on some systems
        // Watch shared packages for HMR
        ignored: ['!**/node_modules/@shizuha/**'],
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
}

export default createShizuhaConfig
