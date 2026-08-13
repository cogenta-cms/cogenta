import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadMigrations } from '../src/commands/migrate.js'
import { run } from '../src/index.js'

/**
 * A project directory: a SQLite configuration and a migrations/ directory.
 *
 * No service is started and nothing is installed into it — the whole point of
 * the L0 smoke criterion is that this works on a bare machine.
 */
async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-migrate-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await mkdir(join(root, 'migrations'), { recursive: true })
  return root
}

/**
 * A migration file, written without a single import.
 *
 * A `SqlFragment` is just parts plus values, so a fixture can build one by hand
 * and the temporary project needs no node_modules at all.
 */
function migrationFile(upSql: string, downSql: string, extra = ''): string {
  return `const raw = (text) => ({ parts: [text], values: [] })

export default {
${extra}  async up(tx) {
    await tx.query(raw(${JSON.stringify(upSql)}))
  },
  async down(tx) {
    await tx.query(raw(${JSON.stringify(downSql)}))
  },
}
`
}

async function addMigration(root: string, name: string, body: string): Promise<void> {
  await writeFile(join(root, 'migrations', name), body, 'utf8')
}

let out: string[]
let err: string[]
const stdout = (text: string): void => {
  out.push(text)
}
const stderr = (text: string): void => {
  err.push(text)
}
const output = (): string => out.join('')
const errors = (): string => err.join('')

beforeEach(() => {
  out = []
  err = []
})

const migrate = (root: string, ...args: string[]): Promise<number> =>
  run({ argv: ['migrate', ...args, '--cwd', root], stdout, stderr, env: {} })

describe('migrate status', () => {
  it('lists every migration as pending on a database that never ran one', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await addMigration(
      root,
      '0002_gadgets.mjs',
      migrationFile('create table gadgets (id integer primary key)', 'drop table gadgets'),
    )

    expect(await migrate(root, 'status')).toBe(0)
    expect(output()).toContain('0001_widgets — pending')
    expect(output()).toContain('0002_gadgets — pending')
    expect(output()).toContain('0 applied, 2 pending.')

    await rm(root, { recursive: true, force: true })
  })

  it('treats a project with no migrations directory as having no migrations', async () => {
    const root = await project()
    await rm(join(root, 'migrations'), { recursive: true, force: true })

    expect(await migrate(root, 'status')).toBe(0)
    expect(output()).toContain('No migration found')

    await rm(root, { recursive: true, force: true })
  })

  it('reports when a file changed after it was applied here', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    expect(await migrate(root, 'up')).toBe(0)

    // Same id, different SQL: the two environments that ran each version now
    // differ in a way nothing else records.
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile(
        'create table widgets (id integer primary key, extra text)',
        'drop table widgets',
      ),
    )

    out = []
    expect(await migrate(root, 'status')).toBe(1)
    expect(output()).toContain('changed since')

    await rm(root, { recursive: true, force: true })
  })
})

describe('migrate up and down', () => {
  it('applies the pending migrations and then reports them as applied', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )

    expect(await migrate(root, 'up')).toBe(0)
    expect(output()).toContain('applied 0001_widgets')

    out = []
    expect(await migrate(root, 'status')).toBe(0)
    expect(output()).toContain('1 applied, 0 pending.')

    await rm(root, { recursive: true, force: true })
  })

  it('says there is nothing to apply rather than pretending it did work', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await migrate(root, 'up')

    out = []
    expect(await migrate(root, 'up')).toBe(0)
    expect(output()).toContain('Nothing to apply.')

    await rm(root, { recursive: true, force: true })
  })

  it('stops at the migration named by --to', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await addMigration(
      root,
      '0002_gadgets.mjs',
      migrationFile('create table gadgets (id integer primary key)', 'drop table gadgets'),
    )

    expect(await migrate(root, 'up', '--to', '0001_widgets')).toBe(0)
    expect(output()).toContain('applied 0001_widgets')
    expect(output()).not.toContain('applied 0002_gadgets')

    await rm(root, { recursive: true, force: true })
  })

  it('reverts the last migration, and only the last one', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await addMigration(
      root,
      '0002_gadgets.mjs',
      migrationFile('create table gadgets (id integer primary key)', 'drop table gadgets'),
    )
    await migrate(root, 'up')

    out = []
    expect(await migrate(root, 'down')).toBe(0)
    expect(output()).toContain('reverted 0002_gadgets')
    expect(output()).not.toContain('reverted 0001_widgets')

    out = []
    await migrate(root, 'status')
    expect(output()).toContain('1 applied, 1 pending.')

    await rm(root, { recursive: true, force: true })
  })

  it('reverts several migrations with --steps', async () => {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await addMigration(
      root,
      '0002_gadgets.mjs',
      migrationFile('create table gadgets (id integer primary key)', 'drop table gadgets'),
    )
    await migrate(root, 'up')

    out = []
    expect(await migrate(root, 'down', '--steps', '2')).toBe(0)
    expect(output()).toContain('reverted 0002_gadgets')
    expect(output()).toContain('reverted 0001_widgets')

    await rm(root, { recursive: true, force: true })
  })

  it('rejects a --steps that is not a whole number instead of reverting nothing', async () => {
    const root = await project()

    expect(await migrate(root, 'down', '--steps', 'lots')).toBe(2)
    expect(errors()).toContain('--steps')

    await rm(root, { recursive: true, force: true })
  })
})

