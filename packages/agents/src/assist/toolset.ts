import type { SiteContext } from '../identity/context.js'
import type { ProviderClient } from '../providers/types.js'
import type { ToolCost, ToolDefinition } from '../tools/types.js'
import { type AssistRuntime, createAssistRuntime } from './runtime.js'
import { createWritingTools } from './writing.js'

/**
 * The one place that decides whether this whole lot exists for a given site.
 *
 * L18's known pitfall, verbatim: "il n'existe pas de version dégradée locale
 * crédible de « génère un résumé » — la dégradation correcte ici est que la
 * fonctionnalité disparaît de l'UI plutôt que d'échouer bruyamment". So there is
 * no fallback tier here, and deliberately no `Driver`/registry either — the
 * absence of an LLM provider produces an empty toolset, not a degraded one.
 *
 * Everything downstream reads `available` and shows nothing when it is false:
 * the REST route answers `{available: false, tools: []}` with a 200, and the
 * admin panel renders nothing at all. Nothing anywhere throws because a site
 * chose not to configure a model, which is R2 restated for this lot.
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
  /** Absent when no provider is configured. */
  readonly runtime?: AssistRuntime
}

export interface AssistToolsetOptions {
  /**
   * The site's configured LLM client. **Optional on purpose** — a site with no
   * `llm` section, or with no API key in the environment, passes nothing here
   * and everything below simply does not exist.
   */
  readonly provider?: ProviderClient
  readonly site: SiteContext
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
  if (options.provider === undefined) return UNAVAILABLE

  const runtime = createAssistRuntime({ provider: options.provider, site: options.site })
  const tools = createWritingTools(runtime)

  return {
    available: true,
    tools,
    capabilities: describeCapabilities(tools),
    runtime,
  }
}
