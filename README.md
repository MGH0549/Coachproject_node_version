# Coaching Platform API

Backend implementation of the supplied Node.js/PostgreSQL technical plan. NestJS and Fastify expose `/api/v1`; PostgreSQL is accessed through Prisma. The backend includes client access management, the exercise library, training and diet plans, independent templates, selections and coach locks, workouts, check-ins, feedback, private photos, password recovery, reminders and privacy tools. It supports one coach and Arabic content and messages. No frontend or payment processing is included.

## Local setup

Use Node.js 26 LTS and PostgreSQL 17 or newer.

```powershell
npm.cmd ci
Copy-Item .env.example .env
docker compose up -d postgres
```

Edit `.env`: set a randomly generated `JWT_SECRET`, the Angular origin and URL, and the coach's international WhatsApp number. The example database credentials are for local use only. Never commit `.env`. `COOKIE_SECURE=false` is allowed locally; production always requires secure cookies and HTTPS URLs. Configure Cloudinary and Resend to exercise real photo and email delivery. Missing credentials in development produce a retry response for photos and a delivery error code in logs for email.

```powershell
npm.cmd run db:generate
npm.cmd run db:deploy
$env:COACH_EMAIL = 'coach@example.com'
# Set COACH_PASSWORD using your secret manager or a private environment variable.
npm.cmd run coach:create
npm.cmd run dev
```

The coach command creates one coach without storing a default password; it refuses a second coach. Registration always creates a client. Swagger UI is at `http://localhost:3000/api/docs` in development. OpenAPI JSON is at `/api/docs-json`. Documentation routes are disabled in production. `npm run dev` compiles and starts the API; run it again after editing TypeScript. The production command runs compiled JavaScript with `npm start`.

## Contract and client integration

- Registration returns HTTP 201 with `{ id, status: 'Pending', whatsappUrl }` and creates no session or cookie. Call login immediately afterward, then use `GET /api/v1/me` to open the client's dashboard. Pending clients can log in before coach activation.
- `GET /api/v1/me` returns only `fullName`, `email`, `status`, `accessEndsAt`, `package`, `timeZone`, and `whatsappUrl`. `accessEndsAt` and `package` may be null. Status is effective (`Pending`, `Active`, `Expired`, or `Deactivated`). IDs, versions, reminder markers and other internal fields are excluded. Coach account responses retain their existing fields, including `accessEndAt` and `version`.
- For Pending, Expired and Deactivated clients, training, diet, selections, progress, check-ins, workouts and photos return HTTP 403 with code `ACCESS_INACTIVE`. Show the account notice and empty states without plan data. Once the coach activates the account, the same authenticated client can access assigned plans without another login.
- Access tokens last 15 minutes. Send `Authorization: Bearer <accessToken>` on protected requests. Refresh is an HttpOnly, SameSite=Strict cookie scoped to `/api/v1/auth`. Angular must use credentials for auth requests and serialize refresh calls. A reused token revokes its entire family. Logout revokes the family; previously issued access tokens remain valid for at most their 15-minute lifetime.
- Set `APP_ORIGIN` to the exact Angular origin. In development, the API also allows Swagger requests from `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>`. CORS and the origin guard use the same allowlist. Cookie requests that change state must include an allowed origin. Production allows only `APP_ORIGIN`; host the app and API under the same parent domain. Cookies are host-only.
- A client's own identifier is taken from their authenticated database record, never from a submitted client ID. Pending, deactivated and expired clients can read their account and use privacy tools, but cannot use plan/progress endpoints. Expiry is calculated on every request; it is not stored as a stale status.
- Coach access dates are calendar strings (`YYYY-MM-DD`). Their inclusive Cairo day end is converted to UTC. Timestamps in API responses have `Z`; workout and check-in `localDate` is a Cairo calendar date. `APP_TIME_ZONE` is fixed to `Africa/Cairo` for this release.
- Paginated endpoints use `page` and `pageSize` (maximum 100), and return `{ items, total, page, pageSize }`. Clients can be searched and filtered by effective status. Exercise searches support muscle group and archive filters.
- Existing plans, exercises, access changes, feedback and selections require the latest integer `version`; stale versions return `VERSION_CONFLICT`. A new plan omits `version`. Replacing a plan replaces its nested structure and resets the nested selections; workout logs retain exercise-name/sets/reps snapshots. A whole-plan lock is preserved. Read the returned plan after every successful selection or edit to obtain the new version.
- Training and diet payloads are nested: days/exercises/alternatives and meals/options/items. Every meal requires at least two options. A diet starts with the first approved option for each meal; `selectedTotals` is calculated from the saved choices. Exercise `alternativeId: null` means the main exercise. Alternative sets/reps inherit from the main exercise unless overridden.
- Coaches may lock a whole plan or a specific selection. Clients can log the locked exercise choice but cannot substitute another exercise. Coach choice endpoints can change and lock a selection in one request.
- Submit a check-in first. Upload each photo separately to `POST /me/check-ins/:id/photos` as a single multipart `photo` field, maximum 8 MiB. JPEG, PNG and WebP are decoded, re-encoded without metadata and resized to fit 1920×1920. Upload failure leaves the saved check-in intact. Photo responses expose an ID; request `/me/photos/:id` for a link valid for five minutes. Cloudinary references are never exposed.
- Errors use `application/problem+json`: `{ type, status, code, message, requestId }`. Messages are Arabic and codes are stable. Validation errors do not echo submitted values.

