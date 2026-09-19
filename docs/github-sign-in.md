# GitHub sign-in for the writing studio

Status: login-service code deployed to
`https://mingyuan-writing.playful-personal-site-template.workers.dev`, but GitHub
App registration and repository-only installation are complete. Public client ID,
callback origin and both Worker secrets are configured. Anonymous session requests
return 401 and sign-in redirects to GitHub with a secure browser-bound cookie.
The Pages rollout is approved; live owner sign-in remains the final acceptance
check. No test articles or images are included in this rollout.

## Architecture

Public pages stay at https://mingyuanren.github.io. Its `/admin/` links to a
Cloudflare Worker, which serves the same static editor from Pages, then performs
GitHub requests server-side. A returning browser opens `/admin/` on the Worker
and restores its session without another token or OAuth prompt. Using a separate
top-level studio origin avoids dependence on third-party cookies.

This is a **GitHub App**, not an OAuth App requesting broad `repo` scopes. Install
it only on `MingyuanRen.github.io`. Permissions: Contents read/write and Actions
read/write; Metadata read is automatic. No other repository or account permissions
are needed. GitHub authorization/installation is a security-sensitive step that
the owner must approve. Revoke the previously shared PAT first.

## One-time setup (owner participation required)

1. Sign in to your personal Cloudflare account and enable Workers. Review its plan
   and limits yourself; no paid plan or billing change is required by this code.
   Authenticate the already-installed Wrangler CLI with `npx wrangler login` and
   complete its authorization yourself. Do not share a Cloudflare token in chat.
2. Choose the `mingyuan-writing` Worker on your `workers.dev` subdomain. After
   approval, an initial `npm run auth:deploy` reserves/creates it; without secrets
   it returns a safe “not configured” response and cannot write anything.
   Read the exact returned URL, rather than guessing the account subdomain.
3. In [GitHub App settings](https://github.com/settings/apps/new), register a
   private GitHub App (only installable on your account):
   - Homepage: `https://mingyuanren.github.io`.
   - Callback: `https://YOUR-WORKER.workers.dev/auth/callback`.
   - Expiring user access tokens: enabled (do not opt out).
   - Request user authorization during installation: optional; use the studio
     sign-in button for the normal flow.
   - Device flow: disabled. Webhook Active: disabled for this implementation.
   - Repository permissions: Contents read/write, Actions read/write.
   - Install only on `MingyuanRen.github.io` and approve that access yourself.
   - Generate a client secret yourself. This implementation does not use or need
     a GitHub App private key.
4. Fill the public `STUDIO_ORIGIN` (HTTPS origin, no trailing slash) and
   `GITHUB_CLIENT_ID` in `auth/wrangler.jsonc`. The verified numeric GitHub user
   and repository IDs are already pinned there. Keep them unchanged.
5. Store secrets using Wrangler's interactive prompts (or the Worker dashboard):

   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET --config auth/wrangler.jsonc
   npx wrangler secret put SESSION_ENCRYPTION_KEY --config auth/wrangler.jsonc
   ```

   The encryption key must be a fresh cryptographically random 32-byte key,
   base64 encoded. Generate and transfer it directly into the secret prompt or
   dashboard; do not commit it, log it, or paste it into chat. For isolated local
   auth testing, secrets can go in git-ignored `auth/.dev.vars`. The OpenAI key
   remains in GitHub Actions; **do not copy it into this Worker**.
6. Put the exact same Worker origin into `site-public/writing-config.json` as
   `studioOrigin`. This URL is public, not a secret.
7. Run `npm run auth:check`, `npm test`, and `npm run build:pages`.
   After local review and explicit approval, deploy the Worker with
   `npm run auth:deploy` and commit/push the site changes to Pages. Worker and
   Pages are separate deployments; Pages CI does not deploy the Worker.
8. Open the Pages admin link, sign in and approve GitHub access. Verify reload
   restores the session, only the website repository is writable, and Sign out
   requires a new sign-in. Test a real publish only with content the owner has
   explicitly approved for public upload and (for articles) paid translation.

## Session and security behavior

- OAuth state is random, browser-bound, single-use and valid for five minutes.
  PKCE uses S256; callback and upstream hosts are fixed, with redirects blocked.
- Only the pinned owner user ID and repository ID can establish a session.
- A random opaque `__Host-` cookie is Secure, HttpOnly, SameSite=Lax and lasts at
  most 30 days. It contains no GitHub token. Sessions do not live in localStorage.
- Credentials and pending OAuth verifiers are AES-GCM encrypted in a per-session
  Durable Object. Alarms remove expired records. The key is a Worker secret.
- Requests use same-origin cookies plus a CSRF header. There is no CORS API.
  GitHub App tokens remain on the server; user profile responses are minimized.
- Access tokens are renewed server-side. A per-session queue prevents concurrent
  refresh-token reuse. Failed/uncertain refresh clears the session, without an
  automatic retry. The 30-day absolute session lifetime is not extended.
- Writes are restricted server-side to validated website article/image/gallery
  paths on `main`, and the existing bilingual publish workflow. No arbitrary
  repositories, branch edits, workflow-file edits or file-deletion endpoint.
- Sign out deletes the server-side session and expires the cookie. To revoke
  *all* sessions/access, revoke/uninstall the GitHub App in GitHub settings.
  Rotating the encryption secret invalidates existing encrypted sessions too.
- GitHub authorization revocation is detected on the next authenticated API call
  (401); this version does not register a webhook receiver.
- Public drafts/uploads/history are still public. “Signed in” does not turn
  GitHub into private storage. Unsaved text remains only in the editor.
- Worker observability logging is disabled. Do not add request/header/body logs:
  callback URLs contain short-lived codes and requests contain writing content.
- The static editor requires inline framework hydration scripts. Its CSP therefore
  permits inline scripts; article Markdown still forbids raw HTML. This is not a
  substitute for keeping site dependencies patched and protecting repo access.
- There is no public self-registration. The anonymous login endpoint still uses
  Worker/DO resources; monitor quotas and add Cloudflare rate/WAF controls if the
  endpoint attracts abuse. No automatic paid-plan upgrades are performed.

## Verification and rollout limits

`tests/auth.test.mjs` uses fake keys/accounts and mocked GitHub responses. It
checks state/PKCE, owner restriction, encrypted storage, CSRF, concurrent renewal,
logout, expiry, proxy allowlists and cookie-session client behavior. It does not
prove live GitHub authorization or Cloudflare deployment works. Those remain
manual acceptance checks after owner configuration and approval.

After `npm run auth:check`, run `node build/verify-auth-runtime.mjs` for a
real local workerd/Durable Object smoke test. Its outbound service is entirely
mocked and cannot call real GitHub or publish content.

The local filesystem studio at `http://localhost:3000/admin/` remains unchanged.
`/admin/sign-in/` previews the login UI without a real account or OAuth call.

References: [GitHub App web flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[token renewal](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens),
[Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
