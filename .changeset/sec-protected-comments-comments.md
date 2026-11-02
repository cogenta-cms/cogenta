---
"@cogenta/comments": patch
---

`createCommentsRouter` accepts a `canComment` hook; a target it refuses answers `COMMENT_NOT_FOUND` before anything is stored, and `CommentsRequest` can carry an `unlocked` check for the transport to supply.
