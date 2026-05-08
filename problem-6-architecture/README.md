# Scoreboard Module — Specification

**Owner:** Sy Truong
**Audience:** Backend engineering team

---

## 1. Purpose

This module is responsible for everything related to the public scoreboard:

- Accepting score-increment requests when a user completes an action.
- Enforcing that only the legitimate, authenticated user can increase their own score.
- Maintaining the **Top 10** ranking with low read latency.
- Pushing **live updates** to all connected scoreboard clients whenever the Top 10 changes.

The action itself is out of scope — we treat it as an opaque event. This module only cares about *what counts as a valid completion* and *how the score is recorded and broadcast*.

---

## 2. Scope

### In scope

- HTTP endpoints for fetching the scoreboard and submitting completed actions.
- A live-update channel (SSE) for the scoreboard page.
- Authentication & authorisation of score updates.
- Anti-tampering measures (action tokens, idempotency, rate limiting).
- Persistence of scores and an in-memory cache of the Top 10.

### Out of scope

- The action itself (game logic, quest mechanics, etc.).
- User registration, login, password reset — assumed to exist already and to issue the JWTs we consume.
- The frontend implementation of the scoreboard page.
- Historical analytics / leaderboards beyond Top 10 (could be a future module — see §10).

---

## 3. Glossary

