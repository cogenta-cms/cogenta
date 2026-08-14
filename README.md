<div align="center">

# Cogenta

**An agentic CMS for Node.js.**
It watches its own security, patches itself, optimises itself, and reports back.

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://www.mozilla.org/en-US/MPL/2.0/)
[![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange.svg)](#status)

</div>

---

## Status

**Pre-alpha. Not usable yet, but a real site can be scaffolded, run and edited.** The
design is complete and public. The foundation (L0), the content model (L1), rendering
(L3) and the admin (L2) are done. The multi-agent runtime (L4) and its built-in agents
(L5 — security, SEO, performance, content, mostly complete) are in place, alongside the
`cogenta` command line (`doctor`, `migrate`, `users create`, `serve`) and
`npm create cogenta`, which scaffolds a working site — including a first real blueprint
("blog") — end to end. See [`docs/getting-started.md`](docs/getting-started.md) to try
it. What's left, in order, is the rest of the installer/ecosystem work (L9), then
channels (L6), third-party plugin extensibility (L7) and fleet supervision (L8). Follow
the [roadmap](docs/06-lots.md) to see where things stand.

## Why another CMS?

The CMS market is stuck between two worlds that don't talk to each other.

**WordPress and Drupal** offer a mature editing experience and a huge ecosystem,
alongside technical and security debt that costs real money every month. Agencies
survive on maintenance contracts that eat their margin — updates, plugins breaking,
compromised sites, clients calling on a Friday night.

**Modern headless CMSs** — Strapi, Payload, Directus — offer excellent developer
experience, but no theme system, a poor editing experience, and a frontend to rebuild
from scratch on every project.

Neither has integrated AI beyond the surface: a "generate text" button wired to a
model, with no memory, no autonomy, no guardrails, and no ability to act on the site.

## What Cogenta does differently

Cogenta is not a CMS with AI features. Its **multi-agent runtime is part of the core**,
alongside the database and the rendering engine. Agents monitor published CVEs and
propose patches, audit SEO on every publish, measure performance, write and translate —
each with its own tools, permissions, memory, budget and autonomy level, under human
review.

**The CMS is fully functional without AI.** No API key, no provider, no network — 
everything works except the agents. They accelerate; they are never a single point
of failure.

## Design principles

**Security is a property of the architecture, not a feature list.** A third-party
plugin must not be *able* to read the database — not merely promise not to. Isolation,
declared permissions and the audit log live in the core.

**A site must be able to run without a server.** The control plane and the delivery
plane are separate. The same content and the same theme ship as static HTML on a CDN,
as Node SSR, or at the edge.

**No hard infrastructure dependencies.** Redis, Docker, S3, a persistent worker — all
optional, each with a degraded driver. `npm create cogenta` must produce a working site
with nothing else installed.

**Content is semantic, never visual.** A block stores "a hero with this title, this
image, this button" — never HTML or CSS classes. That is the only way to switch themes
without breaking anything, and the only way to make AI theme generation reliable.

**An agent action is a proposal before it is a fact.** Diff, audit log, reversibility,
budget, explicit autonomy level. Users are never asked to trust a model — they are
given the means to verify it.

## Documentation

The full design lives in [`docs/`](docs/). Start with the
[vision](docs/00-vision.md), then the [architecture](docs/02-architecture.md).

| Document | Purpose |
|---|---|
| [`getting-started.md`](docs/getting-started.md) | Scaffold, run and edit a site |
| [`00-vision.md`](docs/00-vision.md) | Positioning and non-goals |
| [`01-prd.md`](docs/01-prd.md) | Personas, jobs-to-be-done, scope |
| [`02-architecture.md`](docs/02-architecture.md) | Technical architecture |
| [`03-decisions.md`](docs/03-decisions.md) | Architecture decision records |
| [`04-contrats.md`](docs/04-contrats.md) | The four versioned interface contracts |
| [`05-securite.md`](docs/05-securite.md) | Threat model and security design |
| [`06-lots.md`](docs/06-lots.md) | Work breakdown and roadmap |
| [`lots/`](docs/lots/) | Detailed spec per work package |

> Design documents are currently written in French. English translation will follow
> once the design stabilises. Code, comments, commit messages and issues are in English.

## Contributing

Too early for feature contributions — the contracts are still being implemented.
Questions, critiques of the design, and security reports are very welcome.

Security issues: see [SECURITY.md](SECURITY.md). Please do not open a public issue.

## License

[Mozilla Public License 2.0](LICENSE).

File-level copyleft: modify a core file and you publish that file. Write a theme,
plugin or agent in your own files and you owe nothing — commercial use included.
