import { useState, useCallback, useRef, useEffect } from 'react'
import { Avatar } from './Avatar'
import { authHeaders as buildAuthHeaders } from '../auth'
import { sameUserId } from '../utils/ids'

interface SearchResult {
  id: number
  email: string
  username: string
  first_name: string
  last_name: string
}

interface ConnectionRequest {
  id: string
  user_a_id: number
  user_b_id: number
  requester_id: number
  requester_name: string
  status: string
  message: string
  created_at: string
}

interface NewChatModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectUser: (userId: number, details?: { name?: string; email?: string }) => void
  apiBase: string
  getAuthToken: () => string | Promise<string>
  currentUserId?: number
  extraSearch?: (query: string) => Promise<Array<Partial<SearchResult> & { userId?: number; displayName?: string }>>
}

type Tab = 'search' | 'requests'

export function NewChatModal({ isOpen, onClose, onSelectUser, apiBase, getAuthToken, currentUserId, extraSearch }: NewChatModalProps) {
  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [connectedIds, setConnectedIds] = useState<Set<number>>(new Set())
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set())
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
      loadRequests()
      loadConnections()
    }
  }, [isOpen])

  const authHeaders = useCallback(
    (options?: { forceRefresh?: boolean }) => buildAuthHeaders(getAuthToken, options),
    [getAuthToken],
  )

  const authFetch = useCallback(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let headers = await authHeaders()
    let res = await fetch(input, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } })
    if (res.status === 401) {
      headers = await authHeaders({ forceRefresh: true })
      res = await fetch(input, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } })
    }
    return res
  }, [authHeaders])

  const loadConnections = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/connections/`)
      if (res.ok) {
        const data = await res.json()
        const ids = new Set<number>()
        ;(Array.isArray(data) ? data : data.results ?? []).forEach((p: { user_id?: number }) => {
          if (p.user_id) ids.add(p.user_id)
        })
        setConnectedIds(ids)
      }
    } catch { /* ignore */ }
  }, [apiBase, authFetch])

  const loadRequests = useCallback(async () => {
    setIsLoadingRequests(true)
    try {
      const res = await authFetch(`${apiBase}/connections/requests/`)
      if (res.ok) {
        const data = await res.json()
        const reqs: ConnectionRequest[] = Array.isArray(data) ? data : data.results ?? []
        setRequests(reqs)
        const pIds = new Set<number>()
        reqs.forEach(r => {
          pIds.add(r.requester_id)
          pIds.add(r.user_a_id)
          pIds.add(r.user_b_id)
        })
        setPendingIds(pIds)
      }
    } catch { /* ignore */ }
    setIsLoadingRequests(false)
  }, [apiBase, authFetch])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setIsSearching(true)
    const ql = q.toLowerCase()
    const mergeRows = (rows: SearchResult[]) => {
      const seen = new Set<string>()
      const out: SearchResult[] = []
      for (const row of rows) {
        const key = String(row.username || row.id || '').toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(row)
      }
      return out
    }
    try {
      const headers = await authHeaders()
      let extra: SearchResult[] = []
      if (typeof extraSearch === 'function') {
        try {
          extra = (await extraSearch(q)).map((row) => ({
            id: Number(row.id ?? row.userId ?? 0),
            email: String(row.email || ''),
            username: String(row.username || ''),
            first_name: String(row.first_name || row.displayName || row.username || ''),
            last_name: String(row.last_name || ''),
          })).filter((row) => row.username && row.id)
        } catch { /* home/hive search is additive */ }
      }

      // Strategy 1: Search all platform users via shizuha-id (staff users get full list)
      try {
        const idRes = await fetch(`/id/api/auth/users/all/`, { headers })
        if (idRes.ok) {
          const data = await idRes.json()
          const allUsers: SearchResult[] = (data.users ?? [])
            .filter((u: Record<string, unknown>) => !sameUserId(u.id, currentUserId))
            .map((u: Record<string, unknown>) => ({
              id: u.id as number,
              email: (u.email ?? '') as string,
              username: (u.username ?? '') as string,
              first_name: (u.first_name ?? u.username ?? '') as string,
              last_name: (u.last_name ?? '') as string,
            }))

          const matches = allUsers.filter(u => {
            const name = `${u.first_name} ${u.last_name}`.toLowerCase().trim()
            return name.includes(ql) || u.username.toLowerCase().includes(ql) || (u.email || '').toLowerCase().includes(ql)
          })

          if (matches.length > 0 || extra.length > 0) {
            setResults(mergeRows([...extra, ...matches]))
            setIsSearching(false)
            return
          }
        }
      } catch { /* not staff or endpoint unavailable */ }

      // Strategy 2: Connect social profile search
      try {
        const res = await fetch(`${apiBase}/search/people/?q=${encodeURIComponent(q)}`, { headers })
        if (res.ok) {
          const data = await res.json()
          const people = Array.isArray(data) ? data : data.results ?? []
          if (people.length > 0 || extra.length > 0) {
            const normalized = people.map((p: Record<string, unknown>) => ({
              id: (p.user_id ?? p.id) as number,
              email: (p.email ?? '') as string,
              username: (p.username ?? '') as string,
              first_name: (p.display_name ?? p.first_name ?? p.username ?? '') as string,
              last_name: (p.last_name ?? '') as string,
            }))
            setResults(mergeRows([...extra, ...normalized]))
            setIsSearching(false)
            return
          }
        }
      } catch { /* ignore */ }

      // Strategy 3: Search conversation participants (last resort)
      const convRes = await fetch(`${apiBase}/conversations/`, { headers })
      if (convRes.ok) {
        const convs = await convRes.json()
        const convList = Array.isArray(convs) ? convs : convs.results ?? []
        const seen = new Set<number>()
        const allParticipants: SearchResult[] = []

        for (const conv of convList) {
          for (const p of conv.participants ?? []) {
            if (seen.has(p.user_id) || sameUserId(p.user_id, currentUserId)) continue
            seen.add(p.user_id)
            allParticipants.push({
              id: p.user_id,
              email: p.user_email || '',
              username: p.user_name?.toLowerCase().replace(/\s+/g, '') || '',
              first_name: p.user_name?.split(' ')[0] || '',
              last_name: p.user_name?.split(' ').slice(1).join(' ') || '',
            })
          }
        }

        const matches = allParticipants.filter(p => {
          const name = `${p.first_name} ${p.last_name}`.toLowerCase().trim()
          return name.includes(ql) || (p.username || '').toLowerCase().includes(ql)
        })
        setResults(mergeRows([...extra, ...matches]))
      } else if (extra.length > 0) {
        setResults(extra)
      }
    } catch { /* ignore */ }
    setIsSearching(false)
  }, [apiBase, authHeaders, currentUserId, extraSearch])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }, [search])

  const sendConnectionRequest = useCallback(async (userId: number) => {
    setActionInProgress(`connect-${userId}`)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${apiBase}/connections/request/${userId}/`, { method: 'POST', headers })
      if (res.ok) {
        setPendingIds(prev => { const next = new Set(prev); next.add(userId); return next })
      }
    } catch { /* ignore */ }
    setActionInProgress(null)
  }, [apiBase, authHeaders])

  const acceptRequest = useCallback(async (requestId: string, requesterId: number) => {
    setActionInProgress(`accept-${requestId}`)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${apiBase}/connections/${requestId}/accept/`, { method: 'POST', headers })
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== requestId))
        setConnectedIds(prev => { const next = new Set(prev); next.add(requesterId); return next })
      }
    } catch { /* ignore */ }
    setActionInProgress(null)
  }, [apiBase, authHeaders])

  const rejectRequest = useCallback(async (requestId: string) => {
    setActionInProgress(`reject-${requestId}`)
    try {
      const headers = await authHeaders()
      await fetch(`${apiBase}/connections/${requestId}/reject/`, { method: 'POST', headers })
      setRequests(prev => prev.filter(r => r.id !== requestId))
    } catch { /* ignore */ }
    setActionInProgress(null)
  }, [apiBase, authHeaders])

  const getUserStatus = useCallback((userId: number): 'connected' | 'pending' | 'none' => {
    if (connectedIds.has(userId)) return 'connected'
    if (pendingIds.has(userId)) return 'pending'
    return 'none'
  }, [connectedIds, pendingIds])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 sm:pt-20">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-modal-title"
        className="relative w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[80vh] flex flex-col"
      >
        {/* Header with tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <h3 id="new-chat-modal-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">New Chat</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex px-4">
            <button
              onClick={() => setTab('search')}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'search' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Search People
            </button>
            <button
              onClick={() => setTab('requests')}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors relative ${
                tab === 'requests' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Requests
              {requests.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {requests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'search' && (
            <>
              <div className="p-3">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={handleChange}
                    placeholder="Search by name, username, or email..."
                    aria-label="Search people"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              </div>

              {isSearching ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : results.length > 0 ? (
                results.map((user) => {
                  const displayName = user.first_name && user.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user.username
                  const status = getUserStatus(user.id)
                  const isSelf = sameUserId(user.id, currentUserId)

                  return (
                    <div key={user.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <Avatar name={displayName} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100 truncate font-medium">{displayName}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">@{user.username}</p>
                      </div>
                      {!isSelf && (
                        <div className="flex gap-1.5">
                          {status === 'connected' ? (
                            <button
                              onClick={() => onSelectUser(user.id, { name: displayName, email: user.email })}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
                            >
                              Message
                            </button>
                          ) : status === 'pending' ? (
                            <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500">
                              Pending
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => sendConnectionRequest(user.id)}
                                disabled={actionInProgress === `connect-${user.id}`}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                              >
                                {actionInProgress === `connect-${user.id}` ? '...' : 'Connect'}
                              </button>
                              <button
                                onClick={() => { onSelectUser(user.id, { name: displayName, email: user.email }); onClose() }}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                              >
                                Message
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              ) : query.trim() ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No users found</div>
              ) : (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Search for users by name or username
                </div>
              )}
            </>
          )}

          {tab === 'requests' && (
            <>
              {isLoadingRequests ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-brand-500 rounded-full animate-spin" />
                </div>
              ) : requests.length > 0 ? (
                requests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <Avatar name={req.requester_name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{req.requester_name}</p>
                      {req.message && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{req.message}</p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => acceptRequest(req.id, req.requester_id)}
                        disabled={actionInProgress === `accept-${req.id}`}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectRequest(req.id)}
                        disabled={actionInProgress === `reject-${req.id}`}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No pending requests
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
