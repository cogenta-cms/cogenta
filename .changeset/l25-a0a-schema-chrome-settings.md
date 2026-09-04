---
'@cogenta/schema': minor
---

Two new site settings (L25 D2): `general.socialLinks` (site-scoped, up to 12
`{label, url}` entries, `url` must be `http(s)`) and `general.footerNote` (locale-scoped,
up to 400 characters). Both feed `resolveChromeExtras` (`@cogenta/cli`) into
`ChromeInput.social`/`ChromeInput.footerNote` (contract D `theme@1.4`).

`SITE_SETTING_UI_TYPES` gains `'linkList'` — a new, generic `uiType` for a short ordered
list of `{label, url}` pairs, editable as one `Label | https://url` line per entry.
`general.socialLinks` is its first user.
