---
'@cogenta/seo': patch
---

`SeoResource` takes an optional `categories` map (the slug of the entry's category term, resolved by the caller) so the canonical URL, the sitemap and the hreflang alternates name the category segment of the address (`schema@2.5`); `seoResourceOf` builds a resource with it. `canonicalUrl` no longer refuses an entry that has no category.
