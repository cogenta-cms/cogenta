import {
  type AuditLogLike,
  classifyThemeLayoutNeed,
  NOOP_PROGRESS,
  type ProgressReporter,
  type ProviderClient,
  proposeThemeCandidates,
  type ThemeCreatorAttachment,
  type ThemeCreatorCandidate,
  type ThemeCreatorTargetTheme,
} from '@cogenta/agents'
import { generateSandboxTheme } from './generate-sandbox-theme.js'

/**
 * The single entry point `POST /api/theme/generate` (`@cogenta/cli`'s
 * `theme-wiring.ts`) now calls, replacing its previous direct call to
 * `proposeThemeCandidates` alone. Fixes the real, reported gap: that older
 * wiring could only ever produce contract D token candidates — a recolour of
 * whichever theme package was already active — with no path to a genuinely
 * different page layout, no matter what a request or an attached reference
 * screenshot actually showed. `theme.write_sandbox_file`
 * (`generate-sandbox-theme.ts`, same directory) already could write one;
 * this function is what finally decides *when* to reach for it.
 *
 * A cheap classification call (`classifyThemeLayoutNeed`, `@cogenta/agents`)
 * makes that decision explicitly, never a hardcoded heuristic on "is a file
 * attached" — a plain-text request can just as legitimately need a custom
 * layout, and an attached screenshot of a palette swap does not.
 *
 * Both outcomes still degrade gracefully: a custom-layout request that also
 * gets a usable tokens-only alternative is not treated as a failure of the
 * tokens path, and a tokens path that fails outright (a genuine
 * `proposeThemeCandidates` error) does not take down a sandbox candidate
 * that already generated successfully. `ok: false` is reserved for the case
 * where nothing at all could be produced.
 */

export interface GenerateThemeCandidatesInput {
  readonly client: ProviderClient
  readonly model: string
  readonly description: string
  readonly siteName: string
  readonly availableThemes: readonly ThemeCreatorTargetTheme[]
  readonly attachments?: readonly ThemeCreatorAttachment[]
  readonly baseline?: { readonly themeName: string; readonly tokens: Record<string, unknown> }
  readonly maxCandidates?: number
  /** Minted lazily — only called when the classifier actually decides a sandbox candidate is worth generating, never up front. */
  readonly mintSandboxId: () => string
  readonly writeFile: (input: {
    readonly sandboxId: string
    readonly path: string
    readonly content: string
  }) => Promise<{ readonly path: string }>
  readonly deleteFile: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<void>
  readonly onProgress?: ProgressReporter
  readonly auditLog?: AuditLogLike
  readonly signal?: AbortSignal
}

export type ThemeCandidate =
  | ({ readonly kind: 'tokens' } & ThemeCreatorCandidate)
  | {
      readonly kind: 'sandbox'
      readonly id: string
      readonly label: string
      readonly rationale: string
      readonly sandboxId: string
      readonly filesWritten: readonly string[]
    }

export type GenerateThemeCandidatesResult =
  | {
      readonly ok: true
      readonly candidates: readonly ThemeCandidate[]
      readonly warnings: readonly string[]
      /** Why a custom layout was (or was not) attempted — shown to the operator so this decision is inspectable, never a silent branch. */
      readonly layoutDecision: { readonly needsCustomLayout: boolean; readonly reason: string }
    }
  | { readonly ok: false; readonly reason: string }

export async function generateThemeCandidates(
  input: GenerateThemeCandidatesInput,
): Promise<GenerateThemeCandidatesResult> {
  const progress = input.onProgress ?? NOOP_PROGRESS

  const classification = await classifyThemeLayoutNeed({
    client: input.client,
    model: input.model,
    description: input.description,
    siteName: input.siteName,
    availableThemes: input.availableThemes,
    ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
    ...(input.baseline === undefined ? {} : { baseline: { themeName: input.baseline.themeName } }),
    ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
  })
  if (!classification.ok) return { ok: false, reason: classification.reason }

  // A live run against the real reference screenshot that motivated this
  // feature showed the classifier itself is not reliable enough to be the
  // only gate: asked about a hero photo with an overlaid review badge, an
  // icon-stat band and a circular "20+ years" badge, it judged "tokens are
  // enough" because an installed theme has a hero/stats/about section *in
  // some form* — true, but not what "match this screenshot" actually asked
  // for. A reference image is the strongest, least ambiguous signal this
  // function ever receives that the operator wants visual fidelity to a
  // specific composition, not just a plausible-sounding section list, so it
  // always forces the custom-layout path regardless of the classifier's own
  // verdict — the classifier still decides for the (far more common)
  // text-only, no-attachment case, where "tokens are enough" is usually
  // right and a full agent run would be needless cost.
  const forcedByImage = classification.processed.imageParts.length > 0
  const needsCustomLayout = classification.needsCustomLayout || forcedByImage
  const layoutDecision = {
    needsCustomLayout,
    reason: forcedByImage
      ? classification.needsCustomLayout
        ? classification.reason
        : `A reference image was attached — matching it visually always attempts a custom layout, regardless of the classifier's own verdict ("${classification.reason}").`
      : classification.reason,
  }

  const warnings: string[] = [...classification.processed.warnings]
  const candidates: ThemeCandidate[] = []

  async function tryTokensCandidates(): Promise<void> {
    const result = await proposeThemeCandidates({
      client: input.client,
      model: input.model,
      description: input.description,
      siteName: input.siteName,
      availableThemes: input.availableThemes,
      ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      ...(input.baseline === undefined ? {} : { baseline: input.baseline }),
      ...(input.maxCandidates === undefined ? {} : { maxCandidates: input.maxCandidates }),
      ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
    })
    if (!result.ok) {
      warnings.push(`Tokens-only candidates could not be produced: ${result.reason}`)
      return
    }
    for (const candidate of result.candidates) {
      candidates.push({ kind: 'tokens', ...candidate })
    }
    warnings.push(...result.warnings)
  }

  async function trySandboxCandidate(): Promise<void> {
    const sandboxId = input.mintSandboxId()
    progress.report(`Writing a custom layout into sandbox "${sandboxId}"…`)
    const result = await generateSandboxTheme({
      client: input.client,
      model: input.model,
      description: input.description,
      siteName: input.siteName,
      sandboxId,
      writeFile: input.writeFile,
      deleteFile: input.deleteFile,
      ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      ...(input.onProgress === undefined ? {} : { onProgress: input.onProgress }),
      ...(input.auditLog === undefined ? {} : { auditLog: input.auditLog }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    if (!result.ok) {
      warnings.push(`Custom layout could not be generated: ${result.reason}`)
      return
    }
    candidates.push({
      kind: 'sandbox',
      id: result.sandboxId,
      label: 'Custom layout',
      rationale: result.rationale,
      sandboxId: result.sandboxId,
      filesWritten: result.filesWritten,
    })
  }

  if (needsCustomLayout) {
    // Sandbox generation first — it is the point of this request, and the
    // slower, more expensive of the two; the tokens-only fallback runs
    // after so a failure in one never blocks the other from being reported.
    await trySandboxCandidate()
    await tryTokensCandidates()
  } else {
    await tryTokensCandidates()
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: warnings.at(-1) ?? 'no candidate could be produced',
    }
  }

  return { ok: true, candidates, warnings, layoutDecision }
}
