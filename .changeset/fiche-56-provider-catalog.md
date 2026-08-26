---
'@cogenta/core': minor
'@cogenta/agents': minor
'@cogenta/api': major
'@cogenta/cli': minor
---

LLM provider catalog (fiche 56): OpenRouter, DeepSeek, Qwen and GLM are now
configurable from the admin's "Providers" screen alongside Anthropic, OpenAI
and Google, plus an explicit "custom provider" option for any other
OpenAI-compatible endpoint (a self-hosted proxy, or a vendor not yet
catalogued). No new network code: every OpenAI-compatible entry (OpenRouter,
DeepSeek, Qwen, GLM, custom) reuses `createOpenAiClient` unmodified, only
pointed at a different `baseUrl`.

**`@cogenta/agents`**: `provider` widens from the closed 3-literal union
(`'anthropic' | 'openai' | 'google'`) to a plain string, validated at the
write boundary instead of by a type — `@cogenta/core`'s own
`llmSchema.provider` was already a free string before this fiche. New
`providers/catalog.ts`: `KNOWN_PROVIDER_CATALOG` (id/label/wireFormat/
defaultBaseUrl/knownModels per vendor) and `findProviderCatalogEntry`.
`createProviderRegistry` resolves a name via the catalog when it knows one
(dispatching to the right adapter by `wireFormat`), and otherwise requires
the entry's own `baseUrl` — that pairing (no catalog entry + a `baseUrl`) is
what "custom provider" means structurally, with no separate flag to keep in
sync. `createOpenAiClient` gains an optional `name` (defaults to `'openai'`)
so a client built for OpenRouter/DeepSeek/Qwen/GLM/a custom endpoint reports
its own id via `ProviderClient.name` — needed for the privacy allowlist
(`assertProviderAllowed`) to recognise the right vendor rather than every
OpenAI-compatible client misreporting itself as literally `'openai'`.
`createFileProviderConfigStore.upsert`/`updateSettings` reject a malformed
provider id (`PROVIDER_ID_INVALID`) or one outside the catalog with no
resolvable `baseUrl` (`PROVIDER_CUSTOM_BASE_URL_REQUIRED`) — the write-time
checks that make network-time resolution failures unreachable.

**Breaking (`@cogenta/agents`):** `PROVIDER_NAMES` (the fixed 3-name array)
is removed — read `KNOWN_PROVIDER_CATALOG` instead, or accept that
`ProviderName` is now `string`. `ProviderRegistryConfig`'s value shape gains
nothing new but is now keyed by an open string rather than the closed union.

**`@cogenta/core`**: two new error codes, `PROVIDER_ID_INVALID` and
`PROVIDER_CUSTOM_BASE_URL_REQUIRED` (both 400).

**Breaking (`@cogenta/api`):** `providers-router.ts`'s `ProviderRegistryLike`
gains a required `catalog: readonly ProviderCatalogEntrySummary[]` — any
caller implementing this interface directly (rather than using
`@cogenta/cli`'s adapter) must supply it. New route `GET
/api/providers/catalog` (admin-only) serves it; `catalog` is a reserved
provider id as a result (a provider literally named "catalog" can no longer
be created). `POST /api/providers` no longer rejects a provider name outside
a fixed 3-name list — it rejects a name outside the catalog **only when no
`baseUrl` is given** (`PROVIDER_CUSTOM_BASE_URL_REQUIRED`, still 400, but a
different code than the previous generic "not a supported LLM provider"
`QUERY_INVALID`). `PATCH`/`DELETE /api/providers/:provider` no longer gate
on a fixed name list at all — they resolve against whatever the store
actually has saved (a legitimately-saved custom provider used to be
unreachable by these two verbs; the store's own `PROVIDER_NOT_CONFIGURED`
already covered "this was never saved").

**`@cogenta/cli`**: `packages/cli/src/commands/agent-runtime.ts`'s
`createProviderRegistryAdapter` now supplies `names`/`catalog` from
`KNOWN_PROVIDER_CATALOG` instead of the removed `PROVIDER_NAMES`, and no
longer narrows an arbitrary string against a closed `ProviderName` union
before trusting the live registry's own `has`/`get`. `assistant.ts`'s single-
provider (`cogenta.config.mjs`'s `llm` section) resolution now accepts any
provider `createProviderRegistry` itself can resolve — a catalog id, or a
custom id paired with a `baseUrl` — rather than duplicating a fixed 3-name
allowlist a second time (the exact desynchronisation risk this repo already
hit once with `CONTRACT_C_PERMISSIONS`).

**`@cogenta/admin`** (unpublished, no changeset entry): the "Providers"
screen's "add" form is now catalog-driven — a provider `<select>` populated
from `GET /api/providers/catalog`, a known-models picker per selected
provider, and an explicit "custom provider" choice (its own id field, and a
`baseUrl` the form requires before Save is enabled).

Not included, by the fiche's own scope: Replicate (a different, asynchronous
prediction-and-polling API, not OpenAI-compatible — a separate adapter, left
for a later task).
