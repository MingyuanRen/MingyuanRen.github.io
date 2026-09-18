# Writing on your website

Open `/admin/`. The writing page uses the same typography, colors, and layout
as the public site. It supports Markdown, a rendered preview, image uploads,
drafts, existing-article editing, and automatic bilingual publication using OpenAI.
You do not need to edit code or register with Cloudflare or Netlify.

## Using another computer

For writing only, open https://mingyuanren.github.io/admin/ and connect with a
fine-grained GitHub token scoped only to this repository, with **Contents: Read
and write** and **Actions: Read and write**. No Node.js, local server, or local
OpenAI key is needed. The translation key stays in the repository's Actions
secret. The token must be entered again after refreshing; keep it in a password
manager, not in the repository. Online drafts and uploads are public in GitHub.

For development, install Node.js 24 and Git, then:

```sh
git clone https://github.com/MingyuanRen/MingyuanRen.github.io.git
cd MingyuanRen.github.io
npm ci
npm run dev
```

Open http://localhost:3000/. For local writing, run `npm run cms` in a second
terminal. To translate locally, create your own git-ignored `.env.translation`
with `OPENAI_API_KEY=your-key`, then restart the writing service. GitHub Actions
secrets are not downloaded by cloning the repository.

Before starting work on either computer, run `git pull --ff-only` with a clean
working tree. Online publication also changes `main`, so pull before making
further code changes. Commit and push reviewed changes to deploy; local Publish
does not push. Resolve conflicts deliberately, without force-pushing.

Only committed and pushed files follow you to another computer. Local-only
articles, uploaded pictures, and unsaved editor text do not sync. Back up private
drafts and their images separately; do not push them to this public repository
just to transfer them. Save or download your current writing before leaving.

## Local trial — no commits or deployment

Run `npm run dev` and `npm run cms` in separate terminals. Open
http://localhost:3000/admin/ and click **Start writing locally**.
The second command runs a filesystem adapter bound to 127.0.0.1:8081.
It accepts only the localhost:3000 origin and validated content/image paths,
rejects links and stale revisions, and never invokes Git.
If it is unavailable, local mode fails closed; it never falls back to GitHub.
Stop this service when you finish.

1. Choose Engineering Notes, 片刻 / Moments, or 从夯到拉 / Tier lists.
2. Choose **I write in: 中文 / English** and write the body. Your preferred language
   is remembered for new articles. Notes and tier lists need a title; moments do not.
   Date, optional summary and URL name live under publication details.
   A URL name is generated on first save if left blank.
3. Switch between **Write** and **Preview**. Raw HTML is displayed as text.
4. **Save draft** saves only the version you are writing, without a translation call.
5. **Publish locally** translates the current text and publishes both versions in
   the local preview. No prior save or separate Generate action is needed.
6. Reopen it under **Articles**. Saved URLs are locked to avoid orphaned copies.
7. Readers open the article and switch between **中文 / English**. No reader action
   calls OpenAI. Republishing regenerates the other language from the version you
   are editing, replacing its previous wording (including manual translation edits).

There is no automatic draft saving. Unsaved changes stay in memory and the editor
warns before leaving. Save regularly or use **Download .md** as a local backup.
The downloadable backup is marked as a draft regardless of the online version.
Uploaded images are saved immediately; on GitHub this is a separate public commit.

## Two personal writing formats

**片刻 / Moments** is for a passing thought or a short paragraph. There is no
required title: a short internal title is derived for links and metadata. Readers
see paragraphs in the Moments feed and a clean text page, without dates. Dates
remain internal sorting metadata. The existing
`/personal/essays/` URL remains unchanged, and old Markdown articles keep working.

**从夯到拉 / Tier lists** has three parts:

1. Write an introduction.
2. Upload/drop poster images into the upload area, then drag them from Unranked
   into 夯, 顶级, 人上人, NPC, or 拉完了. Drop onto another poster to insert before it.
   The tier selector and Earlier/Later buttons provide keyboard/touch alternatives.
3. Optionally write a free-form paragraph in the blank text area below the board.
   It has no automatic heading, and is omitted from the article when left blank.
   Then edit film titles and write under each film's subsection. These follow tier
   and within-tier order in the finished article.

