---
'@cogenta/api': minor
---

`GET /api/content/-/by-path` answers an address with a wrong or missing category segment (`schema@2.5`) with a 301 to the canonical one instead of a second 200, looks the entry up by its other route parameters, and the preview link and the SEO router name the canonical address. `ContentServiceOptions.routing`, `RestRouterOptions` and `SeoRouterOptions` take `terms`.
