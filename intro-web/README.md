# Intro Web — static welcome content

Self-contained static HTML for the CSD Free Float introduction dialog. Designers and a separate team can develop pages here without touching the Angular application.

## Layout

```
intro-web/
  index.html       # Entry page (welcome)
  css/             # Stylesheets
  assets/          # Images, icons
```

## Constraints

- All pages render **inside the app dialog iframe** — use responsive layouts that fit phone and desktop viewports.
- Prefer relative URLs for internal navigation (`href="page-2.html"`).
- The host app passes `lang` (`bg` | `en`) and `v` (content version) as query parameters.
- Do not rely on permanent browser caching; the host may append a version query string.

## Local preview

Open `index.html?lang=bg` in a browser, or run a static server:

```bash
npx --yes serve .
```

## Integration with the Angular app

Before `ng serve` / `ng build`, the web client copies this folder to `web/public/intro/`. Edit files here, then restart or rebuild the web app to see changes.

Bump `contentVersion` in [`web/public/assets/intro.config.json`](../web/public/assets/intro.config.json) when content changes so returning users see the updated introduction.
