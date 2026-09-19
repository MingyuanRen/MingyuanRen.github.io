# Writing on your website

The online studio uses GitHub App sign-in with a persistent browser session.
See [GitHub sign-in setup](github-sign-in.md) for hosting and security details.

Open `/admin/`. The writing page uses the same typography, colors, and layout
as the public site. It supports Markdown, a rendered preview, image uploads,
drafts, existing-article editing, and automatic bilingual publication using OpenAI.
You do not need to edit code or configure hosting each time you write.

## Using another computer

For writing only, open https://mingyuanren.github.io/admin/ and choose
**Sign in with GitHub**. The studio opens on the configured Cloudflare Worker.
Sign in once per browser; the session lasts up to 30 days unless you sign out or
revoke access. No token copying, Node.js, local server, or local OpenAI key is
needed. The translation key stays in the repository's Actions secret.
Online drafts and uploads are public in GitHub.

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

## Picture collection

Choose **Picture** in the writing studio. Drop several pictures or use **Choose
pictures**, then optionally add captions and accessibility descriptions. Earlier /
Later changes their order; Remove hides a picture from the collection without
deleting its uploaded file. Preview shows the masonry layout, preserving each
image's aspect ratio. Readers find it at Personal → Picture and can open originals.

**Save collection locally** updates only this computer. Online, **Publish
collection** commits the list and starts the Pages deployment. Pictures do not
call OpenAI or require bilingual versions. Uploads are saved immediately (and
are public on GitHub); the collection itself is not autosaved. Save it before
leaving. Download collection backs up the JSON list, not image files.

Up to 200 pictures per collection, 5 MB each and 20 MB per upload batch. The list
lives in `content/pictures/gallery.json`; uploaded originals use
`site-public/uploads/`. A missing list is an empty gallery. Revision checks
prevent overwriting a collection edited on another computer.

## Moments and tier lists

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
2. Install the private writing GitHub App only on the website repository, with
   **Contents: Read and write** and **Actions: Read and write**. This permits
   article/image commits and publication workflow runs, not other repositories.
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

## Sign in with GitHub

1. Visit https://mingyuanren.github.io/admin/ and choose **Sign in with GitHub**.
2. The writing studio opens on its Cloudflare Worker. If this browser is already
   signed in, your workspace opens automatically. Otherwise sign in as MingyuanRen
   and approve the private writing App on GitHub.
3. Write, preview, save a draft or publish in the studio. The public site remains
   on GitHub Pages. Local writing at localhost still needs no GitHub login.
4. Use **Sign out** on shared computers. If a session expires while writing,
   sign in again in a new tab to keep your unsaved text in the original tab.

The browser stores only an opaque Secure/HttpOnly session cookie. GitHub access
and refresh tokens stay encrypted on the Worker, not in the page or repository.
Revoke/uninstall the GitHub App to revoke all access; Sign out ends the current
session. The old PAT input has been removed. Revoke any previously shared PATs.

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
only your owner-authorized GitHub App session can write. No credentials are included in the
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
