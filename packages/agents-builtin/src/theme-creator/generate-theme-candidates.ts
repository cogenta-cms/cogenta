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
  /** Threaded straight through to `generateSandboxTheme`, where it becomes the run's `theme.preview_sandbox` tool — the difference between a writer that sees its own output and one that does not. */
  readonly renderPreview?: (input: {
    readonly sandboxId: string
  }) => Promise<
    { readonly ok: true; readonly html: string } | { readonly ok: false; readonly error: string }
  >
  /** Also threaded through — together they let a run change an existing theme instead of only writing a new one. */
  readonly listFiles?: (input: { readonly sandboxId: string }) => Promise<readonly string[]>
  readonly readFile?: (input: {
    readonly sandboxId: string
    readonly path: string
  }) => Promise<string>
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
      /** The agent's whole closing text — for the conversation, where it has room. */
      readonly rationale: string
      /** The card-sized version of it, guaranteed short. */
      readonly summary: string
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

  // One answer unless more were asked for. A live run made the case against
  // the old behaviour better than any argument could: a request for "un thème
  // complet à partir du design sur la capture" came back as the one real
  // custom layout plus three recolours of an installed blog theme, and the
  // answer was buried among alternatives nobody wanted. The classifier reads
  // the brief for an explicit count; everything else gets exactly one.
  // Defended rather than trusted, even though the type says it is always
  // there: this number is a loop bound, and an `undefined` one silently
  // produces zero candidates — a feature that answers with nothing at all
  // rather than with an error anyone could act on.
  const requestedVariants = classification.requestedVariants ?? 1

  async function tryTokensCandidates(): Promise<void> {
    const result = await proposeThemeCandidates({
      client: input.client,
      model: input.model,
      description: input.description,
      siteName: input.siteName,
      availableThemes: input.availableThemes,
      ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      ...(input.baseline === undefined ? {} : { baseline: input.baseline }),
      // The brief's own count wins; an explicit caller-supplied ceiling
      // still overrides it, which is what keeps existing callers unchanged.
      maxCandidates: input.maxCandidates ?? requestedVariants,
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
    progress.report(`Writing a custom layout into sandbox "${sandboxId}"…`, {
      kind: 'stage',
    })
    const result = await generateSandboxTheme({
      client: input.client,
      model: input.model,
      description: input.description,
      siteName: input.siteName,
      sandboxId,
      writeFile: input.writeFile,
      deleteFile: input.deleteFile,
      ...(input.renderPreview === undefined ? {} : { renderPreview: input.renderPreview }),
      ...(input.listFiles === undefined ? {} : { listFiles: input.listFiles }),
      ...(input.readFile === undefined ? {} : { readFile: input.readFile }),
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
      summary: result.summary,
      sandboxId: result.sandboxId,
      filesWritten: result.filesWritten,
    })
  }

  if (needsCustomLayout) {
    for (let index = 0; index < requestedVariants; index++) {
      await trySandboxCandidate()
    }
    // Only as a rescue: if writing a custom layout produced nothing at all,
    // a tokens-only proposal is still better than an empty screen. When the
    // custom layout worked, adding recolours beside it is noise.
    if (candidates.length === 0) await tryTokensCandidates()
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
