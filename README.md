# Construct Coordinator

Mobile-first app for coordinating work between multiple teams on a construction
site. **Phase 1**: authentication, projects, membership & roles, and the
server-side permission model. **Phase 2**: project guidelines and tasks with
manual ordering. **Phase 3**: submissions — photo/comment evidence on tasks,
stored in S3-compatible object storage with a mobile offline queue. (The AI
layer comes in later phases.)

## Layout

```
apps/api          NestJS + Prisma + PostgreSQL backend
apps/mobile       React Native (Expo) app
packages/shared   Types & request/response contracts shared by both apps
```

## Getting started

Requirements: Node ≥ 18.18, pnpm 9, Docker.

```bash
docker compose up -d                 # Postgres :5432 + Redis :6379
pnpm install                         # also builds packages/shared + prisma generate
cp .env.example apps/api/.env        # adjust if needed

pnpm --filter api exec prisma migrate deploy   # apply migrations
pnpm --filter api start:dev          # API on http://localhost:3000
pnpm --filter mobile start           # Expo dev server
```

Testing on a physical device? Set `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000`
in `apps/mobile/.env` — `localhost` on the phone points at the phone.

## Tests

```bash
pnpm --filter api test:e2e           # needs Postgres running (docker compose up -d)
```

CI (GitHub Actions) runs the same suite against a Postgres service container.

## Permission model

Roles are **project-scoped** — the same user can be `owner` of one project and
`member` of another.

| Action                           | owner | superuser | member |
| -------------------------------- | :---: | :-------: | :----: |
| View project & members           |   ✓   |     ✓     |   ✓    |
| Invite members                   |   ✓   |     ✓     |        |
| Promote/demote member↔superuser  |   ✓   |           |        |
| Read guideline & tasks           |   ✓   |     ✓     |   ✓    |
| Write guideline                  |   ✓   |     ✓     |        |
| Create/edit/reorder/delete tasks |   ✓   |     ✓     |        |
| Change a task's status           |   ✓   |     ✓     |   ✓    |
| Create/view submissions          |   ✓   |     ✓     |   ✓    |
| Delete a submission              |   ✓   |     ✓     | author only |

Changing task status is the **one** write the `member` role has — it's how
field teams report progress. The status route accepts only `{ status }`, so a
member can't smuggle a title change through it. Status transitions are
unrestricted (any → any) for now.

- Creating a project makes you its `owner` (membership created in the same
  transaction).
- The `owner` role can never be changed or removed — no orphaned projects.
- `owner` can never be granted via invite or role change.

Enforcement lives in `apps/api/src/common/guards/project-role.guard.ts`, applied
via the `@RequireRole(...roles)` decorator. Every future project-scoped module
(tasks, guidelines, uploads) reuses it. The mobile `useProjectRole` hook only
hides UI — it is never trusted for security.

## Invites

`POST /projects/:id/invite { email, role? }` (role defaults to `member`):

- Unknown email → a placeholder `User` (no password) is created with an
  `invited` membership. Registering with that email claims the account and
  activates the membership. Sending the actual email is stubbed (log line) in
  this phase.
- Existing user → membership is created `active` immediately (no accept flow
  in this phase).

## API overview

| Method | Path                            | Auth                  |
| ------ | ------------------------------- | --------------------- |
| POST   | `/auth/register`                | —                     |
| POST   | `/auth/login`                   | —                     |
| POST   | `/auth/refresh`                 | —                     |
| GET    | `/auth/me`                      | JWT                   |
| POST   | `/projects`                     | JWT                   |
| GET    | `/projects`                     | JWT                   |
| GET    | `/projects/:id`                 | any active membership |
| GET    | `/projects/:id/members`         | any active membership |
| POST   | `/projects/:id/invite`          | owner, superuser      |
| PATCH  | `/projects/:id/members/:userId` | owner                 |
| GET    | `/projects/:id/guideline`       | any active membership |
| PUT    | `/projects/:id/guideline`       | owner, superuser      |
| GET    | `/projects/:id/tasks?status=`   | any active membership |
| GET    | `/projects/:id/tasks/:taskId`   | any active membership |
| POST   | `/projects/:id/tasks`           | owner, superuser      |
| PATCH  | `/projects/:id/tasks/reorder`   | owner, superuser      |
| PATCH  | `/projects/:id/tasks/:taskId`   | owner, superuser      |
| PATCH  | `/projects/:id/tasks/:taskId/status` | any active membership |
| DELETE | `/projects/:id/tasks/:taskId`   | owner, superuser      |
| POST   | `.../:taskId/submissions/upload-url` | any active membership |
| POST   | `.../:taskId/submissions`       | any active membership |
| GET    | `.../:taskId/submissions`       | any active membership |
| DELETE | `.../:taskId/submissions/:submissionId` | author or owner/superuser |

The guideline is one evolving document per project (upserted in place);
version history is deliberately deferred (likely Phase 5+). Task reorder takes
`{ taskIds: [...] }` in the new order and renumbers atomically — if any id
doesn't belong to the project, nothing changes.

## Submissions & storage

Photo bytes **never pass through the API**. The flow is:

1. `POST .../submissions/upload-url` → `{ uploadUrl, objectKey }` (presigned
   PUT, key namespaced `projects/:id/tasks/:taskId/<uuid>.jpg`)
2. The mobile client compresses (1600px long edge, JPEG 0.7) + thumbnails
   (400px) client-side and PUTs both directly to object storage
3. `POST .../submissions { comment?, photoKey?, thumbnailKey? }` (at least one
   of comment/photo required) confirms the record

Only object keys are persisted; signed read URLs are generated per response.
Submissions are **immutable** (corrections are new submissions) and deletion
is **soft** (`deleted_at`) — both to keep the audit trail honest for the AI
layer in later phases.

Storage is any S3-compatible store behind `StorageService` — Cloudflare R2 by
default (egress cost), AWS S3 or local MinIO via env vars only (`S3_*` in
`.env.example`).

The mobile app keeps a durable offline queue (AsyncStorage + copies of photos
in the app's document dir): queued submissions show as "pending upload" in the
feed instantly and sync on reconnect (netinfo). If the photo PUT succeeded but
the record POST failed, the retry reuses the uploaded key and never re-uploads.

Redis is provisioned in `docker-compose.yml` for later phases (queues); the API
does not use it yet.
