---
'create-cogenta': minor
---

Seven of the ten blueprints now seed real, concrete photography for their most visually
important slots — restaurant dishes, store products, association events, blog and
portfolio covers, testimonial portraits, magazine section imagery — instead of only the
abstract flat compositions `demo-art` renders. `DemoMediaSpec.photo` names a bundled JPG
under `assets/photos/`, preferred over the procedural `spec` when present; `demo-art`
remains the fallback (and stays the only source for `documentation` and `store`'s category
tiles, which have nothing specific to photograph). The photographs were generated once,
offline, with a user-supplied Replicate API key that no longer exists — this package has
no runtime dependency on Replicate or any other image API, R1/R2/R9 unaffected.
