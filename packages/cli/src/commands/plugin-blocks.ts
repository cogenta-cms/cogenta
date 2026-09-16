import {
  type AnyBlockDefinition,
  type BlockRegistry,
  blockSchemaFromDeclaration,
  defineBlock,
} from '@cogenta/blocks'
import type { PluginBlockProvision, PluginManifest, ResolvedPlugin } from '@cogenta/plugins'

/**
 * L32 step 1 — a block a plugin declares becomes a real block of this site's
 * registry.
 *
 * **Contract B does not move.** The seventeen blocks of the vocabulary are
 * frozen and a plugin never joins them; it registers *beside* them, carrying
 * the `fallback` that `BlockRegistry.resolveRenderable` has walked since L3.
 * That is the whole anti-lock-in guarantee made real: uninstall the plugin,
 * change the theme, and the page still renders — as its fallback, degraded,
 * never blank.
 *
 * The declaration is data (`plugin.manifest.json`), turned into a definition
 * by the real `defineBlock`/`f.*` constructors here, in the host. A manifest
 * that built its own schema by calling functions would be manifest code
 * running in the host process again — the hole L31's security review closed.
 */

/** A plugin block's name is its own; two plugins claiming one is a conflict, not a merge. */
export interface PluginBlockConflict {
  readonly plugin: string
  readonly block: string
  readonly reason: string
}

export interface PluginBlockSet {
  /** Ready to register, in declaration order. */
  readonly definitions: readonly AnyBlockDefinition[]
  /** Which plugin each block came from — what an editor shows, and what uninstalling removes. */
  readonly owners: ReadonlyMap<string, string>
  /** Labels for an editor, keyed by block name. */
  readonly labels: ReadonlyMap<string, string>
  /** Blocks that could not be registered, each with the reason a person can act on. */
  readonly conflicts: readonly PluginBlockConflict[]
}

/**
 * One plugin's blocks, as definitions. Throws only on a declaration the
 * manifest validator should already have refused — a caller that loaded the
 * plugin through `loadPlugin` will not see it.
 */
export function pluginBlockDefinitions(manifest: PluginManifest): readonly AnyBlockDefinition[] {
  return (manifest.provides.blocks ?? []).map((provision: PluginBlockProvision) => {
    const schema = blockSchemaFromDeclaration(
      provision.fields,
      `${manifest.name}.${provision.name}`,
    )
    return defineBlock({
      name: provision.name,
      // The plugin's own version: a block's shape changes when the plugin
      // that defines it does, and nothing else versions it.
      version: manifest.version,
      schema,
      // Rendered by the plugin, in a process of its own — never at build time.
      runtime: 'server',
      fallback: provision.fallback,
      a11y: { headingLevel: provision.headingLevel ?? 'none' },
    }) as AnyBlockDefinition
  })
}

/**
 * The block to render in place of a plugin block the site cannot render —
 * because the plugin is gone, disabled, or failed.
 *
 * The stored entry is never touched: this is what the *theme* is handed, so
 * uninstalling a plugin degrades a page instead of emptying it, and
 * reinstalling brings the real block back with its data intact.
 *
 * Returns `null` when the provision declares no mapping or the mapped data
 * does not satisfy the fallback block — a blank slot is better than markup
 * built out of fields that mean something else.
 */
export function pluginBlockFallback(
  provision: PluginBlockProvision,
  stored: Readonly<Record<string, unknown>>,
  registry: BlockRegistry,
): Record<string, unknown> | null {
  const mapping = provision.fallbackFrom
  if (mapping === undefined) return null
  const definition = registry.get(provision.fallback)
  if (definition === undefined) return null

  const candidate: Record<string, unknown> = {
    _key: stored['_key'],
    _type: definition.name,
    _version: definition.version,
  }
  for (const [into, from] of Object.entries(mapping)) {
    const value = stored[from]
    if (value !== undefined) candidate[into] = value
  }
  // `variant` is envelope data every block carries identically — it belongs
  // to the placement, not to the plugin, so it survives the degradation.
  if (stored['variant'] !== undefined) candidate['variant'] = stored['variant']

  const parsed = definition.validator.safeParse(candidate)
  return parsed.success ? (parsed.data as Record<string, unknown>) : null
}

/**
 * Every installed plugin's blocks, ready for one registry.
 *
 * Never throws: a site whose plugin declares a bad block starts, says which
 * block and why, and serves every page that does not use it. A name already
 * taken — by the vocabulary or by another plugin — is a conflict reported to
 * a person, not a silent overwrite of someone else's block.
 */