describe('migrate up — a destructive migration', () => {
  const destructive = migrationFile(
    'drop table widgets',
    'create table widgets (id integer primary key)',
    "  destructive: true,\n  impact: 'Deletes every widget row; down() rebuilds an empty table.',\n",
  )

  async function projectWithDestructive(): Promise<string> {
    const root = await project()
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )
    await addMigration(root, '0002_drop_widgets.mjs', destructive)
    return root
  }

  it('refuses without both flags, and says what would be lost', async () => {
    const root = await projectWithDestructive()

    expect(await migrate(root, 'up')).toBe(1)
    expect(errors()).toContain('0002_drop_widgets')
    expect(errors()).toContain('Deletes every widget row')
    expect(errors()).toContain('--confirm-destructive')
    expect(errors()).toContain('--backup-verified')

    await rm(root, { recursive: true, force: true })
  })

  it('still refuses when only one of the two flags is given', async () => {
    const root = await projectWithDestructive()

    expect(await migrate(root, 'up', '--confirm-destructive')).toBe(1)
    err = []
    expect(await migrate(root, 'up', '--backup-verified')).toBe(1)
    expect(errors()).toContain('destructive')

    await rm(root, { recursive: true, force: true })
  })

  it('applies it once the operator confirms and the backup is verified', async () => {
    const root = await projectWithDestructive()

    expect(await migrate(root, 'up', '--confirm-destructive', '--backup-verified')).toBe(0)
    expect(output()).toContain('applied 0002_drop_widgets')

    await rm(root, { recursive: true, force: true })
  })

  it('shows the declared impact in status, before anything runs', async () => {
    const root = await projectWithDestructive()

    expect(await migrate(root, 'status')).toBe(0)
    expect(output()).toContain('destructive: Deletes every widget row')

    await rm(root, { recursive: true, force: true })
  })
})

describe('migrate — the command line itself', () => {
  it('rejects a missing subcommand with usage and exit code 2', async () => {
    const root = await project()

    expect(await migrate(root)).toBe(2)
    expect(errors()).toContain('Usage')

    await rm(root, { recursive: true, force: true })
  })

  it('rejects an unknown subcommand with usage and exit code 2', async () => {
    const root = await project()

    expect(await migrate(root, 'sideways')).toBe(2)
    expect(errors()).toContain('Unknown subcommand "sideways"')

    await rm(root, { recursive: true, force: true })
  })

  it('reaches the same database when run from a subdirectory of the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-migrate-'))
    await mkdir(join(root, 'migrations'), { recursive: true })
    await mkdir(join(root, 'src', 'deep'), { recursive: true })
    // A relative path, as a real project writes it. Resolved against the config
    // file, never against the shell: a subdirectory must not open its own empty
    // database and report an already-migrated site as untouched.
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: './site.db' },
}
`,
      'utf8',
    )
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )

    expect(await migrate(root, 'up')).toBe(0)

    out = []
    expect(
      await run({
        argv: ['migrate', 'status', '--cwd', join(root, 'src', 'deep')],
        stdout,
        stderr,
        env: {},
      }),
    ).toBe(0)
    expect(output()).toContain('1 applied, 0 pending.')

    await rm(root, { recursive: true, force: true })
  })

  it('never prints a secret it was given', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cogenta-migrate-'))
    await mkdir(join(root, 'migrations'), { recursive: true })
    await writeFile(
      join(root, 'cogenta.config.mjs'),
      `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  llm: { provider: 'anthropic', model: 'claude-sonnet' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
}
`,
      'utf8',
    )
    await addMigration(
      root,
      '0001_widgets.mjs',
      migrationFile('create table widgets (id integer primary key)', 'drop table widgets'),
    )

    const code = await run({
      argv: ['migrate', 'up', '--cwd', root, '--verbose'],
      stdout,
      stderr,
      env: { COGENTA_LLM_API_KEY: 'sk-ant-must-not-appear' },
    })

    expect(code).toBe(0)
    expect(output()).not.toContain('sk-ant-must-not-appear')
    expect(errors()).not.toContain('sk-ant-must-not-appear')

    await rm(root, { recursive: true, force: true })
  })

  it('leaves colour out of a pipe', async () => {
    const root = await project()

    await migrate(root, 'status')

    // Piping to a file must not fill it with escape codes.
    const esc = String.fromCharCode(27)
    expect(output()).not.toContain(`${esc}[`)
    await rm(root, { recursive: true, force: true })
  })
})

describe('loading migrations from disk', () => {
  it('refuses a file that exports something without a down()', async () => {
    const root = await project()
    await writeFile(
      join(root, 'migrations', '0001_broken.mjs'),
      'export default { async up() {} }\n',
      'utf8',
    )

    await expect(loadMigrations(join(root, 'migrations'))).rejects.toThrow('`down` function')

    await rm(root, { recursive: true, force: true })
  })

  it('orders migrations by file name and hashes each file', async () => {
    const root = await project()
    await addMigration(root, '0002_b.mjs', migrationFile('select 1', 'select 1'))
    await addMigration(root, '0001_a.mjs', migrationFile('select 1', 'select 1'))

    const migrations = await loadMigrations(join(root, 'migrations'))

    expect(migrations.map((migration) => migration.id)).toEqual(['0001_a', '0002_b'])
    for (const migration of migrations) expect(migration.checksum).toMatch(/^[0-9a-f]{64}$/)

    await rm(root, { recursive: true, force: true })
  })
})
