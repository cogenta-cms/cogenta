---
"@cogenta/cli": patch
---

`GET /api/plugins/blocks` and `GET /api/plugins/widgets` answer 401 to an anonymous request instead of listing what the site's plugins provide.
