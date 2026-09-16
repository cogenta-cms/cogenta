---
"@cogenta/plugins": minor
"@cogenta/cli": minor
---

A plugin reacts to what happens on the site (L31 step 2). `cogenta serve` now loads the plugins a site has installed and hands each content lifecycle event (`content.publish`, `content.unpublish`, `content.delete`) to the plugins whose manifest subscribes to it, calling their `onContentEvent` handler inside the isolated worker with the capabilities they were really granted. A plugin can never break a write: an event fires after the write landed, and one that throws, times out or has been disabled is logged and skipped while the publish stands. `provides.eventSubscriptions` is validated against the closed event set (`PLUGIN_EVENT_NAMES`), so a plugin can no longer wait for an event no site emits.
