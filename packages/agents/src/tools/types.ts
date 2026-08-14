import type { z } from 'zod'

export type ToolCost = 'low' | 'medium' | 'high'

export interface ToolLogger {
  info(message: string, fields?: Readonly<Record<string, unknown>>): void
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void
  error(message: string, fields?: Readonly<Record<string, unknown>>): void
}

/**
 * What `execute`/`revert` receive — Contract C's `ctx.site`, `ctx.actor`,
 * `ctx.logger` (`ctx.db` and other resource clients are added by task 5's
 * concrete core tools, which are the first to actually need one; this stays
 * the minimal shape every tool can rely on regardless of what it does).
 */
export interface ToolContext {
  /** Mirrors `ResolvedConfig.site` (`@cogenta/core`'s config resolver) — the same shape, read-only from a tool's perspective. */
  readonly site: {
    readonly name: string
    readonly url?: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
  readonly logger: ToolLogger
  /** The run's cancellation signal — set per call by the manifest, never by the tool definition itself. */
  readonly signal: AbortSignal
}

/**
 * Contract C (`tools@1.0`, ADR-0020), reproduced as a type — this shape is
 * frozen and any change to it is a major version with a migration note, not
 * a routine edit.
 */
export interface ToolDefinition<Input = unknown, Output = unknown> {
  readonly name: string
  readonly version: string
  readonly description: string
  readonly input: z.ZodType<Input>
  readonly output: z.ZodType<Output>
  readonly permissions: readonly string[]
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: ToolCost
  readonly rateLimit?: { readonly perHour: number }
  execute(input: Input, ctx: ToolContext): Promise<Output>
  revert?(receipt: Output, ctx: ToolContext): Promise<void>
}
