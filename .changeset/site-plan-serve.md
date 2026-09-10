---
'@cogenta/cli': minor
---

**A site plan now applies under `cogenta serve` — everything in it that is not
schema.**

ADR-0010 makes the *schema* read-only outside development. The applier read
that as "nothing applies outside development": under `cogenta serve` the whole
route answered `CONTENT_READ_ONLY`, so pages, demonstration entries and the
palette — none of which touch `cogenta.schema.*` — were refused along with the
collections. An ordinary operator never runs `cogenta dev`, so applying a plan
did nothing for them at all.

The split is now where the decision actually draws it. Adding a collection
still requires `cogenta dev`, and a plan that proposes one under `serve` says
so collection by collection instead of failing as a whole. Pages and entries
are rows, and they are created. The palette applies through the same database
overlay the appearance screen writes — live on the next page view, reversible
from that screen, no restart to ask for — rather than by writing a project
file this instance may not touch.

Two silent drops go with it: demonstration content aimed at a collection the
site already had was discarded (only newly-created collections were seeded),
and under `serve`, where nothing can be created, that meant no entry was ever
seeded at all.
