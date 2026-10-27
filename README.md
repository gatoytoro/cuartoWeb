# OnePlusOne website

Public pages for [oneplusone.dating](https://oneplusone.dating). This folder is the website only. The API and the mobile app live elsewhere.

Approved copy is versioned Markdown in `content/`. Each page records `version`, `published_at`, `locale`, `title`, `body`, and `status`.

```powershell
node build.mjs
node preview.mjs
```

Open http://127.0.0.1:4173

`node build.mjs` writes `dist/`: one HTML page per route, plus `dist/content/*.json` for the same copy. Publishing that folder to the domain is a separate step.
