---
"@cogenta/import": patch
---

The WordPress XML reader reads an out-of-range numeric character reference as U+FFFD instead of throwing a `RangeError`, and refuses a document nested more than 256 levels deep with `IMPORT_WXR_PARSE_FAILED` instead of overflowing the stack.
