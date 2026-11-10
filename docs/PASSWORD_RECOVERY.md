# Password recovery

The application includes **Forgot password?**, an email request page and a reset
page with new-password confirmation. Independent hosting remains a later task.
The existing hosted Sites/ChatGPT sign-in is preserved. This feature does not
change academy roles, admissions, parent/student links, fees or account grants.

## Test it locally now

Run `npm run dev:test`, then:

1. Open `http://localhost:5173/local-login` and choose **Forgot password?**.
2. Enter `parent@velx.test` or `student@velx.test`.
3. Open `http://localhost:5173/local-inbox`. The test server captures the reset
   email here instead of sending a real email.
4. Open the reset link and enter the new password twice. Use 12–128 characters.
5. Return to sign in and use the new password. The old password stops working and
   existing local sessions for that account are revoked.

Local links expire after 15 minutes, work only once and are invalidated when a
newer link is issued for the same account. The request response is identical for
known and unknown emails. Requests are rate limited by IP and email. The inbox
and test middleware are available only on the loopback test server and are
excluded from the production Worker.

Only password hashes change in `accounts.json`; neither academy user IDs nor
roles are replaced. The new password is never written to `credentials.json` or
the captured email. The local credentials file records whether a test account
has changed its initial password. The initial shared dummy password remains
valid only for accounts that have not changed it. Restarting the server preserves
updated hashes and pending unexpired reset links.

The captured inbox contains sensitive test reset links. Its files live under
ignored `.sites-runtime/local-test/`; do not publish or commit them. Local test
email capture is not proof of real SMTP delivery.

## Configure real recovery for the future independent deployment

The real email recovery adapter uses **Supabase Auth**, with custom SMTP such as
Resend configured in that provider. The academy can continue using D1 for academy
records; this adapter changes only credentials in the authentication service.

Configure these server runtime values when preparing independent authentication:

| Variable | Purpose |
| --- | --- |
| `AUTH_RECOVERY_PROVIDER=supabase` | Explicitly enable the recovery adapter |
| `SUPABASE_URL` | HTTPS URL of your authentication project |
| `SUPABASE_PUBLISHABLE_KEY` | Project publishable key; no service-role key is used |
| `APP_PUBLIC_URL` | Trusted HTTPS origin of your academy website |

Use hosting environment settings, not committed files, for real configuration.
The endpoint remains unavailable until configuration is complete; it does not
pretend an email was sent when no provider is configured. The settings above do
not replace the current Sites login or implement the future independent login
and invitation flow; those must use the same Supabase project when added.

In Supabase:

1. Configure production custom SMTP and a verified sender/domain. The provider's
   default test SMTP is not sufficient for delivering to academy families.
2. Configure the site's HTTPS URL and allow `/reset-password` as a redirect.
3. Set the email OTP/link expiry to **900 seconds**, and use a minimum password
   length of at least **12** to match the application.
4. Replace the **Reset password** email template with the template below. Its
   token is in a URL fragment so it is not sent in access logs or referrers. The
   page clears the fragment immediately and keeps it only in component memory.
5. Enable the provider's password-change security notification if desired.
6. Verify real delivery, expiry, one-time use, role isolation and sign-in after a
   reset in a separate staging environment before moving production accounts.

```html
<h2>Reset your VELX password</h2>
<p>We received a password reset request for your academy account.</p>
<p>
  <a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=recovery">
    Choose a new password
  </a>
</p>
<p>This link expires in 15 minutes and can be used once.</p>
<p>If you did not request a reset, you can ignore this email.</p>
```

The normal `ConfirmationURL` template redirects with an authenticated session;
this implementation intentionally expects the custom `token_hash` template
above. Do not substitute it without changing and retesting the recovery flow.
Merely viewing the page does not consume the token: verification occurs when the
user submits a valid new password and matching confirmation. This also avoids
email link scanners consuming the token before the user acts.

The server verifies only **recovery-purpose** tokens through the provider, then
updates that authenticated user's password. Clients cannot select a user ID or
role. The provider consumes the token; the application does not store or return
provider access/refresh tokens. A failed password update after token verification
requires a new link. Successful provider resets append an audit event where the
email matches an existing academy user, without updating that user's role or links.

After success, the user signs in again. The adapter requests global provider
sign-out; refresh sessions are revoked, while already issued access JWTs follow
the provider's access-token expiry rules. Account revocation remains enforced by
the academy on each API request. This is not a substitute for the later verified
identity/session integration needed for independent hosting.

## Verification

`npm test` covers password policy, matching confirmation, generic request
responses, expiry, superseded tokens, replay rejection, origin checks, local
session revocation and the provider adapter. The provider network is stubbed in
automated tests; no real SMTP credentials or account secrets are required.

`npm run test:recovery` exercises the running localhost reset endpoints, checks
that parent/student roles and linked profiles stay unchanged, and restores the
initial dummy password through a second verified recovery flow. It skips dummy
accounts whose password the user has already changed. It does not send real email.

References: [Supabase recovery API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
