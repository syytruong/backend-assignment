# Tasks API

A small CRUD backend built with **Express + TypeScript + SQLite**, demonstrating clean layering, validated input, sensible error handling, and a working test suite.

The chosen resource is a `Task` (title, description, status, priority, due date). Concrete enough to make filtering meaningful, simple enough to keep the focus on architecture rather than domain quirks.

---

## Requirements

- **Node.js 18+** (uses `node:crypto.randomUUID` and modern ES features).
- **npm** (or pnpm / yarn — examples below use npm).
- No external services. The database is a local SQLite file created on first run.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template (optional — defaults work)
cp .env.example .env

# 3. (Optional) explicitly run migrations. Server also runs them on startup.
npm run db:migrate

# 4. Start the dev server with auto-reload
npm run dev

# Server is now listening on http://localhost:3000
# Health check:
curl http://localhost:3000/health
```

For a production build:

```bash
npm run build       # compiles TypeScript -> dist/
npm start           # runs the compiled server
```

To run the tests:

```bash
npm test
```

---

## Configuration

All config is loaded from environment variables (see `.env.example`). Validated by Zod at startup — invalid values cause an immediate, descriptive failure rather than a mysterious crash later.

| Variable        | Default              | Description |
|-----------------|----------------------|-------------|
| `PORT`          | `3000`               | HTTP port to listen on. |
| `NODE_ENV`      | `development`        | One of `development`, `production`, `test`. |
| `DATABASE_PATH` | `./data/tasks.db`    | SQLite file path. Use `:memory:` for an ephemeral DB. |

---

## API reference

Base path: `/api/v1`

All responses are JSON. Successful responses for single resources are wrapped in `{ "data": ... }`; list responses use `{ "items": [...], "pagination": {...} }`. Errors use `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.

### `POST /api/v1/tasks` — create

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Write spec",
    "description": "Cover the auth section",
    "priority": "high",
    "dueDate": "2026-06-01T00:00:00Z"
  }'
