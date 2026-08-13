import { invalidBlockDefinition, unknownBlock } from './errors.js'
import type { AnyBlockDefinition } from './types.js'
import { VOCABULARY } from './vocabulary.js'

/**
 * The blocks a site knows about: the twelve of the vocabulary, plus whatever a
 * theme or a plugin adds.
 */
export class BlockRegistry {
  readonly #blocks = new Map<string, AnyBlockDefinition>()

  register(definition: AnyBlockDefinition): void {
    const existing = this.#blocks.get(definition.name)
    if (existing !== undefined && existing !== definition) {
      throw invalidBlockDefinition(
        definition.name,
        'a different block is already registered under this name',
      )
    }
    this.#blocks.set(definition.name, definition)
  }

  has(name: string): boolean {
    return this.#blocks.has(name)
  }

  get(name: string): AnyBlockDefinition | undefined {
    return this.#blocks.get(name)
  }

  /** Same as `get`, but says what went wrong instead of returning nothing. */
  mustGet(name: string): AnyBlockDefinition {
    const definition = this.#blocks.get(name)
    if (definition === undefined) throw unknownBlock(name, this.names())
    return definition
  }

  names(): string[] {
    return [...this.#blocks.keys()]
  }

  all(): AnyBlockDefinition[] {
    return [...this.#blocks.values()]
  }

  /**
   * The block a theme should actually render for `name`, following `fallback`
   * until it reaches something the theme implements.
   *
   * This is the anti-lock-in guarantee of contract B made concrete: content
   * written against a theme's own block still renders after a theme change,
   * degraded but never lost. Returns `undefined` when nothing in the chain is
   * implemented, so the caller decides between skipping and failing the build.
   */
  resolveRenderable(name: string, implemented: Iterable<string>): AnyBlockDefinition | undefined {
    const available = new Set(implemented)
    const seen = new Set<string>()
    let current: string | null = name

    while (current !== null) {
      if (seen.has(current)) {
        throw invalidBlockDefinition(name, 'its fallback chain loops back on itself')
      }
      seen.add(current)
      const definition: AnyBlockDefinition = this.mustGet(current)
      if (available.has(current)) return definition
      current = definition.fallback
    }
    return undefined
  }
}

export function createBlockRegistry(
  definitions: readonly AnyBlockDefinition[] = VOCABULARY,
): BlockRegistry {
  const registry = new BlockRegistry()
  for (const definition of definitions) registry.register(definition)
  return registry
}

/**
 * The twelve, ready to use. A site that adds blocks builds its own registry
 * rather than mutating this one: a shared mutable default is how one plugin's
 * block ends up defined for everybody's tests.
 */
export const vocabularyRegistry: BlockRegistry = createBlockRegistry()
