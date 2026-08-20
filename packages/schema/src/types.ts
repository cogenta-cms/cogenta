/**
 * The shapes the content engine is built on.
 *
 * This file is the seam between `@cogenta/schema`, `@cogenta/blocks` and
 * `@cogenta/api`: it declares what a field and a collection *are*, so the three
 * packages can be built against the same shapes rather than against each other.
 *
 * It implements contract A, frozen at `schema@2.0` on 2026-08-16 (ADR-0022).
 * Every departure from the contract text is a bug in this file, not a liberty.
 */

/**
 * Contract A, "Types de champ". Closed set: adding one is a minor version.
 *
 * `taxonomy` joined the set in `schema@2.0` (ADR-0022) alongside
 * `defineTaxonomy()`. It is not a `relation` with a different target: a
 * relation points at a collection, and a taxonomy term is not content.
 */
export const FIELD_KINDS = [
  'text',
  'richText',
  'slug',
  'number',
  'boolean',
  'date',
  'datetime',
  'media',
  'relation',
  'select',
  'json',
  'geo',
  'color',
  'blocks',
  'taxonomy',
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/** Contract A, "Permissions". Actions are fixed; role names are an open set. */
export const CONTENT_ACTIONS = ['read', 'create', 'update', 'delete', 'publish'] as const

export type ContentAction = (typeof CONTENT_ACTIONS)[number]

export const CONTENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const

export type ContentStatus = (typeof CONTENT_STATUSES)[number]

/**
 * The editorial workflow's state, orthogonal to `status` (`schema@2.1`,
 * ADR-0027) — exactly as `deletedAt` is orthogonal to it since ADR-0022.
 *
 * `approved` is **not** `published`: approving authorises, publishing is
 * still the `publish` action. Confounding the two would publish by surprise
 * and would remove the control the `publish` permission grants.
 */
export const REVIEW_STATES = ['none', 'pending', 'changes-requested', 'approved'] as const

export type ReviewState = (typeof REVIEW_STATES)[number]

/** The three transitions the server-side table recognises. Closed set. */
export const REVIEW_TRANSITIONS = ['submit', 'approve', 'requestChanges'] as const

export type ReviewTransition = (typeof REVIEW_TRANSITIONS)[number]

export const PROVENANCE_KINDS = ['human', 'assisted', 'generated'] as const

export type Provenance = (typeof PROVENANCE_KINDS)[number]

/** What the admin needs to render a field, and nothing the engine needs. */
export interface FieldAdminOptions {
  readonly label?: string
  readonly help?: string
  readonly group?: string
  /** Show this field only when another field holds a given value. */
  readonly showWhen?: { readonly field: string; readonly equals: unknown }
}

export interface BaseFieldOptions {
  readonly required?: boolean
  readonly default?: unknown
  /**
   * Declares that this field is translated.
   *
   * **Not a storage directive** (ADR-0014): content is stored one entry per
   * locale. This tells the admin the field is worth translating, so it can
   * offer to copy it from the source entry.
   */
  readonly localized?: boolean
  readonly unique?: boolean
  readonly validate?: (value: unknown) => true | string
  readonly admin?: FieldAdminOptions
}

/** What happens to a referencing row when the target is deleted. */
export type OnDelete = 'restrict' | 'cascade' | 'setNull'

export interface FieldDefinition extends BaseFieldOptions {
  readonly kind: FieldKind
  /** Kind-specific settings: `max`, `to`, `many`, `accept`, `options`, `from`… */
  readonly options: Readonly<Record<string, unknown>>
}

export interface CollectionRouting {
  readonly pattern: string
  /** Prefix the route with the locale. */
  readonly locale?: boolean
}

export interface CollectionVersioning {
  readonly drafts?: boolean
  readonly history?: boolean
  /** Versions kept per entry. Unlimited history is a slow leak, not a feature. */
  readonly keep?: number
}

/**
 * The purge window of a collection's trash (`schema@2.0`, ADR-0022).
 *
 * Declared on the model of `versioning.keep`: a bound, not a promise of
 * forever. `trash: false` on the collection restores the pre-2.0 behaviour —
 * `delete()` is an immediate hard delete, with nothing kept.
 */
export interface CollectionTrash {
  /** Days a trashed entry is kept before `purgeExpired()` may remove it. */
  readonly retainDays: number
}

/** Days a trashed entry is kept when the collection says nothing. */
export const DEFAULT_TRASH_RETAIN_DAYS = 30

/**
 * One action's grant.
 *
 * The plain array form is the whole of contract A before `schema@2.1` and
 * stays valid: this is a strictly additive change (ADR-0027), the same
 * nature as `tools@1.1`'s `document.extract`. The object form adds `own`,
 * for "this role may act on its own entries only" — a real clause in the
 * block rather than a `'author:own'` role-name convention, which would
 * reproduce the class of silent typo bug the L10 sitemap 500 was.
 */
export type CollectionPermissionRule =
  | readonly string[]
  | { readonly roles: readonly string[]; readonly own?: boolean }

export type CollectionPermissions = Readonly<
  Partial<Record<ContentAction, CollectionPermissionRule>>
>

/** `CollectionPermissionRule`, always read back out as `{ roles, own }`. */
export interface NormalisedPermissionRule {
  readonly roles: readonly string[]
  readonly own: boolean
}

const EMPTY_RULE: NormalisedPermissionRule = { roles: [], own: false }

/** The one place either form of a `CollectionPermissionRule` is unpacked. */
export function normalisePermissionRule(
  rule: CollectionPermissionRule | undefined,
): NormalisedPermissionRule {
  if (rule === undefined) return EMPTY_RULE
  if (Array.isArray(rule)) return { roles: rule, own: false }
  const object = rule as { readonly roles: readonly string[]; readonly own?: boolean }
  return { roles: object.roles, own: object.own === true }
}

/**
 * The editorial workflow, opt-in per collection (`schema@2.1`, ADR-0027) —
 * never a global switch, so it stays consistent with permissions already
 * being declared per collection, and a single-editor site sees nothing new.
 */
export interface CollectionWorkflow {
  readonly enabled: boolean
}

export interface CollectionDefinition {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly routing?: CollectionRouting
  readonly versioning?: CollectionVersioning
  /**
   * Trash window. Absent means the default window; `false` means no trash at
   * all, so `delete()` is the hard delete `purge()` performs.
   */
  readonly trash?: CollectionTrash | false
  /** Absent or `{ enabled: false }` means no workflow: `submit`/`approve`/`requestChanges` all refuse. */
  readonly workflow?: CollectionWorkflow
  readonly fields: Readonly<Record<string, FieldDefinition>>
  readonly indexes?: readonly (readonly string[])[]
  readonly permissions: CollectionPermissions
}

/**
 * A taxonomy, contract A § "Taxonomies" (`schema@2.0`, ADR-0022).
 *
 * A second top-level declarable object, beside `defineCollection()`. Its terms
 * are **not content**: no `status`, no `version`, no `translationOf`. "Cuisine"
 * and "Cooking" are one concept of classification, not two contents in a
 * translation family — which is why labels are indexed by locale rather than
 * split across rows the way ADR-0014 splits content.
 */
export interface TaxonomyDefinition {
  readonly name: string
  /** Indexed by locale, exactly like a term's own labels. */
  readonly labels: {
    readonly singular: Readonly<Record<string, string>>
    readonly plural?: Readonly<Record<string, string>>
  }
  /**
   * Whether terms may be nested. A flat taxonomy (tags) refuses a parent
   * outright rather than allowing a tree nobody renders.
   */
  readonly hierarchical?: boolean
  /**
   * Who may do what to the **terms**. The action vocabulary is the frozen one
   * of contract A; `publish` has no meaning on a term and is refused.
   */
  readonly permissions: CollectionPermissions
}

/**
 * One term of a taxonomy.
 *
 * `path` is the materialised path (ADR-0022): the ids of every ancestor and of
 * the term itself, slash-separated and slash-terminated, so "everything under
 * this term" is a `like` the three dialects answer identically — never a
 * recursive CTE, whose support diverges (ADR-0006).
 */
export interface TaxonomyTerm {
  readonly id: string
  readonly taxonomy: string
  readonly parent: string | null
  readonly slug: string
  readonly labels: Readonly<Record<string, string>>
  readonly position: number
  readonly path: string
  /** 0 at the root. Derived from `path`, never stored twice by hand. */
  readonly depth: number
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Contract A, "Champs système". Present on every entry, never declared by the
 * user, never optional — `provenance` least of all: the European AI framework
 * requires it, so it exists from the first migration.
 */
export interface SystemFields {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly createdBy: string | null
  readonly updatedBy: string | null
  readonly status: ContentStatus
  /**
   * When this entry went to the trash, `null` while it has not (`schema@2.0`,
   * ADR-0022).
   *
   * **Orthogonal to `status`, never a value of it.** A published article in the
   * trash is still `published`, so `untrash()` gives back what was taken rather
   * than quietly demoting it to a draft — and every `switch` on `ContentStatus`
   * in the repository stays exhaustive.
   */
  readonly deletedAt: string | null
  /**
   * The editorial workflow's state, `'none'` while it was never entered
   * (`schema@2.1`, ADR-0027). Orthogonal to `status`, exactly as `deletedAt`
   * is — a client written before this field existed reads exactly the
   * `status` values it always did, unaware `reviewState` exists at all.
   */
  readonly reviewState: ReviewState
  /** Who is expected to review this entry next, or `null`. Set at submission or chosen by an editor. */
  readonly assignedReviewer: string | null
  readonly locale: string
  readonly translationOf: string | null
  readonly version: number
  readonly provenance: Provenance
  readonly provenanceDetail: {
    readonly agent?: string
    readonly model?: string
    readonly at?: string
    readonly prompt?: string
  } | null
}
