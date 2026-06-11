# TaskFlow

Full-stack task management application — Go 1.25 API, Next.js 15 frontend, Postgres 16. Every required feature and all 8 bonus items are implemented.

**Live:**
- Frontend (Vercel): **https://rival.itsvivek.me**
- API (Render): **https://taskflow-api-c0kt.onrender.com** ([health check](https://taskflow-api-c0kt.onrender.com/healthz))
- Database: Neon (managed Postgres)

> The API runs on Render's free tier, which spins down after ~15 minutes of inactivity — the first request after idle can take up to ~50 seconds while the instance cold-starts. Subsequent requests are fast.

**Demo accounts:**

| Role | Email | Password | What you'll see |
|------|-------|----------|-----------------|
| User | `demo@taskflow.dev` | `taskflow-demo-123` | 12 sample tasks with activity history |
| Admin | `admin@taskflow.dev` | `taskflow-demo-123` | "All tasks" toggle to view every user's tasks |

> Render free tier cold-starts take ~50 s; the first request after inactivity will be slow.

---

## Screenshots

| Light mode | Dark mode | Task panel (activity + attachments) |
|---|---|---|
| ![Task list light](docs/screenshots/list-light.png) | ![Task list dark](docs/screenshots/list-dark.png) | ![Task panel](docs/screenshots/panel.png) |

---

## Features

### Required

