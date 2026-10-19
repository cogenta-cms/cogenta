---
"@cogenta/render": patch
---

Refresh the compatible sharp image-processing dependency and workspace lockfile to remove fixed security advisories. The optional native image processor retains its WASM fallback. Refresh Astro and test-tool patch/minor resolutions without adding a direct dependency; document and reproduce the remaining upstream http-cache-semantics advisory rather than suppressing it.
