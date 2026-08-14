import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

const SiteConfigSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  locales: z.array(z.string()),
  defaultLocale: z.string(),
})

export type SiteConfig = z.infer<typeof SiteConfigSchema>

/**
 * `site.config_read` — a read-only projection of `ctx.site`, which the
 * runtime already populates from `ResolvedConfig.site` (`@cogenta/core`).
 * No `site.config_write` counterpart exists yet: the taxonomy names it, but
 * writing site config from an agent needs its own review (which fields are
 * even safe to let an agent touch) that is out of this task's scope.
 */
export function createSiteConfigReadTool(): ToolDefinition<Record<string, never>, SiteConfig> {
  return defineTool({
    name: 'site.config_read',
    version: '1.0.0',
    description: "Read this site's configuration (name, url, locales).",
    input: z.object({}),
    output: SiteConfigSchema,
    permissions: ['site.config_read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(_input, ctx) {
      return {
        name: ctx.site.name,
        ...(ctx.site.url === undefined ? {} : { url: ctx.site.url }),
        locales: [...ctx.site.locales],
        defaultLocale: ctx.site.defaultLocale,
      }
    },
  })
}
