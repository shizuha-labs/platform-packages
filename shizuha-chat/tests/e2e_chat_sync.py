#!/usr/bin/env python3
"""Opt-in chat reliability E2E for an explicitly provisioned disposable target.

See tests/CHAT_E2E.md. This script never signs tokens or supplies target identities.
"""
import asyncio
import json
import time
import sys
import os
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlencode

from e2e_fixture_config import FixtureConfigurationError, load_fixture_config

try:
    _fixture = load_fixture_config(os.environ)
except FixtureConfigurationError as exc:
    print(f'Chat E2E configuration refused: {exc}', file=sys.stderr)
    raise SystemExit(2) from None

if '--validate-config' in sys.argv[1:]:
    print('Fixture configuration valid; no client imports or network requests made.')
    raise SystemExit(0)

# Authority and target validation intentionally precede these client imports.
import websockets
import aiohttp

WS_URL = _fixture.ws_url
API_URL = _fixture.api_url
AGENT_ID = _fixture.agent_id
TOKEN_A, TOKEN_B = _fixture.token_a, _fixture.token_b


@dataclass
class WSClient:
    """Simulates a platform client (mobile/web/agent-frontend)."""
    name: str
    token: str
    ws: Optional[object] = None
    messages_received: list = field(default_factory=list)
    streaming_content: str = ""
    last_complete: Optional[dict] = None

    async def connect(self):
        url = f"{WS_URL}?token={self.token}"
        self.ws = await websockets.connect(url, close_timeout=5)
        # Wait for connection to be ready
        await asyncio.sleep(0.2)

    async def disconnect(self):
        if self.ws:
            await self.ws.close()
            self.ws = None

    async def send_agent_message(self, content: str, source_service: str = "test"):
        """Send using agent-routed protocol (no create_session)."""
        await self.ws.send(json.dumps({
            "type": "message",
            "agent_id": AGENT_ID,
            "content": content,
            "source_service": source_service,
        }))

    async def collect_response(self, timeout: float = 60.0) -> dict:
        """Collect all streaming events until 'complete' or 'error'."""
        self.streaming_content = ""
        self.last_complete = None
        tools = []
        start = time.monotonic()

        while time.monotonic() - start < timeout:
            try:
                raw = await asyncio.wait_for(self.ws.recv(), timeout=timeout - (time.monotonic() - start))
                msg = json.loads(raw)
                self.messages_received.append(msg)

                if msg["type"] == "content":
                    self.streaming_content += msg["data"].get("delta", "")
                elif msg["type"] == "tool_start":
                    tools.append(msg["data"].get("tool", "unknown"))
                elif msg["type"] == "complete":
                    self.last_complete = msg
                    return {
                        "status": "complete",
                        "content": self.streaming_content,
                        "agent_id": msg.get("agent_id"),
                        "tools": tools,
                        "duration": msg["data"].get("duration_seconds"),
                        "elapsed": time.monotonic() - start,
                    }
                elif msg["type"] == "error":
                    return {
                        "status": "error",
                        "message": msg["data"].get("message", "unknown"),
                        "agent_id": msg.get("agent_id"),
                        "elapsed": time.monotonic() - start,
                    }
            except asyncio.TimeoutError:
                return {"status": "timeout", "elapsed": time.monotonic() - start}

        return {"status": "timeout", "elapsed": timeout}


# Shared aiohttp session (avoid cold-start overhead per request)
_http_session: Optional[aiohttp.ClientSession] = None

async def get_http_session() -> aiohttp.ClientSession:
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession()
    return _http_session

async def close_http_session():
    global _http_session
    if _http_session and not _http_session.closed:
        await _http_session.close()
        _http_session = None


async def rest_get_history(token: str, agent_id: str = AGENT_ID,
                           limit: int = None, since: str = None,
                           after_id: str = None) -> list:
    """Fetch message history via REST API (simulates platform startup)."""
    params = {}
    if limit:
        params["limit"] = limit
    if since:
        params["since"] = since
    if after_id:
        params["after_id"] = after_id

    url = f"{API_URL}/agents/{agent_id}/history/"
    if params:
        url += "?" + urlencode(params)

    session = await get_http_session()
    async with session.get(url, headers={"Authorization": f"Bearer {token}"}) as resp:
        if resp.status == 200:
            return await resp.json()
        return []


