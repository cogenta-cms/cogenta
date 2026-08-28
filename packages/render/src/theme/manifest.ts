import { CogentaError } from '@cogenta/core'
import { z } from 'zod'

/**
 * Contract D, "Manifeste", frozen at `theme@1.0`.
 *
 * The manifest is third-party input: it arrives from a theme package the site
 * owner installed, so it is parsed and refused, never trusted.
 */

export type ThemeRuntime = 'static' | 'server' | 'edge'

export interface ThemeManifest {
  readonly name: string
  readonly version: string
  /** Version of the theme contract this theme was written against. */
  readonly engine: string
  /** Version of the block vocabulary this theme supports. */
  readonly blocks: string
  readonly implements: readonly string[]
  /** Collections the theme expects, or `'*'` for "whatever the site has". */
  readonly collections: readonly string[] | '*'
  readonly runtime: ThemeRuntime
  /** Path to the default skin, relative to the theme root. */
  readonly tokens: string
  readonly a11y?: { readonly verified: string } | undefined
  /**
   * A short, human-readable summary of the theme — what the appearance
   * gallery shows next to its name (fiche 48). Optional: a manifest written
   * before `theme@1.2` still validates, and the gallery falls back to
   * whatever label the theme registry has for it.
   */
  readonly description?: string | undefined
  /**
   * Who publishes the theme, shown alongside `version` in the gallery.
   * Optional for the same reason as `description` — a third-party theme
   * that predates this field, or simply omits one, still installs.
   */
  readonly author?: string | undefined
}

const SEMVER_RANGE = /^[\^~]?\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/u
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/u

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(SEMVER, 'must be an exact semver version, such as 1.0.0'),
  engine: z.string().regex(SEMVER_RANGE, 'must be a semver range, such as ^1.0.0'),
  blocks: z.string().regex(SEMVER_RANGE, 'must be a semver range, such as ^1.0.0'),
  implements: z.array(z.string().min(1)),
  collections: z.union([z.literal('*'), z.array(z.string().min(1))]),
  runtime: z.enum(['static', 'server', 'edge']),
  tokens: z.string().min(1),
  a11y: z.object({ verified: z.string().min(1) }).optional(),
  // theme@1.2 (fiche 48): both optional, so a manifest written before this
  // field existed keeps validating unchanged.
  description: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
})

export type ThemeManifestInput = z.input<typeof manifestSchema>

/** Declares a theme. The same validation runs on install, on a manifest that was never typed. */
export function defineTheme(input: ThemeManifestInput): ThemeManifest {
  return parseThemeManifest(input)
}

export function parseThemeManifest(input: unknown, source?: string): ThemeManifest {
  const result = manifestSchema.safeParse(input)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new CogentaError({
      code: 'THEME_INVALID',
      message: `${source === undefined ? 'This theme manifest' : `The theme manifest in ${source}`} is not valid: ${problems.join('; ')}.`,
      hint: 'A manifest declares name, version, engine, blocks, implements, collections, runtime and tokens. See contract D.',
      details: source === undefined ? { problems } : { source, problems },
    })
  }

  // `exactOptionalPropertyTypes` makes `a11y: undefined` (or `description`/
  // `author`: undefined) and the key being genuinely absent two different
  // types, so each is only set on the result when there is something in it.
  const { a11y, description, author, ...rest } = result.data
  return {
    ...rest,
    ...(a11y === undefined ? {} : { a11y }),
    ...(description === undefined ? {} : { description }),
    ...(author === undefined ? {} : { author }),
  }
}
