import { z } from 'zod'

/**
 * What every L18 assistant tool returns, without exception.
 *
 * `applied: false` is a literal, not a boolean. The *type* of an assistant
 * tool's output therefore cannot express "I changed the entry" — L18's
 * acceptance criterion ("aucune action de ce lot ne modifie ou supprime du
 * contenu sans validation humaine explicite", R6) is a property of the shape
 * here, not a rule each tool is trusted to remember. The editor applies a
 * suggestion by editing the form and saving it, through the same
 * `ContentService` and the same permission checks every other edit goes through.
 */
export const SuggestionSchema = z.object({
  /** One or more candidates, best first. Never empty. */
  suggestions: z.array(z.string().min(1)).min(1),
  /** One short sentence about what was changed or why, when the tool has something worth saying. */
  note: z.string().optional(),
  /** Always false: an assistant tool proposes, a human disposes. */
  applied: z.literal(false),
})

export type Suggestion = z.infer<typeof SuggestionSchema>

export function suggestion(suggestions: readonly string[], note?: string): Suggestion {
  return {
    suggestions: [...suggestions],
    ...(note === undefined ? {} : { note }),
    applied: false,
  }
}
