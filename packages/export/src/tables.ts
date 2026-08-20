import {
  blocksTable,
  type CollectionDefinition,
  entriesTable,
  orderByDependency,
  relationsOf,
  relationTable,
  type TaxonomyDefinition,
  taxonomyTable,
  versionsTable,
} from '@cogenta/schema'

export interface BuildBackupTablesOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  /**
   * Tables outside the content schema that content may reference — users,
   * media — listed first so a foreign key in a content table always finds
   * its target already restored. Order is the caller's: `@cogenta/export`
   * does not know `@cogenta/auth` or `@cogenta/core`'s media table exists,
   * by design (it depends on neither), so it trusts whoever assembled the
   * site to have put users before sessions and so on.
   */
  readonly before?: readonly string[]
  /**
   * Tables that may reference content — navigation menus, redirects, a
   * commerce catalogue — listed last for the same reason, in reverse.
   */
  readonly after?: readonly string[]
}

/**
 * Every physical table backup task 3 needs to know about, in an order a
 * forward-only restore can insert into without ever meeting a foreign key
 * before its target: `before`, then taxonomy terms, then content in
 * dependency order (`orderByDependency`, the same helper table creation
 * itself uses), then `after`.
 */
export function buildBackupTables(options: BuildBackupTablesOptions): readonly string[] {
  const tables: string[] = [...(options.before ?? [])]

  for (const taxonomy of options.taxonomies) {
    tables.push(taxonomyTable(taxonomy.name))
  }

  for (const collection of orderByDependency(options.collections)) {
    tables.push(entriesTable(collection.name))
    tables.push(versionsTable(collection.name))
    tables.push(blocksTable(collection.name))
    for (const relation of relationsOf(collection)) {
      if (relation.many) tables.push(relationTable(collection.name, relation.field))
    }
  }

  tables.push(...(options.after ?? []))
  return tables
}