```

| Field         | Type                              | Required | Notes |
|---------------|-----------------------------------|----------|-------|
| `title`       | string (1–200 chars)              | yes      | Trimmed; empty after trim is rejected. |
| `description` | string (≤ 2000 chars)             | no       | |
| `status`      | `todo` \| `in_progress` \| `done` | no       | Defaults to `todo`. |
| `priority`    | `low` \| `medium` \| `high`       | no       | Defaults to `medium`. |
| `dueDate`     | ISO-8601 datetime with offset     | no       | e.g. `2026-06-01T00:00:00Z`. |

Returns `201` with the created task.

### `GET /api/v1/tasks` — list with filters

```bash
curl 'http://localhost:3000/api/v1/tasks?status=todo&priority=high&q=spec&limit=20&offset=0&sort=createdAt&order=desc'
```

| Query     | Type                                        | Default      | Description |
|-----------|---------------------------------------------|--------------|-------------|
| `status`  | enum                                        | —            | Exact match. |
| `priority`| enum                                        | —            | Exact match. |
| `q`       | string                                      | —            | Case-insensitive substring search across `title` and `description`. |
| `limit`   | int 1–100                                   | `20`         | Page size. |
| `offset`  | int ≥ 0                                     | `0`          | Page offset. |
| `sort`    | `createdAt` \| `updatedAt` \| `priority`    | `createdAt`  | Sort key. Picked from a fixed allow-list — never spliced from raw input. |
| `order`   | `asc` \| `desc`                             | `desc`       | |

Returns:
```json
{
  "items": [ /* Task[] */ ],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

### `GET /api/v1/tasks/:id` — read

```bash
curl http://localhost:3000/api/v1/tasks/<uuid>
```

Returns `200` with the task, or `404` if not found, or `422` if the id is not a valid UUID.

### `PATCH /api/v1/tasks/:id` — update

```bash
curl -X PATCH http://localhost:3000/api/v1/tasks/<uuid> \
  -H 'Content-Type: application/json' \
  -d '{ "status": "in_progress" }'
```

Partial update — any subset of the create fields. Empty bodies are rejected with 422 (so you don't silently no-op a typo'd field name). Returns `200` with the updated task, or `404`.

### `DELETE /api/v1/tasks/:id` — delete

```bash
curl -X DELETE http://localhost:3000/api/v1/tasks/<uuid>
```

Returns `204` on success, `404` if the id doesn't exist.

### Status codes

| Code | When |
|------|------|
| 200 | Successful read/update |
| 201 | Successful create |
| 204 | Successful delete |
| 400 | Malformed request (e.g. non-JSON body) |
| 404 | Resource or route not found |
| 422 | Schema validation failure |
| 500 | Unhandled server error |

---

## Project layout

```
src/
├── config/             env vars + validation
├── db/
│   ├── connection.ts   singleton SQLite connection (WAL, FK on)
│   └── migrate.ts      idempotent schema setup
├── middleware/
│   └── errorHandler.ts central error → HTTP translation
├── modules/tasks/
│   ├── task.schema.ts      Zod schemas + TS types (single source of truth)
│   ├── task.repository.ts  SQL only — nothing else talks to the DB
│   ├── task.service.ts     business logic — no Express, no SQL
│   ├── task.controller.ts  thin: parse → call service → respond
│   └── task.routes.ts      route → controller wiring
├── utils/
│   ├── AppError.ts     typed error class with HTTP status + code
│   └── asyncHandler.ts wraps async handlers so rejections reach the error middleware
├── app.ts              builds the Express app (no listen)
└── server.ts           runs migrations, listens, handles graceful shutdown

tests/
└── tasks.test.ts       end-to-end suite via supertest, in-memory SQLite
```

The strict layering (route → controller → service → repository) is deliberate even at this size:

- The **service** has no Express imports, so its tests don't need supertest.
- The **repository** is the only place SQL lives, so swapping SQLite for Postgres later means changing one file's body, not its surface.
- The **schema** is both the runtime validator and the TypeScript type — they can't drift apart.

---

## Design choices and trade-offs

A few things I made deliberate calls on, with the reasoning if you want to push back during review.

**SQLite via `better-sqlite3`.** The brief says "simple database for data persistence". SQLite is the right call for that: zero external setup, a single file, real SQL with proper types and indexes. `better-sqlite3` is synchronous, which feels wrong in Node-land, but its API is faster than `sqlite3`'s callback-based driver for the kinds of small queries this API runs, and it removes a whole category of misuse around transactions.

**Zod for validation.** A single schema produces both the runtime validator and the TypeScript input type, so they can't drift. Caught at the boundary — the service layer trusts its inputs.

**PATCH instead of PUT for update.** PATCH is closer to what callers actually want ("change one field"). PUT would mean replacing the whole resource and forcing every client to send the full payload to update one field. I rejected empty-body PATCH explicitly — silent no-ops are an anti-pattern that hides client bugs.

**`{ data: ... }` envelope on responses.** Lets us add metadata (warnings, deprecation notices, request IDs) later without breaking clients. Worth the verbosity.

**Singleton DB connection.** `better-sqlite3` is synchronous and thread-safe, so connection pools don't apply the way they do for Postgres. One connection per process is the documented best practice.

**No auth.** The brief didn't ask for it. In real life I'd add a JWT-bearer middleware before `createTaskRouter` and tag routes with required scopes — happy to walk through what that would look like.

---

## Possible improvements (out of scope, but worth flagging)

These are the things I'd push for in a v1.1 if this were going to production:

1. **Authentication & per-user ownership.** Right now anyone who can reach the API can do anything. Realistically you'd want a `user_id` foreign key on `tasks`, JWT middleware, and ownership checks in the service layer.
2. **Rate limiting.** `express-rate-limit` on `/api/v1` to keep one bad actor from flooding the DB.
3. **Structured logging.** Morgan is fine for dev but in production I'd swap to pino with request IDs and JSON output for log aggregation.
4. **OpenAPI spec.** Generate it from the Zod schemas (e.g. via `zod-to-openapi`) so the API docs stay in sync with the code.
5. **Real migration tool.** `CREATE TABLE IF NOT EXISTS` is fine for one table; the moment we need to alter columns it isn't. Drizzle, knex, or node-pg-migrate would be the upgrade.
6. **Soft delete + audit log.** "Deleted" rarely means "actually gone" in business apps. A `deleted_at` column and a `task_events` audit table would be cheap insurance.
7. **Optimistic concurrency control.** A `version` column or `If-Match` ETag to prevent two concurrent PATCHes from clobbering each other.
8. **Pagination by cursor instead of offset.** Offset pagination gets slow and gives weird results when rows are inserted between requests. Cursor-based is more work but more correct.
9. **Container image.** A `Dockerfile` + `docker-compose.yml` so the reviewer can run `docker compose up` without Node installed locally.

---

## Notes for the reviewer

- The full happy path and error cases are covered by the test suite (`npm test`). Run them first — if those pass, the API is wired up correctly.
- The database file lives at `./data/tasks.db` by default. Delete it to start fresh.
- I haven't added a Dockerfile in the interest of keeping the submission lean — happy to add one on request.
