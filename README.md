# Construct Coordinator

Mobile-first app for coordinating work between multiple teams on a construction
site. **Phase 1**: authentication, projects, membership & roles, and the
server-side permission model. (Tasks, uploads, and the AI layer come in later
phases.)

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

| Action                          | owner | superuser | member |
| ------------------------------- | :---: | :-------: | :----: |
| View project & members          |   ✓   |     ✓     |   ✓    |
| Invite members                  |   ✓   |     ✓     |        |
| Promote/demote member↔superuser |   ✓   |           |        |

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

Redis is provisioned in `docker-compose.yml` for later phases (queues); the API
does not use it yet.
