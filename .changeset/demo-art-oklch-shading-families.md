---
'create-cogenta': minor
---

L25 task A0c — a quality overhaul of the procedural demo-art module (A0b) so
`heroArt`/`coverArt`/`avatarArt`/`productArt` read as a premium SaaS/agency
template rather than an out-of-focus photo of skin.

- New `demo-art/oklch.ts`: a zero-dependency sRGB↔OKLCH converter
  (Björn Ottosson's OKLab, polar form) with `rotateHue`/`withChroma`/
  `withLightness`/`withMinChroma`. Every "derive a second/third hue from one
  accent" move in `compositions.ts` now happens in this perceptually uniform
  space instead of mixing sRGB toward grey or white/black, which desaturates
  a hue as a side effect rather than moving lightness or chroma on their own.
- `render.ts` gains per-shape gradient fills (`linear`/`radial`, computed in
  world space so "light falls from the top-left" reads consistently across
  rotated shapes), soft drop shadows, per-shape opacity and blend modes
  (`screen`/`multiply`), and a compiled bounding box per layer so a small
  accent shape only costs work over the pixels it can touch.
- `heroArt` gains a `variant` parameter (`mesh`/`geometric`/`diagonal`/
  `radial`/`dark`/`warm`) — every variant keeps its left half calm (low local
  contrast, close to a flat wash) so a title sits over it legibly, with every
  mesh point, glow and shape anchored at `x ≳ 0.55`.
- `coverArt` gains nine visibly different layout families (translucent
  screen-blended discs, a gradient-shaded geometric card stack, a diagonal
  split, offset concentric rings, a wave band, a dot grid with a glowing
  node, thin crisp lines over a soft blob, an editorial flat field, a dark
  accent-tinted glow), picked deterministically by seed.
- `productArt` gains six gradient-shaded, drop-shadowed, specular-highlighted
  "object" families (rounded card, capsule, sphere, stacked cards, torus,
  hexagonal tile) on a grounded backdrop with a contact shadow, so a seeded
  product photo reads as a stylised 3D render rather than a flat shape.
- **Real bug found and fixed while eyeballing a rendered contact sheet, not
  just reading code**: `meshHues`' "counter" hue used a single fixed −55°
  rotation. That is safe for a violet/blue-violet accent (this project's own
  SaaS-flavoured palettes), but the *same* −55° pushes a teal/cyan accent —
  this project's own `store` starting skin, hue ≈186° — straight into
  OKLCH's yellow-green "olive" band (≈131°, `#427000`), visible as a dull
  army-green blob against the accent's own clean teal in `hero-geometric`/
  `hero-diagonal`/`hero-dark`. `rotateAwayFromMud` now checks the actual
  candidate hue and flips direction (+55° instead, landing on a clean
  blue-violet) rather than committing to one sign — correct for both this
  project's shipped palettes and whatever hue an AI-generated skin (L18/L19)
  hands it.

No new dependency (R9/R10): `oklch.ts` is arithmetic only, same discipline as
the rest of `demo-art`. Public signatures unchanged (`renderArt(spec)`,
`heroArt(palette, variant?, seed?)`, `coverArt(palette, seed?)`,
`avatarArt(palette, seed?)`, `logoArt(seed?)`, `productArt(palette, seed?)`),
so `demo-media.ts`'s existing `mediaSpecs` wiring from A0b needs no changes.
