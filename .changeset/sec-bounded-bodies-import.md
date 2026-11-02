---
"@cogenta/import": patch
---

The WordPress media download now enforces its 50 MiB limit while the body streams (and cancels the transfer there) instead of after the whole file was in memory, and its per-file timeout keeps running until the body is fully read rather than being cleared when the headers arrive.