export function collectPluginBlocks(
  plugins: readonly ResolvedPlugin[],
  options: { readonly taken?: Iterable<string> } = {},
): PluginBlockSet {
  const definitions: AnyBlockDefinition[] = []
  const owners = new Map<string, string>()
  const labels = new Map<string, string>()
  const conflicts: PluginBlockConflict[] = []
  const taken = new Set(options.taken ?? [])

  for (const plugin of plugins) {
    const manifest = plugin.manifest
    for (const provision of manifest.provides.blocks ?? []) {
      if (taken.has(provision.name)) {
        conflicts.push({
          plugin: manifest.name,
          block: provision.name,
          reason:
            owners.get(provision.name) === undefined
              ? `"${provision.name}" is already a block of this site's vocabulary.`
              : `"${provision.name}" is already provided by the plugin "${owners.get(provision.name)}".`,
        })
        continue
      }
      try {
        const [definition] = pluginBlockDefinitions({
          ...manifest,
          provides: { ...manifest.provides, blocks: [provision] },
        })
        if (definition === undefined) continue
        definitions.push(definition)
        taken.add(provision.name)
        owners.set(provision.name, manifest.name)
        labels.set(provision.name, provision.label ?? provision.name)
      } catch (error) {
        conflicts.push({
          plugin: manifest.name,
          block: provision.name,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return { definitions, owners, labels, conflicts }
}

/**
 * A field of a plugin block, in the shape the admin's own block table uses
 * (`packages/admin/src/blocks/vocabulary.ts`). Deliberately the admin's
 * shape, not contract B's: the admin is a browser bundle that never imports
 * `@cogenta/blocks`, and this route exists precisely so it does not have to.
 */
export interface PluginBlockFieldDescription {
  readonly name: string
  readonly kind: string
  readonly required: boolean
  readonly localized: boolean
  readonly unique: false
  readonly hasCustomValidation: false
  readonly options: Readonly<Record<string, unknown>>
  /** The label and help text the declaration gave, if it gave any. */
  readonly admin?: { readonly label?: string; readonly help?: string }
}

export interface PluginBlockDescription {
  readonly name: string
  readonly label: string
  readonly fields: readonly PluginBlockFieldDescription[]
  /** Which plugin brings it — what an editor is told when it disappears. */
  readonly plugin: string
  readonly fallback: string
}

function describeField(
  name: string,
  declaration: {
    readonly kind: string
    readonly required?: boolean
    readonly localized?: boolean
    readonly label?: string
    readonly help?: string
    readonly options?: Readonly<Record<string, unknown>>
    readonly of?: Readonly<Record<string, unknown>>
  },
): PluginBlockFieldDescription {
  // A list compiles to the admin's `json` kind carrying the item shape, the
  // same translation the vocabulary's own list fields already get — a change
  // of editor, never of format.
  const isList = declaration.kind === 'list'
  const items = Object.entries(
    (declaration.of ?? {}) as Record<string, { kind: string; required?: boolean; label?: string }>,
  ).map(([itemName, item]) => ({
    name: itemName,
    kind: item.kind,
    required: item.required === true,
    localized: false,
    unique: false as const,
    hasCustomValidation: false as const,
    options: {},
    ...(item.label === undefined ? {} : { admin: { label: item.label } }),
  }))
  return {
    name,
    kind: isList ? 'json' : declaration.kind,
    required: declaration.required === true,
    localized: declaration.localized === true,
    unique: false,
    hasCustomValidation: false,
    options: isList
      ? { ...(declaration.options ?? {}), list: true, items }
      : (declaration.options ?? {}),
    // The words the plugin author chose, so a person filling the block in
    // reads "Colonne de gauche" rather than `leftLabel`.
    ...(declaration.label === undefined && declaration.help === undefined
      ? {}
      : {
          admin: {
            ...(declaration.label === undefined ? {} : { label: declaration.label }),
            ...(declaration.help === undefined ? {} : { help: declaration.help }),
          },
        }),
  }
}

/** Every plugin block this site registered, described for the admin. */
export function describePluginBlocks(
  plugins: readonly ResolvedPlugin[],
  set: PluginBlockSet,
): readonly PluginBlockDescription[] {
  const registered = new Set(set.definitions.map((definition) => definition.name))
  const described: PluginBlockDescription[] = []
  for (const plugin of plugins) {
    for (const provision of plugin.manifest.provides.blocks ?? []) {
      if (!registered.has(provision.name)) continue
      if (set.owners.get(provision.name) !== plugin.manifest.name) continue
      described.push({
        name: provision.name,
        label: provision.label ?? provision.name,
        fields: Object.entries(provision.fields ?? {}).map(([name, declaration]) =>
          describeField(name, declaration),
        ),
        plugin: plugin.manifest.title ?? plugin.manifest.name,
        fallback: provision.fallback,
      })
    }
  }
  return described
}
