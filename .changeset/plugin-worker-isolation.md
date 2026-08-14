---
'@cogenta/plugins': minor
---

`runIsolated`/`runIsolatedOrThrow` (L7 task 3) — the real worker isolation
boundary "tout plugin tiers s'exécute dans un worker séparé" requires.
Combines `node:worker_threads` (spawned with `env: {}` so secrets and the
host environment are never passed in, plus bounded `resourceLimits`) with a
`node:vm` sandbox inside the worker whose global object has no `process`,
no `require`, no `fetch`, and no dynamic `import()` (no
`importModuleDynamically` callback is registered, and `codeGeneration:
{strings: false}` blocks `eval`/`new Function` escape techniques). A
timeout-based kill switch terminates a runaway worker. Four real, isolated
hostile-code tests prove `fs`, undeclared network access, `process`, and a
host-held secret are all unreachable from inside the sandbox — the lot's
own explicit acceptance criteria. Measured isolation overhead (~46ms per
call, one fresh Worker per call, no pooling) is documented. This task
deliberately does not build the capability-gated SDK object (task 4/5) or
the full resource-limit-and-disable policy (task 6) — only the isolation
primitive those tasks build on.