## Main routes

| Area      | Routes under `/api/v1`                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`                                                                                                 |
| Account   | `GET /me`; coach `GET /coach/clients`, `GET /coach/clients/:clientId`, `POST /coach/clients/:clientId/activate`, `/deactivate`, `/extend`                                                     |
| Exercises | coach `GET/POST /coach/exercises`, `PUT/DELETE /coach/exercises/:id`, `POST /coach/exercises/:id/archive`                                                                                     |
| Training  | client `GET /me/training`, `PUT /me/training/exercises/:id/selection`; coach `GET/PUT /coach/clients/:clientId/training`, `PUT .../training/lock`, `PUT .../training/exercises/:id/selection` |
| Diet      | client `GET /me/diet`, `PUT /me/diet/meals/:id/selection`; coach `GET/PUT /coach/clients/:clientId/diet`, `PUT .../diet/lock`, `PUT .../diet/meals/:id/selection`                             |
| Templates | coach `GET/POST /coach/templates/training` and `/diet`, `GET/PUT .../:id`, `POST .../:id/copy` with `clientId` and optional replacement `version`                                             |
| Progress  | client `POST /me/check-ins`, `GET /me/progress`, `GET/POST /me/workouts`; coach `GET /coach/clients/:clientId/progress`, `GET .../workouts`, `PUT .../check-ins/:id/feedback`                 |
| Photos    | client `POST /me/check-ins/:id/photos`, `GET/DELETE /me/photos/:id`; coach `GET/DELETE /coach/clients/:clientId/photos/:id`                                                                   |
| Privacy   | client `GET /me/export`, `DELETE /me`; coach `GET /coach/clients/:clientId/export`, `DELETE /coach/clients/:clientId`                                                                         |
| Health    | `GET /health` checks the database without exposing configuration                                                                                                                              |

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Integration tests use a **dedicated** PostgreSQL database with `test` in its name. They deliberately refuse any other database and clean only their uniquely named fixtures. They use real Prisma/PostgreSQL and Supertest; Cloudinary and Resend are replaced with adapters so tests never send emails or upload health data.

```powershell
docker compose exec postgres createdb -U coach coaching_test
$env:DATABASE_URL = 'postgresql://coach:localdevelopment@localhost:5432/coaching_test'
$env:TEST_DATABASE_URL = $env:DATABASE_URL
npm.cmd run db:deploy
npm.cmd run test:integration
npm.cmd run verify
```

`npm run verify` runs typecheck, lint, unit tests, build, and the PostgreSQL integration suite in that order. Set `TEST_DATABASE_URL` and apply migrations to that dedicated database first, as above. Integration coverage includes immediate Pending login, the exact account field allowlist for every inactive status, all inactive endpoint refusals with `ACCESS_INACTIVE`, and the register-to-coach-activation dashboard flow.

Domain tests cover expiry, activation, extension, locks, Cairo midnight and DST changes, and photo retention. Architecture tests parse imports and reject outward dependencies from domain/application. Integration tests cover role/status/ownership rules, version conflicts, choice locks, templates, workout alternatives, photos, feedback, token rotation and replay, password recovery, lockout and deletion. CI provisions its own database, applies migrations, and runs lint/typecheck/tests/build and an audit.

For the pre-launch load check, set `LOAD_BASE_URL` and `LOAD_ACCESS_TOKEN` to a staging API and an active client's short-lived token, then run `npm run load`. It reads plan/progress endpoints with five concurrent workers and reports failures and p95 latency against the 200 ms target. Use a representative populated plan and progress history for release acceptance.

## Operations and deployment

Set `TRUST_PROXY=true` in production behind Render or another trusted reverse proxy so IP-based rate limits use each visitor's address. It defaults to `false`, which ignores forwarded headers. Enable it only when all requests pass through trusted proxies that sanitize forwarded headers, including `X-Forwarded-For`, and direct public access to the API is blocked.

Hosting is intentionally unselected. The Dockerfile provides a Linux runtime running as a non-root user; the production artifact runs `node dist/main.js`. Build and release steps are:

```text
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm audit --audit-level=high
npm run db:deploy
node dist/main.js
```

Apply production migrations as a controlled release step using a migration account. The API database login should have only runtime DML privileges, with a separate owner/migration account; never grant runtime superuser rights. Use a PostgreSQL connection with TLS outside localhost. Terminate HTTPS at a reverse proxy, redirect HTTP there, and block direct public access to the Node port. Forwarding headers are not trusted by default; configure a narrowly scoped proxy trust policy if you later need per-client IP rate limiting behind a proxy. Run one API instance initially: the in-memory throttler, library cache and daily scheduler assume that deployment. Before scaling, provide shared rate limiting and a singleton/locked job runner.

All production Cloudinary and Resend credentials are required at startup. Use authenticated Cloudinary images, and verify your account permits authenticated, time-limited downloads. Check Cloudinary storage/bandwidth and regional storage settings. Verify the Resend sender domain's SPF/DKIM and set `EMAIL_FROM`. Password-reset links point to the Angular `/reset-password` screen.

At 09:00 Cairo daily, the scheduler sends access-end reminders `REMINDER_LEAD_DAYS` ahead (default 3), records the access deadline already reminded, cleans photos seven days after expiry/deactivation and removes expired token families/reset tokens and old audits. Extending access clears the reminder marker. Reactivated clients retain photos. Failed delivery retries three times; reset delivery runs asynchronously and does not fail the request. A process restart can interrupt an in-flight reset email; the client can request a new link. Failed reminders retry at the next scheduled run. Monitor `EMAIL_DELIVERY_FAILED`, `HOUSEKEEPING_FAILED`, and server error codes without logging bodies, secrets or health data. Keep the API running through the daily schedule.

Publish the operator's privacy policy and show it alongside the explicit registration consent in Angular before launch. Registration records the consent timestamp. Privacy exports contain personal records and five-minute download links to retained photos, including when an account is inactive. Deletion removes Cloudinary files before removing database records, and can be retried if Cloudinary is unavailable. An audit retains actor/record IDs and action names, without copied health data, for `AUDIT_RETENTION_DAYS` (default 365).

Provision independent local/staging/production databases and secrets. Configure encrypted storage, daily PostgreSQL backups, monitored structured logs and health checks, and periodically restore a backup into an isolated database to verify recovery. Hosting, DNS/sender verification, production backups, alert destinations and live external-service checks require the actual hosting/service accounts; no deployment has been performed by this repository.
