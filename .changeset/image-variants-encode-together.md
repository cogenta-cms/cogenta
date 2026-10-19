---
"@cogenta/cli": patch
---

An uploaded image's resized variants are now encoded together instead of one
width after another, so the native image library's thread pool is actually
used. The same files are produced; installing the showcase site, which seeds
thirty images, went from about 32 to 17 seconds on the machine it was measured
on, and an editor's upload returns sooner.
