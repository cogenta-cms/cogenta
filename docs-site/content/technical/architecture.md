---
title: Architecture
order: 1
---

# Architecture

Cogenta is a pnpm/Turborepo monorepo: a set of independently published
`@cogenta/*` packages, strict TypeScript, ESM only, zero `any`. Two rules
shape everything else.

## The two-plane principle

A **control plane** (database, secrets, authentication, agents) and a
**delivery plane** (theme rendering, images, cache) are separated in the
architecture, not by convention. A theme never opens a database connection
and never sees a secret (R5): it receives a `RenderContext` — an HTTP client
with a read-restricted token, never more. That's what makes a third-party
theme safe by construction rather than by code review.

## No hard dependency on infrastructure (R1)

Redis, Docker, S3, a persistent worker — anything that assumes an external
service is **optional**. Every infrastructure need goes through an
interface with at least two implementations: an optimal one (Redis for the
queue, for instance) and a degraded one that depends on nothing (in memory,
or on disk). See [Packages and drivers](paquets-et-drivers.html) for the real
list.

## The CMS works without AI (R2)

No content, admin or rendering feature depends on a configured API key.
Without an AI provider, everything works — only agents and the assistant
stay inert, and say so rather than fail.

## A multi-agent runtime in the core, not a plugin

What sets Cogenta apart from a classic CMS with AI bolted on: the tool
contract (see [Contracts](contracts.html#contract-c-agentic-tool-tools-1-1)) and the
permission registry are part of the core, with the same rule everywhere:
**a tool declares its permissions, the runtime verifies them — never the
tool itself** (R4). Every agent action is logged, diffed where relevant, and
reversible or explicitly marked non-reversible with human validation
required (R6).

## External content is data, never an instruction (R8)

A comment, an import, an uploaded document, the content of a web page a tool
fetched: everything that comes from outside enters an agent's context
tagged as data, never mixed with the text that instructs the model. That's
what makes a prompt injection attempt ineffective even when a model is
deliberately set up to obey whatever it reads.

## Repository layout

```
packages/        every publishable @cogenta/* package
examples/         real, tested starting points (plugin, theme, a minimal complete example)
docs/             vision, recorded decisions, contracts, lot specifications
docs-site/        this documentation — one source, published in two places
```
