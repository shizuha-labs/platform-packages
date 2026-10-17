export const WS_OPEN = 1

export function isCurrentSocket<T>(current: T | null | undefined, candidate: T): boolean {
  return current === candidate
}

export function socketIsOpen<T extends { readyState: number }>(
  ws: T | null | undefined,
): ws is T {
  return !!ws && ws.readyState === WS_OPEN
}

/** Prefer the live socket. If it is not actually OPEN, REST must send. */
export function shouldRestFallback(wsConnected: boolean, wsAccepted: boolean): boolean {
  return !wsConnected || !wsAccepted
}
