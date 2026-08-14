import type { ProviderClient } from '@cogenta/agents'
import { CogentaError, isCogentaError } from '@cogenta/core'
import {
  CONTRAST_PAIRS,
  DENSITIES,
  type SkinTokens,
  TOKEN_GROUPS,
  TOKEN_SPECS,
  validateSkin,
} from '@cogenta/render'

/**
 * L9 task 7: "L'IA ne produit pas de CSS. Elle remplit le schéma de tokens du
 * contrat D." Generation, validation and the three-attempt correction loop —
 * validation itself is not reimplemented here: `validateSkin` (`@cogenta/render`)
 * already does hard-refusal contrast/scale/completeness/motion checks with
 * actionable `hint`s on every `CogentaError` it throws, written (its own source
 * comment says so) for exactly this — "the author is a model, which can only
 * correct what the message actually measures." This module's only job is to
 * turn that hint into the next attempt's correction prompt.
 */

const KIND_HINT: Readonly<Record<string, string>> = {
  color: 'a hex, rgb() or hsl() colour, fully opaque if it is ever used as a background',
  length: 'a CSS length with a unit, e.g. "0.25rem" or "16px"',
  duration: 'a CSS duration with a unit, e.g. "200ms"',
  ratio: 'a number greater than 1',
  text: 'a short string (a font stack, an easing keyword, a CSS box-shadow value)',
  boolean: 'true or false',
  density: `one of: ${DENSITIES.join(', ')}`,
}

/**
 * Describes contract D's token schema by reading the same `TOKEN_SPECS`/
 * `CONTRAST_PAIRS` that `validateSkin` checks against, rather than a
 * hand-duplicated copy of the shape — the prompt and the validator cannot
 * drift apart.
 */
function describeTokenSchema(): string {
  const byGroup = new Map<string, string[]>()
  for (const spec of TOKEN_SPECS) {
    const list = byGroup.get(spec.group) ?? []
    list.push(`"${spec.name}": ${KIND_HINT[spec.kind] ?? 'a string'}`)
    byGroup.set(spec.group, list)
  }
  const groups = TOKEN_GROUPS.map(
    (group) => `  "${group}": { ${(byGroup.get(group) ?? []).join(', ')} }`,
  )
  const contrastLines = CONTRAST_PAIRS.map(
    (pair) =>
      `color.${pair.foreground} on color.${pair.background} must reach WCAG 2.2 AA contrast for ${pair.size} text`,
  )
  return [
    'Return a single JSON object with exactly these top-level keys, and no others:',
    '{',
    groups.join(',\n'),
    '}',
    '',
    'Hard requirements, checked automatically before this skin is accepted:',
    ...contrastLines.map((line) => `- ${line}`),
    '- font.scale must be greater than 1, so each step of the type scale is strictly larger than the one before it.',
    '- motion.reduced must be true.',
    '- Every key listed above must be present, with no extra key added.',
  ].join('\n')
}

export interface GenerateSkinOptions {
  readonly client: ProviderClient
  readonly model: string
  /** Free text: sector, mood, audience, optional brand colours. */
  readonly description: string
  readonly blueprintLabel: string
  /** "trois tentatives" by default. */
  readonly maxAttempts?: number
}

export type GenerateSkinResult =
  | { readonly ok: true; readonly tokens: SkinTokens; readonly attempts: number }
  | { readonly ok: false; readonly attempts: number; readonly reason: string }

const DEFAULT_MAX_ATTEMPTS = 3
const MAX_TOKENS = 2000

function buildPrompt(options: GenerateSkinOptions, correction: string | undefined): string {
  const lines = [
    'You are configuring the visual design tokens of a Cogenta CMS site.',
    'You do not write CSS or markup — only the JSON data below.',
    `Site type: ${options.blueprintLabel}.`,
    `Description from the site owner: ${options.description}`,
    '',
    describeTokenSchema(),
    '',
    'Reply with ONLY the JSON object. No prose, no markdown code fence, no explanation.',
  ]
  if (correction !== undefined) {
    lines.push(
      '',
      `Your previous attempt was rejected: ${correction}`,
      'Fix it and reply again with ONLY the corrected JSON object.',
    )
  }
  return lines.join('\n')
}

function notJson(reason: string): CogentaError {
  return new CogentaError({
    code: 'SKIN_GENERATION_RESPONSE_NOT_JSON',
    message: `The model's response was not a single JSON object: ${reason}.`,
    hint: 'Reply with ONLY a JSON object matching the requested token schema — no prose, no markdown fence.',
  })
}

function extractJson(content: string | null): unknown {
  if (content === null) throw notJson('the response was empty')
  const trimmed = content.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) throw notJson('no JSON object was found')
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch (error) {
    throw notJson(error instanceof Error ? error.message : String(error))
  }
}

function correctionFor(error: CogentaError): string {
  return error.hint === undefined ? error.message : `${error.message} ${error.hint}`
}

export async function generateSkin(options: GenerateSkinOptions): Promise<GenerateSkinResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  let correction: string | undefined
  let lastReason = 'no attempt was made'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let content: string | null
    try {
      const response = await options.client.chat({
        model: options.model,
        messages: [{ role: 'user', content: buildPrompt(options, correction) }],
        maxTokens: MAX_TOKENS,
      })
      content = response.content
    } catch (error) {
      lastReason = `model call failed: ${error instanceof Error ? error.message : String(error)}`
      correction = lastReason
      continue
    }

    let candidate: unknown
    try {
      candidate = extractJson(content)
    } catch {
      lastReason = 'the model did not return a JSON object'
      correction =
        'Your previous response was not a single JSON object. Reply with ONLY the JSON object — no prose, no markdown fence.'
      continue
    }

    try {
      const tokens = validateSkin(candidate)
      return { ok: true, tokens, attempts: attempt }
    } catch (error) {
      if (!isCogentaError(error)) throw error
      lastReason = error.message
      correction = correctionFor(error)
    }
  }

  return { ok: false, attempts: maxAttempts, reason: lastReason }
}