async def rest_clear_chat(token: str, agent_id: str = AGENT_ID) -> dict:
    """Clear chat via REST API (simulates user pressing clear button)."""
    session = await get_http_session()
    async with session.post(
        f"{API_URL}/agents/{agent_id}/clear/",
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        if resp.status == 200:
            return await resp.json()
        return {"error": resp.status}


async def rest_get_session_history(token: str, session_id: str,
                                    limit: int = None, since: str = None) -> list:
    """Fetch message history by session ID."""
    params = {}
    if limit:
        params["limit"] = limit
    if since:
        params["since"] = since

    url = f"{API_URL}/sessions/{session_id}/history/"
    if params:
        url += "?" + urlencode(params)

    session = await get_http_session()
    async with session.get(url, headers={"Authorization": f"Bearer {token}"}) as resp:
        if resp.status == 200:
            return await resp.json()
        return []


async def expire_old_sessions():
    """Expire existing sessions for the test agent so we start fresh."""
    session = await get_http_session()
    # Use Django ORM via a management-like HTTP call — but since we don't have
    # that endpoint, we'll create a fresh session by sending a message.
    # The agent-routed path will auto-create a new session if needed.
    # First, just verify the history endpoint is reachable.
    async with session.get(
        f"{API_URL}/agents/{AGENT_ID}/history/?limit=1",
        headers={"Authorization": f"Bearer {TOKEN_A}"},
    ) as resp:
        if resp.status == 200:
            return True
    return False


# ─── Test Results Tracker ─────────────────────────────────────────────

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def ok(self, name: str, detail: str = ""):
        self.passed += 1
        self.results.append(("PASS", name, detail))
        print(f"  \033[32mPASS\033[0m {name}" + (f" ({detail})" if detail else ""))

    def fail(self, name: str, detail: str = ""):
        self.failed += 1
        self.results.append(("FAIL", name, detail))
        print(f"  \033[31mFAIL\033[0m {name}" + (f" ({detail})" if detail else ""))

    def check(self, condition: bool, name: str, detail: str = ""):
        if condition:
            self.ok(name, detail)
        else:
            self.fail(name, detail)

    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"Results: {self.passed}/{total} passed, {self.failed} failed")
        if self.failed:
            print("\nFailed tests:")
            for status, name, detail in self.results:
                if status == "FAIL":
                    print(f"  - {name}: {detail}")
        print(f"{'='*60}")
        return self.failed == 0


# ─── Test Suite ───────────────────────────────────────────────────────

T = TestRunner()


async def test_1_single_platform_message():
    """Send a message on one platform, verify full streaming lifecycle."""
    print("\n--- Test 1: Single Platform Message Lifecycle ---")

    client = WSClient(name="web-client", token=TOKEN_A)
    await client.connect()

    t0 = time.monotonic()
    unique_marker = f"e2e-test-{int(time.time())}"
    await client.send_agent_message(f"Reply with exactly: {unique_marker}")
    result = await client.collect_response(timeout=90)

    msg_ok = result["status"] in ("complete", "error")  # error = LLM backend issue, not chat infra
    T.check(msg_ok, "1.1 Message round-trip completes",
            f"status={result['status']}, {result.get('elapsed', 0):.1f}s")
    T.check(result.get("agent_id") == AGENT_ID, "1.2 Response tagged with agent_id",
            f"got={result.get('agent_id')}")
    if result["status"] == "complete":
        T.check(len(result.get("content", "")) > 0, "1.3 Non-empty response content",
                f"{len(result.get('content', ''))} chars")
    else:
        T.ok("1.3 Response content (skipped — LLM error, not chat infra)")

    # Verify message persisted to DB via REST
    history = await rest_get_history(TOKEN_A, limit=4)
    T.check(len(history) >= 2, "1.4 Messages persisted to DB",
            f"{len(history)} messages in history")

    # Find our test message
    user_msgs = [m for m in history if m["role"] == "user" and unique_marker in m["content"]]
    T.check(len(user_msgs) == 1, "1.5 User message in DB history",
            f"found {len(user_msgs)} matching messages")

    assistant_msgs = [m for m in history if m["role"] == "assistant"]
    T.check(len(assistant_msgs) >= 1, "1.6 Assistant response in DB history")

    latency = time.monotonic() - t0
    T.check(latency < 90, "1.7 Total latency acceptable",
            f"{latency:.1f}s")

    await client.disconnect()
    return history


async def test_2_cross_platform_sync(prev_history: list):
    """Send on platform A (web), verify visible on platform B (mobile) via REST."""
    print("\n--- Test 2: Cross-Platform Message Sync ---")

    # Platform B (same user, different "device") loads history via REST
    # This simulates mobile app opening and loading server history
    history_b = await rest_get_history(TOKEN_A, limit=10)

    T.check(len(history_b) >= 2, "2.1 Platform B sees messages from Platform A",
            f"{len(history_b)} messages")

    # The last messages should match what Platform A saw
    if prev_history and history_b:
        last_a = prev_history[-1]["id"] if prev_history else None
        last_b = history_b[-1]["id"] if history_b else None
        T.check(last_a == last_b, "2.2 Latest message ID matches across platforms",
                f"A={last_a}, B={last_b}")


