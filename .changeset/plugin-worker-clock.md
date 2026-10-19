---
"@cogenta/plugins": patch
---

The same start-up allowance now applies when a plugin or a theme module runs
in a worker thread (the fallback runtime, and the sandbox that renders a theme
under construction): the time limit runs from the moment the thread executes,
so a loaded host no longer reports "module render worker timed out" for a theme
that renders in milliseconds.
