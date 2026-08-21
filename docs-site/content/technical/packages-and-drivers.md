---
title: Packages and drivers
order: 2
---

# Packages and drivers

## The `@cogenta/*` packages

Descriptions copied verbatim from each `package.json` — the same text npm
shows, never rewritten by hand for this page.

| Package | Role |
|---|---|
| `core` | Configuration, typed errors, structured logging and the driver system behind Cogenta. |
| `schema` | Content schema in code: collections, field types, generated types and migrations. |
| `blocks` | The semantic block vocabulary every Cogenta theme implements. |
| `api` | REST and GraphQL over the content engine, on one permission layer. |
| `mcp` | MCP (Model Context Protocol) server and client — the tool registry, exposed. |
| `auth` | Identity, sessions and credentials: password, TOTP and WebAuthn, plus the append-only audit log. |
| `render` | Astro integration, render context and theme installation checks. |
| `theme-canonical` | The reference Cogenta theme: the twelve vocabulary blocks, rendered accessibly, with zero client JavaScript. |
| `seo` | Sitemaps, feeds, JSON-LD, hreflang and llms.txt derived from the content schema. |
| `agents` | The agentic runtime: LLM provider abstraction, tool-calling, execution loop, permissions, memory, budgets, audit. |
| `agents-builtin` | The built-in agents shipped with Cogenta — Security, SEO, Content, Performance. |
| `plugins` | Plugin manifest schema, loader, worker isolation and permission model. |
| `channels` | Channel adapter interface and registry — Telegram, Slack, Discord, email, webhooks. |
| `commerce` | Contract E: products, carts, orders, payments, tax, shipping, coupons, invoices and subscriptions. |
| `comments` | Contract F: visitor comments — moderation queue, threading, rate limiting, hashed IP, anti-spam. |
| `forms` | Contract G: form definitions and submissions (ADR-0026). |
| `export` | Content export/import, site backup/restore and GDPR export — `export@1.0`. |
| `import` | Importers that bring content from another CMS into Cogenta, starting with WordPress WXR. |
| `analytics` | Self-hosted, cookie-free, privacy-respecting page-view analytics. |
| `fleet` | Multi-site fleet control plane — pairing, telemetry, inventory, rollouts, reporting. |
| `cli` | The Cogenta command line: diagnose an install, run migrations, inspect drivers. |
| `create-cogenta` | The Cogenta installer wizard — `npm create cogenta`. |
| `admin` | The admin SPA — private, not published to npm. |

## Drivers (R1)

Every infrastructure need in the project is an **interface**, with at least
two real implementations behind a shared registry (`createDriverRegistry`,
`@cogenta/core`): an **optimal** one, which assumes an external service, and
a **degraded** one, which assumes none. Both are tested against the same
contract suite — the degraded driver is never a stub nobody bothers to
verify.

| Need | Optimal | Degraded |
|---|---|---|
| Cache | Redis | In-process memory |
| Queue | Redis/BullMQ | In-process memory |
| File storage | S3 (or compatible) | Local disk |
| Database | Postgres, MySQL/MariaDB | SQLite |
| Vector search | pgvector | File, then memory |
| Payment | Stripe | Bank transfer (not a stub — a real payment method, with manual rather than automatic confirmation) |
| Images | `sharp` | `wasm-vips` (R10: no native dependency without a WASM fallback — `sharp` breaks on ARM/musl/shared hosting) |

A site picks its level based on what it actually has available — shared
hosting with no Redis and no S3 never fails to start, it simply runs in
degraded mode everywhere, which is a deployment choice, not a missing
feature.
