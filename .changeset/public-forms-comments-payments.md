---
"@cogenta/api": patch
"@cogenta/cli": patch
"@cogenta/comments": patch
"@cogenta/commerce": patch
"@cogenta/forms": patch
---

Correct conditional public form visibility and native validation with a no-JavaScript fallback, preserve repeated multipart choice values, reject missing or stale comment timing, and mount payment webhooks with raw-body provider signature verification and idempotent settlement.

Reject payment notifications with mismatched settlement amounts or currencies and prevent delayed deliveries from undoing paid or refunded states.

Use the site's language for default form confirmation and acknowledgment messages, preserving author-written text.
