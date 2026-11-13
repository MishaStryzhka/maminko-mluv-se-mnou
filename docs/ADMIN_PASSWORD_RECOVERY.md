# Admin password recovery

The recovery UI is `/admin/forgot-password`. It sends a single-use link to the
email already stored on an active `admin_users` record. The account owner enters
the replacement password on `/admin/reset-password`; operators and assistants
must not request, read, or type that password on the owner's behalf.

## Deployment boundary

- Publish this change to the reviewed staging branch first. Do not merge or
  promote the application to Production as part of the recovery task.
- `ADMIN_PASSWORD_RESET_ENABLED=true` enables the endpoint. It is off by default.
  Initially scope it to Preview, branch `feat/stripe-checkout-staging` only.
- `PUBLIC_SITE_URL` must be the exact HTTPS origin of the stable branch alias.
  The endpoint requires that Origin and never accepts a redirect or recipient
  override. Open the stable alias, not an immutable deployment URL.
- Reuse the configured `SMTP_USER=info@maminko-mluv-se-mnou.cz` and secret
  `SMTP_APP_PASSWORD`. Never print, decrypt, copy, or commit the secret.
- Recovery mail is independent of `ORDER_EMAIL_TEST_ENABLED`. Leave that flag
  false and leave `STRIPE_ALLOW_LIVE=false`; no checkout/payment changes are needed.
- Preview and Production currently share the `DATABASE_URL` configuration. The
  owner explicitly authorized recovery of the existing account knowing that its
  password changes for both. Do not describe the database operation as isolated
  to staging. Other users, roles, products and orders must remain unchanged.

## Security contract

- `POST /api/admin-password-reset` with `action=request` validates the input and
  returns the same `202 {ok:true}` before account lookup or SMTP. Unknown,
  inactive and rate-limited accounts have the same public response.
- Vercel `waitUntil` retains bounded background processing (function limit 60s).
  It is best effort, not a durable delivery queue. Failure logs contain only a
  fixed event code, never addresses, SQL, credentials or token-bearing URLs.
- Request limits are database-backed: global 60/hour, client IP 10/hour,
  email 3/hour and a 60-second cooldown. Completion limits: global 120/hour,
  client IP 30/hour, token 6/hour. Counters use hashed identifiers and are capped;
  stale buckets are pruned after one day on allowed requests.
- A cryptographically random 32-byte token is sent in the URL fragment. Only
  its SHA-256 hash and a 15-minute expiry are stored. The page removes the
  fragment immediately, retains it only in memory, and has no third-party assets.
- New requests supersede the prior link. SMTP failure clears only its own hash.
  GET/page load does not consume a token, including email-link scanner visits.
- Completion validates the 12–200-character password, then performs one SQL CTE:
  conditional password replacement, token consumption, failure-lock clearance,
  auth-version increment and deletion of existing sessions. It preserves the
  current scrypt format, account ID, email, role and active status.
- Completion issues no login session. It clears the current cookie and sends
  a separate security notice to the stored account email.
- The upgraded auth path captures the version before password verification,
  guards session issuance with it, and rejects stale versions during reads.
  Columns use `NOT NULL DEFAULT 0` for additive legacy compatibility.

### Legacy deployment limitation

The existing-session deletion works across deployments sharing the database.
An old application instance, however, does not check `auth_version`. An old-code
login already in flight could finish after the deletion snapshot. Ask the owner
not to submit other logins while resetting. Do not claim global fencing of all
possible legacy in-flight sessions, deactivate accounts, add blocking triggers,
or delete old deployments as a workaround. Releasing the upgraded auth path to
Production is a separate authorized release.

## Verification

Run `npm test` and `git diff --check`. Recovery tests use synthetic credentials,
injected SMTP and PGlite (Postgres in WASM) only, never deployed data. They cover
single-use/expiry, duplicate submissions, transaction rollback, stale versions,
rate-limit atomics, recipient/origin guards, generic responses and UI states.
PGlite validates SQL and interleaved service calls; it is not a multi-backend
Postgres load test.

After the reviewed Preview deployment is ready, inspect the live forgot/reset
pages and negative-token state. The owner supplies the registered email, opens
the recovery email and sets their new password privately. Confirm login using
visible signed-in state only. Never capture or persist the new password, reset
token, token-bearing URL or mailbox content in screenshots/notes.

## Disable / rollback

Set the branch-scoped `ADMIN_PASSWORD_RESET_ENABLED=false` and redeploy to stop
new requests and completions on the newly routed deployment. Older immutable
deployments retain their environment snapshots; this is not a global revocation
of all old enabled endpoints. Links expire after 15 minutes. A security incident
requires separately authorized invalidation of outstanding hashes and review of
old enabled deployments. Disabling does not undo a password already changed.
Keep additive columns; no destructive down-migration is needed.
