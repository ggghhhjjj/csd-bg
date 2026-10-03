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

Introduction HTML lives in [`../intro-web/`](../intro-web/) and is copied to `public/intro/` before serve/build (`npm run copy-intro`). Bump `contentVersion` in [`public/assets/intro.config.json`](public/assets/intro.config.json) when intro content changes.

Contextual help (the **?** control) lives in [`../help-web/`](../help-web/) and is copied to `public/help/` (`npm run copy-help`, included in `copy-static`). Register topics in [`public/assets/help-topics.json`](public/assets/help-topics.json) and [`src/app/core/help/help-topic-id.ts`](src/app/core/help/help-topic-id.ts); co-locate `*.help-id.ts` next to Angular features.

Application build number lives in [`public/assets/app.config.json`](public/assets/app.config.json) and is shown in the header (`v42`). GitHub Pages deploy bumps it automatically during `npm run build:web` (CI only); scraper-only commits do not trigger a web deploy or version change.

Do not copy `data/vectors` into `www/`.
