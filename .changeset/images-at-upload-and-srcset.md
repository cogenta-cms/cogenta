---
'@cogenta/api': minor
'@cogenta/cli': minor
---

Images are processed at upload and served with a real `srcset` (L10 task 5).
`@cogenta/render`'s image pipeline, `srcset.ts` and its two driver tiers
(sharp, WebAssembly libvips) had existed since L3 and were called by nothing:
an uploaded image recorded no dimensions, produced no renditions, and
`ctx.image()` in the rendered page threw `THEME_IMAGE_UNSUPPORTED`.

- **`@cogenta/api`** — `createMediaRouter` takes an optional
  `MediaImageProcessor`. On an image upload it probes the intrinsic size into
  the asset's existing `width`/`height` columns (no schema change) and writes
  the renditions beside the original under `media/{id}/variants/`. Deleting
  the asset deletes them, by recomputing their names — `StorageDriver` has no
  `list`, which is why the ladder is fixed and `variantNames` exists. The
  interface is injected rather than imported: a REST transport has no business
  pulling a 12 MB WebAssembly dependency into its tree.
- **`@cogenta/cli`** — builds that processor from the real driver registry and
  serves the renditions at a new **public** `GET /_image?id=…&w=…`. Public and
  image-only on purpose: a published page's `<img>` is fetched by a browser
  with no session, so it cannot sit behind the same gate as
  `/api/media/{id}/file`, which is unchanged and still covers every other kind.
  `/_image` never renders on demand — an unstored width falls back to the
  original — so a public URL cannot be turned into CPU.
- The rendered page now carries a real `srcset`, and `og:image` and JSON-LD's
  `image` come from the same asset, absolute. Which media a page needs is
  answered by `collectDependencies`, the walk `/api/content` already uses,
  rather than by a new heuristic over block JSON.

Variants are produced at upload rather than lazily because `cogenta serve`
has no durable variant cache: a lazy pipeline behind an in-memory store
re-decodes every image after every restart, which is the worst answer on the
shared hosting R10 names. WebP only, for now, because AVIF's encode cost on
the WASM tier — the tier that always exists — would make an upload of a
handful of images take minutes.

Also fixes a real shutdown hang: `server.close()` waits for every open
connection, so one client that fetched a large response and never read the
body kept `cogenta serve` alive forever. Shutdown now cuts remaining
connections after a short grace period.
