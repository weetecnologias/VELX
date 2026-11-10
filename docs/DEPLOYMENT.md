# Deployment and architecture

## Current hosting target

This repository is a server-backed Sites project, `appgprj_6af18a55cb308191abf2ab530e774d45`. It uses TypeScript, React 19, Vinext (Next.js app router compatibility), Cloudflare Workers, D1 SQL and private R2 storage. `.openai/hosting.json` declares `DB` and `BUCKET`. Sites provisions hosted bindings and applies the committed Drizzle SQL migrations before deploying the Worker.

The deployed review URL is expected at `https://velx-taekwondo-academy.amulya-bhogi.chatgpt.site`. A URL in source alone is not proof of deployment; use the successful deployment result. The initial preview is owner-private. Public website routes exist, but anonymous visitors cannot reach an owner-private Site until the owner deliberately changes its audience.

## Required configuration

The public marketing website is a single homepage with section anchors. Legacy
marketing routes such as `/about` and `/contact` redirect to `/#about` and
`/#contact`, preserving query parameters such as `utm_source`. Keep these redirects
when configuring external hosting. The sitemap lists the homepage and admission
page rather than the redirected marketing routes. `/track`, `/privacy` and
`/portal` retain their existing functionality.

Follow [Git workflow](GIT_WORKFLOW.md) before preparing a release. Each task has
its own branch, tested changes integrate into `develop`, and production releases
are promoted to `main`. The existing local branches do not create hosted
development/production environments or enable automatic deployment. Future
independent hosting must bind those environments to separate databases, storage,
authentication settings and secrets.

Optional password recovery configuration is described in
[Password recovery](PASSWORD_RECOVERY.md). It requires a configured Supabase Auth
project, custom SMTP, a recovery-specific email template and trusted HTTPS URLs.
It does not replace the current Sites sign-in; independent login and hosting are
still later tasks. Local test mode provides a separate captured-email workflow.

* `BOOTSTRAP_ADMIN_EMAIL` (secret): exact email of the authorised first Super Admin. It has already been configured for the current Site owner. Do not commit its value. The bootstrap checks authenticated email and requires no existing Super Admin.
* `DB`: D1 binding, provisioned by Sites from the manifest.
* `BUCKET`: R2 binding, provisioned by Sites for student photos.
* Sites sign-in: supplied by hosting; no browser API keys or service-role secrets are needed.

There is no Supabase project or payment/WhatsApp provider credential in this build. D1 is the equivalent managed cloud SQL database. D1 does not implement PostgreSQL RLS: server-side ownership and assignment predicates enforce row access, and clients have no direct database credentials or access. The Worker must be reachable only through the trusted Sites dispatch, which supplies authenticated identity headers. Do not expose an alternate public Worker URL accepting user-supplied identity headers. Moving to independent hosting requires replacing `app/chatgpt-auth.ts` with a verified identity-provider integration and preserving all service authorisation checks.

## Local setup (Node 22.13+)

```powershell
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_amazing_jean_grey.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_integrity.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_cool_wolf_cub.sql
npm run dev -- --port 5173
```

Run migration files once in order. They create schema only. `POST /api/setup`, restricted to Super Admins, creates the initial programme/belt reference dataset. Local and hosted databases are separate. Normal local preview shows public pages and the hosted sign-in entry point. For password-checked dummy accounts, run `npm run dev:test`; see [Local testing](LOCAL_TESTING.md). That explicitly enabled development mode uses a separate local D1/R2 state directory and is excluded from production. Automated service tests use isolated SQLite databases and fixture identities that cannot sign in to the hosted portal.

## Validation

```powershell
npm run typecheck
npm test
npm run build
```

`tests/workflows.test.mjs` runs the actual service against the actual SQL migrations in isolated SQLite databases. It covers public enquiries/rate limiting, private tracking keys, CRM conversion, duplicate admission/import rollback, capacity constraints, attendance upserts, verified partial payments, idempotency, immutable payments/audits, ownership/coach scoping, account revocation and additional modules. These are integration tests of the service and database. They do not emulate production provider password-reset or SSO sessions.

## Sites release

1. Keep the existing project ID and audience. Use the Sites source-workflow helper to synchronise the exact checkout, run remaining checks/builds and create the deployment archive. Never commit credentials, local database state or backups.
2. Save and deploy the pushed source SHA using the native Sites private deployment operation for this known owner-private Site. Keep archive, pushed SHA and saved version consistent.
3. If deployment is pending, building or publishing, poll its deployment ID until terminal. Retain version IDs if publication must be resumed.
4. Sign in to `/portal`, initialise reference data and complete the administrator setup. Open the review version before choosing a public audience.
5. To serve anonymous website visitors, the owner must change the Site audience to public. This does not grant academy roles: all portal APIs still require an authorised identity and server-side permissions. Share the Site with selected staff/families while private, or make it public deliberately; adding an app role alone cannot override the hosting audience.

For a custom domain, confirm support in the hosting account. Do not point a domain at a guessed upstream Worker address.

## Storage, reliability and limits

All fees are integer paise. Related admission and payment writes use D1 atomic batches. Triggers prevent overpayments, out-of-capacity enrolment and changes to confirmed payments/audit entries. Validation runs on the server with Zod. Public writes are rate limited in D1; JSON writes reject foreign origins. Requests are served over hosted HTTPS. Private API responses are uncached. SQL is parameterised; student records and private photos are never in public endpoints.

Use native D1 point-in-time recovery and exports for production backups and a separate R2 backup for photos. Confirm the platform's current retention and regional requirements in your account before handling real records. The app's logical JSON backup is a portable supplementary export. A disaster recovery drill, production monitoring and guardian consent/retention policy remain academy operating responsibilities.

## Phase 3 integration boundary

The current UI uses manual receipt verification and WhatsApp click-to-chat. `lib/integrations.ts` defines provider boundaries and configuration requirements. A future gateway needs provider public key, server secret, webhook signing secret, trusted return URL and idempotent server-verified webhook processing. Never accept a browser redirect as proof of payment. Official WhatsApp needs a Business account, phone-number ID, access token, webhook verification secret, approved templates and opt-in/consent handling. These credentials must be configured through hosting secrets, never client bundles. No provider API is called until that integration is implemented and tested.

## Known implementation boundaries

* Authentication is real Sites/ChatGPT SSO. A standalone academy email/password login has not been implemented. Password recovery and global session controls belong to the provider.
* Printable receipts use the browser's Save as PDF; a server-side PDF generation service is not included.
* Curriculum, batch and fee plan creation is supported. Programme definitions currently come from the reference seed; editing curriculum structure requires a source/database migration change.
* Exports and core record creation are implemented. Multi-branch accounting, refunds, credits, recurring invoice generation, automated delivery and advanced analytics remain outside this implementation.
* No automatic backup schedule is installed. Configure native backups with the operator after choosing retention and access controls.

Reference seed data is supplied in seed/reference.sql. Fictional sample records are in seed/demo.sql for an isolated test database only; never apply that file to the live academy.

