---
'@cogenta/plugins': minor
---

Run plugins in a permission-restricted child process, not a worker thread

A `vm` context is not a security boundary on its own: the known escape paths are
closed and tested, but Node's own documentation is explicit about it. `runIsolated`
now forks the guest with `--permission`, read access to the guest directory only,
an empty environment and a heap ceiling, so even a total sandbox escape lands where
`fs` and `child_process` answer `ERR_ACCESS_DENIED`.

A runtime older than Node 22.5 falls back to the worker thread and says so once
through `process.emitWarning`. Every `IsolatedRunResult` now carries `isolation`
(`'process'` or `'worker'`), and `RunIsolatedOptions` accepts `isolation` for a
caller that needs the thread on purpose.
