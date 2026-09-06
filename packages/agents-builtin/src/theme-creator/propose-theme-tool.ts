import {
  defineTool,
  type ProviderClient,
  proposeThemeCandidates,
  type ThemeCreatorTargetTheme,
  type ToolDefinition,
} from '@cogenta/agents'
import { z } from 'zod'

/**
 * `theme.propose_theme` (`tools@1.5`, `docs/04-contrats.md`) — the Cogenta
 * Theme Creator's only tool, and its only way to touch a site's appearance:
 * it never touches it. `sideEffects: false` is not a policy this tool
 * chooses to respect, it is the whole of what the tool can do — pick a base
 * theme from what is actually installed, and fill contract D's token schema
 * via the same generate/validate/correct loop the installer and the
 * site-plan screen already use (`generateSkinCandidates`, unchanged).
 * Activating a candidate stays the human action it already was for a skin
 * gallery entry: `PUT /api/theme/overrides`.
 *
 * `resolveProvider`/`availableThemes` are factory options, not part of the
 * Zod input schema a model fills in — the same shape every other AI-backed
 * tool in this codebase uses (`AssistToolset`'s `runtime`, `deps-patch-tool
 * .ts`'s `PrClient`): Contract C's frozen `ToolContext` carries no
 * `ProviderClient` slot, and a tool whose own job *is* to call a model gets
 * one from the site's configured provider — never from anything a model
 * could name. `resolveProvider` is called **fresh on every `execute()`**,
 * never resolved once and captured: the provider store it wraps
 * (`@cogenta/cli`'s `resolveThemeProvider`) is admin-configurable at
 * runtime, and a client resolved once at wiring time would go stale the
 * moment an admin saved a new key — the exact bug this shape was written to
 * avoid. `availableThemes` is threaded the same way for the same reason: it
 * is `@cogenta/cli`'s `availableThemes()`, which this package cannot import
 * without inverting the dependency arrow.
 */

export interface ProposeThemeToolOptions {
  readonly resolveProvider: () => Promise<
    { readonly client: ProviderClient; readonly model: string } | undefined
  >
  readonly availableThemes: readonly ThemeCreatorTargetTheme[]
}

const AttachmentSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  /** Raw base64 — no `data:` URI prefix, same convention as `theme-router.ts`'s `contentBase64`. */
  dataBase64: z.string().min(1),
})

const BaselineSchema = z.object({
  themeName: z.string().min(1),
  tokens: z.record(z.string(), z.unknown()),
})

const ProposeThemeInputSchema = z.object({
  description: z.string().min(1).max(4000),
  siteName: z.string().min(1),
  attachments: z.array(AttachmentSchema).max(5).optional(),
  /** Present for "adjust the current theme" rather than "design a new one". */
  baseline: BaselineSchema.optional(),
  maxCandidates: z.number().int().min(2).max(5).optional(),
})
export type ProposeThemeInput = z.infer<typeof ProposeThemeInputSchema>

const ChromeInputSchema = z.object({
  tagline: z.string().optional(),
  footerNote: z.string().optional(),
})

const CandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  rationale: z.string(),
  tokens: z.record(z.string(), z.unknown()),
  themeName: z.string(),
  chromeInput: ChromeInputSchema.optional(),
})

const ProposeThemeOutputSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    candidates: z.array(CandidateSchema),
    warnings: z.array(z.string()),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
])
export type ProposeThemeOutput = z.infer<typeof ProposeThemeOutputSchema>

export function createProposeThemeTool(
  options: ProposeThemeToolOptions,
): ToolDefinition<ProposeThemeInput, ProposeThemeOutput> {
  return defineTool({
    name: 'theme.propose_theme',
    version: '1.0.0',
    description:
      'Proposes one to five theme candidates (a base theme package plus contract D skin tokens) from a free-text description and optional attachments. Never applies anything.',
    input: ProposeThemeInputSchema,
    output: ProposeThemeOutputSchema,
    permissions: ['theme.customize'],
    sideEffects: false,
    reversible: false,
    cost: 'medium',
    async execute(input) {
      const resolved = await options.resolveProvider()
      if (resolved === undefined) {
        return { ok: false, reason: 'No LLM provider is configured.' }
      }

      const attachments = (input.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        data: Uint8Array.from(Buffer.from(attachment.dataBase64, 'base64')),
      }))

      const result = await proposeThemeCandidates({
        client: resolved.client,
        model: resolved.model,
        description: input.description,
        siteName: input.siteName,
        availableThemes: options.availableThemes,
        ...(attachments.length === 0 ? {} : { attachments }),
        ...(input.baseline === undefined ? {} : { baseline: input.baseline }),
        ...(input.maxCandidates === undefined ? {} : { maxCandidates: input.maxCandidates }),
      })

      if (!result.ok) return { ok: false, reason: result.reason }

      return {
        ok: true,
        candidates: result.candidates.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          rationale: candidate.rationale,
          tokens: candidate.tokens,
          themeName: candidate.themeName,
          ...(candidate.chromeInput === undefined
            ? {}
            : { chromeInput: { ...candidate.chromeInput } }),
        })),
        warnings: [...result.warnings],
      }
    },
  })
}
