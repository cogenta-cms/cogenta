import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  type AnyBlockDefinition,
  BlockMigrationRegistry,
  createBlockRegistry,
  defineBlock,
  f,
  loadBlock,
  loadBlocks,
} from '../src/index.js'

/**
 * The regression the spec asks for: a block whose schema moved on is migrated
 * when it is read, and the migrated form is what gets written back.
 *
 * `callout` starts with a single `text` field. 2.0.0 splits it into `title` and
 * `body`; 3.0.0 adds a `tone`. Nothing is lost on the way.
 */
const calloutV3 = defineBlock({
  name: 'callout',
  version: '3.0.0',
  runtime: 'static',
  fallback: 'prose',
  a11y: { headingLevel: 'h3' },
  schema: {
    title: f.text({ required: true, max: 120 }),
    body: f.text({ required: true, max: 400 }),
    tone: f.select({ options: ['info', 'warning'], required: true }),
  },
})

function registries(): {
  registry: ReturnType<typeof createBlockRegistry>
  migrations: BlockMigrationRegistry
} {
  const registry = createBlockRegistry()
  registry.register(calloutV3 as AnyBlockDefinition)

  const migrations = new BlockMigrationRegistry()
  migrations.registerAll([
    {
      block: 'callout',
      from: '1.0.0',
      to: '2.0.0',
      migrate(data) {
        const text = typeof data.text === 'string' ? data.text : ''
        const [first = text, ...rest] = text.split('. ')
        return { title: first, body: rest.length === 0 ? text : rest.join('. ') }
      },
    },
    {
      block: 'callout',
      from: '2.0.0',
      to: '3.0.0',
      // A new required field needs a value for content written before it existed.
      migrate: (data) => ({ ...data, tone: 'info' }),
    },
  ])

  return { registry, migrations }
}

const storedV1 = {
  _key: 'block-7',
  _type: 'callout',
  _version: '1.0.0',
  text: 'Back up first. The migration rewrites every row.',
}

describe('block schema migration', () => {
  it('migrates a block one version step at a time, without losing data', () => {
    const { registry, migrations } = registries()
    const { block, migrated } = loadBlock(storedV1, { registry, migrations })

    expect(migrated).toBe(true)
    expect(block._version).toBe('3.0.0')
    expect(block.title).toBe('Back up first')
    expect(block.body).toBe('The migration rewrites every row.')
    expect(block.tone).toBe('info')
  })

  it('keeps the _key across the migration, so comments and diffs still point at the block', () => {
    const { registry, migrations } = registries()
    const { block } = loadBlock(storedV1, { registry, migrations })
    expect(block._key).toBe('block-7')
  })

  it('refuses to let a migration change a block identity', () => {
    const { registry } = registries()
    const rogue = new BlockMigrationRegistry()
    rogue.registerAll([
      {
        block: 'callout',
        from: '1.0.0',
        to: '2.0.0',
        migrate: () => ({ _key: 'stolen', title: 'a', body: 'b' }),
      },
      { block: 'callout', from: '2.0.0', to: '3.0.0', migrate: (d) => ({ ...d, tone: 'info' }) },
    ])

    const { block } = loadBlock(storedV1, { registry, migrations: rogue })
    expect(block._key).toBe('block-7')
  })

  it('reports the block as unchanged when it is already at the current version', () => {
    const { registry, migrations } = registries()
    const current = {
      _key: 'block-8',
      _type: 'callout',
      _version: '3.0.0',
      title: 'Already there',
      body: 'Nothing to do.',
      tone: 'warning',
    }
    expect(loadBlock(current, { registry, migrations }).migrated).toBe(false)
  })

  it('refuses a block written by a newer deployment rather than dropping its fields', () => {
    const { registry, migrations } = registries()
    const future = {
      _key: 'k',
      _type: 'callout',
      _version: '4.0.0',
      title: 'a',
      body: 'b',
      tone: 'info',
    }
    try {
      loadBlock(future, { registry, migrations })
      expect.unreachable('a newer stored version must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_MIGRATION_FAILED')
      expect(error.message).toContain('newer')
    }
  })

  it('names the missing step when the migration path has a hole', () => {
    const { registry } = registries()
    const incomplete = new BlockMigrationRegistry()
    incomplete.register({
      block: 'callout',
      from: '2.0.0',
      to: '3.0.0',
      migrate: (data) => ({ ...data, tone: 'info' }),
    })
    expect(() => loadBlock(storedV1, { registry, migrations: incomplete })).toThrowError(
      /no migration registered from 1.0.0/,
    )
  })

  it('validates the migrated block, so a bad migration fails loudly', () => {
    const { registry } = registries()
    const bad = new BlockMigrationRegistry()
    bad.registerAll([
      { block: 'callout', from: '1.0.0', to: '2.0.0', migrate: () => ({ title: 'a', body: 'b' }) },
      { block: 'callout', from: '2.0.0', to: '3.0.0', migrate: (d) => ({ ...d }) },
    ])
    expect(() => loadBlock(storedV1, { registry, migrations: bad })).toThrowError(/tone/)
  })

  it('refuses a stored block with no usable schema version', () => {
    const { registry, migrations } = registries()
    const unversioned = { _key: 'k', _type: 'callout', text: 'orphan' }
    expect(() => loadBlock(unversioned, { registry, migrations })).toThrowError(/schema version/)
  })

  it('reports a zone as needing a rewrite as soon as one of its blocks moved', () => {
    const { registry, migrations } = registries()
    const current = {
      _key: 'block-9',
      _type: 'callout',
      _version: '3.0.0',
      title: 'Fresh',
      body: 'Nothing to do.',
      tone: 'info',
    }
    const zone = loadBlocks([current, storedV1], { registry, migrations })
    expect(zone.migrated).toBe(true)
    expect(zone.blocks.map((block) => block._key)).toEqual(['block-9', 'block-7'])
  })
})

describe('the migration registry', () => {
  it('refuses a step that does not move forward', () => {
    const migrations = new BlockMigrationRegistry()
    expect(() =>
      migrations.register({
        block: 'callout',
        from: '2.0.0',
        to: '1.0.0',
        migrate: (d) => ({ ...d }),
      }),
    ).toThrowError(/does not move forward/)
  })

  it('refuses two steps starting from the same version, because the path must be one path', () => {
    const migrations = new BlockMigrationRegistry()
    migrations.register({
      block: 'callout',
      from: '1.0.0',
      to: '2.0.0',
      migrate: (d) => ({ ...d }),
    })
    expect(() =>
      migrations.register({
        block: 'callout',
        from: '1.0.0',
        to: '3.0.0',
        migrate: (d) => ({ ...d }),
      }),
    ).toThrowError(/unambiguous/)
  })
})
