# Help Web — contextual help topics

Static HTML pages for the CSD Free Float **contextual help** dialog (the **?** control on screens). Authors can extend topics here without changing Angular feature code beyond the topic id stub.

This is separate from [`../intro-web/`](../intro-web/), which powers the global **Help** menu guide.

## Layout

```
help-web/
  _shared/              # Shared styles and locale helper
  statistics/
    shareholders-diff-rank/
      index.html
      css/topic.css
    range-presets/
      index.html
      css/topic.css
```

Topic folders mirror [`web/src/app/`](../web/src/app/) feature paths. Each topic id (e.g. `statistics.shareholders-diff-rank`) maps to a folder under `help-web/statistics/shareholders-diff-rank/`.

## Constraints

- Pages render **inside the app dialog iframe** — use responsive layouts for phone and desktop.
- Use **relative** URLs for images and internal links.
- The host passes `lang` (`bg` | `en`) and `v` (topic content version) as query parameters.
- Register every topic in [`web/public/assets/help-topics.json`](../web/public/assets/help-topics.json) and in [`web/src/app/core/help/help-topic-id.ts`](../web/src/app/core/help/help-topic-id.ts).

## Local preview

Open a topic with locale, for example:

```bash
npx --yes serve .
# then visit statistics/shareholders-diff-rank/index.html?lang=en&v=1.0.0
```

## Integration with the Angular app

Before `ng serve` / `ng build`, the web client copies this folder to `web/public/help/` (`npm run copy-help`).

Bump `contentVersion` for a topic in `help-topics.json` when that topic’s HTML or assets change.
