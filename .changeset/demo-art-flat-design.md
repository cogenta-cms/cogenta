---
"create-cogenta": minor
---

`demo-art`'s procedural visuals (L25 D1) are redesigned to a flat, structured register —
D5, a binding product-owner rule handed down after seeing the first generated templates:
"zero dégradé... typiquement le style cent pour cent IA". Every hero, cover, avatar,
logo, and product composition is now built only from solid colour fields, crisp
geometric shapes with a hairline anti-aliased edge, dot/line grids, hard-edged colour
bands, a checkerboard, and hard-edged organic blobs (circles fused by a smooth minimum,
never blurred) — the register of Basecamp, Notion, GitHub, and Stripe's documentation
illustrations, not a "mesh gradient" landing page.

`render.ts` gains four new flat layer kinds — `fill` (an honest full-canvas solid,
replacing a one-stop `gradient` standing in for a background), `bands` (two or more flat
colours tiled edge-to-edge with a hard seam), `checker` (a bounded checkerboard), and
`blob` (organic hard-edged silhouettes) — plus an optional bounding box on `dots` so a
grid can be confined to part of the canvas. `gradient`/`glow`/`vignette` stay defined and
tested in `render.ts` as a capability; nothing in `compositions.ts` emits one anymore
(`test/demo-art/flat-design.test.ts` is the gate that holds this line across every
variant, seed, and palette).

`heroArt`'s `variant` keeps its existing values (`mesh`/`geometric`/`diagonal`/`radial`/
`dark`/`warm`) as aliases of six flat families — grid & node, colour blocks, diagonal
bands, concentric rings, an editorial mark on ink, and arch & sun — plus clearer new
names (`grid`/`blocks`/`bands`/`rings`/`ink`/`sun`) for the same families; a name and its
alias always render byte-identical output, so no existing caller needs to change. Every
hero variant keeps its left ~55% a single flat colour so a title reads cleanly over it
(verified geometrically, not just by eye). `coverArt` picks from nine flat families
(colour block, grid & node, stripe band, concentric, editorial mark, isometric stack,
arch & sun, checker/half-tone, duotone blobs). New `oklch.ts` (sRGB↔OKLCH, no dependency)
derives 2–3 flat "companion tones" from a palette's `accent` by hue rotation, and clamps
a dedicated warm background tone into the amber/terracotta arc so the "warm"/"sun" family
reads as warm even from a cool accent (a store's teal, say) rather than barely rotating
it.

Two real bugs found and fixed during visual review (not just unit tests): the "arch &
sun" and "isometric stack" cover families never consumed their random stream, so any two
seeds landing on the same family rendered byte-identical output — both now vary position,
scale, and colour per seed like every other family.