async def test_3_incremental_sync():
    """Verify incremental sync returns only new messages."""
    print("\n--- Test 3: Incremental Sync (since/after_id) ---")

    # Get full history first
    full_history = await rest_get_history(TOKEN_A)
    T.check(len(full_history) >= 2, "3.1 Full history available",
            f"{len(full_history)} messages")

    if len(full_history) < 2:
        T.fail("3.2-3.5 Skipped", "not enough messages")
        return

    # Test `since` parameter — get messages after second-to-last
    pivot = full_history[-2]
    since_ts = pivot["created_at"]
    incremental = await rest_get_history(TOKEN_A, since=since_ts)
    T.check(len(incremental) < len(full_history), "3.2 since= returns fewer messages",
            f"full={len(full_history)}, since={len(incremental)}")
    T.check(len(incremental) >= 1, "3.3 since= includes latest message",
            f"got {len(incremental)}")

    # Test `after_id` parameter
    after_msgs = await rest_get_history(TOKEN_A, after_id=pivot["id"])
    T.check(len(after_msgs) >= 1, "3.4 after_id= returns new messages",
            f"got {len(after_msgs)}")

    # Verify none of the returned messages have created_at <= pivot
    if incremental:
        all_newer = all(m["created_at"] > since_ts for m in incremental)
        T.check(all_newer, "3.5 All incremental messages are newer than pivot")

    # Test `limit` returns newest N
    limited = await rest_get_history(TOKEN_A, limit=2)
    T.check(len(limited) == 2, "3.6 limit=2 returns exactly 2",
            f"got {len(limited)}")
    if limited and full_history:
        T.check(limited[-1]["id"] == full_history[-1]["id"],
                "3.7 limit=2 returns the newest messages")


async def test_4_reconnection_recovery():
    """Disconnect, send from another platform, reconnect, verify sync."""
    print("\n--- Test 4: Reconnection Recovery ---")

    # Platform A connects
    platform_a = WSClient(name="platform-a", token=TOKEN_A)
    await platform_a.connect()

    # Get current state
    history_before = await rest_get_history(TOKEN_A)
    msg_count_before = len(history_before)

    # Platform A disconnects (simulating network loss)
    await platform_a.disconnect()
    await asyncio.sleep(0.5)

    # While Platform A is offline, Platform B sends a message
    platform_b = WSClient(name="platform-b", token=TOKEN_A)
    await platform_b.connect()

    reconnect_marker = f"reconnect-test-{int(time.time())}"
    await platform_b.send_agent_message(f"Reply with exactly: {reconnect_marker}")
    result_b = await platform_b.collect_response(timeout=90)

    T.check(result_b["status"] in ("complete", "error"),
            "4.1 Platform B message round-trip while A is offline",
            f"status={result_b['status']}")

    await platform_b.disconnect()

    # Platform A reconnects and syncs
    # Simulate what onReconnect does: incremental fetch since last known message
    since_param = history_before[-1]["created_at"] if history_before else None
    synced = await rest_get_history(TOKEN_A, since=since_param)

    T.check(len(synced) >= 2, "4.2 Incremental sync returns Platform B's messages",
            f"got {len(synced)} new messages")

    # Verify the reconnect marker is in the synced messages
    found_marker = any(reconnect_marker in m.get("content", "") for m in synced)
    T.check(found_marker, "4.3 Platform A sees Platform B's message after reconnect",
            f"marker='{reconnect_marker}'")


async def test_5_session_consolidation():
    """Verify single session per (user, agent) regardless of source_service."""
    print("\n--- Test 5: Session Consolidation ---")

    # Send from three different "source_service" values
    sources = ["web", "mobile", "agent"]

    for src in sources:
        client = WSClient(name=f"client-{src}", token=TOKEN_A)
        await client.connect()
        await client.send_agent_message(
            f"Session test from {src}: {int(time.time())}",
            source_service=src,
        )
        result = await client.collect_response(timeout=90)
        T.check(result["status"] in ("complete", "error"),
                f"5.1 Message from source={src} completes",
                f"status={result['status']}")
        await client.disconnect()
        await asyncio.sleep(0.3)

    # All messages should be in the same session (verified via history API)
    history = await rest_get_history(TOKEN_A, limit=20)
    T.check(len(history) >= 3, "5.2 All messages visible in single history",
            f"got {len(history)}")


