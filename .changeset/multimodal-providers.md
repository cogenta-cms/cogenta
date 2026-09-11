---
'@cogenta/agents': minor
'@cogenta/api': minor
---

**A provider can now declare that it also generates images.**

Image generation had a registry, two drivers and a tool — and its model could
only be set by editing `cogenta.config.mjs` and restarting, while every text
model had been editable from the admin's Providers screen for lots. Choosing
an image model was the one configuration left in the file.

`StoredProviderConfig` gains `imageModel`, and capability is **derived from
it** rather than stored as a flag: a multimodal vendor is one entry sharing
one API key, not two entries, and a record can never claim an `image`
capability it has no model for. An entry without one is text-only, which is
what every entry saved before this field was.
`resolveImageProviderRegistryConfig` reads the same encrypted store its text
twin reads, and `POST`/`PATCH /api/providers` carry the field — `null` clears
it, so a vendor can stop offering images.

`imageBaseUrl` is separate from `baseUrl` on purpose, and this is the trap it
avoids: on both image clients `baseUrl` is the **complete** endpoint
(`…/v1/images/generations`), and the text one is a different complete endpoint
(chat completions). Sharing a single field would have posted an image payload
at a chat URL for anyone behind a proxy.

A vendor no image client serves is skipped rather than failing the whole
resolution: an image model typed onto a text-only provider leaves a working
text provider, not a broken site.
