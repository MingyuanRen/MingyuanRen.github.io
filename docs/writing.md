# Writing on your website

Open `/admin/`. The writing page uses the same typography, colors, and layout
as the public site. It supports Markdown, a rendered preview, image uploads,
drafts, existing-article editing, and separately authored Chinese/English versions.
You do not need to edit code or register with Cloudflare or Netlify.

## Local trial — no commits or deployment

Run `npm run dev` and `npm run cms` in separate terminals. Open
http://localhost:3000/admin/ and click **Start writing locally**.
The second command runs a filesystem adapter bound to 127.0.0.1:8081.
It accepts only the localhost:3000 origin and validated content/image paths,
rejects links and stale revisions, and never invokes Git.
If it is unavailable, local mode fails closed; it never falls back to GitHub.
Stop this service when you finish.

1. Choose Engineering Notes, Personal · 随笔, or Personal · 从夯到拉.
2. Fill in a title, URL name (Chinese or letters/numbers/hyphens), date and body.
3. Switch between **Write** and **Preview**. Raw HTML is displayed as text.
4. **Save draft** excludes the article from the website.
5. **Publish locally** makes it visible only in the local preview.
6. Reopen it under **Articles**. Saved URLs are locked to avoid orphaned copies.
7. **Open / add English version** creates a separate translation using the same URL
   name. Nothing is machine-translated. Readers see a switch only when both language
   versions are published.

There is no automatic draft saving. Unsaved changes stay in memory and the editor
warns before leaving. Save regularly or use **Download .md** as a local backup.
The downloadable backup is marked as a draft regardless of the online version.
Uploaded images are saved immediately; on GitHub this is a separate public commit.

## Connect GitHub — no login server

This implementation uses a fine-grained personal access token, **not OAuth**.
GitHub Pages only serves static files. A token allows the browser to use
[GitHub's Contents API](https://docs.github.com/en/rest/repos/contents)
directly, without adding an authentication backend.

After the implementation has been reviewed and deployed:

1. Visit https://mingyuanren.github.io/admin/.
2. Follow **One-time setup on GitHub** to
   [create a fine-grained token](https://github.com/settings/personal-access-tokens/new).
3. Set an expiration, choose **Only select repositories**, and select
   **MingyuanRen.github.io**. Give **Contents: Read and write** permission.
   Metadata read access is automatic; do not grant access to other repositories.
4. Paste the token into the password field and click **Connect GitHub**.
   Do not send the token in chat, commit it, or put it in an environment variable.
5. Write, preview, save a draft or publish without leaving the website.

The token is held only in memory for the tab, never in localStorage, sessionStorage,
cookies, URLs or generated files. **Re-enter it after refreshing or reopening the
page.** Disconnect clears it. It is sent only to https://api.github.com, with
redirects blocked and browser credentials omitted. Revoke it in GitHub settings
if you no longer want this access. Repository permissions are enforced by GitHub;
the page's UI/account checks are not a replacement for token scope.

Each online save requires confirmation and creates a commit on `main`.
Publishing triggers the existing GitHub Pages workflow. A successful commit
does not guarantee a successful deployment: follow **Check deployment** and then
**View article**. Publication may take a few minutes. If a file changed elsewhere,
the save fails without overwriting it; download your edits, reopen the latest
version and merge manually.

**Live GitHub authentication and publishing have not yet been tested.** Local
end-to-end checks and mocked API tests do not substitute for a real authorized
production test. No production test or code deployment happens before approval.

## Public repository warning

**Drafts, images and revision history committed to this repository are public,
even when an article is excluded from the website.** Never upload confidential
work notes, private journals, or credentials. Deleting a file later does not remove
it from Git history. The editor displays this warning before online saves.

Markdown files live at `content/<engineering|essays|rankings>/<slug>.<zh|en>.md`.
Images live at `site-public/uploads/`; supported formats are PNG/JPEG/GIF/WebP,
up to 5 MB. SVG/HTML uploads are rejected. The renderer disables raw HTML and
unsafe link protocols. Draft bodies are excluded from published article data.

The static site and its scripts are public. Anyone can visit the admin URL, but
only your repository-scoped token can write. No credentials are included in the
site. No third-party editor scripts or analytics are loaded by the writing page.

## Dependency review

The former CMS was removed rather than shipping its prebuilt dependency bundle.
Compatible transitive fixes and patched React/Vite/build packages were installed.
The remaining npm audit findings are in the existing development-only
`drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild` chain.
It is not imported by the writing page or served by GitHub Pages. Do not expose its
development server. A forced audit fix proposes a breaking downgrade; it was not
applied. Recheck with `npm audit` and `npm audit --omit=dev` before deployment.

The lint, build, static export and writing tests are independent of the optional
Cloudflare/database scaffold. A standalone `tsc --noEmit` still reports missing
Cloudflare worker type declarations in `db/index.ts` and `worker/index.ts`;
those existing files are unchanged by the writing feature.
