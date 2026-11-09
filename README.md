# VELX Academy

Full-stack public website and private academy workspace built with TypeScript, React, Vinext, Cloudflare Workers, D1 and private R2 storage.

The implementation prioritises Phase 1: enquiries and conversion, admissions, Excel import, batches, attendance, fees, verified partial payments and receipts. Role-scoped coach, parent and student views, progress, examinations, announcements and reports are also included. Online gateways and automated WhatsApp delivery remain Phase 3 integration work.

See [Setup and deployment](docs/DEPLOYMENT.md), [Admin guide](docs/ADMIN_GUIDE.md) and [Asset provenance](docs/ASSETS.md).

```powershell
npm run install:ci
npm run typecheck
npm test
npm run build
```

Real authentication is supplied by Sites sign-in. No fake login, client-side record database or production test accounts are included. Local public preview is available through `npm run dev`; hosted authentication is required to enter the real portal. Private records are stored only in the cloud SQL database and private storage, with server-side access checks on each request.
