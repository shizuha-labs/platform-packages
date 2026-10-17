import type { ConnectMessage, OptimisticMessage } from '../types'

/**
 * CON-283: pure state transitions for the WS ack-timeout / retry flow in
 * @shizuha/chat. Extracted from useMessages so the reliability logic is
 * unit-testable in CI (plain node, no React renderer needed).
 */

/**
 * Mark a message failed when its WS ack times out (ACK_TIMEOUT_MS elapsed with
 * no `new_message` echo). Guarded to only fire while the message is still an
 * unconfirmed optimistic send (_optimistic && _sending) — a `new_message` echo
 * (addMessage) or `send_error` that already reconciled/cleared it must NOT be
 * double-marked.
 */
export function markAckTimedOut<T extends ConnectMessage | OptimisticMessage>(
  messages: T[],
  clientMessageId: string,
): T[] {
  return messages.map((m) =>
    m.client_message_id === clientMessageId
      && (m as OptimisticMessage)._optimistic
      && (m as OptimisticMessage)._sending
      ? { ...m, _sending: false, _failed: true }
      : m,
  )
}

/**
 * CON-283: retry a failed message reusing the SAME client_message_id so the
 * server's unique_client_message_per_conversation idempotency dedupes any
 * duplicate that may have actually landed despite the perceived failure.
 * Flips the bubble back to _sending (clearing _failed) for the retry attempt.
 */
export function markRetrying<T extends ConnectMessage | OptimisticMessage>(
  messages: T[],
  clientMessageId: string,
): T[] {
  return messages.map((m) =>
    m.client_message_id === clientMessageId
      ? { ...m, _failed: false, _sending: true }
      : m,
  )
}
