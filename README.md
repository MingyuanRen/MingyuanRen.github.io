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

This builds the site and checks the server-rendered empty template. A private repository stores the source; it does not publish the website.
