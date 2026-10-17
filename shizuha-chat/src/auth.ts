const ACCESS_TOKEN_KEY = 'shizuha_access_token'
const REFRESH_TOKEN_KEY = 'shizuha_refresh_token'
const REFRESH_SKEW_MS = 120_000

type GetAuthToken = () => string | Promise<string>

let refreshPromise: Promise<string | null> | null = null

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(window.atob(padded)) as { exp?: number }
  } catch {
    return null
  }
}

function tokenExpiresSoon(token: string, skewMs = REFRESH_SKEW_MS): boolean {
  if (!hasBrowserStorage()) return false
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 - Date.now() <= skewMs
}

function refreshEndpoints(): string[] {
  if (typeof window === 'undefined') return ['/id/api/auth/refresh/']
  const origin = window.location.origin.replace(/\/$/, '')
  return [
    `${origin}/id/api/auth/refresh/`,
    `${origin}/api/auth/refresh/`,
    `${origin}/auth/refresh/`,
  ]
}

async function refreshStoredToken(): Promise<string | null> {
  if (!hasBrowserStorage()) return null
  const refresh = window.localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refresh) return null

  if (!refreshPromise) {
    refreshPromise = (async () => {
      for (const url of refreshEndpoints()) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh }),
          })
          if (!response.ok) continue
          const data = await response.json()
          const accessToken = data.access || data.access_token
          const refreshToken = data.refresh || data.refresh_token
          if (typeof accessToken !== 'string' || !accessToken) continue
          window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
          if (typeof refreshToken === 'string' && refreshToken) {
            window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
          }
          return accessToken
        } catch {
          // Try the next compatible Shizuha ID refresh endpoint.
        }
      }
      return null
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

export async function getFreshAuthToken(getAuthToken: GetAuthToken, options: { forceRefresh?: boolean } = {}): Promise<string> {
  const token = await getAuthToken()
  const stored = hasBrowserStorage() ? window.localStorage.getItem(ACCESS_TOKEN_KEY) || '' : ''
  const current = token || stored

  if ((options.forceRefresh || (current && tokenExpiresSoon(current))) && hasBrowserStorage()) {
    const refreshed = await refreshStoredToken()
    if (refreshed) return refreshed
    if (options.forceRefresh || tokenExpiresSoon(current, 0)) {
      throw new Error('Authentication token expired and refresh failed')
    }
  }

  return current
}

export async function authHeaders(getAuthToken: GetAuthToken, options: { forceRefresh?: boolean } = {}): Promise<Record<string, string>> {
  const token = await getFreshAuthToken(getAuthToken, options)
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}
