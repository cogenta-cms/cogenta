---
'@cogenta/cli': patch
'@cogenta/core': patch
'@cogenta/api': patch
---

`cogenta serve` now sends a blocking Content-Security-Policy by default (pentest F-04). It has no `'unsafe-inline'` for scripts: the two inline scripts the server itself writes (the light/dark toggle and a form's conditional fields) are allowed by their sha256 hash, computed from the same constants the page templates insert, so an injected script, an event handler or a `javascript:` link no longer runs. The policy varies by path (admin, public pages, form pages, JSON API) and opens Google Fonts only with `appearance.remoteWebFonts`. `security.csp` still replaces it verbatim; `security.csp: false` now documents turning it off. Sites that add their own inline or third-party scripts must set `security.csp`.
