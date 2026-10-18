---
"@cogenta/render": minor
"@cogenta/cli": patch
---

`@cogenta/render/browser` is a new entry point holding only what a browser can
use: design-token specs, colour and contrast arithmetic, and the documentation
Markdown renderer. The admin now imports it instead of the package root, whose
image pipeline made the admin build emit a 5 MB WebAssembly file that
`@cogenta/cli` published with every release; the published CLI is about 5 MB
lighter. `@cogenta/cli`'s build also clears its copy of the admin before
copying the new one, so stale builds no longer pile up in `dist/admin-assets`.
