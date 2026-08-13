---
'@cogenta/render': minor
'@cogenta/core': minor
---

Add the image pipeline, the three build targets, the tag-invalidated page cache and the
PWA to `@cogenta/render`.

Images are a driver like any other: `sharp` at the optimal tier as an optional peer, a
WebAssembly libvips fallback at the degraded tier, and one contract suite run against
both. The fallback runs **unconditionally**, not when `sharp` happens to be missing — a
suite that stops exercising it on the maintainer's laptop is exactly the hole L3 warns
about. `/_image` caps requested dimensions, because it is a public URL and a loop over
widths would otherwise be a cache-filling attack.

A build target is a parameter, never a theme variant: the renderer is handed a route and
returns a string, so a theme cannot branch on the target even if it wanted to, and
equivalence across static, Node and edge is structural rather than promised. A static
build carrying a `runtime: 'server'` block is refused with a message naming the element,
where it sits in the site, and three numbered ways out — asserted byte for byte so the
wording cannot quietly degrade.

The page cache derives its tags by instrumenting what a render actually read, not by
declaration, which would be wrong at the first omission. A list page carries its
collection's tag and a detail page does not, so publishing an entry that was never in
the cached page still drops the list.
