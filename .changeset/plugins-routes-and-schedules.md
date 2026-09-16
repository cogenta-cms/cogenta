---
"@cogenta/plugins": minor
"@cogenta/cli": minor
---

A plugin serves a page and works on a cadence (L31 step 2). `provides.routes` mounts each declared path under `/_cogenta/plugins/<plugin name>`, a reserved prefix where a plugin can never shadow a site page nor be shadowed by one; the plugin's `onRequest` handler receives the method, path, query and body (text, 64 KiB cap) and answers with a status, one content type from a known list, and a body — never a header, so it cannot set a cookie on the site's origin or turn its answer into a download. `provides.schedules` registers real tasks on the site's own scheduler (`plugin:<name>:<schedule>`), which run on the same tick, take the same multi-replica claim, and can be run by hand from the "Tâches planifiées" screen. Both are validated in the manifest, and a plugin that throws is logged and answered for — a 500 with nothing of its error in the body.
