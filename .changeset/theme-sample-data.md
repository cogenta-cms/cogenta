---
"@cogenta/core": minor
"@cogenta/api": minor
"@cogenta/cli": minor
---

Apply a theme together with its starter's sample data (L28). `POST /api/theme/sample-data/preview` computes, without writing, what importing the sample data would do — collections added or found incompatible, slugs the site already owns, menus and settings filled or kept, media added, and for a reset exactly what is deleted — as coded warnings. `POST /api/theme/sample-data/apply` recomputes that plan and applies it: `keep` is strictly additive, `reset` takes and verifies a backup first and requires the site name typed as confirmation. Both rewrite the schema, so applying is limited to `cogenta dev`. `GET /api/theme` gains `sampleData: { themes, writable }`. New error codes `THEME_SAMPLE_DATA_UNAVAILABLE` and `THEME_SAMPLE_DATA_CONFIRMATION_INVALID`.