- [x] User authentication — signup, login, logout, `/auth/me`
- [x] JWT HS256 in `httpOnly` cookie `taskflow_session` (7-day TTL, `Secure` in production)
- [x] Password hashed with bcrypt (8–72 char input limit matches bcrypt's native cap)
- [x] Task CRUD — create, read, update, delete with ownership enforcement in SQL
- [x] Task fields: title, description, status (`todo` / `in_progress` / `done`), priority (`low` / `medium` / `high`), due date
- [x] Task list: filter by status, full-text search (`q`), sort by `due_date` / `priority` / `created_at`, order `asc` / `desc`, cursor-free pagination (`page` + `limit`, default 20, max 100)
- [x] Input validation with structured field-level error envelope

### Bonus

- [x] **Admin role** — `scope=all` on `GET /tasks` returns all users' tasks with `owner_email`; view-only by design (assignment spec)
- [x] **SSE real-time** — `GET /events` streams `task_created` / `task_updated` / `task_deleted` events; frontend subscribes and invalidates TanStack Query cache
- [x] **Optimistic UI** — status toggle and task deletion apply instantly; TanStack Query rolls back on API failure with a toast
- [x] **Attachments** — upload PNG, JPEG, GIF, WebP, PDF, or plain text; stored as Postgres `bytea`; 5 MB cap enforced server-side with content sniffing (not just filename extension)
- [x] **Activity log** — every create / update / delete / attachment event is written transactionally; surfaced as a humanised timeline in the task panel
- [x] **Docker Compose** — one command brings up db + api + web; seed script included
- [x] **GitHub Actions CI** — backend tests run against a real Postgres service container; frontend runs typecheck, lint, and vitest
- [x] **Dark mode** — `class` strategy via `next-themes`, persisted to `localStorage`, WCAG AA colour tokens

---

## Quickstart

Requires Docker Desktop (or equivalent).

```bash
# 1. Clone and start the stack
git clone <repo-url> rival && cd rival
docker compose up --build -d

# 2. Seed demo data (admin + demo user + 12 sample tasks)
docker compose run --rm --entrypoint /seed api

# 3. Open http://localhost:3000
```

**Demo credentials**

| Email | Password | Role |
|---|---|---|
| `admin@taskflow.dev` | `taskflow-demo-123` | admin |
| `demo@taskflow.dev` | `taskflow-demo-123` | user |

If host ports 8080, 3000, or 5432 are already in use, override them with standard Docker Compose port-mapping syntax or use the native dev setup below.

---

## Native Development

### Prerequisites

| Tool | Version |
|---|---|
| Go | 1.25+ |
| Node.js | ≥20 (`.nvmrc` pins 22; `nvm use` works) |
| Postgres | 16 (or Docker for the db service only) |

### Steps

```bash
# Start only the database
docker compose up -d db

# Backend (defaults: PORT=8080, DATABASE_URL points to above db)
cd backend
make dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # runs on http://localhost:3000
```

The frontend proxies all `/api/*` requests to the Go server via Next.js rewrites, so cookies are first-party with no CORS setup needed.

### Running tests

```bash
# Backend — integration tests against real Postgres (needs: docker compose up -d db)
cd backend
make test

# Frontend — vitest unit tests (no network required)
cd frontend
npm test

# Frontend typecheck + lint
npm run typecheck
npm run lint
```

**End-to-end (Playwright):** specs live in `frontend/e2e/`. They require the full stack running (`baseURL: http://localhost:3001` by default in `playwright.config.ts`). Not wired into CI because they need a live backend.

```bash
cd frontend
npx playwright test
```

---

## Configuration

### Backend (`backend/.env.example`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/taskflow?sslmode=disable` | Postgres connection string |
| `JWT_SECRET` | `change-me` | HMAC-SHA256 secret — use `openssl rand -hex 32` in production |
| `PORT` | `8080` | HTTP listen port |
| `ENV` | `development` | `development` or `production` — `production` sets `Secure` on the session cookie |

### Frontend (`frontend/.env.example`)

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:8080` | Base URL of the Go API — used **at build time** by Next.js rewrites and **at runtime** by the SSE proxy route handler |

> `API_URL` is a server-side variable (not `NEXT_PUBLIC_`). It never reaches the browser.

---

## API Reference

All API paths are prefixed `/api` in the browser (via Next.js rewrite) and called directly on the Go server otherwise. The Go server listens at the root (no `/api` prefix itself).

Authentication is via the `taskflow_session` cookie set on login. The cookie is `HttpOnly; SameSite=Lax; Secure` (production).

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/signup` | — | Create account. Returns `201` with user object + sets session cookie. |
| `POST` | `/auth/login` | — | Authenticate. Returns `200` with user object + sets session cookie. |
| `POST` | `/auth/logout` | required | Clears session cookie. Returns `204`. |
| `GET` | `/auth/me` | required | Returns current user object. |
| `POST` | `/tasks` | required | Create a task. Returns `201` with task object. |
| `GET` | `/tasks` | required | List tasks. See query parameters below. |
| `GET` | `/tasks/{id}` | required | Get task by ID. Returns `404` if not owned by caller (non-admin). |
| `PATCH` | `/tasks/{id}` | required | Partial update (any subset of fields). Returns `200` with updated task. |
| `DELETE` | `/tasks/{id}` | required | Delete task. Returns `204`. |
| `GET` | `/tasks/{id}/activity` | required | Returns chronological activity log for a task. |
| `POST` | `/tasks/{id}/attachments` | required | Upload attachment (`multipart/form-data`, field `file`). Max 5 MB. |
| `GET` | `/tasks/{id}/attachments` | required | List attachment metadata for a task. |
| `GET` | `/attachments/{id}` | required | Download attachment bytes (sets `Content-Disposition: attachment`). |
| `DELETE` | `/attachments/{id}` | required | Delete attachment. Returns `204`. |
| `GET` | `/events` | required | SSE stream. Emits `task_created`, `task_updated`, `task_deleted` events scoped to the authenticated user. |
| `GET` | `/healthz` | — | Returns `{"status":"ok"}`. |

### `GET /tasks` query parameters

| Parameter | Default | Values / constraints |
|---|---|---|
| `status` | — (all) | `todo`, `in_progress`, `done` |
| `q` | — | Full-text search on title (trigram index) |
| `sort` | `created_at` | `created_at`, `due_date`, `priority` |
| `order` | `desc` | `asc`, `desc` |
| `page` | `1` | Positive integer |
| `limit` | `20` | `1`–`100` |
| `scope` | — (own tasks) | `all` — admin only; returns all users' tasks with `owner_email` field |

Response envelope:

```json
{
  "data": [ /* task objects */ ],
  "meta": { "page": 1, "limit": 20, "total": 42, "total_pages": 3 }
}
```

### Error envelope

All errors use this shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "validation failed",
    "fields": {
      "title": "is required and must be at most 200 characters",
      "due_date": "must be YYYY-MM-DD"
    }
  }
}
```

`fields` is omitted for non-validation errors.

### HTTP status codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `204` | No Content |
| `400` | Bad Request (malformed JSON) |
| `401` | Unauthenticated |
| `403` | Forbidden (wrong owner or missing admin role) |
| `404` | Not Found |
| `409` | Conflict (email already registered) |
| `413` | Payload Too Large (attachment > 5 MB) |
| `422` | Unprocessable Entity (field validation failed) |

### Validation rules (task fields)

| Field | Rule |
|---|---|
| `title` | Required; 1–200 characters |
| `description` | Optional; max 5 000 characters |
| `status` | `todo`, `in_progress`, or `done` |
| `priority` | `low`, `medium`, or `high` |
| `due_date` | Optional; `YYYY-MM-DD` format |
| `email` | Valid email format |
| `password` | 8–72 characters (bcrypt input ceiling) |

---

## Architecture

### Monorepo layout

```
rival/
├── backend/
│   ├── cmd/
│   │   ├── api/          # main — wires config, DB, hub, server
│   │   └── seed/         # seed script (demo users + tasks)
│   ├── db/
│   │   ├── migrations/   # 3 embedded golang-migrate files
│   │   └── queries/      # sqlc input SQL
│   └── internal/
│       ├── api/          # HTTP handlers, middleware, routes
│       ├── auth/         # bcrypt + JWT helpers
│       ├── config/       # env-based config
│       ├── events/       # in-memory SSE hub
│       └── store/        # sqlc-generated queries + hand-built list query
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js App Router pages + /api/events proxy route
│   │   ├── components/   # React components (task list, panel, forms, activity, attachments)
│   │   ├── hooks/        # TanStack Query hooks, optimistic helpers, SSE hook
│   │   └── lib/          # API client, zod schemas, activity formatter, types
│   └── e2e/              # Playwright specs (not in CI)
├── docs/
│   └── screenshots/
└── docker-compose.yml
```

### Request flow

```
Browser → Vercel/Next.js → rewrite /api/* → Go API :8080 → Postgres 16
                         ↓ /api/events → dedicated route handler (SSE proxy, no gzip buffering)
```

The Next.js `rewrites()` in `next.config.ts` forward all `/api/*` requests to the Go server. This keeps the session cookie first-party (same origin as the browser) with no CORS configuration. The one exception is the SSE endpoint: Next.js rewrites apply gzip compression which buffers event streams, so `GET /api/events` is handled by a dedicated route handler (`app/api/events/route.ts`) that pipes the upstream body directly without compression.

### Auth design

- On login/signup, the server signs a JWT (HS256, 7-day TTL) containing `user_id`, `email`, and `role`, and sets it in a `HttpOnly; SameSite=Lax` cookie.
- `requireAuth` middleware reads and validates the cookie on every protected route.
- Ownership is enforced at the SQL query level, not in Go application code (non-admin callers always filter by `user_id = $1`).
- The `role` claim is baked into the token at login time, so role promotions/demotions take effect on the user's next login (within the 7-day TTL window at most).

### Real-time design

- The Go server maintains an in-memory `Hub` (`internal/events/hub.go`) keyed by `user_id`. Each SSE connection subscribes to a buffered channel (cap 8).
- When a task mutation completes, the handler publishes a JSON event to the relevant user's channel(s).
- The frontend `useTaskEvents` hook wraps `EventSource`, reconnects on error, and calls `queryClient.invalidateQueries` on each event.
- **Scope:** events are scoped to the task owner. Admins do not receive other users' events via SSE — they see live updates only for their own tasks; viewing all tasks requires a manual refresh.

### Data model

- **`users`**: `id (uuid)`, `email (citext, unique)`, `password_hash`, `role ('user'|'admin')`, `created_at`
- **`tasks`**: `id`, `user_id → users`, `title`, `description`, `status`, `priority`, `due_date`, `created_at`, `updated_at`; trigram GIN index on `title` for full-text search
- **`task_activity`**: `id (bigserial)`, `task_id → tasks`, `actor_id → users`, `action`, `changes (jsonb)`, `created_at`
- **`attachments`**: `id (uuid)`, `task_id → tasks`, `filename`, `content_type`, `size_bytes`, `data (bytea)`, `created_at`

Migrations are embedded in the binary via `golang-migrate` and run automatically on startup.

---

## Testing

### Backend

Integration tests in `backend/internal/api/` run against a real Postgres database (no mocks). Coverage:

- Auth flows: signup, login, logout, `/me`; duplicate email `409`; invalid credentials `401`; field validation `422`
- Task CRUD + ownership: `404` on cross-user access
- List filters: combined status + search + sort + pagination in a single test
- Activity log: correct events written after create/update/delete
- Admin `scope=all`: returns other users' tasks with `owner_email`; forbidden for non-admin
- Attachments: upload, list, download, delete; `413` over 5 MB; `422` on disallowed MIME type; content sniffing rejects disguised files
- SSE: hub subscribe/unsubscribe/publish race conditions (Go race detector); stream integration test

```bash
cd backend
docker compose up -d db   # if not already running
make test                  # go vet + go test ./... -count=1
```

### Frontend

79 vitest unit tests covering:

- API client (`src/lib/api.test.ts`) — request construction, error parsing
- Zod schemas (`auth-schema.test.ts`, `task-schema.test.ts`) — validation rules
- URL state (`use-task-params.test.ts`) — query string serialisation/deserialisation
- Optimistic cache helpers (`optimistic.test.ts`) — update and rollback logic
- Activity formatters (`activity-format.test.ts`) — humanised timeline strings
- List state components (`task-list.test.tsx`) — empty/loading/error states
- SSE hook (`use-task-events.test.ts`) — connection, event dispatch, reconnect

```bash
cd frontend
npm test
```

### End-to-end

Playwright specs in `frontend/e2e/`:

| File | What it tests |
|---|---|
| `activity-timeline.spec.ts` | Activity events appear after CRUD operations |
| `admin-all-tasks.spec.ts` | Admin `scope=all` view with `owner_email` |
| `attachments.spec.ts` | Upload, download, delete cycle |
| `optimistic.spec.ts` | Optimistic status toggle and rollback |
| `sse-live.spec.ts` | Real-time update appears in second tab |

These require the full stack running. They are not wired into CI.

---

## Assumptions & Trade-offs

1. **Attachments in Postgres `bytea` (5 MB cap).** This keeps the stack to a single persistence layer and is viable at assessment scale. Persistent-disk storage is unavailable on free-tier hosting. Production path: offload uploads to S3/R2, store only a presigned-URL pointer in Postgres, and serve files directly from object storage.

2. **In-memory SSE hub — single instance only.** The hub lives in the Go process. Horizontal scaling across multiple API instances would split subscribers across processes. Production path: replace the hub's internal channel map with Redis pub/sub (or a message bus). Documented in `internal/events/hub.go`.

3. **JWT in `httpOnly` cookie + Next.js rewrites proxy.** The cookie never touches JS, so XSS cannot steal it. The rewrite makes it first-party, so no CORS setup is needed. The trade-off: `role` is baked into the token at login, so a role change takes effect only on the user's next login (maximum delay equals the 7-day TTL).

4. **Admin is view-only.** The assignment asks for admin to be able to _view_ all tasks. Creating or modifying other users' tasks is not implemented, which keeps the permission model simple and matches the spec.

5. **`sqlc` + one hand-built list query.** sqlc generates type-safe query code from SQL. The `ListTasks` query (`internal/store/list.go`) cannot be generated by sqlc because it builds a dynamic `WHERE` clause at runtime; a whitelist of allowed sort columns and a safe parameter approach are used instead of an ORM.

6. **SSE proxied through a dedicated Next.js route handler.** Next.js rewrites silently gzip-buffer SSE streams at a chunk boundary, which delays delivery of events. The `/api/events` route bypasses this by piping the upstream response body directly with `compress: false` on the Node.js fetch call.

7. **Password limit 8–72 characters.** bcrypt silently truncates input at 72 bytes. The upper bound is validated explicitly rather than silently accepting and truncating.

8. **No rate limiting, no refresh-token rotation.** Out of scope for this assessment. Production additions: a rate-limiting middleware (e.g. per-IP sliding window) and short-lived access tokens with a separate refresh-token flow.

9. **Render free tier cold starts (~50 s).** The first request to the Render-hosted API after a period of inactivity will be slow while the container spins up. This is a hosting-tier limitation, not an application bug.
