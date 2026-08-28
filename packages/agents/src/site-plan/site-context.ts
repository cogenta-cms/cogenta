import type { CollectionDefinition, TaxonomyDefinition } from '@cogenta/schema'

/**
 * Fiche 60 task 2 — the instant snapshot of a site that already exists,
 * built once per proposal and handed to the three agents that need it
 * (`./analyse-brief.js`, `./content-model.js`, `./skin-candidates.js`).
 *
 * Before this, a plan proposed from the admin, on a site with two hundred
 * articles and a live shop, read exactly like a plan proposed on an empty
 * database — the only contact with reality was `site-plan.ts`'s late,
 * defensive "this collection name is already taken" refusal at *apply* time.
 * `describeExistingSite` is what makes the state an input to the agent's own
 * reasoning instead: `content-model.ts` reads it to steer proposals towards
 * addition rather than duplication (task 4), and `structural-gaps.ts` reads
 * it to say what a usual site still lacks (task 5).
 *
 * This module does no I/O of its own, on purpose. `@cogenta/agents` has no
 * database dependency anywhere else, and this is not the file that starts —
 * the counts, the active theme name and the list of configured integrations
 * are all read by the caller (`@cogenta/cli`'s `site-plan.ts`, which already
 * owns the database handle and the resolved config) and handed in as plain
 * data. That is also what makes `describeExistingSite` testable against a
 * fabricated "empty site" and a fabricated "populated site" without a real
 * database (fiche 60's own acceptance criterion for this task).
 */

export interface ExistingCollectionField {
  readonly name: string
  readonly kind: string
}

export interface ExistingCollectionSnapshot {
  readonly name: string
  readonly labels: { readonly singular: string; readonly plural: string }
  readonly fields: readonly ExistingCollectionField[]
  readonly routed: boolean
  readonly entryCount: number
  /** Published entries. Only meaningful for a routed collection — `null` otherwise. */
  readonly publishedCount: number | null
}

export interface ExistingTaxonomySnapshot {
  readonly name: string
  readonly termCount: number
}

export interface ExistingSiteSnapshot {
  readonly collections: readonly ExistingCollectionSnapshot[]
  readonly taxonomies: readonly ExistingTaxonomySnapshot[]
  /** The theme package name, e.g. `@cogenta/theme-canonical`. Empty string when unknown. */
  readonly activeTheme: string
  /** Names of configured integrations, detected by the caller from config presence alone — never guessed here. */
  readonly integrations: readonly string[]
}

/** What a brand-new site — the installer's own path, unchanged by this fiche — looks like. */
export const EMPTY_EXISTING_SITE: ExistingSiteSnapshot = {
  collections: [],
  taxonomies: [],
  activeTheme: '',
  integrations: [],
}

export interface ExistingEntryCounts {
  readonly total: number
  readonly published: number
}

export interface DescribeExistingSiteInput {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies?: readonly TaxonomyDefinition[]
  /** Per-collection counts, by collection name. A collection missing here is treated as having zero entries. */
  readonly entryCounts?: Readonly<Record<string, ExistingEntryCounts>>
  /** Per-taxonomy term counts, by taxonomy name. Missing means zero. */
  readonly termCounts?: Readonly<Record<string, number>>
  readonly activeTheme?: string
  readonly integrations?: readonly string[]
}

export function describeExistingSite(input: DescribeExistingSiteInput): ExistingSiteSnapshot {
  const collections: ExistingCollectionSnapshot[] = input.collections.map((collection) => {
    const counts = input.entryCounts?.[collection.name]
    const routed = collection.routing !== undefined
    return {
      name: collection.name,
      labels: collection.labels,
      fields: Object.entries(collection.fields).map(([name, field]) => ({
        name,
        kind: field.kind,
      })),
      routed,
      entryCount: counts?.total ?? 0,
      publishedCount: routed ? (counts?.published ?? 0) : null,
    }
  })

  const taxonomies: ExistingTaxonomySnapshot[] = (input.taxonomies ?? []).map((taxonomy) => ({
    name: taxonomy.name,
    termCount: input.termCounts?.[taxonomy.name] ?? 0,
  }))

  return {
    collections,
    taxonomies,
    activeTheme: input.activeTheme ?? EMPTY_EXISTING_SITE.activeTheme,
    integrations: input.integrations ?? [],
  }
}

/** A fresh install, or a site whose schema declares nothing yet — "premier jet" mode (task 4). */
export function isExistingSiteEmpty(snapshot: ExistingSiteSnapshot): boolean {
  return snapshot.collections.length === 0 && snapshot.taxonomies.length === 0
}

/**
 * Plain text, meant to travel through `assembleContext`'s `data` channel —
 * escaping and tagging happen there (R8), never here. A collection's own
 * `name` is a bare, schema-validated identifier (`^[a-z][a-z0-9_]*$`), but
 * its `labels` are free text an operator or an earlier agent chose, so
 * nothing here treats any part of this as safe to paste into a trusted
 * instruction — the whole rendering goes through the data channel uniformly.
 */
export function renderExistingSiteForPrompt(snapshot: ExistingSiteSnapshot): string {
  if (isExistingSiteEmpty(snapshot)) {
    return 'This is a brand-new site: no collection and no taxonomy is declared yet.'
  }

  const lines: string[] = [
    snapshot.activeTheme === ''
      ? 'Active theme: unknown.'
      : `Active theme: ${snapshot.activeTheme}.`,
    snapshot.integrations.length === 0
      ? 'No integration is configured.'
      : `Configured integrations: ${snapshot.integrations.join(', ')}.`,
    '',
    'Collections already declared on this site:',
  ]

  for (const collection of snapshot.collections) {
    const fieldList =
      collection.fields.map((field) => `${field.name} (${field.kind})`).join(', ') || 'no field'
    const state = collection.routed
      ? `routed, ${collection.publishedCount ?? 0} published of ${collection.entryCount} total`
      : `not routed, ${collection.entryCount} entries`
    lines.push(
      `- ${collection.name} ("${collection.labels.plural}"): ${state}. Fields: ${fieldList}.`,
    )
  }

  if (snapshot.taxonomies.length > 0) {
    lines.push('', 'Taxonomies already declared on this site:')
    for (const taxonomy of snapshot.taxonomies) {
      lines.push(`- ${taxonomy.name}: ${taxonomy.termCount} term(s).`)
    }
  }

  return lines.join('\n')
}
