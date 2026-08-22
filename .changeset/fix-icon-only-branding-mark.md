---
"@cogenta/cli": patch
---

Fix: the default Cogenta mark served at `/_cogenta/logo-cogenta.png` (public
site footer credit, and now the public site's favicon too) was a 64×64
raster containing the icon *and* the "COGENTA" wordmark baked together —
shrinking it to a footer-credit size made the text illegible and left the
hexagon mark itself occupying only a fraction of an already-tiny canvas. No
CSS `block-size` could fix that; the problem was in the source pixels. The
asset is now cropped to the icon alone, trimmed and re-exported at the same
64×64, with the full pixel budget spent on the mark instead of shared with
text nothing at that size could read anyway. Also: the public site now
serves a favicon (`<link rel="icon">`) — there wasn't one before.
