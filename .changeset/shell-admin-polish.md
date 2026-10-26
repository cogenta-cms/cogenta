---
"@cogenta/api": patch
---

Notices: `POST /api/notices/{id}/restore` takes a dismissal back (additive), so the admin can offer "Undo" after a recommendation is hidden. It only ever deletes the caller's own dismissal, and restoring a notice that was never hidden is a no-op. `NoticeDismissalStore` gains `restore(userId, noticeId)`.
