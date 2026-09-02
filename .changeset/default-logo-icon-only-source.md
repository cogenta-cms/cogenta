---
'@cogenta/cli': patch
---

Fixed the public icon still looking wrong after the earlier icon-only crop (`272b606`):
the root cause was never the CSS size, it was the source pixels. That crop pulled the
icon out of a combined icon+wordmark lockup, which left the hexagon mark occupying only
a fraction of an already-small 64×64 canvas — no `block-size` on the `<img>` could fix
that, since the mark itself was tiny inside its own image.

`DEFAULT_LOGO_BASE64` (`packages/cli/src/commands/default-logo.ts`) now embeds a
properly composed, generously padded icon-only source (`docs/logo/logo-cogenta-icon.png`
and the matching admin/branding assets, all regenerated together) at 128×128 instead of
64×64 — sharp enough for the 32–40px footer/login contexts that actually display it.
Verified by `curl`, bypassing the browser cache, against the real served bytes.
