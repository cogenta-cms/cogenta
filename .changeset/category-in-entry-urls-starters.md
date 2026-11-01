---
'@cogenta/starters': minor
---

The blog blueprint serves its posts at `/blog/:category/:slug` and the magazine its articles at `/articles/:section/:slug`, for SEO; a post with no category keeps `/blog/<slug>`. The seeded home page buttons link the canonical address. Sites scaffolded before keep their schema: `cogenta schema set-route` moves them.
