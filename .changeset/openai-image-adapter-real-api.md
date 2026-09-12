---
'@cogenta/agents': patch
'@cogenta/api': minor
'@cogenta/cli': patch
---

Make generated images actually work against the real OpenAI image API.

The L18 image adapter had never been run against a live endpoint, only its
own fixtures — and its test froze the bug as the expected value. Three
defects, all found by generating one real picture:

- **Sizes no OpenAI model accepts.** `IMAGE_DIMENSIONS` is a pixel pair,
  which is right for Stability; OpenAI takes one of a short closed list of
  size strings that differs by model. `landscape` was sent as `1536x640` — a
  perfectly ordinary SDXL shape, and a flat 400 here. Each model family now
  maps the three named shapes to sizes it really accepts, with `dall-e-2`
  degrading a banner to the square it can draw rather than being refused.
- **`response_format` sent to `gpt-image-1`,** which rejects the parameter
  outright. It now travels only to the `dall-e-*` models that need it.
- **A 400 with no reason.** "OpenAI returned status 400" cannot distinguish
  an unsupported parameter from a refused prompt from a model the account
  cannot reach. The vendor's own sentence now travels in the message and in
  `details.providerMessage`.

A kept generated image also goes through `ingestMediaUpload` — the same path
a human upload takes — instead of writing the file itself. It was landing
with `width`/`height` null, so it had no renditions: no `srcset`, no WebP,
and `/_image?w=` served the original to every visitor. Measured on a real
generation: 2.4MB PNG before, 22KB WebP at `w=640` after.

`IngestMediaUploadInput` gains optional `provenance`/`provenanceDetail` so
that one ingest path can record a model-drawn picture as such. Additive —
omitted means the store's default, `human`, exactly as before.
