---
"@cogenta/plugins": patch
---

A plugin's time limit no longer includes the time its isolated process takes
to start. Starting a permission-restricted Node process can alone take more
than a second on a loaded shared host or on Windows, and the limit (two
seconds by default) used to run from the moment the process was forked, so a
healthy plugin could be killed and reported as `timeout` before any of its code
ran. The plugin's clock now starts when its code is handed over; a process that
never comes up is still stopped after thirty seconds, reported as `crash`.
