import {
  createTermSlugResolver,
  type TaxonomyDefinition,
  type TaxonomyStore,
  type TermSlugResolver,
} from '@cogenta/schema'

/**
 * The slug of a term for the category segment of an entry's URL
 * (`schema@2.5`), over whatever store each taxonomy is read through.
 *
 * `cogenta serve` passes the stores it also writes terms through and drops the
 * copy on every write; a process that only reads (`cogenta mcp`,
 * `cogenta channels`) lets the short lifetime of the copy do that work.
 */
export function createSiteTermSlugs(
  taxonomies: readonly TaxonomyDefinition[],
  storeFor: (taxonomy: TaxonomyDefinition) => TaxonomyStore,
): TermSlugResolver {
  return createTermSlugResolver({
    termsOf: (name) => {
      const taxonomy = taxonomies.find((candidate) => candidate.name === name)
      return taxonomy === undefined ? undefined : storeFor(taxonomy).list()
    },
  })
}
