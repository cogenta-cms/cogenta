import type { SiteContext } from '../identity/context.js'
import type { PromptTemplateStore } from '../prompts/types.js'
import type { ImageProviderClient } from '../providers/image/types.js'
import type { ProviderClient } from '../providers/types.js'
import type { EmbeddingProvider } from '../rag/embeddings/types.js'
import type { SemanticSearch } from '../rag/semantic/search.js'
import type { VectorStore } from '../rag/vector/types.js'
import type { ToolCost, ToolDefinition } from '../tools/types.js'
import { createContentChatTool } from './chat.js'
import { createClassifyTool, createFindDuplicatesTool, createModerateTool } from './classify.js'
import { createFaqTool, createSchemaOrgTool } from './faq.js'
import { createGenerateImageTool } from './images.js'
import { type AssistRuntime, createAssistRuntime } from './runtime.js'
import type { AssistUsageTracker } from './usage.js'
import { createWritingTools } from './writing.js'

/**
 * The one place that decides which parts of this lot exist for a given site.
 *
 * L18's known pitfall, verbatim: "il n'existe pas de version dégradée locale
 * crédible de « génère un résumé » — la dégradation correcte ici est que la
 * fonctionnalité disparaît de l'UI plutôt que d'échouer bruyamment". So there is
 * no fallback tier here, and deliberately no `Driver`/registry either: the
 * absence of an LLM provider produces an empty toolset, not a degraded one.
 *
 * Capabilities appear **one by one**, not as a block, because they do not all
 * need the same thing:
 *
 * | capability                | needs                                    |
 * |---------------------------|------------------------------------------|
 * | writing, moderation, FAQ  | a text provider                          |
 * | image generation          | an image provider                       |
 * | chat / RAG                | a text provider **and** semantic search |
 * | duplicate detection       | a vector store — **no AI provider at all** |
 *
 * That last row is the interesting one: `assist.find_duplicates` embeds with
 * whatever `EmbeddingProvider` the site has, which by default is the local
 * hashing one that needs no key and no service. A site with R2 taken to its
 * limit — zero AI configured — still gets working duplicate detection.
 *
 * Everything downstream reads `available` and shows nothing when it is false:
 * the REST route answers `{available: false, tools: []}` with a 200, and the
 * admin panel renders nothing at all. Nothing anywhere throws because a site
 * chose not to configure a model.
 */

export interface AssistCapability {
  readonly tool: string
  /** Short label for a button in the admin. */
  readonly label: string
  readonly description: string
  readonly cost: ToolCost
  /** The input field names the admin must supply, beyond the entry text. */
  readonly needs: readonly string[]
}

export interface AssistToolset {
  readonly available: boolean
  /** Plain sentence for the admin when `available` is false. Never a stack trace, never a code. */
  readonly reason?: string
  readonly tools: readonly ToolDefinition[]
  readonly capabilities: readonly AssistCapability[]
  /** Absent when no text provider is configured. */
  readonly runtime?: AssistRuntime
  /** The text model actually in use, when a provider is configured — fiche 30 task 5's `provenanceDetail.model` reads this. */
  readonly model?: string
  /** Fiche 30 task 3. Present exactly when a text provider is present — the only side that spends tokens. */
  readonly usage?: AssistUsageTracker
}

export interface AssistToolsetOptions {
  /**
   * The site's configured LLM client. **Optional on purpose** — a site with no
   * `llm` section, or with no API key in the environment, passes nothing here
   * and everything that needs one simply does not exist.
   */
  readonly provider?: ProviderClient
  /** The site's configured image vendor, independent of the text one. */
  readonly imageProvider?: ImageProviderClient
  /** L10's full-text index fused with the vector store. Needed by chat/RAG. */
  readonly search?: SemanticSearch
  /** The vector store and embedder duplicate detection runs on. Needs no AI provider. */
  readonly vectors?: { readonly store: VectorStore; readonly embeddings: EmbeddingProvider }
  readonly site: SiteContext
  /** Fiche 30 task 3. Absent means no cap is tracked (the toolset still runs — only visibility and enforcement are lost). */
  readonly usage?: AssistUsageTracker
  /** Fiche 45 — the shared prompt template library. Absent (or empty) means every tool below falls back to its own hard-coded instruction text unchanged. */
  readonly promptTemplates?: PromptTemplateStore
}

