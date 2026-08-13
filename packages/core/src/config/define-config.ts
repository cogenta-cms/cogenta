import type { CogentaConfigInput } from './types.js'

/**
 * Identity function whose only job is to give `cogenta.config.ts` full type
 * checking and editor completion.
 *
 * ```ts
 * import { defineConfig } from '@cogenta/core'
 *
 * export default defineConfig({
 *   site: { name: 'My site', url: 'https://example.com' },
 *   database: { url: process.env.DATABASE_URL ?? './.cogenta/site.db' },
 * })
 * ```
 *
 * Secrets are rejected here at compile time and again at startup: they belong
 * in the environment, never in this file.
 */
export function defineConfig(config: CogentaConfigInput): CogentaConfigInput {
  return config
}
