import { CogentaError } from '@cogenta/core'
import { z } from 'zod'

/**
 * What the delivery plane needs to know, and deliberately nothing else.
 *
 * `site` is structurally the `site` block of `CogentaConfig`, so a resolved
 * Cogenta configuration is assignable here without an import: the render
 * package must not pull the control-plane configuration loader — and with it
 * the database URL and every secret — into the process that runs theme code
 * (ADR-0004).
 */
export interface SiteConfig {
  readonly name: string
  readonly url: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

export interface ThemeConfig {
  /** Package name or directory name of the active theme. */
  readonly name: string
  /**
   * Where the theme lives. Absolute, or relative to the working directory.
   * Absent means "resolve `name` as a package from the working directory".
   */
  readonly root?: string | undefined
}

/**
 * How the renderer reaches the content API (ADR-0016).
 *
 * `token` is a read-only token carrying the rights of the `public` role. It is
 * the *only* credential the delivery plane holds, and it can read nothing a
 * visitor could not read anyway.
 */
export interface ContentApiConfig {
  readonly url: string
  readonly token: string
  /** Mount point of the content routes under `url`. */
  readonly basePath?: string | undefined
}

export interface RenderConfig {
  readonly site: SiteConfig
  readonly theme: ThemeConfig
  readonly content: ContentApiConfig
}

const siteSchema = z.object({
  name: z.string().min(1),
  url: z.url(),
  locales: z.array(z.string().min(1)).min(1),
  defaultLocale: z.string().min(1),
})

const renderConfigSchema = z.object({
  site: siteSchema,
  theme: z.object({ name: z.string().min(1), root: z.string().min(1).optional() }),
  content: z.object({
    url: z.url(),
    token: z.string().min(1),
    basePath: z.string().min(1).optional(),
  }),
})

/**
 * Validates a render configuration, and fails loudly rather than rendering a
 * site against half a configuration.
 */
export function parseRenderConfig(input: unknown): RenderConfig {
  const result = renderConfigSchema.safeParse(input)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `The render configuration is not usable: ${problems.join('; ')}.`,
      hint: 'A render configuration needs site.name, site.url, site.locales, site.defaultLocale, theme.name and a content API url plus read token.',
      details: { problems },
    })
  }

  const config = result.data
  if (!config.site.locales.includes(config.site.defaultLocale)) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `The default locale "${config.site.defaultLocale}" is not in the site locales.`,
      hint: `Add it to site.locales, or pick one of: ${config.site.locales.join(', ')}.`,
      details: { defaultLocale: config.site.defaultLocale, locales: config.site.locales },
    })
  }

  return config
}
