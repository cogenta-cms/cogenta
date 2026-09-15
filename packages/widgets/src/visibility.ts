import { CogentaError } from '@cogenta/core'
import { z } from 'zod'

/**
 * Where, for whom, on what and when a widget shows (L30 D4) — the rules the
 * WordPress visibility extensions add, as data, evaluated by one pure function
 * so the admin preview and the public site can never disagree.
 */

const identifierLike = z.string().trim().min(1).max(128)

export const pageTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('home') }),
  z.strictObject({
    kind: z.literal('collection'),
    collection: identifierLike,
    /** Absent or empty: every entry of the collection. */
    entryIds: z.array(identifierLike).max(200).optional(),
  }),
  z.strictObject({
    kind: z.literal('taxonomy'),
    taxonomy: identifierLike,
    /** Absent or empty: every term's archive. */
    termIds: z.array(identifierLike).max(200).optional(),
  }),
  z.strictObject({ kind: z.literal('dateArchive') }),
  z.strictObject({ kind: z.literal('search') }),
  z.strictObject({
    kind: z.literal('path'),
    /** A site path; `/guides/*` matches everything below `/guides/`. */
    path: z
      .string()
      .trim()
      .min(1)
      .max(512)
      .refine((value) => value.startsWith('/'), { message: 'must start with "/"' }),
  }),
])

export type PageTarget = z.infer<typeof pageTargetSchema>

export const widgetVisibilitySchema = z.strictObject({
  pages: z
    .strictObject({
      mode: z.enum(['all', 'only', 'except']).default('all'),
      targets: z.array(pageTargetSchema).max(100).default([]),
    })
    .default({ mode: 'all', targets: [] }),
  audience: z.enum(['everyone', 'visitors', 'members']).default('everyone'),
  devices: z
    .strictObject({
      desktop: z.boolean().default(true),
      tablet: z.boolean().default(true),
      mobile: z.boolean().default(true),
    })
    .default({ desktop: true, tablet: true, mobile: true }),
  /** ISO 8601; the widget shows from this instant. */
  from: z.iso.datetime({ offset: true }).nullable().default(null),
  /** ISO 8601; the widget stops showing at this instant. */
  until: z.iso.datetime({ offset: true }).nullable().default(null),
  /** Empty: every language of the site. */
  locales: z.array(z.string().trim().min(2).max(16)).max(50).default([]),
})

export type WidgetVisibility = z.infer<typeof widgetVisibilitySchema>

export const DEFAULT_VISIBILITY: WidgetVisibility = widgetVisibilitySchema.parse({})

export function validateWidgetVisibility(input: unknown): WidgetVisibility {
  const parsed = widgetVisibilitySchema.safeParse(input ?? {})
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new CogentaError({
      code: 'WIDGET_INVALID',
      message: `The widget's visibility rules are not valid at "${issue?.path.join('.') ?? ''}": ${issue?.message ?? 'unknown problem'}.`,
      hint: 'Pages take a mode (all, only, except) and targets; audience is everyone, visitors or members; dates are ISO 8601.',
      details: { issues: parsed.error.issues.map((item) => item.message) },
    })
  }
  const value = parsed.data
  if (
    value.from !== null &&
    value.until !== null &&
    Date.parse(value.from) >= Date.parse(value.until)
  ) {
    throw new CogentaError({
      code: 'WIDGET_INVALID',
      message: 'A widget cannot stop showing before it starts.',
      hint: 'Set "until" after "from", or clear one of them.',
    })
  }
  return value
}

/** What the host knows about the page being rendered. */
export interface WidgetRequestContext {
  readonly path: string
  readonly kind: 'home' | 'entry' | 'taxonomy' | 'dateArchive' | 'search' | 'other'
  readonly collection?: string
  readonly entryId?: string
  readonly taxonomy?: string
  readonly termId?: string
  readonly signedIn: boolean
  readonly locale: string
  readonly now: Date
}

function pathMatches(pattern: string, path: string): boolean {
  const normalise = (value: string): string =>
    value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
  if (pattern.endsWith('/*')) {
    const base = normalise(pattern.slice(0, -2))
    const current = normalise(path)
    return current === base || current.startsWith(`${base === '/' ? '' : base}/`)
  }
  return normalise(pattern) === normalise(path)
}

export function targetMatches(target: PageTarget, context: WidgetRequestContext): boolean {
  switch (target.kind) {
    case 'home':
      return context.kind === 'home'
    case 'collection':
      return (
        context.kind === 'entry' &&
        context.collection === target.collection &&
        (target.entryIds === undefined ||
          target.entryIds.length === 0 ||
          (context.entryId !== undefined && target.entryIds.includes(context.entryId)))
      )
    case 'taxonomy':
      return (
        context.kind === 'taxonomy' &&
        context.taxonomy === target.taxonomy &&
        (target.termIds === undefined ||
          target.termIds.length === 0 ||
          (context.termId !== undefined && target.termIds.includes(context.termId)))
      )
    case 'dateArchive':
      return context.kind === 'dateArchive'
    case 'search':
      return context.kind === 'search'
    case 'path':
      return pathMatches(target.path, context.path)
  }
}

/**
 * Whether a widget shows on this request. Devices are not decided here: the
 * same cached page serves every screen, so they travel to the markup as
 * attributes and the stylesheet hides what a screen should not see.
 */
export function isWidgetVisible(
  widget: { readonly enabled: boolean; readonly visibility: WidgetVisibility },
  context: WidgetRequestContext,
): boolean {
  if (!widget.enabled) return false
  const { visibility } = widget
  if (visibility.audience === 'visitors' && context.signedIn) return false
  if (visibility.audience === 'members' && !context.signedIn) return false
  if (visibility.locales.length > 0 && !visibility.locales.includes(context.locale)) return false
  const now = context.now.getTime()
  if (visibility.from !== null && now < Date.parse(visibility.from)) return false
  if (visibility.until !== null && now >= Date.parse(visibility.until)) return false
  const { mode, targets } = visibility.pages
  if (mode === 'all') return true
  const matched = targets.some((target) => targetMatches(target, context))
  return mode === 'only' ? matched : !matched
}
