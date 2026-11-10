# VELX Academy

Full-stack public website and private academy workspace built with TypeScript, React, Vinext, Cloudflare Workers, D1 and private R2 storage.

The implementation prioritises Phase 1: enquiries and conversion, admissions, Excel import, batches, attendance, fees, verified partial payments and receipts. Role-scoped coach, parent and student views, progress, examinations, announcements and reports are also included. Online gateways and automated WhatsApp delivery remain Phase 3 integration work.

See [Setup and deployment](docs/DEPLOYMENT.md), [Admin guide](docs/ADMIN_GUIDE.md) and [Asset provenance](docs/ASSETS.md).

Use a separate `feature/`, `fix/`, `docs/`, `chore/` or `hotfix/` branch for each
change. Tested work integrates into `develop`; `main` is reserved for releases.
See [Git workflow](docs/GIT_WORKFLOW.md)
for commits, reviews and the later development/production hosting setup.

Forgot-password and reset-password pages are included. Local testing captures
reset emails in a loopback-only inbox. The optional real recovery adapter needs
authentication-provider configuration for the later independent deployment; see
[Password recovery](docs/PASSWORD_RECOVERY.md). It preserves academy roles and
linked student records and does not replace the current hosted sign-in.

```powershell
npm run install:ci
npm run typecheck
npm test
npm run build
```

Hosted authentication is supplied by Sites sign-in. No client-side record database or production test accounts are included. Local public preview is available through `npm run dev`. To test all roles with password-checked dummy accounts and a separate local database, use `npm run dev:test` and follow [Local testing](docs/LOCAL_TESTING.md). Private records use SQL/private storage, with server-side access checks on each request.
