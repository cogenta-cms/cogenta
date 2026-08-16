---
'@cogenta/core': minor
'@cogenta/agents': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

Advanced AI (L18): a writing assistant, a `vector` driver, semantic search,
RAG chat with citations, classification/duplicate detection/moderation, and
FAQ/Schema.org drafting. **Nothing here is on a required path** — a site with
no AI provider configured behaves exactly as before, and the whole feature set
disappears from the UI rather than failing (R2).

- **`@cogenta/agents`** gains the `vector` driver need the architecture
  document has named since L0 and nothing implemented: `VectorStore` with three
  drivers behind the existing `createDriverRegistry` — `pgvector` (optimal),
  `file` (degraded, survives a restart) and `memory` (degraded, always
  available). One contract suite runs against all three; pgvector's run is an
  integration test that skips loudly without `COGENTA_TEST_POSTGRES_URL`.
  Nothing re-implements cosine similarity: L4's `vectorRank` does the ranking
  everywhere, and all three drivers return the same number.

  `createSemanticSearch` fuses the vector half with L10's full-text index by
  RRF — **beside it, never instead of it**: pure vector search misses
  exact-keyword queries, which is the failure the architecture document warns
  about at line 190.

  Fifteen Contract C tools, all `sideEffects: false`, every output carrying
  `applied: false` as a **literal** so an assistant tool's type cannot say it
  changed anything (R6). Eight writing tools (rewrite, proofread, summarise,
  translate, meta description, titles, tags, alt text), `assist.generate_image`
  behind a two-vendor image provider driver (OpenAI, Stability), `assist.chat`
  (RAG with citations), `assist.classify`/`assist.find_duplicates`/
  `assist.moderate`, and `assist.faq_draft`/`assist.schema_org_draft`.

  Three properties worth knowing:
  - **Citations come from retrieval, not from the model.** The model names
    1-based indices into the passages it was shown; this code maps them back to
    what the retriever returned, and an invented index resolves to nothing. A
    chat answer can never cite a page that was not retrieved.
  - **Moderation and duplicate detection can recommend `none` or `review`, and
    nothing else.** The union has no destructive member, so no answer —
    however jailbroken — describes a deletion.
  - **`assist.find_duplicates` needs no AI provider at all.** It embeds with
    the site's `EmbeddingProvider`, which by default is the local hashing one:
    no key, no service, no model download.

- **`@cogenta/core`** gains an `imageGeneration` config section
  (`COGENTA_IMAGE_PROVIDER`/`_MODEL`/`_BASE_URL`, key in `COGENTA_IMAGE_API_KEY`
  and refused in the config file like every other secret), a `vector` section
  (`driver`/`path`/`table` — dimensions stay on `embeddings`, never duplicated),
  and the error codes `VECTOR_DIMENSION_MISMATCH`, `VECTOR_STORE_FAILED`,
  `ASSIST_UNAVAILABLE`, `ASSIST_RESPONSE_INVALID`.

- **`@cogenta/api`** gains `createAssistantRouter` — `GET /api/assistant` and
  `POST /api/assistant/run`. The `GET` answers **200 with
  `{available: false, tools: []}`** on a site with no provider, which is what
  lets a client render nothing instead of handling an error. The permission
  gate is the route's, not the tools' (R4): an actor may use the assistant when
  they may edit content somewhere, and an anonymous caller is refused before any
  provider is contacted, so an unauthenticated request can never spend the
  site's AI budget. The route also refuses any tool declaring a side effect,
  even though none does.

- **`@cogenta/cli`** wires all of it into `cogenta serve`: providers built from
  the config, the vector store selected through the registry, the content stores
  wrapped so a publish updates the embedding index the same way it already
  updates the full-text one, and `/api/assistant` mounted on every site. Every
  piece degrades to "off" with a log line rather than stopping the site: an
  unknown provider name, a missing API key, an unavailable vector store and an
  embeddings provider with no adapter yet are four warnings, not four crashes.

**Migration**: none. Every new configuration section is optional, and a site
that adds none behaves exactly as it did before.
