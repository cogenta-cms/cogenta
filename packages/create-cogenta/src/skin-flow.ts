import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateSkinCandidates, type ProviderClient, type SkinCandidate } from '@cogenta/agents'
import type { Output } from '@cogenta/cli'
import type { SkinTokens } from '@cogenta/render'
import type { Prompter } from './prompts.js'
import { renderSkinPreview } from './skin-preview.js'

export interface ChooseSkinOptions {
  readonly prompter: Prompter
  readonly out: Output
  readonly client: ProviderClient
  readonly model: string
  readonly description: string
  readonly blueprintLabel: string
  readonly siteName: string
  readonly targetDir: string
  /** Caps how many manual "regenerate" rounds the user can ask for, on top of each candidate's own three automatic correction attempts. */
  readonly maxRegenerations?: number
  /** How many designs to propose. Clamped to 2..5 by `generateSkinCandidates`. Defaults to 3. */
  readonly candidateCount?: number
}

export type SkinOutcome =
  | {
      readonly kind: 'generated'
      readonly tokens: SkinTokens
      readonly attempts: number
      /** Which of the proposed designs the human picked. */
      readonly candidateId: string
      readonly candidateLabel: string
      /** How many were actually offered — the lot requires this to be at least two. */
      readonly offered: number
    }
  | { readonly kind: 'default'; readonly reason: string }

const DEFAULT_MAX_REGENERATIONS = 3

async function writePreviews(
  candidates: readonly SkinCandidate[],
  siteName: string,
  targetDir: string,
): Promise<string> {
  const root = join(targetDir, '.cogenta', 'skin-preview')
  await mkdir(root, { recursive: true })
  await Promise.all(
    candidates.map(async (candidate) => {
      const directory = join(root, candidate.id)
      await mkdir(directory, { recursive: true })
      const pages = renderSkinPreview(candidate.tokens, siteName)
      await Promise.all(
        pages.map((page) => writeFile(join(directory, page.filename), page.html, 'utf8')),
      )
    }),
  )
  return root
}

/**
 * L19 task 3, in the installer: "l'utilisateur voit et choisit explicitement
 * entre deux et cinq gabarits proposés, jamais un seul choix imposé."
 *
 * The shape of the round is what it was in L9 task 7 — generate, preview on
 * three real pages, then accept / regenerate / fall back to the default,
 * bounded so a non-interactive `--yes` run (whose `Prompter.choice` always
 * answers with its default) never loops. What changed is that a round now
 * produces several designs rather than one, each validated against contract
 * D by `generateSkin`'s own loop, and the accept step is a pick among them.
 *
 * A round that cannot produce at least two distinct valid designs is not
 * offered as a choice: it falls through to the next round, and eventually to
 * the default skin, saying why. Presenting one option as if it were a
 * decision is the failure mode this task exists to remove.
 */
export async function chooseSkin(options: ChooseSkinOptions): Promise<SkinOutcome> {
  const maxRegenerations = options.maxRegenerations ?? DEFAULT_MAX_REGENERATIONS
  let lastReason = 'no attempt was made'

  for (let round = 1; round <= maxRegenerations; round++) {
    options.out.detail(
      `Generating design proposals from your description (round ${round}/${maxRegenerations})…`,
    )
    const result = await generateSkinCandidates({
      client: options.client,
      model: options.model,
      description: options.description,
      blueprintLabel: options.blueprintLabel,
      ...(options.candidateCount === undefined ? {} : { count: options.candidateCount }),
    })

    for (const failure of result.failures) {
      options.out.warn(`The "${failure.label}" design was not offered: ${failure.reason}.`)
    }

    if (!result.ok) {
      lastReason = `no usable choice of designs was produced: ${result.reason}`
      options.out.warn(lastReason)
      break
    }

    const previewRoot = await writePreviews(result.candidates, options.siteName, options.targetDir)
    options.out.ok(
      `${result.candidates.length} designs generated and validated. Previews: ${previewRoot}`,
    )
    for (const candidate of result.candidates) {
      options.out.detail(`  ${candidate.label} — ${previewRoot}${join('', candidate.id)}`)
    }

    type Pick =
      | { readonly kind: 'candidate'; readonly candidate: SkinCandidate }
      | 'regenerate'
      | 'default'
    const choice = await options.prompter.choice<Pick>(
      'Which design do you want? (open the previews above to compare)',
      [
        ...result.candidates.map((candidate) => ({
          label: candidate.label,
          value: { kind: 'candidate' as const, candidate },
          hint: candidate.rationale,
        })),
        { label: 'None of these — propose new ones', value: 'regenerate' as const },
        { label: 'None of these — use the default skin', value: 'default' as const },
      ],
      0,
    )

    if (choice === 'default') {
      return { kind: 'default', reason: 'the default skin was chosen over the generated ones' }
    }
    if (choice !== 'regenerate') {
      return {
        kind: 'generated',
        tokens: choice.candidate.tokens,
        attempts: choice.candidate.attempts,
        candidateId: choice.candidate.id,
        candidateLabel: choice.candidate.label,
        offered: result.candidates.length,
      }
    }
    lastReason = `${maxRegenerations} regeneration round${maxRegenerations === 1 ? '' : 's'} were used without picking a design`
  }

  return { kind: 'default', reason: lastReason }
}
