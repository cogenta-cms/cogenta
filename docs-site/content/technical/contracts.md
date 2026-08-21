---
title: Interface contracts
order: 3
---

# Interface contracts

Seven critical interfaces govern Cogenta, each **versioned in semver**,
documented in full and kept up to date in `docs/04-contrats.md` — this page
summarizes what each one guarantees and why it exists separately from the
others; it never replaces the source document, which remains the exact
reference for types and routes.

## Contract A — Content schema (`schema@2.1`)

How a collection is declared (`defineCollection`, `f.*`), the system fields
every entry carries (`id`, `status`, `deletedAt`, `reviewState`,
`provenance`, …), internationalization (one entry per language, never a
single multilingual record), rich text (a structured JSON document, never
HTML), relations (with a real foreign key), and native taxonomies (a
materialized-path tree). Two recent bumps: `2.0` added trash and taxonomies,
`2.1` an optional editorial workflow and "owner-only" permissions.

## Contract B — Block vocabulary (`blocks@1.0`, frozen)

Twelve blocks, closed, each describing **semantic data** — never HTML or
style. Adding a thirteenth block requires an RFC: the vocabulary stays
deliberately small and predictable rather than becoming a general-purpose
page builder.

## Contract C — Agentic tool (`tools@1.1`)

How a tool declares itself (`defineTool`): its permissions, whether its
effect is reversible, its cost, its rate limit. The central, non-negotiable
rule, R4: **a tool declares its permissions, the runtime verifies them** —
never the tool itself. Every call produces a complete audit trace.

## Contract D — Theme (`theme@1.1`)

A theme's file structure, its manifest, the `RenderContext` object it
receives — and nothing more: never the database, never a secret, never the
filesystem. A static check refuses, at install time, any theme that tries
to import `node:fs`, `@cogenta/core` or any core driver package. See
[Creating a theme](creating-a-theme.html) for the full guide.

## Contract E — Commerce (`commerce@1.0`, adopted, not frozen)

Products, cart, orders, payment, invoices, subscriptions — a data domain
**separate** from contract A rather than an extension of it: an order has
no draft, no per-language translation, no trash. Deliberately not frozen: a
commerce model never tested against a real shop doesn't yet deserve the same
level of commitment as A through D.

## Contract F — Comments (`comments@1.0`, adopted, not frozen)

The CMS's first real anonymous public write endpoint
(`POST /api/comments`) — moderation, threading, rate limiting and
anti-spam heuristics from the first version, kept separate from contract A
because a comment has neither the same sense of publication status as
content, nor a translation family.

## Contract G — Forms (`forms@1.0`, adopted, not frozen)

Same reasoning as F, for forms published on the site: a submission is a
fact recorded, never authored, with no draft and no translation. Works
without JavaScript (a plain `POST`, a confirmation redirect).

## Export and backup formats

Two public formats, versioned separately from the seven contracts above:
`export@1.0` (NDJSON, one line = one record, respects the requesting
actor's permissions) for a content export meant to travel, and
`cogenta-backup@1.0` (an uncompressed, streamed ZIP, checksum-verified
before any write) for a full backup that doesn't.

---

**Exact, complete reference**: `docs/04-contrats.md` in the repository —
the real TypeScript types, routes, code examples verified against the
implementation. This page is deliberately a summary: the contract itself
is the only source of truth when the two disagree.