| Term             | Meaning                                                                                            |
|------------------|----------------------------------------------------------------------------------------------------|
| **Action**       | An opaque user-facing task whose completion is worth points. The module never inspects what it is. |
| **Action token** | Short-lived signed token issued when the user *starts* an action. Required to claim the points.    |
| **Score delta**  | The number of points an action is worth. Determined server-side, not by the client.                |
| **Top 10**       | The ten users with the highest current scores, ordered descending. Ties broken by *earliest to     |
|                  |  reach the score* (i.e. order ` older`updated_at`wins).                                            |
| **Live update**  | A server-pushed message to subscribed clients when the Top 10 changes.                             |

---

## 4. High-level architecture

```
┌──────────────┐                         ┌──────────────────────┐
│   Browser    │ ─── GET /scoreboard ──► │                      │
│ (scoreboard  │ ◄── SSE stream ──────── │   Scoreboard Module  │
│   page)      │                         │   (this spec)        │
└──────────────┘                         │                      │
                                         │  ┌────────────────┐  │
┌──────────────┐                         │  │ HTTP handlers  │  │
│   Browser    │ ── POST /actions/start ►│  │ Score service  │  │
│  (action     │ ◄── action_token ─────  │  │ Pub/Sub        │  │
│   page)      │                         │  └────────┬───────┘  │
│              │ ── POST /actions/       │           │          │
│              │       complete ────────►│           │          │
└──────────────┘                         └───────────┼──────────┘
                                                     │
                                       ┌─────────────┴──────────────┐
                                       │                            │
                                  ┌────▼────┐                ┌──────▼─────┐
                                  │  Redis  │                │ PostgreSQL │
                                  │ ZSET +  │                │ source of  │
                                  │ pub/sub │                │   truth    │
                                  └─────────┘                └────────────┘
```

See `scoreboard_flow.excalidraw` for the standalone diagram file.

### Why this split

- **Postgres** is the source of truth for scores. It survives restarts and gives us transactional guarantees (idempotency, audit trail).
- **Redis sorted set (ZSET)** holds the live ranking. `ZADD` / `ZREVRANGE` give us O(log N) updates and O(log N + 10) reads, which is what makes the scoreboard cheap to serve.
- **Redis Pub/Sub** is the fan-out for SSE. The instance that processes the score update publishes to a channel; every API instance with subscribed SSE clients forwards the message. This keeps the live-update path horizontally scalable without sticky sessions.

---

## 5. Data model

### 5.1 PostgreSQL

```sql
-- Authoritative store for current score per user.
CREATE TABLE user_scores (
    user_id        UUID PRIMARY KEY REFERENCES users(id),
    score          BIGINT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_scores_score_idx
    ON user_scores (score DESC, updated_at ASC);

-- Append-only audit log of every score change. Used for idempotency,
-- abuse investigation, and to rebuild the Redis ZSET after a flush.
CREATE TABLE score_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    action_token_id UUID NOT NULL UNIQUE,   -- enforces "one token, one credit"
    delta           INTEGER NOT NULL CHECK (delta > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX score_events_user_idx ON score_events (user_id, created_at DESC);
```

The `UNIQUE` constraint on `action_token_id` is the linchpin of idempotency: if the same completion request arrives twice (network retry, double click, attacker replay), the second insert fails and we know not to double-credit.

### 5.2 Redis

| Key                         | Type            | Purpose                                                                                |
|-----------------------------|-----------------|----------------------------------------------------------------------------------------|
| `scoreboard:zset`           | ZSET            | `member = user_id`, `score = score`. Truncated to top ~100 members for memory bound    |
|                             |                 | (see section 10)                                                                       |
| `scoreboard:user:{user_id}` | HASH            | Cached display name + avatar URL for Top 10 members, TTL 1h. Avoids a Postgres join on |
|                             |                 | every read.                                                                            |
| `scoreboard:channel`        | Pub/Sub channel | Broadcasts Top 10 change events to all API instances.                                  |
| `action_token:{token_id}`   | STRING          | The short-lived action token's metadata (user_id, action_type, issued_at). TTL = token |
|                             |                 | lifetime.

---

## 6. API surface

All endpoints are under `/api/v1` and require a valid user JWT in `Authorization: Bearer <jwt>` unless stated otherwise.

### 6.1 `GET /scoreboard`

Returns the current Top 10.

**Response 200:**
```json
{
  "top": [
    { "rank": 1, "user_id": "…", "display_name": "…", "score": 1820 },
    …
  ],
  "generated_at": "2026-05-04T08:13:11Z"
}
```

Served from Redis. Should respond in single-digit milliseconds. Public endpoint — no auth required (the scoreboard is shown on the public website).

### 6.2 `GET /scoreboard/stream`  (Server-Sent Events)

Opens a long-lived SSE connection. The server pushes one event per Top 10 change:

```
event: scoreboard.update
data: {"top": [...], "generated_at": "..."}
```

A heartbeat comment (`: ping\n\n`) is sent every 20 seconds to keep proxies from closing the connection.

Public endpoint. Implementation backed by a per-instance subscription to the `scoreboard:channel` Redis Pub/Sub channel.

> **Why SSE and not WebSockets?** The traffic is one-directional (server → client), the payload is small, SSE auto-reconnects in browsers, and it works through ordinary HTTP proxies and load balancers without protocol upgrades. WebSockets would be the right call if we ever need bidirectional or binary traffic — see §10.

### 6.3 `POST /actions/start`

Called by the client when the user *begins* an action. Returns an action token that must be presented on completion.

**Request:**
```json
{ "action_type": "daily_quiz" }
```

**Response 201:**
```json
{
  "action_token": "<JWT, ~5 min TTL>",
  "expires_at": "2026-05-04T08:18:00Z"
}
```

The action token is a JWT signed with a server-side key. Its claims include:

- `jti` — unique token id (UUID), used as the idempotency key.
- `sub` — the user id from the caller's JWT.
- `action_type` — the type of action.
- `delta` — the points the action is worth, **decided server-side** based on `action_type`.
- `iat`, `exp` — issued/expiry timestamps.

Auth required.

### 6.4 `POST /actions/complete`

Called by the client when the action is finished, presenting the action token.

**Request:**
```json
{ "action_token": "<jwt from /actions/start>" }
```

**Server-side validation (in this exact order — fail fast):**

1. Caller's JWT is valid and not expired.
2. The action token is a valid JWT under our signing key.
3. `action_token.sub == caller.user_id`. _A user may only redeem their own token._
4. `action_token.exp` has not passed.
5. `INSERT INTO score_events (..., action_token_id = jti, ...)` succeeds (i.e. this `jti` has not been used before). **This is the idempotency check.** Any unique-constraint violation is a definitive "already credited" — return 409.
6. `UPDATE user_scores SET score = score + delta, updated_at = now() WHERE user_id = ...` in the same transaction.
7. Update Redis ZSET (`ZADD scoreboard:zset <new_score> <user_id>`).
8. If the change affects the Top 10, publish a `scoreboard.update` message on `scoreboard:channel`.

**Response 200:** `{ "score": 1820, "rank": 7 }` (rank is `null` if user is outside Top 10).

**Response 409:** `{ "error": "token_already_redeemed" }`.

Auth required.

---

## 7. Security & anti-cheat

This is the part of the requirements that needs the most defensive thinking. The naive "client POSTs `{user_id, +10}`" design is trivially exploited: anyone with browser dev tools can replay or forge requests. The measures below stack so that compromising one does not break the system.

| Threat | Mitigation |
|--------|------------|
| Forged user identity | JWT signed by auth service; we verify signature and `aud` claim. Score is always credited to `caller.sub`, never to a `user_id` passed in the body. |
| Forged or inflated score deltas | The client never tells us the delta. The action token, signed by *us*, carries the delta, which we set from a server-side table keyed by `action_type`. |
| Replay of a completion request | `score_events.action_token_id` is `UNIQUE`. Second redemption of the same token returns 409. |
| Token theft (using someone else's action token) | We require `action_token.sub == caller.sub`. The token is bound to its issuer. |
| Skipping the action entirely (claiming completion instantly after start) | If certain action types have a known minimum duration, enforce `now() - action_token.iat >= min_duration[action_type]` at completion time. Configurable per action type. |
| Rate / volume abuse | Rate-limit `/actions/start` and `/actions/complete` per user (e.g. 60/min) and per IP. Block obvious anomalies (e.g. 1000 completions/min by one user) and alert. |
| Eavesdropping | TLS only — reject plain HTTP at the load balancer. |
| Long-lived stolen tokens | Action tokens expire in ~5 min. User JWTs have their normal short lifetime. |

> Note for the team: none of this prevents a user from automating the action *itself* (e.g. scripting their browser to actually play through the action). That's a game-design / bot-detection problem, not an API problem, and is explicitly out of scope here. We should make this trade-off explicit with product before launch.

---

## 8. Live update flow

The interesting subtlety is **avoiding broadcast storms**. If user #437 (currently rank 50,000) gains 10 points, no scoreboard viewer needs to know. We only publish when the *visible Top 10* changes.

Algorithm in the score-update path:

```
new_score   = ZADD scoreboard:zset score user_id
top_before  = (cached snapshot of last broadcast Top 10)
top_after   = ZREVRANGE scoreboard:zset 0 9 WITHSCORES

if top_before != top_after:
    publish("scoreboard:channel", top_after)
    cache top_after
```

The cached snapshot lives in Redis (`scoreboard:last_broadcast`) so that any API instance can do the comparison. Comparison is cheap — 10 (user_id, score) pairs.

The SSE handler on each API instance:

```
on connect:
    send current Top 10 immediately (so the client doesn't have to also call GET /scoreboard)
    subscribe to scoreboard:channel
on message from channel:
    forward to all open SSE connections on this instance
on disconnect:
    unsubscribe
```

---

## 9. Failure & operational considerations

- **Redis down on read** → fall back to a Postgres query (`SELECT … ORDER BY score DESC, updated_at ASC LIMIT 10`). Slower but correct. Log loudly and page on-call.
- **Redis down on write** → still commit the Postgres transaction and queue a "rebuild ZSET for this user" job. The score is durable; the live update is degraded until Redis recovers.
- **Postgres down on write** → return 503 to the client. Do not write to Redis. The client's action token is still valid until it expires, so they can retry.
- **Pub/Sub message lost** → SSE clients also poll `GET /scoreboard` every 30 s as a safety net. Lost messages self-heal within one polling interval.
- **Cold start / Redis flush** → an idempotent `rebuild_zset` job reads from `user_scores` and repopulates `scoreboard:zset` with the top ~100 users. Should run on Redis startup and be invokable manually.
- **Observability** — emit metrics for: action token issue rate, completion success/409/4xx rates, Top 10 churn rate, SSE connection count, end-to-end latency from `/actions/complete` to SSE delivery (target p95 < 250 ms).

---

## 10. Open questions & suggested improvements

These are things I'd want the team and product to weigh in on before we cut a ticket. Calling them out here rather than silently picking one.

1. **Tie-breaking rule.** I've assumed *earliest to reach the score wins*. Product should confirm — "most recent activity wins" is also defensible and is what a lot of game leaderboards do.
2. **Pagination beyond Top 10.** The requirement says Top 10, but users almost always ask "where am I on the board?" next. A `GET /scoreboard/me` endpoint returning the user's rank is cheap to add and worth scoping in v1.1.
3. **Score decay / seasons.** Is the scoreboard all-time, or does it reset weekly/monthly? This dramatically changes the data model — seasonal would need a `season_id` on every event. Worth deciding *before* we ship, because retrofitting is painful.
4. **WebSocket upgrade path.** SSE is the right call for now, but if we later add scoreboard *interactions* (chat, reactions on the leaderboard, etc.) we'll need WebSockets. The HTTP handlers and the Pub/Sub fan-out can be reused; only the transport layer changes.
5. **Anti-bot.** As noted in §7, this spec defends the API but not the action. If the action is automatable (e.g. a button click), we should layer on something like a periodic CAPTCHA, behavioural signals, or proof-of-work on `/actions/start`. Worth a separate spike.
6. **Server-side delta table location.** I've assumed the `action_type → delta` mapping is in code/config. If product wants to tune values without a deploy, this should live in a small admin-editable table with cache invalidation.
7. **Multi-region.** Pub/Sub on a single Redis works for one region. Going multi-region means a global stream (Kafka, Redis Streams with cross-region replication, or similar). Out of scope for v1, but worth flagging so we don't paint ourselves into a corner.
8. **Audit & support tooling.** `score_events` is a goldmine for "why did my score change?" support tickets. Consider a small internal admin endpoint to show a user's recent score events. Cheap to build now, expensive to retrofit when support is drowning.

---

## 11. Acceptance criteria

The implementation is considered done when:

- [ ] All endpoints in §6 are implemented and documented in OpenAPI.
- [ ] An authenticated user can complete the start → complete flow and see their score increase.
- [ ] Replaying a completion request returns 409 and does not double-credit.
- [ ] Submitting another user's action token returns 403.
- [ ] An expired action token returns 410.
- [ ] The scoreboard page receives a live update within 1 second (p95) of a Top 10 change.
- [ ] Killing Redis degrades the system gracefully (reads from Postgres, writes still durable) and recovers without data loss when Redis comes back.
- [ ] Load test: 500 completions/sec sustained for 5 minutes with p95 latency < 200 ms on `/actions/complete`.
- [ ] Threat model in §7 reviewed and signed off by security.
