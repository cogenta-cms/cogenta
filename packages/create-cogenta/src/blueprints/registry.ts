export interface Blueprint {
  readonly id: string
  readonly label: string
  /** `false` for every entry this session did not build (L9 tasks 3/8) — visible in the menu, not hidden, but selecting one falls back to `blank` with a note. */
  readonly available: boolean
}

/**
 * "Type de site → sélection d'un blueprint." Only `blank` is real today —
 * an empty content schema, no demo content, nothing to configure beyond
 * what the wizard itself asks. The other eight names the lot commits to
 * (vitrine, blog, magazine, portfolio, documentation, association,
 * restaurant, SaaS — L9 tasks 3 and 8) are listed so the step exists and
 * reads honestly, not synthesised as fake content now.
 */
export const BLUEPRINTS: readonly Blueprint[] = [
  { id: 'blank', label: 'Blank — empty schema, nothing pre-configured', available: true },
  { id: 'vitrine', label: 'Showcase site (coming soon)', available: false },
  { id: 'blog', label: 'Blog (coming soon)', available: false },
  { id: 'magazine', label: 'Magazine (coming soon)', available: false },
  { id: 'portfolio', label: 'Portfolio (coming soon)', available: false },
  { id: 'documentation', label: 'Documentation site (coming soon)', available: false },
  { id: 'association', label: 'Nonprofit / association (coming soon)', available: false },
  { id: 'restaurant', label: 'Restaurant (coming soon)', available: false },
  { id: 'saas', label: 'SaaS (coming soon)', available: false },
]

export const DEFAULT_BLUEPRINT_ID = 'blank'

export interface ResolvedBlueprint {
  readonly blueprint: Blueprint
  /** `true` when the requested id was unknown or not yet available, and `blank` was substituted — the caller must say so, never substitute silently. */
  readonly fellBackToBlank: boolean
}

export function resolveBlueprint(id: string): ResolvedBlueprint {
  const requested = BLUEPRINTS.find((entry) => entry.id === id)
  if (requested !== undefined && requested.available) {
    return { blueprint: requested, fellBackToBlank: false }
  }
  const blank = BLUEPRINTS.find((entry) => entry.id === DEFAULT_BLUEPRINT_ID)
  if (blank === undefined) {
    throw new Error('The "blank" blueprint is missing from the registry — this is a bug.')
  }
  return { blueprint: blank, fellBackToBlank: true }
}
