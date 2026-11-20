# Project accounts: frontend and database preparation

Updated November 20, 2026. These changes prepare account integration; **no account backend is included, deployed, or connected**. The default configuration disables credential submission. The Program Mapper remains usable without an account and keeps its existing local saving behavior. Cloud plan saving is a later feature.

## Files to merge

- `pages/login-page.html`: redesigned login with a Create Account link, password visibility control, reset link, and authenticated account summary/sign-out state.
- `pages/create-account.html`: display name, email, password, confirmation, and verification instructions.
- `pages/reset-password.html`: reset request and new-password forms.
- `pages/verify-email.html`: explicit email verification action.
- `css/pages/login.css`: scoped account styles; all four pages also load the unchanged shared `css/main.css`.
- `js/pages/account-core.mjs`, `js/pages/account.js`: validation, CSRF/session handling, real-response checks, accessible form state, and error handling.
- `data/accounts/config.json`: public connection configuration, disabled by default.
- `backend/accounts/schema.sql`: additive PostgreSQL account tables, not applied automatically.
- `tests/accounts/`: integration-contract and page-handler tests.

Use `create-account.html` for account registration. The existing `registration.html` is still the course-registration help page. The shared navigation, mapper, homepage, and other tools are unchanged.

## Connect a backend

1. Merge the account runtime files listed above into the branch hosted by Amplify. Keep `enabled: false` until the account service is ready. Static Amplify hosting serves these files; it cannot execute this SQL or the API contract.
2. Implement the endpoints below in a server-side API. For AWS, an API Gateway + Lambda service with network access to the private RDS instance is one option. An existing server in the same VPC also works. This package deliberately does not prescribe or create new AWS infrastructure.
3. Back up the database. From an authorized connection to RDS, review and run `backend/accounts/schema.sql` with `psql -v ON_ERROR_STOP=1 ... -f backend/accounts/schema.sql`. This creates only the `csun_accounts` schema and its tables; it does not alter `csun_mapper`. It is a baseline, not an upgrade tool: `IF NOT EXISTS` will not repair an older, incompatible table definition. Review existing definitions before rerunning.
4. Give the API a dedicated PostgreSQL login, not the RDS master login. As the owner, grant that existing role `USAGE ON SCHEMA csun_accounts` and only `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA csun_accounts`. Keep the role password in your server's secret manager/environment, never a frontend file. Use parameterized SQL and TLS with certificate verification for RDS connections. Restrict database port 5432 to the API's security group.
5. Configure a verified transactional email sender and the exact public site URL. Send verification and reset emails to the submitted address. Never construct links from an untrusted Host header. Implement expiry, single use, abuse controls, and generic responses described below.
6. Route `/api/auth/*` to the API, or configure its HTTPS base URL. If using an Amplify rewrite, place the API rule before any HTML catch-all rule. `/api` is a placeholder until this route exists. A 200 response containing index.html is intentionally rejected by this client.
7. Run end-to-end tests against a staging deployment: new account, duplicate registration, expired and reused tokens, login before/after verification, wrong password, password reset, session expiry, logout, rate limits, and CSRF rejection. Verify cookies in the actual browser. Apply restrictive Content Security Policy, HSTS, and `Cache-Control: no-store` on auth API responses at your host/API.
8. Set `enabled: true` in `data/accounts/config.json` only when those tests pass. Commit the config change to deploy. No database credentials belong in that JSON.