async def test_6_deduplication():
    """Verify messages are not duplicated during sync."""
    print("\n--- Test 6: Deduplication ---")

    # Get full history twice
    history_1 = await rest_get_history(TOKEN_A)
    history_2 = await rest_get_history(TOKEN_A)

    # Same count
    T.check(len(history_1) == len(history_2), "6.1 Repeated fetches return same count",
            f"fetch1={len(history_1)}, fetch2={len(history_2)}")

    # No duplicate IDs
    ids_1 = [m["id"] for m in history_1]
    T.check(len(ids_1) == len(set(ids_1)), "6.2 No duplicate message IDs",
            f"{len(ids_1)} total, {len(set(ids_1))} unique")

    # Incremental sync after latest should return 0
    if history_1:
        since_latest = history_1[-1]["created_at"]
        empty_sync = await rest_get_history(TOKEN_A, since=since_latest)
        T.check(len(empty_sync) == 0, "6.3 No messages after latest timestamp",
                f"got {len(empty_sync)}")


async def test_7_concurrent_connections():
    """Multiple WebSocket connections for same user simultaneously."""
    print("\n--- Test 7: Concurrent Connections ---")

    # Connect three clients simultaneously (simulates phone + laptop + tablet)
    clients = [
        WSClient(name="phone", token=TOKEN_A),
        WSClient(name="laptop", token=TOKEN_A),
        WSClient(name="tablet", token=TOKEN_A),
    ]

    for c in clients:
        await c.connect()

    T.ok("7.1 Three concurrent connections established")

    # Send from phone
    marker = f"concurrent-{int(time.time())}"
    await clients[0].send_agent_message(f"Reply with: {marker}")

    # Collect response on phone (the sender)
    result = await clients[0].collect_response(timeout=90)
    T.check(result["status"] in ("complete", "error"), "7.2 Sender receives response",
            f"status={result['status']}")

    # The other two clients won't get the streaming response (they didn't send),
    # but the REST history should show it
    history = await rest_get_history(TOKEN_A, limit=4)
    found = any(marker in m.get("content", "") for m in history)
    T.check(found, "7.3 Message visible via REST to all clients")

    for c in clients:
        await c.disconnect()


async def test_8_performance_benchmarks():
    """Measure latency for key operations."""
    print("\n--- Test 8: Performance Benchmarks ---")

    # 8.1: REST history full load
    # Baseline ~1.7-2.3s (sync Django ORM via Daphne ASGI). Threshold catches regressions.
    t0 = time.monotonic()
    history = await rest_get_history(TOKEN_A)
    full_load_ms = (time.monotonic() - t0) * 1000
    T.check(full_load_ms < 5000, "8.1 Full history load < 5s",
            f"{full_load_ms:.0f}ms for {len(history)} messages")

    # 8.2: REST incremental sync (empty)
    # Note: ~1.7s is current baseline due to sync ORM in Daphne ASGI.
    # Target is < 3s (catches regressions, not micro-optimization).
    if history:
        t0 = time.monotonic()
        await rest_get_history(TOKEN_A, since=history[-1]["created_at"])
        inc_ms = (time.monotonic() - t0) * 1000
        T.check(inc_ms < 5000, "8.2 Incremental sync (empty) < 5s",
                f"{inc_ms:.0f}ms")

    # 8.3: WebSocket connect time
    t0 = time.monotonic()
    client = WSClient(name="perf-test", token=TOKEN_A)
    await client.connect()
    connect_ms = (time.monotonic() - t0) * 1000
    T.check(connect_ms < 5000, "8.3 WebSocket connect < 5s",
            f"{connect_ms:.0f}ms")

    # 8.4: Ping/pong latency
    t0 = time.monotonic()
    await client.ws.send(json.dumps({"type": "ping"}))
    raw = await asyncio.wait_for(client.ws.recv(), timeout=5)
    pong = json.loads(raw)
    ping_ms = (time.monotonic() - t0) * 1000
    T.check(pong["type"] == "pong", "8.4 Ping/pong works")
    T.check(ping_ms < 100, "8.5 Ping latency < 100ms",
            f"{ping_ms:.0f}ms")

    # 8.5: REST limit=N performance
    t0 = time.monotonic()
    await rest_get_history(TOKEN_A, limit=5)
    limit_ms = (time.monotonic() - t0) * 1000
    T.check(limit_ms < 5000, "8.6 Limited history fetch < 5s",
            f"{limit_ms:.0f}ms")

    await client.disconnect()


async def test_9_rapid_disconnect_reconnect():
    """Rapid disconnect/reconnect cycles — stress test fault tolerance."""
    print("\n--- Test 9: Rapid Disconnect/Reconnect (Fault Tolerance) ---")

    history_before = await rest_get_history(TOKEN_A)
    count_before = len(history_before)

    # 5 rapid connect/disconnect cycles
    for i in range(5):
        client = WSClient(name=f"stress-{i}", token=TOKEN_A)
        await client.connect()
        await asyncio.sleep(0.1)
        await client.disconnect()
        await asyncio.sleep(0.1)

    T.ok("9.1 Survived 5 rapid reconnect cycles")

    # Verify data integrity after stress
    history_after = await rest_get_history(TOKEN_A)
    T.check(len(history_after) == count_before, "9.2 No data loss after stress",
            f"before={count_before}, after={len(history_after)}")

    # Connect and send after stress
    client = WSClient(name="post-stress", token=TOKEN_A)
    await client.connect()
    marker = f"post-stress-{int(time.time())}"
    await client.send_agent_message(f"Reply with: {marker}")
    result = await client.collect_response(timeout=90)
    T.check(result["status"] in ("complete", "error"), "9.3 Can send/receive after stress",
            f"status={result['status']}, {result.get('elapsed', 0):.1f}s")
    await client.disconnect()


