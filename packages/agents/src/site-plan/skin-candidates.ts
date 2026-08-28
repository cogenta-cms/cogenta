import type { ProviderClient } from '../providers/types.js'
import { generateSkin } from '../skin/generate.js'
import {
  type ExistingSiteSnapshot,
  isExistingSiteEmpty,
  renderExistingSiteForPrompt,
} from './site-context.js'
import type { SkinCandidate } from './types.js'

/**
 * L19 task 3 — "l'utilisateur voit et choisit explicitement entre deux et
 * cinq gabarits proposés, jamais un seul choix imposé."
 *
 * This is a widening of `generateSkin`, not a replacement of it: each
 * candidate goes through that function's own generate-validate-correct loop
 * against contract D, unchanged, so an invalid candidate is still rejected
 * and regenerated exactly as before. What is new is that several are asked
 * for at once, each steered towards a different design direction, and that a
 * candidate list is only offered when at least two genuinely distinct skins
 * survived validation — offering "a choice" of one, or of the same skin
 * twice, would be a lie about what the human is choosing between.
 */

export interface SkinDirection {
  readonly id: string
  readonly label: string
  /** Appended to the site description, as guidance for this candidate only. */
  readonly direction: string
}

/**
 * Five directions, ordered. Asking one model for "three different skins"
 * in one call reliably produces three near-identical ones; asking three
 * times with three genuinely different briefs does not. They are written as
 * design intent rather than as colour values, because the model fills in
 * contract D's tokens and `validateSkin` judges the contrast — naming
 * hex codes here would fight both.
 */
export const SKIN_DIRECTIONS: readonly SkinDirection[] = [
  {
    id: 'editorial',
    label: 'Warm editorial',
    direction:
      'Warm and editorial: a generous type scale, a paper-like background rather than pure white, a single restrained accent colour, comfortable density.',
  },
  {
    id: 'clinical',
    label: 'Clean and clinical',
    direction:
      'Clean and clinical: a near-neutral palette, a tight type scale, compact density, a cool accent used sparingly, sharp corners.',
  },
  {
    id: 'bold',
    label: 'Bold and graphic',
    direction:
      'Bold and graphic: a strongly saturated accent, a large type scale with a marked jump between steps, generous radius, high contrast throughout.',
  },
  {
    id: 'quiet',
    label: 'Quiet and minimal',
    direction:
      'Quiet and minimal: near-monochrome, very low chroma, wide spacing, a small type scale, almost no radius, motion kept to the minimum.',
  },
  {
    id: 'classic',
    label: 'Classic and formal',
    direction:
      'Classic and formal: deep neutral tones, a conservative type scale, a serif heading stack, moderate density, understated accent.',
  },
]

export const MIN_SKIN_CANDIDATES = 2
export const MAX_SKIN_CANDIDATES = 5

export interface GenerateSkinCandidatesOptions {
  readonly client: ProviderClient
  readonly model: string
  /** Free text: sector, mood, audience, optional brand colours — the same input `generateSkin` takes. */
  readonly description: string
  readonly blueprintLabel: string
  /** Clamped to 2..5. Defaults to 3. */
  readonly count?: number
  /** Passed to each candidate's own validation loop. */
  readonly maxAttemptsPerCandidate?: number
  /**
   * Fiche 60 task 3 — the site these candidates would style, when one
   * already exists. Threaded to every `generateSkin` call as tagged,
   * escaped data (R8), never folded into `description`.
   */
  readonly existingSite?: ExistingSiteSnapshot
}

export interface SkinCandidateFailure {
  readonly id: string
  readonly label: string
  readonly reason: string
}

export type GenerateSkinCandidatesResult =
  | {
      readonly ok: true
      readonly candidates: readonly SkinCandidate[]
      readonly failures: readonly SkinCandidateFailure[]
    }
  | {
      readonly ok: false
      readonly reason: string
      /** Whatever did survive — one candidate, or none. Never offered as a choice, but reported. */
      readonly candidates: readonly SkinCandidate[]
      readonly failures: readonly SkinCandidateFailure[]
    }

function clampCount(count: number | undefined): number {
  if (count === undefined) return 3
  return Math.min(MAX_SKIN_CANDIDATES, Math.max(MIN_SKIN_CANDIDATES, Math.trunc(count)))
}

export async function generateSkinCandidates(
  options: GenerateSkinCandidatesOptions,
): Promise<GenerateSkinCandidatesResult> {
  const directions = SKIN_DIRECTIONS.slice(0, clampCount(options.count))
  const hasExistingSite =
    options.existingSite !== undefined && !isExistingSiteEmpty(options.existingSite)
  const context =
    hasExistingSite && options.existingSite !== undefined
      ? [{ source: 'current site', content: renderExistingSiteForPrompt(options.existingSite) }]
      : undefined

  // Run in parallel: the installer's whole promise is measured in seconds,
  // and five sequential three-attempt loops is a minute of staring at a
  // spinner. Each call is independent — no candidate reads another's result.
  const settled = await Promise.all(
    directions.map(async (direction) => {
      const result = await generateSkin({
        client: options.client,
        model: options.model,
        description: `${options.description}\n\nDesign direction for this proposal: ${direction.direction}`,
        blueprintLabel: options.blueprintLabel,
        ...(options.maxAttemptsPerCandidate === undefined
          ? {}
          : { maxAttempts: options.maxAttemptsPerCandidate }),
        ...(context === undefined ? {} : { context }),
      })
      return { direction, result }
    }),
  )

  const candidates: SkinCandidate[] = []
  const failures: SkinCandidateFailure[] = []
  const seen = new Set<string>()

  for (const { direction, result } of settled) {
    if (!result.ok) {
      failures.push({ id: direction.id, label: direction.label, reason: result.reason })
      continue
    }
    const fingerprint = JSON.stringify(result.tokens)
    if (seen.has(fingerprint)) {
      failures.push({
        id: direction.id,
        label: direction.label,
        reason: 'it came back identical to another candidate, so it would not have been a choice',
      })
      continue
    }
    seen.add(fingerprint)
    candidates.push({
      id: direction.id,
      label: direction.label,
      rationale: direction.direction,
      tokens: result.tokens,
      attempts: result.attempts,
    })
  }

  if (candidates.length < MIN_SKIN_CANDIDATES) {
    return {
      ok: false,
      reason:
        candidates.length === 0
          ? 'no candidate passed contract D validation'
          : 'only one candidate passed contract D validation, which is not a choice',
      candidates,
      failures,
    }
  }
  return { ok: true, candidates, failures }
}
