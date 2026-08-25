# CSD Web Client

Angular 22 + Apache Cordova (`cordova-browser`) PWA. Application sources are in `src/`. `www/` is **build output only** — never edit it.

## Commands

```bash
npm install          # requires Node 24
npm start            # ng serve; toggle EN/BG via localStorage + reload
npm test
npm run build        # single production app → www/
npm run cordova:run  # hook runs npm run build, then cordova run browser
```

Language is not part of the URL. Old `/en/` and `/bg/` Pages bookmarks 404.

Dataset URLs are in [`public/assets/vectors.config.json`](public/assets/vectors.config.json). Changing them is an application change, not a weekday scrape.

Do not copy `data/vectors` into `www/`.