const LABELS: Readonly<Record<string, { readonly label: string; readonly needs: string[] }>> = {
  'assist.rewrite': { label: 'Rewrite', needs: [] },
  'assist.proofread': { label: 'Proofread', needs: [] },
  'assist.summarise': { label: 'Summarise', needs: [] },
  'assist.translate': { label: 'Translate', needs: ['targetLocale'] },
  'assist.meta_description': { label: 'Meta description', needs: [] },
  'assist.titles': { label: 'Titles', needs: [] },
  'assist.tags': { label: 'Tags', needs: [] },
  'assist.alt_text': { label: 'Alt text', needs: [] },
  'assist.generate_image': { label: 'Generate image', needs: ['prompt'] },
  'assist.chat': { label: 'Ask the site', needs: ['question', 'siteId', 'collections'] },
  'assist.classify': { label: 'Suggest categories', needs: ['taxonomy'] },
  'assist.find_duplicates': { label: 'Find duplicates', needs: ['siteId', 'collections'] },
  'assist.moderate': { label: 'Check for review', needs: [] },
  'assist.faq_draft': { label: 'Draft a FAQ', needs: [] },
  'assist.schema_org_draft': { label: 'Draft structured data', needs: ['type'] },
}

export function describeCapabilities(
  tools: readonly ToolDefinition[],
): readonly AssistCapability[] {
  return tools.map((tool) => ({
    tool: tool.name,
    label: LABELS[tool.name]?.label ?? tool.name,
    description: tool.description,
    cost: tool.cost,
    needs: LABELS[tool.name]?.needs ?? [],
  }))
}

const UNAVAILABLE: AssistToolset = Object.freeze({
  available: false,
  reason:
    'No AI provider is configured for this site, so the writing assistant is switched off. Everything else in the CMS works exactly the same.',
  tools: Object.freeze([]),
  capabilities: Object.freeze([]),
})

export function createAssistToolset(options: AssistToolsetOptions): AssistToolset {
  const runtime =
    options.provider === undefined
      ? undefined
      : createAssistRuntime({
          provider: options.provider,
          site: options.site,
          ...(options.usage === undefined
            ? {}
            : {
                onUsage: (info) => {
                  // `record` needs a tool name to attribute to; a completion
                  // made with no `request.tool` (there is none today) is
                  // still counted against the monthly cap, just not
                  // attributed to any one row in the per-tool breakdown.
                  options.usage?.record(info.tool ?? 'unknown', info.usage)
                },
              }),
        })

  const promptTemplates = options.promptTemplates
  const tools: ToolDefinition[] = [
    ...(runtime === undefined
      ? []
      : [
          ...createWritingTools(runtime, promptTemplates),
          createClassifyTool(runtime, promptTemplates) as ToolDefinition,
          createModerateTool(runtime, promptTemplates) as ToolDefinition,
          createFaqTool(runtime, promptTemplates) as ToolDefinition,
          createSchemaOrgTool(runtime, promptTemplates) as ToolDefinition,
        ]),
    ...(options.imageProvider === undefined
      ? []
      : [createGenerateImageTool(options.imageProvider) as ToolDefinition]),
    ...(runtime === undefined || options.search === undefined
      ? []
      : [
          createContentChatTool({
            runtime,
            search: options.search,
            ...(promptTemplates === undefined ? {} : { promptTemplates }),
          }) as ToolDefinition,
        ]),
    ...(options.vectors === undefined
      ? []
      : [createFindDuplicatesTool(options.vectors) as ToolDefinition]),
  ]

  if (tools.length === 0) return UNAVAILABLE

  return {
    available: true,
    tools,
    capabilities: describeCapabilities(tools),
    ...(runtime === undefined ? {} : { runtime, model: runtime.model }),
    ...(runtime === undefined || options.usage === undefined ? {} : { usage: options.usage }),
  }
}
