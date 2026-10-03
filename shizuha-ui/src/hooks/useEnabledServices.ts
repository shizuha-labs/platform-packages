import { useMemo } from 'react'

/**
 * Decode enabled_services from the JWT access token stored in localStorage.
 * Returns the list of service slugs, or null if no token / no claim.
 */
export function useEnabledServices(): string[] | null {
  return useMemo(() => {
    try {
      const token = localStorage.getItem('shizuha_access_token')
      if (!token) return null
      const parts = token.split('.')
      if (parts.length !== 3) return null
      const payload = JSON.parse(atob(parts[1]))
      return payload.enabled_services || null
    } catch {
      return null
    }
  }, [])
}