Example configuration:

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "apiBaseUrl": "/api",
  "requestTimeoutMs": 15000
}
```

`apiBaseUrl` is the prefix before `/auth`, with no query, fragment, username or password. `/api` uses the current site origin. An explicit HTTPS API URL is also accepted. Only local development on localhost/127.0.0.1/::1 may use HTTP. Pages hosted on a public HTTP origin are rejected. API redirects are rejected. Do not put bearer tokens or API keys in this config.

## Exact API contract

All bodies are JSON objects. All success responses other than logout have `Content-Type: application/json` and `Cache-Control: no-store`. The client sends cookies with `credentials: include`. Authenticated users are represented as `{ "id": "uuid", "displayName": "Steven", "email": "student@example.com" }`; never include password hashes, database errors, tokens from email, or internal account flags in this object.

| Method and path | Request body | Required success |
| --- | --- | --- |
| GET `/api/auth/session` | None | 200 `{ "user": null, "csrfToken": "..." }` or 200 `{ "user": { ... }, "csrfToken": "..." }` |
| POST `/api/auth/register` | `{ "displayName": "...", "email": "...", "password": "..." }` | 202 `{ "status": "pending_verification" }` |
| POST `/api/auth/login` | `{ "email": "...", "password": "..." }` | 200 `{ "user": { ... }, "csrfToken": "..." }` |
| POST `/api/auth/logout` | `{}` | 204, no response body |
| POST `/api/auth/password-reset/request` | `{ "email": "..." }` | 202 `{ "status": "accepted" }` |
| POST `/api/auth/password-reset/confirm` | `{ "token": "...", "password": "..." }` | 200 `{ "status": "password_reset" }` |
| POST `/api/auth/verify-email` | `{ "token": "..." }` | 200 `{ "status": "verified" }` |

Every POST requires `Content-Type: application/json`, a valid session cookie, and an `X-CSRF-Token` header matching that session. The client obtains a pre-authentication session before registration, login, verification, or reset. GET session must return an anonymous session for an unauthenticated/expired user, rather than a 401. Generate the CSRF token from a server-side session secret or use a signed token bound to that session; store its SHA-256 hash for checking. If storing only a hash, generate/replace the token on GET session and return it to the caller. Each session/CSRF token must have at least 32 cryptographically random bytes, encoded as unpadded base64url (43 characters for 32 bytes). The client accepts 32–512 base64url characters; that syntactic validation does not replace the server entropy requirement.

Error status codes: 400 for invalid input/link, 401 for generic login failure (including unknown email, wrong password, disabled or unverified account), 403 for invalid Origin/session/CSRF, 410 for an expired/used email link, 429 for rate limiting, and 5xx for service failures. Return a small generic JSON error; the frontend intentionally does not display raw server text. Use matching generic responses/timing for unknown versus registered emails. A failed request must not return a success-shaped object. Success JSON/status is verified before the UI announces completion.

## Server-side requirements

- Revalidate everything on the server. Display name: trim, 2–80 Unicode code points; email: trim/lowercase consistently with the client, max254, validate and verify ownership; allow personal email addresses. Password: 15–128 Unicode code points for new/reset passwords, reject all whitespace, allow spaces/paste/Unicode, do not trim, normalize, or silently truncate. Login should accept existing nonempty passwords up to128 characters. Reject common/breached passwords server-side without exposing the submitted password. Set reasonable HTTP body limits. Client checks only improve usability.
- Hash passwords on the server using a maintained Argon2id library, with an individually random salt and a calibrated work factor. OWASP's minimum baseline is 19MiB memory, two iterations, one lane; measure production cost and raise it when practical. Store only the encoded hash in `password_hash`. A DB length check cannot prove the value is a hash. Do not use SHA-256, encryption, or browser hashing for passwords.
- Use an opaque cookie such as `__Host-csun_session`, `Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain attribute. Only the server sets it. Store only SHA-256 hashes of high-entropy session/email tokens in PostgreSQL. Enforce absolute and idle expiry server-side (example:8hours absolute,30minutes idle; shorter for anonymous sessions). Destroy/rotate the anonymous session at login; rotate CSRF at the same time. Check disabled status on every authenticated request. Logout must revoke/delete the session and expire the cookie. Reset must revoke all sessions and outstanding reset tokens; do not automatically log in after reset.
- Require Origin to equal an explicit trusted origin on all POSTs, verify the CSRF token in constant time, and reject missing/null/untrusted Origin for these browser endpoints. SameSite alone is not CSRF protection. No state changes via GET. Rate limit by network identity and normalized account key with a shared server-side store; protect login, register, reset requests and token attempts. Avoid permanent lockout that lets an attacker disable a student's account. Do not log request bodies or password/token headers.
- Prefer a same-origin API. A separate same-site API such as `api.csunreimagined.com` needs exact CORS `Access-Control-Allow-Origin: https://csunreimagined.com`, `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and preflight support for JSON and `X-CSRF-Token`. If both www and apex are used, select a canonical origin and configure exact allowed origins. Never use `*` with credentials. A different-site API requires `SameSite=None; Secure` and may fail with third-party cookie restrictions; route through the site origin instead where possible.
- Keep verification and reset tokens separate, purpose-bound, associated with a user, expiring and single-use. Example lifetimes:24hours for verification,30minutes for password reset. Atomically check and consume them with the relevant account update in a transaction to prevent concurrent replay. Invalidate older purpose-specific tokens when issuing a new one. Expired/unverified registrations need a safe re-registration/resend path: repeated registration returns the same202 response, and may send a new verification link for a still-pending account after throttling. It must never replace a verified user's password. New-account creation races must handle the unique email index and return a generic response.
- Email links: `https://csunreimagined.com/pages/verify-email.html#token=TOKEN` and `https://csunreimagined.com/pages/reset-password.html#token=TOKEN`. Fragments are removed immediately and held in memory until submission; do not add query-string token links or third-party analytics to these pages. Verification requires an explicit button press so email link scanners cannot consume a token with GET. Reloading a token page after its fragment was removed requires reopening the email link. Apply `Referrer-Policy: no-referrer` at hosting level too. Never log full verification/reset links in the mail pipeline or support logs.
- Keep secrets in the backend. Schedule deletion of expired/revoked sessions and expired/consumed tokens. Document account retention, deletion, and email handling before launching registrations. Add future saved-plan tables with an owner user_id and enforce ownership server-side on every read/write; do not treat a client-supplied user_id as authorization.

## Verification

Run from the extracted project root:

```sh
node --test tests/accounts/*.test.mjs tests/student-centers/*.test.mjs tests/program-mapper/*.test.mjs
```

Tests exercise the real page module with a small DOM contract harness and mock API, not a deployed backend. `docs/accounts-validation.json` records the run. No SQL was applied to RDS, no emails were sent, and no live account was created. Browser rendering, autofill/password-manager behavior, CORS/cookies, real email delivery, the migration against staging PostgreSQL, and cloud deployment still require integration testing.

References: [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [PostgreSQL UUID Functions](https://www.postgresql.org/docs/current/functions-uuid.html).
