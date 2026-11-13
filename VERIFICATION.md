# Local verification — 13 November 2026

Final verification used Node.js 26.13.0 LTS and a local PostgreSQL 17 container. Earlier checks also passed on the machine's installed Node.js 24.18.0. Node 26 was downloaded into an ignored temporary folder; the machine's installed Node version was not changed. CI, Docker and the package engine target Node 26.

- Prisma client generation and the initial migration succeeded against a dedicated test database.
- ESLint, strict TypeScript checks, and the compiled production build passed.
- 21 unit/architecture tests and 10 PostgreSQL/Supertest integration tests passed.
- Integration coverage includes account lifecycle, role/status/ownership enforcement, version conflicts, exercise and meal locks, independent template copying, workouts, check-ins, photo failures, feedback, exports and deletion, token rotation/replay/logout, password reset, lockout, HTTP rate limiting, security headers and OpenAPI response schemas.
- Photo processing tests verify real image decoding, resizing, metadata removal, authenticated Cloudinary upload options and signed download parameters. No live health images were uploaded.
- A local load check used a six-day training plan with eight exercises per day and three alternatives per exercise, plus 26 check-ins. Five workers completed 100 plan/progress requests with **zero failures** and **117 ms p95 on Node 26** (127 ms on Node 24), against the 200 ms target. This is local evidence, not a production capacity guarantee.
- The final production dependency audit reported **zero vulnerabilities**. The full dependency tree has low/moderate development-tool advisories; no high/critical findings were reported. CI runs an online audit and fails on high/critical findings.

Live Resend delivery/domain verification, Cloudinary account permissions/region checks, staging/production deployment, production load acceptance, backup restoration, alerting, and publication of the operator's privacy policy require real service accounts and the hosting decision. Those operations have not been performed. The Docker image was provided but not built in this verification run.

The current test run emits Jest's experimental VM-modules warning (required by the cookie dependency's ESM import), and Prisma/pg emit a query-queue deprecation warning during nested export reads. Tests pass on the pinned versions. Keep Prisma/pg upgrades under integration-test coverage before adopting pg 9.
