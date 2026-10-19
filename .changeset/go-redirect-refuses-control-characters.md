---
"@cogenta/cli": patch
---

`/_cogenta/go?to=` only redirects to a path on the site, and refused `//host`
and backslashes already, but not a tab or line break inside the path: browsers
drop those, so `/<tab>/evil.example` reached `//evil.example`. Any control
character now sends the visitor to the home page instead.
