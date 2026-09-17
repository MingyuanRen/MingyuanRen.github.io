# Personal site

A minimal, empty personal website template. No sample biography, articles, or contact details are included.

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Edit `app/content.ts` to add your name or bio. Empty fields stay hidden. The homepage links to `/personal/`, with two empty categories: 随笔 at `/personal/essays/` and 从夯到拉 at `/personal/rankings/`. Edit their pages under `app/personal/` when ready to write. The site uses Arial with a fixed light appearance.

Layout: `app/page.tsx`. Styles: `app/globals.css`.

```sh
npm test
```

This builds the site and checks the server-rendered empty template.

## Publishing

The public repository `MingyuanRen/MingyuanRen.github.io` deploys to https://mingyuanren.github.io/ through GitHub Actions whenever `main` changes.

`npm run build:pages` creates a static export in `dist/client/`. The normal local development command remains `npm run dev`. Assets live in `site-public/`: the GitHub profile avatar and the favicon from the requested Instagram profile. Old unused artwork in `public/` is excluded.
