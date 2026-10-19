---
'@cogenta/agents': minor
---

Only offer the model typefaces the site can load.

`generateSkin`, `generateSkinCandidates` and `proposeThemeCandidates` take a new
`remoteWebFonts` option (default off). Off, the prompt lists only the families the
built-in themes ship and the site serves itself, instead of the whole 70-family catalogue,
because a family that falls back to a system face is a typeface the owner would never see.
On, the whole catalogue, as before.
