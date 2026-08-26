---
'@cogenta/theme-kit': minor
---

Add `resolveBlockForRender` (fiche 43, sous-chantier C(ii)) and `withBlockVariant`
(sous-chantier D, RFC 0002), both additive exports.

`resolveBlockForRender` finishes wiring `@cogenta/blocks`'s `BlockRegistry` into the
actual render path: a placed block whose exact type the active theme does not implement
now follows its declared `fallback` chain and renders as the nearest block the theme does
implement, rather than a silently blank slot. Every one of the five in-house themes calls
it once, inside their own `renderBlock`.

`withBlockVariant` stamps a placed block's optional `variant` (`blocks@2.0`, RFC 0002) onto
the element it rendered to, as one `data-variant-<axis>` attribute per axis actually set —
a theme's CSS then resolves each to its own token. Both functions are pure and have no
effect on a block that carries neither a theme-private type nor a `variant`: existing
content renders unchanged.
