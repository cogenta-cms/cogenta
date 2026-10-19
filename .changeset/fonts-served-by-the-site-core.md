---
'@cogenta/core': minor
---

Add `appearance.remoteWebFonts` to the site configuration (default `false`).

Off, no visitor's address is sent to a font provider: skins use the families the built-in
themes bundle and a family outside that set falls back to the next one of its stack. On, a
skin may use the wider Google Fonts catalogue at the price of a request to Google before
any consent, which must then be disclosed (and, depending on your legal analysis,
consented to). It is read as `config.appearance.remoteWebFonts` on the resolved config.
