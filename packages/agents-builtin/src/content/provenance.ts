import {
  type ContentServiceLike,
  defineTool,
  type ToolContext,
  type ToolDefinition,
} from '@cogenta/agents'
import { z } from 'zod'
import type { ContentProvenance } from './types.js'

export interface ContentDraftToolOptions {
  readonly provenance: ContentProvenance
}

function accessContextOf(actor: {
  readonly id: string | null
  readonly roles: readonly string[]
}): {
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
} {
  return { actor }
}

// Deliberately no `provenance` field — the model has no way to even attempt
// setting it. `values` still accepts anything else the agent wants to write.
const ContentDraftInputSchema = z.object({
  collection: z.string(),
  id: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
  locale: z.string().optional(),
})
type ContentDraftInput = z.infer<typeof ContentDraftInputSchema>

const DEFAULT_READ_OPTIONS = { state: 'working' as const, depth: 0 }

/**
 * "Tout contenu produit porte `provenance: generated` ou `assisted`. Le
 * champ n'est pas optionnel et n'est pas modifiable par l'agent." Two
 * things make this a hard structural rule rather than a convention: the
 * input schema never offers a `provenance` key for the model to set (see
 * `ContentDraftInputSchema` above), and `execute` overwrites whatever ends
 * up under that key in `values` unconditionally, every call — even if a
 * caller smuggled one in directly. This is the Content agent's own
 * `content.write_draft`, not the generic one in `@cogenta/agents` (which
 * has no opinion on provenance at all, correctly — that is this agent's
 * rule, not the tool registry's).
 */
export function createContentDraftTool(
  service: ContentServiceLike,
  options: ContentDraftToolOptions,
): ToolDefinition<ContentDraftInput, Record<string, unknown>> {
  return defineTool({
    name: 'content.write_draft',
    version: '1.0.0',
    description:
      'Create or update a working-state (draft) content entry, stamped with its provenance.',
    input: ContentDraftInputSchema,
    output: z.record(z.string(), z.unknown()),
    permissions: ['content.write_draft'],
    sideEffects: true,
    reversible: false,
    cost: 'low',
    async execute(input: ContentDraftInput, ctx: ToolContext) {
      const context = accessContextOf(ctx.actor)
      const values = { ...input.values, provenance: options.provenance }

      if (input.id !== undefined) {
        return service.update(context, input.collection, input.id, { values }, DEFAULT_READ_OPTIONS)
      }
      return service.create(
        context,
        input.collection,
        { values, ...(input.locale === undefined ? {} : { locale: input.locale }) },
        DEFAULT_READ_OPTIONS,
      )
    },
  })
}
