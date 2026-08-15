---
'@cogenta/plugins': minor
---

Adds the skin gallery registry (L7 task 10): `createSkinGallery` submits a
candidate token JSON, runs it through `@cogenta/render`'s real `validateSkin`
(reused wholesale, not reimplemented) and stores the outcome — `accepted` or
`rejected` with the specific real failure code and reason — with no
pending/human-reviewed state, matching the lot's "sans revue humaine"
requirement for this one registry kind. `listAccepted`/`get` read back
gallery entries. `@cogenta/plugins` gains a real dependency on
`@cogenta/render`.