Boards support 40 posters (5 MB per image, 20 MB per upload batch).
Drafts can keep unranked posters. Publishing requires every poster to have a name
and a tier. The browser creates a PNG and uploads it before saving the article.
Readers see the introduction, the finished PNG, then the film-by-film reasons;
there are no public editing controls. A download button also exports the PNG
without publishing.

The Markdown frontmatter stores structured `ranking` data as well as the generated
image URL. Reopening an article restores its layout, images, and reasons, so the
PNG is not your only editable copy. Removing a poster from the board does not
delete its uploaded file. Publication translates the introduction, commentary, film titles and descriptions
while preserving the board, poster paths, tiers and ordering.

## Translate on Publish

Write in one language, then **Publish**. The current unsaved text is translated to
the other language and both versions are published. You stay on your original
language in the editor. The publish button explains the API charge and that
republishing replaces the other language's wording. Existing language files are
updated only if their revisions have not changed during translation.

Progress and errors appear by the publishing controls; errors scroll into view.
On translation failure no article is updated, and your current text remains in
the editor. Save a draft or download it to keep a backup. Draft saving works
without an OpenAI key. There are no automatic paid retries.

Local setup (enter the actual key yourself; never put it in chat):

1. Create `.env.translation` at the project root, containing `OPENAI_API_KEY=your-key`.
   This file is git-ignored. Do not use a `NEXT_PUBLIC_` or `VITE_` environment variable.
2. Restart `npm run cms`. Only the local writing server loads this file.
3. **Publish locally** translates and saves both language files. It does not commit
   or deploy. Both files are staged before replacement, and filesystem write failures
   attempt rollback. This is not a crash-proof database transaction: keep backups.

Online setup, **after approving and deploying the bilingual publication workflow**:

1. In the website repository, open Settings → Secrets and variables → Actions →
   **New repository secret**. Name it `OPENAI_API_KEY` and enter the key yourself.
   Use a secret, not a public repository variable or a Markdown file.
2. Bilingual publishing needs an additional permission: explicitly grant
   the website-only fine-grained token **Actions: Read and write**. This permission
   can also manage workflow runs; leave all other repositories inaccessible.
   Draft saving still only requires Contents: Read and write.
3. Reconnect the writing studio. Write in either language and choose **Publish**.
4. The studio starts `publish.yml` on `main` with the current text and expected
   revisions. GitHub Actions translates it and creates one commit containing both
   language files, then calls the Pages workflow to deploy that exact commit.
   The main branch moves only after translation and validation succeed; concurrent
   changes cause a conflict instead of an overwrite. The studio waits up to five
   minutes for the workflow. On timeout or refresh, check Actions and the article list.
   A deployment failure can leave both files saved in GitHub but not yet live;
   check the failed deployment before publishing again (and paying for another translation).
   Do not repeatedly start new requests while one may be running.

The default model is `gpt-5.6` (GPT-5.6 Sol), with `reasoning.effort: none` for
direct translation without extra reasoning overhead. Override `OPENAI_TRANSLATION_MODEL` in the local
env file or as a GitHub Actions repository variable. Automatic translation is capped
at 24,000 input characters and 16,000 output tokens, with a two-minute API timeout.
Online workflow dispatch also has a conservative 60 KB request limit.
There are no automatic paid retries. Check your API account's billing and limits;
your ChatGPT subscription is not the API credential used here.

Translation runs only when the author requests it in the writing studio. Readers
switch between pre-generated static pages; page views never trigger API calls.
The OpenAI key is server-side only and never sent to the browser. The publish
disclosure explicitly covers sending article text to OpenAI and API charges. Poster binaries
are not sent. The API request uses `store: false` (not a promise of zero data
retention); source, key and provider responses are not logged. A malformed,
refused or truncated translation is rejected. Source revisions are checked before
and after generation, and both versions are updated together only after validation.
On GitHub, **draft source/history is public**, even while excluded from the website.

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), and
[GitHub workflow dispatch permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).

New uploads use temporary in-memory image previews until the GitHub Pages build
finishes. If you refresh immediately after upload, wait for deployment before
exporting: saved image URLs may not be live yet. Image uploads and the generated
PNG are separate commits; if the later article save fails (for example a revision
conflict), an unreferenced image can remain in the public repository. Your current
text remains in the editor for download/recovery.

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