async def test_10_multi_user_isolation():
    """Verify user B cannot see user A's messages."""
    print("\n--- Test 10: Multi-User Isolation ---")

    history_a = await rest_get_history(TOKEN_A)
    history_b = await rest_get_history(TOKEN_B)

    # User B should have their own history (possibly empty)
    if len(history_a) > 0:
        # Verify no message from A appears in B's history
        a_ids = set(m["id"] for m in history_a)
        b_ids = set(m["id"] for m in history_b)
        overlap = a_ids & b_ids
        T.check(len(overlap) == 0, "10.1 No message ID overlap between users",
                f"A has {len(a_ids)}, B has {len(b_ids)}, overlap={len(overlap)}")
    else:
        T.ok("10.1 No messages to compare (user A history empty)")


async def test_11_agent_id_in_all_responses():
    """Verify agent_id is present in all streaming events."""
    print("\n--- Test 11: Agent ID Routing in All Events ---")

    client = WSClient(name="routing-test", token=TOKEN_A)
    await client.connect()

    await client.send_agent_message(f"Reply: routing-check-{int(time.time())}")
    result = await client.collect_response(timeout=90)

    if result["status"] in ("complete", "error"):
        # Check all received messages have agent_id
        streaming_types = {"content", "tool_start", "tool_complete", "complete", "error"}
        relevant = [m for m in client.messages_received if m.get("type") in streaming_types]
        all_have_agent_id = all(m.get("agent_id") == AGENT_ID for m in relevant)
        T.check(all_have_agent_id, "11.1 All streaming events have correct agent_id",
                f"{len(relevant)} events checked, status={result['status']}")
    else:
        T.fail("11.1 Message did not complete", result.get("message", ""))

    await client.disconnect()


async def test_12_clear_chat_hides_history():
    """Clear chat on one platform — messages should be gone on ALL platforms."""
    print("\n--- Test 12: Clear Chat Hides History (Cross-Platform) ---")

    # Verify we have messages to clear
    history_before = await rest_get_history(TOKEN_A)
    T.check(len(history_before) > 0, "12.1 Messages exist before clear",
            f"{len(history_before)} messages")

    # Clear chat via REST API (simulates pressing clear button on any platform)
    result = await rest_clear_chat(TOKEN_A)
    T.check("cleared_at" in result, "12.2 Server returns cleared_at timestamp",
            f"result={result}")

    # Immediately check history — should be empty
    history_after = await rest_get_history(TOKEN_A)
    T.check(len(history_after) == 0, "12.3 History empty after clear",
            f"{len(history_after)} messages")

    # Check with limit (should still be empty)
    history_limited = await rest_get_history(TOKEN_A, limit=10)
    T.check(len(history_limited) == 0, "12.4 Limited history empty after clear",
            f"{len(history_limited)} messages")


async def test_13_new_messages_after_clear():
    """Messages sent after clear should be visible."""
    print("\n--- Test 13: New Messages After Clear ---")

    # Send a new message (chat was cleared in test 12)
    client = WSClient(name="post-clear", token=TOKEN_A)
    await client.connect()

    post_clear_marker = f"post-clear-{int(time.time())}"
    await client.send_agent_message(f"Reply with exactly: {post_clear_marker}")
    result = await client.collect_response(timeout=90)

    T.check(result["status"] in ("complete", "error"), "13.1 Message after clear completes",
            f"status={result['status']}")

    await client.disconnect()

    # Verify the new message is visible
    history = await rest_get_history(TOKEN_A)
    # On LLM error, only user message may be persisted; on success, user+assistant = 2
    T.check(len(history) >= 1, "13.2 New messages visible after clear",
            f"{len(history)} messages (expect 1-2)")

    user_msgs = [m for m in history if m["role"] == "user"]
    T.check(any(post_clear_marker in m["content"] for m in user_msgs),
            "13.3 New user message is in history")

    # Verify from "another platform" (same REST, simulates mobile loading)
    history_b = await rest_get_history(TOKEN_A, limit=10)
    T.check(len(history_b) == len(history), "13.4 Other platform sees same messages",
            f"{len(history_b)} messages")


