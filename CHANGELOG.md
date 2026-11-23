# Changelog

## Unreleased

- Added strength sessions and a `WorkoutSet` Prisma migration linked to existing workout logs, with quarter-kilogram weights, repetitions, optional notes and an atomic ten-set limit per exercise per Cairo day.
- Added Active-only client save/edit/delete, paged exercise history and overview routes, plus read-only coach history. Plan ownership, alternatives and existing selection locks are enforced.
- Added API best-set, heaviest-weight, Epley estimated 1RM and latest-session trend calculations. Strength sessions and sets are included in privacy exports and cascading deletion.
- Added strength ownership, membership, numeric limits, concurrent daily caps, Cairo midnight, inactive-account, metrics, export and deletion tests and OpenAPI contracts.

- Limited `GET /api/v1/me` to `fullName`, `email`, `status`, `accessEndsAt`, `package`, `timeZone`, and `whatsappUrl`, including for Pending, Expired and Deactivated clients; coach responses are unchanged.
- Added regression coverage for inactive endpoint refusals (`403 ACCESS_INACTIVE`), registration without a session, immediate Pending login, and plan access after coach activation using the same login.
- Documented the new client dashboard flow and added `npm run verify` for typecheck, lint, unit tests, build and PostgreSQL integration tests. Security guards, rate limits, tokens and sessions are unchanged.
- Registration now documents valid example values, and validation errors identify the rejected fields without echoing passwords or submitted values.
- Fixed local Swagger requests being rejected by the origin guard. Development allows the configured frontend and local API origins; production retains its configured frontend restriction.

## 0.1.0

- Initial versioned backend: Arabic authentication and account lifecycle, coach exercise library, training and diet plans and templates, client choices and locks, workouts, check-ins and feedback.
- Added protected progress photos, privacy export/deletion, Cairo date handling, reminders and retention jobs.
- Added PostgreSQL migrations, OpenAPI development documentation, security controls, tests and CI.

## 2026-11-22 — Training weights

- Include latest sets, session date and personal best weight independently for main exercises and alternatives in the client's training response.
- Accept optional sets on workout completion, using the existing atomic strength insert and Cairo daily limits. Completion without weights stays supported.
- Document both response shapes and add real PostgreSQL API coverage for isolation, inactive access, and completion.
