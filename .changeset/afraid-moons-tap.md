---
'@cogenta/cli': minor
'@cogenta/core': minor
---

Add `@cogenta/cli` and its first command, `cogenta doctor`.

`doctor` reports which driver is running for each need, **why that one**, and what it
costs. The "why" is the point: the registry can fall back from Redis to the filesystem
without anyone noticing, and an operator who cannot see that has a site that is slower
than they think for a reason nothing told them. Skipped drivers are listed with their
reason too.

It also states out loud what would otherwise be discovered later — that a site with no
LLM provider works apart from the agents, that SQLite is one machine with no vector
index, and that signed media URLs will not survive a restart without
`COGENTA_STORAGE_SIGNING_KEY`. An invalid configuration is reported as the offending
fields rather than a stack trace, and exits non-zero so a deployment script notices.

Core gains `loadConfig` and `findConfigFile`, which walk up from the working directory
the way a package manager looks for a lockfile. A missing config file is not an error: a
container configured entirely through `COGENTA_*` and `DATABASE_URL` is a legitimate way
to run.