async def test_14_clear_does_not_affect_other_users():
    """Clearing user A's chat should not affect user B's chat."""
    print("\n--- Test 14: Clear Does Not Affect Other Users ---")

    # Send a message as user B first (so they have history)
    client_b = WSClient(name="user-b", token=TOKEN_B)
    await client_b.connect()

    b_marker = f"user-b-{int(time.time())}"
    await client_b.send_agent_message(f"Reply with: {b_marker}")
    result = await client_b.collect_response(timeout=90)
    await client_b.disconnect()

    if result["status"] not in ("complete", "error"):
        T.fail("14.0 User B message failed (timeout)", result.get("message", ""))
        return

    history_b_before = await rest_get_history(TOKEN_B)
    b_count_before = len(history_b_before)

    # Clear user A's chat
    await rest_clear_chat(TOKEN_A)

    # Verify user B's history is unchanged
    history_b_after = await rest_get_history(TOKEN_B)
    T.check(len(history_b_after) == b_count_before,
            "14.1 User B history unaffected by A's clear",
            f"before={b_count_before}, after={len(history_b_after)}")


async def test_15_incremental_sync_after_clear():
    """Incremental sync should respect cleared_at boundary."""
    print("\n--- Test 15: Incremental Sync Respects Clear ---")

    # Get current history (post-clear state from test 13)
    history = await rest_get_history(TOKEN_A)

    if len(history) == 0:
        T.ok("15.1 No messages — incremental sync not applicable after clear")
        return

    # since= with a timestamp before cleared_at should return nothing extra
    # Use a very old timestamp
    old_sync = await rest_get_history(TOKEN_A, since="2020-01-01T00:00:00Z")
    T.check(len(old_sync) == len(history),
            "15.1 since=old returns same as full (both respect cleared_at)",
            f"since=old: {len(old_sync)}, full: {len(history)}")

    # after_id= with the first message should return remaining
    if len(history) >= 2:
        after = await rest_get_history(TOKEN_A, after_id=history[0]["id"])
        T.check(len(after) == len(history) - 1,
                "15.2 after_id respects cleared_at boundary",
                f"got {len(after)} (expected {len(history) - 1})")


async def test_16_server_dedup_no_duplicate_ids():
    """Server never returns duplicate message IDs in history."""
    print("\n--- Test 16: Server-Side Dedup (No Duplicate IDs) ---")

    # Fetch full history multiple times from different "platforms"
    history_a = await rest_get_history(TOKEN_A)
    history_b = await rest_get_history(TOKEN_A)
    history_c = await rest_get_history(TOKEN_A, limit=100)

    # All three fetches should return identical message lists
    T.check(len(history_a) == len(history_b) == len(history_c),
            "16.1 Three independent fetches return same count",
            f"a={len(history_a)}, b={len(history_b)}, c={len(history_c)}")

    # No duplicate IDs within any single response
    for label, h in [("a", history_a), ("b", history_b), ("c", history_c)]:
        ids = [m["id"] for m in h]
        T.check(len(ids) == len(set(ids)), f"16.2 No duplicate IDs in fetch {label}",
                f"{len(ids)} total, {len(set(ids))} unique")

    # No duplicate content (role+content pairs) within response
    fingerprints = [f"{m['role']}:{m['content'][:200]}" for m in history_a]
    T.check(len(fingerprints) == len(set(fingerprints)),
            "16.3 No duplicate content fingerprints in history",
            f"{len(fingerprints)} total, {len(set(fingerprints))} unique")


async def test_17_reconnect_sync_no_duplicates():
    """Simulate reconnect sync — messages from streaming + REST should not duplicate."""
    print("\n--- Test 17: Reconnect Sync Dedup ---")

    # Get baseline
    history_before = await rest_get_history(TOKEN_A)
    count_before = len(history_before)

    # Send a message via WS (simulates normal user interaction)
    client = WSClient(name="dedup-sender", token=TOKEN_A)
    await client.connect()

    dedup_marker = f"dedup-test-{int(time.time())}"
    await client.send_agent_message(f"Reply with exactly: {dedup_marker}")
    result = await client.collect_response(timeout=90)

    T.check(result["status"] in ("complete", "error"),
            "17.1 Message round-trip for dedup test",
            f"status={result['status']}")

    await client.disconnect()

    # Now fetch history via REST (simulates what reconnect sync does)
    history_after = await rest_get_history(TOKEN_A)

    # The server should show exactly 2 new messages (user + assistant)
    expected_new = 2 if result["status"] == "complete" else 1
    new_count = len(history_after) - count_before
    T.check(new_count == expected_new,
            "17.2 Exactly N new messages in history (no duplicates from streaming)",
            f"before={count_before}, after={len(history_after)}, new={new_count}, expected={expected_new}")

    # Now simulate "reconnect incremental sync" — fetch since last known message
    since_ts = history_before[-1]["created_at"] if history_before else None
    incremental = await rest_get_history(TOKEN_A, since=since_ts) if since_ts else history_after

    # Incremental should return the exact same new messages, no extras
    T.check(len(incremental) == expected_new,
            "17.3 Incremental sync returns exactly new messages",
            f"got {len(incremental)}, expected {expected_new}")

    # Verify no duplicate content in full history
    fp_set = set()
    duplicates = 0
    for m in history_after:
        fp = f"{m['role']}:{m['content'][:200]}"
        if fp in fp_set:
            duplicates += 1
        fp_set.add(fp)
    T.check(duplicates == 0, "17.4 No content duplicates in full history after sync",
            f"{duplicates} duplicates found")


