---
'@cogenta/cli': minor
---

Serve the themes' web fonts from the site itself, and stop pre-connecting to Google.

`cogenta serve` now answers `/_cogenta/fonts/<theme>/<file>.woff2` from the built-in theme
packages: the theme's own `fonts/manifest.json` is the allow-list (a file that is not listed
is a 404), the path is held to a strict shape so no filesystem path can be named, the type is
`font/woff2`, the cache is a year `immutable` (file names carry a hash of their bytes), and
there is no CORS header because only the site's own stylesheet asks.

The page head no longer carries `<link rel="preconnect">` to `fonts.googleapis.com` and
`fonts.gstatic.com`. A default site therefore makes no request to any host but its own for a
font, on every page type of all ten themes (an end-to-end test renders them and fails on any
`googleapis`, `gstatic` or absolute external URL). A `preload` for the body face was built
and measured and dropped: on a throttled link it delayed the stylesheet and made first and
largest contentful paint slower.

A skin may name any bundled family on any theme: the site adds the faces the active theme
does not declare itself. A family that is not bundled falls back to the next family of its
stack. The skin sheet is rendered with the site's `appearance.remoteWebFonts` setting
(`@cogenta/core`), off by default; on, the non-bundled catalogue families are `@import`ed
from Google Fonts and the head pre-connects to it — an explicit, documented choice, never a
silent request. `cogenta skin generate` and the theme generator only offer the model the
families the site can load.

Third-party themes that still `@import` remote fonts keep working.
