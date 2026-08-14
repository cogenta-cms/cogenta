import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProviderClient } from '@cogenta/agents'
import type { Output } from '@cogenta/cli'
import type { SkinTokens } from '@cogenta/render'
import type { Prompter } from './prompts.js'
import { generateSkin } from './skin-generation.js'
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
  /** Caps how many manual "regenerate" rounds the user can ask for, on top of each round's own three automatic correction attempts. */
  readonly maxRegenerations?: number
}

export type SkinOutcome =
  | { readonly kind: 'generated'; readonly tokens: SkinTokens; readonly attempts: number }
  | { readonly kind: 'default'; readonly reason: string }

const DEFAULT_MAX_REGENERATIONS = 3

async function writePreview(
  tokens: SkinTokens,
  siteName: string,
  targetDir: string,
): Promise<string> {
  const previewDir = join(targetDir, '.cogenta', 'skin-preview')
  await mkdir(previewDir, { recursive: true })
  const pages = renderSkinPreview(tokens, siteName)
  await Promise.all(
    pages.map((page) => writeFile(join(previewDir, page.filename), page.html, 'utf8')),
  )
  return previewDir
}

/**
 * Step 5 of L9 task 7's pipeline: "Aperçu proposé sur trois pages types, avec
 * possibilité de régénérer ou d'ajuster." Each round runs `generateSkin`'s own
 * three-attempt auto-correction loop; on success, three real preview pages are
 * written to disk (`.cogenta/skin-preview/`) and the human is offered accept,
 * regenerate, or fall back to the default — bounded so a non-interactive
 * `--yes`/`--config` run (whose `Prompter.choice` always returns its default,
 * "accept") never loops.
 */
export async function chooseSkin(options: ChooseSkinOptions): Promise<SkinOutcome> {
  const maxRegenerations = options.maxRegenerations ?? DEFAULT_MAX_REGENERATIONS
  let lastReason = 'no attempt was made'

  for (let round = 1; round <= maxRegenerations; round++) {
    options.out.detail(
      `Generating a skin from your description (round ${round}/${maxRegenerations})…`,
    )
    const result = await generateSkin({
      client: options.client,
      model: options.model,
      description: options.description,
      blueprintLabel: options.blueprintLabel,
    })

    if (!result.ok) {
      lastReason = `${result.attempts} attempt${result.attempts === 1 ? '' : 's'} all failed validation: ${result.reason}`
      options.out.warn(lastReason)
      break
    }

    const previewDir = await writePreview(result.tokens, options.siteName, options.targetDir)
    options.out.ok(
      `Skin generated and validated in ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}. Preview: ${previewDir}`,
    )

    const choice = await options.prompter.choice(
      'Use this generated skin?',
      [
        { label: 'Accept it', value: 'accept' as const },
        { label: 'Regenerate (try again)', value: 'regenerate' as const },
        { label: 'Use the default skin instead', value: 'default' as const },
      ],
      0,
    )

    if (choice === 'accept') {
      return { kind: 'generated', tokens: result.tokens, attempts: result.attempts }
    }
    if (choice === 'default') {
      return { kind: 'default', reason: 'the default skin was chosen over the generated one' }
    }
    // 'regenerate' — loop again.
    lastReason = `${maxRegenerations} regeneration round${maxRegenerations === 1 ? '' : 's'} were used without accepting a result`
  }

  return { kind: 'default', reason: lastReason }
}
