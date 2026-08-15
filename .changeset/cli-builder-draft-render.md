---
"@cogenta/cli": minor
---

Render an unsaved draft through the real page pipeline, so the visual page builder can
show the published page instead of a lookalike.

`theme-render.ts` gains `renderDraftPage(draft, options, context)`. It reads the stored
entry through the same permission-checked `ContentGateway` as everything else, overlays
the block list and values the editor has on screen but has not saved, resolves the entry's
real path with the same `buildPath` the public route uses, and hands all of it to the one
page renderer `renderRequestedPage` already used. There is no second renderer: both
exports now differ only in how they got hold of an entry.

`cogenta serve` exposes it as `POST /api/builder/render`, behind three gates in order — an
authenticated actor, `update` on the collection asked of the same `PermissionLayer` every
write path asks, and the gateway's own read check inside the render. A refusal answers 403
through `errorResponse`, not 500. The response is `no-store`: a draft is cacheable by
nobody.

`Site` now carries `permissions`, so a route this file serves itself can ask the one
authority rather than re-deciding who may edit.

**What the fidelity test found.** The preview's `<body>` is byte-for-byte the public
page's — asserted, not assumed. Its `<head>` is not, and should not be: a preview reads the
*working* face of the entry, so `@cogenta/seo` refuses it `isPublished` and the document
carries `noindex, nofollow` and drops the canonical link. The test asserts the difference
is exactly those two tags and nothing else, which is a stronger statement than equality
would have been.
