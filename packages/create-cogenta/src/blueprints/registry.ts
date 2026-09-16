import { CogentaError } from '@cogenta/core'

export interface Blueprint {
  readonly id: string
  readonly label: string
  /** `false` for every entry this session did not build (L9 task 8) — visible in the menu, not hidden, but selecting one falls back to `blank` with a note. */
  readonly available: boolean
}

/**
 * "Type de site → sélection d'un blueprint." Every blueprint the lot
 * commits to (`docs/lots/L9-ecosysteme.md`, "## Blueprints") is real as of
 * L9 task 8, batch B: `blank` (empty schema, no demo content), `blog` (L9
 * task 3), `vitrine`/`portfolio`/`documentation` (batch A) and
 * `magazine`/`association`/`restaurant`/`saas` (batch B). Each beyond
 * `blank` has a real `BlueprintContentPack` (`./content-packs.js`). `store`
 * (L22 task 10) is the tenth: a product catalogue, see `./store.js` for why
 * it stops at contract A and does not reach for `@cogenta/commerce`.
 */
export const BLUEPRINTS: readonly Blueprint[] = [
  { id: 'vitrine', label: 'Showcase site — services, testimonials, demo content', available: true },
  { id: 'blog', label: 'Blog — posts, categories, demo content', available: true },
  { id: 'magazine', label: 'Magazine — articles by section, demo content', available: true },
  { id: 'portfolio', label: 'Portfolio — projects, demo content', available: true },
  {
    id: 'documentation',
    label: 'Documentation site — ordered doc pages, demo content',
    available: true,
  },
  { id: 'association', label: 'Nonprofit / association — events, demo content', available: true },
  { id: 'restaurant', label: 'Restaurant — menu, demo content', available: true },
  { id: 'saas', label: 'SaaS — features, demo content', available: true },
  { id: 'store', label: 'Online store — product catalogue, demo content', available: true },
  // Last, and said plainly: an empty schema serves no page at all until one
  // is designed, which is a developer's starting point, not a first site.
  {
    id: 'blank',
    label: 'Blank — empty schema, nothing pre-configured (for developers)',
    available: true,
  },
]

/**
 * What the installer proposes when nobody chooses (L36): `vitrine`, a
 * complete site with a home page, a theme and demo content. Until then it was
 * `blank`, and `npm create cogenta --yes` produced a site whose first answer
 * at `/` was an error.
 */
export const DEFAULT_BLUEPRINT_ID = 'vitrine'

/**
 * What a blueprint id that does not exist resolves to, and what a
 * programmatic `scaffoldSite` call that names none gets: the empty schema,
 * which invents nothing on the caller's behalf.
 */
export const FALLBACK_BLUEPRINT_ID = 'blank'

export interface ResolvedBlueprint {
  readonly blueprint: Blueprint
  /** `true` when the requested id was unknown or not yet available, and `blank` was substituted — the caller must say so, never substitute silently. */
  readonly fellBackToBlank: boolean
}

export function resolveBlueprint(id: string): ResolvedBlueprint {
  const requested = BLUEPRINTS.find((entry) => entry.id === id)
  if (requested?.available) {
    return { blueprint: requested, fellBackToBlank: false }
  }
  const blank = BLUEPRINTS.find((entry) => entry.id === FALLBACK_BLUEPRINT_ID)
  if (blank === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'The "blank" blueprint is missing from the registry.',
      hint: 'BLUEPRINTS must always include an entry whose id is FALLBACK_BLUEPRINT_ID — this is a bug in the registry, not a user-facing condition.',
      details: { fallbackBlueprintId: FALLBACK_BLUEPRINT_ID },
    })
  }
  return { blueprint: blank, fellBackToBlank: true }
}
