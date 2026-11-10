# Localhost testing with dummy accounts

Run this command from the application directory:

```powershell
npm run dev:test
```

The command applies pending schema migrations to a dedicated local D1 database,
seeds fictional academy records, and starts the application on loopback port 5173.
Open `http://localhost:5173/local-login` and use the credentials printed by the
command. It creates these account emails:

| Role | Email |
| --- | --- |
| Super Admin | `superadmin@velx.test` |
| Admin | `admin@velx.test` |
| Coach | `coach@velx.test` |
| Parent | `parent@velx.test` |
| Student | `student@velx.test` |

A shared random test password is generated on the first run. Credentials are saved
in ignored `.sites-runtime/local-test/credentials.json`; salted scrypt hashes are
in `accounts.json` beside it. Re-running the command preserves the password and
existing test records. No credentials are committed to source control.

The parent is linked to **Aarav Demo** and **Ananya Demo**. The student account is
linked only to Aarav. The coach is assigned the Demo Juniors taekwondo batch.
**Kabir Demo** belongs to another household and another coach's MMA batch, so you
can test that unrelated records stay inaccessible. Admins can see all three.

The dataset includes training plans, attendance, progress notes, enquiries,
announcements, invoices, one simulated partial payment, a printable sample receipt,
an expense and an examination registration. All personal information and payment
records are fictional. WhatsApp controls still open the external WhatsApp service;
use the displayed drafts only for inspection unless intentionally sending a message.

Sign out or choose **Switch account** to test another role. Sessions are stored
in server memory and use an HttpOnly, SameSite cookie. Restarting the server
invalidates sessions; the test database persists. Tests on `localhost` and
`127.0.0.1` use different browser cookies, so consistently use one hostname.

**Forgot password?** opens `/forgot-password`. Request a link, open `/local-inbox`,
and choose a new password through the captured email. Links expire in 15 minutes
and work once; successful resets revoke that account's local sessions. The new
password is saved only as a hash and the initial dummy credential listing marks
the account as changed. Its academy role and linked students stay unchanged.
See [Password recovery](PASSWORD_RECOVERY.md) for the complete workflow and
future production email configuration.

## Isolation from the hosted application

- The test middleware is registered only for Vite development with explicit
  `VELX_LOCAL_TEST_AUTH=1`, set by `dev:test`. It refuses non-loopback hosts and
  remote connections, strips supplied identity headers, and verifies passwords
  before supplying a fixture identity to the actual application API.
- D1 and R2 persist under `.sites-runtime/local-test/state`, separate from normal
  local preview state and from hosted data. Every setup command uses `--local`.
- `npm run dev` retains the regular hosted-authentication behavior. `npm run build`
  always excludes local test sign-in, even if the local-test environment flag is set.
- The same server-side academy role/ownership checks, SQL constraints and workflows
  run in test mode. Fixture credentials cannot sign in to the deployed Site.
- No production secret, hosting audience or cloud database is changed. This task
  is local-only and does not publish an update.

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

While the local server is running, run `npm run test:local` to verify all five
password logins and role restrictions through the application's actual HTTP API.

The test suite includes local password/session checks and the existing academy
workflow integration tests. Smoke-test each role in the running local application
and verify that direct API requests also respect role restrictions. This does not
test the production identity provider's SSO, password reset or global sessions.

Stop the foreground server with Ctrl+C. Keep it running while using the local URL.
