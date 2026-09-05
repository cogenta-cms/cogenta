---
"@cogenta/theme-kit": patch
---

Fixes `renderSocialLinks`' Instagram, YouTube and Threads icons (and the
generic fallback "chain link" icon), found while seeding real social links
on `@cogenta/theme-association`'s own scaffolded site: each of these icons
draws two nested contours meant to punch a hole in each other (Instagram's
square frame and its lens, YouTube's frame around its play triangle,
Threads' loop, the fallback's two link rings) via `fill-rule="evenodd"` —
but `evenodd` only cancels overlap *within one path's own subpaths*, never
across sibling `<path>` elements, and each contour was rendered as its own
separate element. The result was a solid, illegible blob instead of the
intended ring for every one of these four icons on every theme that uses
`renderSocialLinks` (this package is shared across all of them). Contours
meant to subtract from one another are now joined into a single path's `d`;
shapes meant to sit solid beside a neighbour (a flash dot, a play triangle)
stay their own element so they are never accidentally cancelled by it.
