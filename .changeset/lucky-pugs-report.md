---
'@cogenta/core': minor
---

Add the `bullmq` job queue driver — the optimal tier, on Redis — as the counterpart to the
`database` driver. Both now run **one** contract suite, so a site that loses its Redis
falls back without a line of calling code changing.

`bullmq` stays an optional peer: it is loaded by dynamic import through `loadBullmqModule()`,
which returns `null` when it is absent, and the API it exposes is described structurally so
the published type declarations never reference it. A site on the database queue installs
neither `bullmq` nor `ioredis`, and still typechecks.

Jobs are fetched by hand rather than by a `Worker` loop, because `tick()` is the call both
drivers answer to — cron drives it on shared hosting, and it has to mean the same thing on
Redis. The atomic claim stays inside Redis, so the L0 acceptance criterion holds: four
workers draining twenty-four jobs never process one twice. A job whose worker was killed is
returned to the queue by bullmq's stalled checker, which manual fetching does not start on
its own — the driver starts it.

Two mappings are worth knowing. Cogenta priorities run high-first and bullmq's run low-first
with `0` reserved, so priorities are mirrored onto a mid-range origin; and bullmq has no
cancelled state, so a cancelled job is removed and recorded in a tombstone hash under the
driver's own key prefix. Job ids carry the job name, because bullmq shards by queue.

`available()` opens a connection and pings rather than trusting that a URL is configured, and
`health()` never reports the URL — it routinely carries a password.
