# OpsFlow MVP — Next.js edition

A one-day MVP for the Newtonite Software Engineering Challenge: an internal operations workspace for creating, assigning, tracking, approving, and resolving work items.

## Included

- Email/password registration and login (bcrypt password hashing, signed JWTs)
- Team-scoped work item visibility; public registration cannot set elevated roles
- Work item creation, editing, search, status/priority filters, server-side pagination
- Assignment validation, comments, activity history, approval action
- Optimistic concurrency via `version` and the `If-Match` request header (stale updates return `409`)
- Server-side role checks, request validation, basic rate limiting, Helmet headers
- MongoDB indexes for common filters, text search, and activity timelines
- Basic workflow contract tests and an engineering decisions document

## Stack

- Frontend: Next.js App Router + React + plain CSS
- API: Node.js + Express
- Data: MongoDB + Mongoose
- Auth: bcryptjs + JWT

## Prerequisites

- Node.js 20+
- MongoDB running locally or a MongoDB Atlas connection string

## Run locally

1. Copy `.env.example` to `.env.local` if you need to change `NEXT_PUBLIC_API_URL` (default is `http://localhost:4000/api`).
2. Copy `server/.env.example` to `server/.env`.
3. Set `MONGODB_URI` and replace `JWT_SECRET` with a long random secret.
4. From the project root run:

   ```bash
   npm install
   npm run install:all
   npm run dev
   ```

5. Open `http://localhost:3000`. API health check: `http://localhost:4000/api/health`.

If using MongoDB Atlas, allow your current IP in the database network access rules and use the Atlas connection string in `MONGODB_URI`.

## First account / roles

The first account registered is a **member** by design. To exercise approval, create a team lead/admin through a controlled operator action in the database or add a protected admin-provisioning command before a real deployment. Do not expose a public role selector. Example using `mongosh` after registering a user:

```js
use opsflow
db.users.updateOne({ email: "lead@example.com" }, { $set: { role: "lead" } })
```

Log out and back in after changing a role so the UI refreshes the user profile. API authorization always uses the server-loaded user record.

## Workflow

1. Member creates a work item in their team.
2. Member/assignee updates details and moves work to `In Progress` or `Blocked`.
3. Team lead/admin moves work to `Awaiting Approval`.
4. Team lead/admin uses **Approve & resolve** to move it to `Resolved`.
5. Every create/update/comment/approval is recorded in activity history.
6. If two people edit the same version, the first update increments `version`; the second receives `409 Conflict` and must reload before retrying.

## Tests

```bash
npm test --prefix server
```

The included tests are lightweight workflow contract tests, not full API/database integration tests. Add integration tests against a disposable MongoDB instance before production use.

## Known limitations

- This is an assessment MVP, not production-ready software.
- User/team management UI and secure admin provisioning are not implemented.
- One team per user in this MVP; membership in multiple teams is not modelled.
- Approval is a single-step workflow, not configurable per work-item type.
- Comment writes are not yet transactionally combined with their activity event; a crash between the writes could leave an incomplete audit trail.
- `Idempotency-Key` is attached to comment activity but duplicate keys are not yet deduplicated in storage. Do not treat comment submission as fully idempotent.
- No background queue, email notifications, realtime updates, file attachments, or soft-delete/archive flow.
- Dashboard metrics are calculated from the currently loaded page, while the list count is server-side. Treat the cards as page-level MVP stats, not organization-wide KPIs.
- JWT is stored in localStorage for simplicity. Production should consider secure HttpOnly cookies, CSRF controls as applicable, refresh/revocation strategy, and stronger session management.
- Team leads can approve items in their own team; only admins can move work across teams.
- MongoDB transactions should be used for multi-document atomic workflows when the deployment supports replica sets.

## API overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/work-items?page=1&limit=10&q=...&status=...&priority=...&assignee=me`
- `POST /api/work-items`
- `GET /api/work-items/:id`
- `PATCH /api/work-items/:id` (send `If-Match: <version>`)
- `POST /api/work-items/:id/comments`
- `POST /api/work-items/:id/approve` (send `If-Match: <version>`)
- `GET /api/work-items/:id/activities`


### Next.js structure
- `app/page.jsx` — application route
- `app/layout.jsx` — root layout and metadata
- `app/opsflow.jsx` — interactive dashboard client component
- `app/globals.css` — dashboard styling
- `server/` — existing Express REST API and MongoDB models
