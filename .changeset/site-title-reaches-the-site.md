---
'@cogenta/cli': minor
---

Make the "Site title" setting reach the site.

Its own help text promises the browser tab and search results, and it reached
neither. `<title>`, `og:site_name`, the `%site%` token of the SEO template and
the theme's banner all read `site.name` from `cogenta.config.mjs`, which an
editor cannot change; the only thing that ever read `general.title` was the
admin's own footer.

Every public render now resolves the site's name through the setting, falling
back to the configured name when it is empty. Read per render, like the
branding and chrome settings beside it and for the same reason: a title
changed in the admin shows on the next page, with no restart.

Deliberately not applied in three places: the theme gallery preview pins its
own fictional site name, widget-area resolution renders no title, and the
WebAuthn relying party keeps the configured name — a credential is bound to
it, and an editable setting has no business moving it.
