# Personal site

A minimal, empty personal website template. No sample biography, articles, or contact details are included.

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Edit `app/content.ts` to add your name, photo, links, and entries. Empty fields stay hidden. The page retains the NOW, LEARNING, TECH, and CULTURE section labels; change or remove them in the same file.

Layout: `app/page.tsx`. Styles: `app/globals.css`.

```sh
npm test
```

This builds the site and checks the server-rendered empty template.

## Publishing

The public repository `MingyuanRen/MingyuanRen.github.io` deploys to https://mingyuanren.github.io/ through GitHub Actions whenever `main` changes.

`npm run build:pages` creates a static export in `dist/client/`. The normal local development command remains `npm run dev`. Old unused public artwork is excluded from this export; enable `publicDir` in `vite.config.ts` when adding your own assets.
