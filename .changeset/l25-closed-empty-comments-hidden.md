---
'@cogenta/cli': patch
'@cogenta/theme-saas': patch
---

A public page whose collection opted out of comments, and that holds none, no longer ends
on a "Comments (0) — comments are closed" section: closed and empty means there is no
discussion on this page, not a discussion the visitor may not join. A closed thread that
already holds approved comments still shows them read-only. `@cogenta/theme-saas` caps its
feature grid at three columns so six features read as a 3×2 grid rather than four plus
two orphans.
