# Changelog

## Unreleased

- Registration now documents valid example values, and validation errors identify the rejected fields without echoing passwords or submitted values.
- Fixed local Swagger requests being rejected by the origin guard. Development allows the configured frontend and local API origins; production retains its configured frontend restriction.

## 0.1.0

- Initial versioned backend: Arabic authentication and account lifecycle, coach exercise library, training and diet plans and templates, client choices and locks, workouts, check-ins and feedback.
- Added protected progress photos, privacy export/deletion, Cairo date handling, reminders and retention jobs.
- Added PostgreSQL migrations, OpenAPI development documentation, security controls, tests and CI.
