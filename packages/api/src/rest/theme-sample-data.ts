/**
 * L28 — applying a theme together with the sample data its starter ships.
 *
 * The router only moves these shapes over HTTP; the engine that computes and
 * applies them lives with the CLI, which owns the schema file, the backup and
 * the starter packs. Everything a person must read before choosing is in the
 * preview, computed on the server and recomputed on apply: the client never
 * sends a plan to be trusted.
 */

export type SampleDataMode = 'keep' | 'reset'

/** One warning, as a stable code plus its parameters, so the admin words it in the reader's language. */
export interface SampleDataWarning {
  readonly code:
    | 'collection-incompatible'
    | 'slug-conflict'
    | 'menu-kept'
    | 'setting-kept'
    | 'schema-rewrite'
    | 'reset-deletes'
    | 'reset-backup'
    | 'collection-removed'
    | 'settings-replaced'
    | 'media-files-kept'
    | 'schema-not-serialisable'
    | 'entries-failed'
  readonly params: Readonly<Record<string, string | number>>
}

export interface SampleDataCollectionOutcome {
  readonly name: string
  /** `add`: new to the site. `import`: already there and compatible. `skip`: already there, incompatible. `replace`: reset. */
  readonly outcome: 'add' | 'import' | 'skip' | 'replace'
  /** Entries the sample data holds for this collection. */
  readonly entries: number
  /** Entries that will not be imported because the site already has that slug. */
  readonly conflictingSlugs: readonly string[]
  /** For `skip`: the fields that differ, as `field (expected kind)`. */
  readonly mismatches: readonly string[]
}

export interface SampleDataPreview {
  readonly theme: string
  readonly starter: string
  readonly mode: SampleDataMode
  /** What a reset asks the person to type. */
  readonly siteName: string
  /** False under `cogenta serve`: the preview still answers, applying is refused (ADR-0010). */
  readonly writable: boolean
  readonly collections: readonly SampleDataCollectionOutcome[]
  readonly taxonomies: readonly {
    readonly name: string
    readonly outcome: 'add' | 'merge' | 'replace'
    readonly terms: number
  }[]
  readonly menus: readonly {
    readonly location: string
    readonly outcome: 'fill' | 'keep' | 'replace'
    readonly items: number
  }[]
  readonly settings: readonly {
    readonly key: string
    readonly outcome: 'fill' | 'keep' | 'replace'
  }[]
  readonly media: number
  /** Only for a reset: exactly what is deleted, counted on the live database. */
  readonly removals: {
    readonly entries: number
    readonly terms: number
    readonly media: number
    readonly menus: number
    readonly redirects: number
    readonly collections: readonly string[]
  } | null
  readonly warnings: readonly SampleDataWarning[]
}

export interface SampleDataReport extends SampleDataPreview {
  readonly imported: { readonly entries: number; readonly terms: number; readonly media: number }
  /** The verified backup a reset took first, and the command that brings the site back. */
  readonly backup: {
    readonly path: string
    /** The schema file as it was before the reset, kept beside the archive: restoring needs it back in place first. */
    readonly previousSchema: string | null
    readonly restoreCommand: string
  } | null
  /** True when the schema file was rewritten: `cogenta dev` restarts to load it. */
  readonly restarting: boolean
}

export interface SampleDataEngineLike {
  /** Theme package names that ship sample data. */
  themes(): readonly string[]
  /** Whether applying is allowed on this instance (`cogenta dev` only). */
  readonly writable: boolean
  preview(input: {
    readonly theme: string
    readonly mode: SampleDataMode
  }): Promise<SampleDataPreview>
  apply(input: {
    readonly theme: string
    readonly mode: SampleDataMode
    /** For a reset: the site name, typed by the person. */
    readonly confirmation?: string
    readonly actorId: string | null
    /** Activates the theme with its own skin; called once the data is in, before the schema file is written. */
    readonly activateTheme: () => Promise<void>
  }): Promise<SampleDataReport>
}