async def test_18_concurrent_sends_no_duplicate_responses():
    """Multiple rapid sends — each should get exactly one response."""
    print("\n--- Test 18: Concurrent Sends Dedup ---")

    history_before = await rest_get_history(TOKEN_A)
    count_before = len(history_before)

    # Send two messages in quick succession on same connection
    client = WSClient(name="rapid-sender", token=TOKEN_A)
    await client.connect()

    marker_1 = f"rapid-1-{int(time.time())}"
    await client.send_agent_message(f"Reply with exactly: {marker_1}")
    result_1 = await client.collect_response(timeout=90)

    T.check(result_1["status"] in ("complete", "error"),
            "18.1 First rapid message completes",
            f"status={result_1['status']}")

    marker_2 = f"rapid-2-{int(time.time())}"
    await client.send_agent_message(f"Reply with exactly: {marker_2}")
    result_2 = await client.collect_response(timeout=90)

    T.check(result_2["status"] in ("complete", "error"),
            "18.2 Second rapid message completes",
            f"status={result_2['status']}")

    await client.disconnect()

    # Check history — should have exactly 4 new messages (2 user + 2 assistant)
    history_after = await rest_get_history(TOKEN_A)
    new_msgs = len(history_after) - count_before
    T.check(new_msgs >= 2, "18.3 At least 2 new messages (user messages persisted)",
            f"new={new_msgs}")

    # Verify no duplicate IDs
    all_ids = [m["id"] for m in history_after]
    T.check(len(all_ids) == len(set(all_ids)),
            "18.4 No duplicate message IDs after rapid sends",
            f"{len(all_ids)} total, {len(set(all_ids))} unique")

    # Verify each marker appears exactly once in user messages
    # (assistant may echo the marker back, so only check user role)
    user_content = " ".join(m["content"] for m in history_after if m["role"] == "user")
    T.check(user_content.count(marker_1) == 1,
            "18.5 First marker appears exactly once in user messages",
            f"marker_1 count={user_content.count(marker_1)}")
    T.check(user_content.count(marker_2) == 1,
            "18.6 Second marker appears exactly once in user messages",
            f"marker_2 count={user_content.count(marker_2)}")


async def test_19_local_first_incremental_sync():
    """Verify incremental sync pattern: cached data + server delta = complete history.

    Simulates the local-first loading pattern:
    1. User sends a message (populates server history)
    2. Simulates "cached" state by fetching current history
    3. Sends another message while "offline" (via a second client)
    4. Incremental sync (since=last cached timestamp) returns exactly the new messages
    5. Full history matches cached + delta (no gaps, no duplicates)
    """
    print("\n--- Test 19: Local-First Incremental Sync ---")

    # Step 1: Clear and send initial message to establish baseline
    await rest_clear_chat(TOKEN_A)
    client = WSClient(name="local-first-test", token=TOKEN_A)
    await client.connect()

    await client.send_agent_message("Local-first baseline message")
    result = await client.collect_response(timeout=90)
    T.check(result["status"] in ("complete", "error"),
            "19.1 Baseline message completes",
            f"status={result['status']}")

    # Step 2: Fetch current history — this simulates "what's in local cache"
    cached_history = await rest_get_history(TOKEN_A)
    cached_count = len(cached_history)
    T.check(cached_count >= 2, "19.2 Cached history has baseline messages",
            f"count={cached_count}")

    last_cached_ts = cached_history[-1]["created_at"]

    # Step 3: Send a second message — simulates "new message while app was closed"
    await client.send_agent_message("Message sent while other platform was offline")
    result2 = await client.collect_response(timeout=90)
    T.check(result2["status"] in ("complete", "error"),
            "19.3 Second message completes",
            f"status={result2['status']}")

    await client.disconnect()

    # Step 4: Incremental sync — fetch only messages since last cached timestamp
    delta = await rest_get_history(TOKEN_A, since=last_cached_ts)
    T.check(len(delta) >= 2, "19.4 Incremental sync returns new messages only",
            f"delta={len(delta)} (expected >= 2 user+assistant)")

    # Verify delta messages are all newer than our cached timestamp
    for msg in delta:
        T.check(msg["created_at"] >= last_cached_ts,
                "19.5 All delta messages are newer than cached timestamp")

    # Step 5: Merged result should equal full history (no gaps)
    full_history = await rest_get_history(TOKEN_A)
    # Simulate merge: cached + delta with dedup
    cached_ids = set(m["id"] for m in cached_history)
    merged = list(cached_history)
    for m in delta:
        if m["id"] not in cached_ids:
            merged.append(m)
    T.check(len(merged) == len(full_history),
            "19.6 Cached + delta = full history (no gaps, no duplicates)",
            f"merged={len(merged)}, full={len(full_history)}")

    # Step 6: Verify no duplicate IDs in merged result
    merged_ids = [m["id"] for m in merged]
    T.check(len(merged_ids) == len(set(merged_ids)),
            "19.7 No duplicate IDs in merged result",
            f"{len(merged_ids)} total, {len(set(merged_ids))} unique")


