---
'@cogenta/cli': minor
---

L25 task A0b — `selectMediaImageProcessor`, `createMediaImageProcessor`,
`variantName`, `variantWidthsFor`, `contentTypeOf`, `VARIANT_FORMAT` and
`MediaImageProcessorOptions` are now exported from `@cogenta/cli`'s public
entrypoint (previously only reachable by importing `./commands/media-images.js`
directly). `create-cogenta`'s `scaffoldSite` uses `selectMediaImageProcessor` to
give its own real media ingestion (`seedDemoMedia`) the same image-processing
pipeline `cogenta serve` uses for a live upload.
