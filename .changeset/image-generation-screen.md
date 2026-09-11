---
'@cogenta/cli': minor
---

Generate images from the media library, and keep only the ones worth keeping.

`cogenta serve` gains two admin-only routes in front of the image-creator
agent's work. `POST /api/media/generate` returns candidates as data URLs and
writes nothing at all — generating is cheap to undo and storing is not, which
is why `assist.generate_image` stores nothing by its own contract.
`POST /api/media/generate/keep` is the only one that stores a file, and it
takes the alt text with it. Everything it writes is recorded as `generated`
with the model that drew it: the one field of contract A the European AI
framework makes non-optional.

`GET /api/media/generate` answers whether the feature is offered at all — 200
with `available: false` rather than an error, the same shape as
`GET /api/assistant`, so a site with no image model configured shows no panel
instead of a form that only fails once used (R2). The image client is resolved
fresh on every request from the admin's own provider store first, then
`config.imageGeneration`, so a model saved from the Providers screen works on
the very next call rather than after a restart.
