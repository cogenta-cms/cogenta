---
'@cogenta/render': minor
'@cogenta/core': minor
---

Add the three build targets — static, Node SSR, edge — and the refusal that keeps a static
build honest.

The target is a build parameter, never a theme variant: the renderer is handed the route
and nothing else, so it *cannot* branch on the target. That is what makes "the same
content produces an equivalent result on the three targets" a property of the code rather
than a promise, and the equivalence test compares the three builds byte for byte.

A build collects every declared runtime need first — blocks, theme, plugins — and judges
afterwards. `collectionList` is the one block of the twelve that declares
`runtime: 'server'`, so the case is real on the first site that places a listing. On a
static target the build is refused before a single page is rendered, with a message that
names the block, the pages it sits on and their block keys, why a static build cannot
carry it, and the three ways out: build for `--target node` or `--target edge`, move the
work to an external service the browser calls, or remove the element. Every offending
element is reported at once, so an operator takes one decision rather than one build per
problem. Nothing degrades silently: no dropped block, no build-time snapshot of a live
list.

On the two request-time targets the split is hybrid and identical: pages with a
server-side need are served on request, the rest are still prerendered. An unregistered
block is refused rather than assumed static — guessing a runtime is how a server-side
block slips into a static build.

Core adds two error codes, `BUILD_TARGET_UNKNOWN` and `BUILD_RUNTIME_UNSATISFIED`.