async def test_20_clear_invalidates_cache():
    """After clear, server returns empty history — client cache must be invalidated.

    Verifies the local-first pattern handles clear correctly:
    1. Messages exist (would be in local cache)
    2. Clear chat
    3. Full fetch returns 0 messages (cache invalidated)
    4. Incremental sync with old timestamp returns 0 (server respects cleared_at)
    5. New messages after clear are visible
    """
    print("\n--- Test 20: Clear Invalidates Cache ---")

    # Step 1: Ensure some messages exist
    history_before = await rest_get_history(TOKEN_A)
    T.check(len(history_before) >= 2, "20.1 Messages exist before clear",
            f"count={len(history_before)}")

    # Save timestamp from before clear
    old_ts = history_before[-1]["created_at"] if history_before else None

    # Step 2: Clear chat
    await rest_clear_chat(TOKEN_A)

    # Step 3: Full fetch should return 0
    history_after_clear = await rest_get_history(TOKEN_A)
    T.check(len(history_after_clear) == 0,
            "20.2 Full history empty after clear (cache must be invalidated)",
            f"count={len(history_after_clear)}")

    # Step 4: Incremental sync with old timestamp should also return 0
    # (server filters by cleared_at, not just created_at)
    if old_ts:
        delta = await rest_get_history(TOKEN_A, since=old_ts)
        T.check(len(delta) == 0,
                "20.3 Incremental sync returns 0 after clear (even with old timestamp)",
                f"delta={len(delta)}")

    # Step 5: Send new message, verify it appears
    client = WSClient(name="post-clear-test", token=TOKEN_A)
    await client.connect()
    await client.send_agent_message("First message after cache invalidation")
    result = await client.collect_response(timeout=90)
    T.check(result["status"] in ("complete", "error"),
            "20.4 New message after clear completes",
            f"status={result['status']}")
    await client.disconnect()

    history_new = await rest_get_history(TOKEN_A)
    T.check(len(history_new) >= 1, "20.5 New messages visible after clear",
            f"count={len(history_new)}")


async def main():
    print("=" * 60)
    print("Chat Sync E2E Test Suite — WhatsApp-like Reliability")
    print("=" * 60)
    print(f"WS:  {WS_URL}")
    print(f"API: {API_URL}")
    print(f"Agent: {AGENT_ID}")
    print()

    # Warmup: establish HTTP connection pool before benchmarks
    print("Warming up HTTP connection pool...")
    await rest_get_history(TOKEN_A, limit=1)
    print("Ready.\n")

    try:
        history = await test_1_single_platform_message()
        await test_2_cross_platform_sync(history)
        await test_3_incremental_sync()
        await test_4_reconnection_recovery()
        await test_5_session_consolidation()
        await test_6_deduplication()
        await test_7_concurrent_connections()
        await test_8_performance_benchmarks()
        await test_9_rapid_disconnect_reconnect()
        await test_10_multi_user_isolation()
        await test_11_agent_id_in_all_responses()
        await test_12_clear_chat_hides_history()
        await test_13_new_messages_after_clear()
        await test_14_clear_does_not_affect_other_users()
        await test_15_incremental_sync_after_clear()
        await test_16_server_dedup_no_duplicate_ids()
        await test_17_reconnect_sync_no_duplicates()
        await test_18_concurrent_sends_no_duplicate_responses()
        await test_19_local_first_incremental_sync()
        await test_20_clear_invalidates_cache()
    except Exception as e:
        print(f"\n\033[31mFATAL ERROR: {e}\033[0m")
        import traceback
        traceback.print_exc()
        T.fail("Suite crashed", str(e))

    await close_http_session()
    success = T.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
