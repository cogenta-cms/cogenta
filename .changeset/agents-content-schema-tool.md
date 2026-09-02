---
"@cogenta/agents": minor
"@cogenta/cli": patch
---

Gives an agent a way to learn a collection's actual field shape before writing to it. A live run asked the "Cogenta Agent" superagent "peux-tu générer un template ?" and it answered by asking the human to specify every field itself — `content.write_draft`'s `values` input is deliberately schema-blind (`z.record(z.string(), z.unknown())`), so nothing let the model discover a collection's real field keys short of guessing or reverse-engineering an existing entry, and a fresh collection with zero entries left it nothing to reverse-engineer at all.

`@cogenta/agents` gains a new contract-C tool, `content.schema` (`createContentSchemaTool`), read-only under the same `content.read` permission as the existing browse pair (`content.collections`/`content.list`) — describing a collection's shape is not a wider grant than reading one of its entries. It answers two things: one or every readable collection's field shape (key, kind, required, label, kind-specific options), and this site's fixed block vocabulary (contract B's seventeen blocks, each with its own name/version/field shape) — the block half needs no site data at all, it is always present so an agent building a `blocks`-kind field's value never has to guess what a `hero` or `prose` block actually holds. The "Cogenta Agent" seed gains it alongside the existing browse pair, and `ensureBuiltinAgents` grants it to an already-seeded built-in that holds `content.read`, exactly like `content.collections`/`content.list` before it.

`@cogenta/agents` gains a new direct dependency, `@cogenta/blocks` (workspace-internal, zero transitive cost) — the same package `@cogenta/theme-canonical`/`@cogenta/theme-kit` already depend on to read the same fixed vocabulary.

`@cogenta/cli`'s `agent-runtime.ts` wires the new tool into the site's real tool registry with a `contentSchemaServiceLikeOf` adapter that reuses the exact same `ContentService.summary()` permission check `content.collections` already goes through, so `content.schema` never describes a collection the calling actor could not otherwise read.
