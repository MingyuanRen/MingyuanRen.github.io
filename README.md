# Personal site

A minimal personal website with an on-site Markdown writing studio.

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

The homepage links to Engineering Notes at `/tech/` and Personal at `/personal/`,
with 随笔 and 从夯到拉 categories. The site uses Arial with a fixed light appearance.

For local writing, also run `npm run cms`, then open
`http://localhost:3000/admin/`. No GitHub login is needed locally and saving does
not commit or deploy. See [the writing guide](docs/writing.md) for drafts,
translations, and connecting a repository-scoped GitHub token for online publishing.

Layout: `app/page.tsx`. Styles: `app/globals.css`.

```sh
npm test
```

This builds the site and checks rendering, Markdown safety, and draft visibility.

## Publishing

The public repository `MingyuanRen/MingyuanRen.github.io` deploys to https://mingyuanren.github.io/ through GitHub Actions whenever `main` changes.

`npm run build:pages` creates a static export in `dist/client/`. The normal local development command remains `npm run dev`. Assets live in `site-public/`: the GitHub profile avatar and the favicon from the requested Instagram profile. Old unused artwork in `public/` is excluded.
