import process from 'node:process'
import { parseArgs } from 'node:util'
import { createLogger, isCogentaError } from '@cogenta/core'
import { runBackup, runRestore } from './commands/backup.js'
import { formatDoctorReport, runDoctor } from './commands/doctor.js'
import { runExport, runImportContent } from './commands/export.js'
import { runGenerate } from './commands/generate.js'
import { runImport } from './commands/import.js'
import { runLinks } from './commands/links.js'
import { runMcp } from './commands/mcp.js'
import { runMigrate } from './commands/migrate.js'
import { runServe } from './commands/serve.js'
import { runSkin } from './commands/skin.js'
import { runUsers } from './commands/users.js'
import { createOutput, shouldUseColour, type Writer } from './output.js'

export type { BackupOptions, RestoreOptions } from './commands/backup.js'
export { runBackup, runRestore } from './commands/backup.js'
export type { DoctorCheck, DoctorOptions, DoctorReport } from './commands/doctor.js'
export { formatDoctorReport, runDoctor } from './commands/doctor.js'
export type { ExportOptions, ImportContentOptions } from './commands/export.js'
export { runExport, runImportContent } from './commands/export.js'
export type { GenerateOptions, GenerateSubcommand } from './commands/generate.js'
export { runGenerate } from './commands/generate.js'
export type { ImportOptions, ImportSubcommand } from './commands/import.js'
export { runImport } from './commands/import.js'
export type { LinksOptions, LinksSubcommand } from './commands/links.js'
export { runLinks } from './commands/links.js'
export type { McpOptions } from './commands/mcp.js'
export { runMcp } from './commands/mcp.js'
export type { MigrateOptions, MigrateSubcommand } from './commands/migrate.js'
export { loadMigrations, MIGRATIONS_DIRECTORY, runMigrate } from './commands/migrate.js'
export type { ServeOptions } from './commands/serve.js'
export { loadCollections, runServe } from './commands/serve.js'
export type { SkinOptions, SkinSubcommand } from './commands/skin.js'
export { runSkin } from './commands/skin.js'
export type { UsersOptions, UsersSubcommand } from './commands/users.js'
export { runUsers } from './commands/users.js'
export type { Output, Writer } from './output.js'
export { createOutput, shouldUseColour } from './output.js'

const USAGE = `cogenta — the command line for a Cogenta site

Usage
  cogenta <command> [options]

Commands
  doctor           Report which driver is running for each need, and why
  migrate status   List every migration and whether it ran here
  migrate up       Apply the pending migrations
  migrate down     Revert applied migrations
  users create     Create a user — the first admin account is made this way
  users reset-password   Send a single-use reset token, or redeem one
  import wordpress <file.xml>   Import a WordPress WXR export, with a report
  export <file.ndjson>   Export content — entries, terms, menus, redirects
  import content <file.ndjson>   Re-import an export produced by "export"
  backup create    Back up every table (content, users, audit…) to a file
  backup list      List backups in the backup directory
  restore preview <file.zip>   Show what a backup would add or overwrite
  restore apply <file.zip>     Restore a backup — CLI only (fiche 26)
  generate types   Write TypeScript declarations for the content schema
  links check      Crawl published content and report links that lead nowhere
  skin list        Show the site's active skin
  skin validate <tokens.json>   Check a token file against contract D
  skin apply <tokens.json>      Validate, then make it the active skin
  skin generate --description "…"   Generate a skin from a description
  serve, dev       Run the content and auth API over HTTP
  mcp              Run an MCP server over stdin/stdout, exposing this site's tools
  help             Show this message
  version          Print the version

Not built yet: build, upgrade, deploy, theme, agent, and generate
schema/generate migrations — see CLAUDE.md for why each is deferred
rather than stubbed.

Options
  --cwd <path>            Run as if from this directory
  --no-color              Never colour the output (NO_COLOR is honoured too)
  --verbose               Send structured driver logs to stderr
  --out <path>            generate types: where to write the declarations
  --description <text>    skin generate: free text describing the site
  --external              links check: also follow links that leave the site
  --collections <a,b,c>   export: only these collections (default: all)
  --dir <path>            backup: where to write/read backups (default .cogenta/backups)
  --passphrase <text>     backup create / restore: encrypt or decrypt the backup

Migration options
  --to <id>               Stop at this migration, inclusive
  --steps <n>             How many migrations "migrate down" reverts (default 1)
  --confirm-destructive   The impact of every destructive migration has been read
  --backup-verified       A backup was taken and verified to restore

User options
  --email <email>         The new user's email
  --roles <role,role>     Comma-separated role names
  --admin                 Shorthand for --roles admin
  --token <token>         reset-password: the token from the mail
  --password <text>       reset-password: the new password (generated if absent)
  --mail-dir <path>       Where outgoing mail is written (default .cogenta/mail)

Serve options
  --port <n>              Port to listen on (default 4000)
  --host <host>           Host to bind to (default 127.0.0.1)

MCP options
  --email <email>         mcp: run as this real user (looked up in the user store)
  --role <role,role>      mcp: run as a synthetic actor with these roles (testing only)
`

export interface RunOptions {
  readonly argv: readonly string[]
  readonly stdout?: Writer
  readonly stderr?: Writer
  readonly env?: Record<string, string | undefined>
  readonly isTty?: boolean
  readonly version?: string
  /** Stops `serve` when aborted. Ignored by every other command. */
  readonly signal?: AbortSignal
  /** `serve` only: reports the bound address once listening (tests need the OS-assigned port). */
  readonly onListening?: (address: { port: number; host: string }) => void
}

/**
 * Runs one command and returns its exit code.
 *
 * Nothing here calls `process.exit` or writes to a stream directly: the streams
 * are injected, so the whole CLI is testable without spawning a process or
 * capturing stdout.
 */
export async function run(options: RunOptions): Promise<number> {
  const env = options.env ?? process.env
  const stdout = options.stdout ?? ((text) => void process.stdout.write(text))
  const stderr = options.stderr ?? ((text) => void process.stderr.write(text))

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...options.argv],
      allowPositionals: true,
      strict: true,
      options: {
        cwd: { type: 'string' },
        'no-color': { type: 'boolean' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        to: { type: 'string' },
        steps: { type: 'string' },
        'confirm-destructive': { type: 'boolean' },
        'backup-verified': { type: 'boolean' },
        email: { type: 'string' },
        roles: { type: 'string' },
        role: { type: 'string' },
        admin: { type: 'boolean' },
        token: { type: 'string' },
        password: { type: 'string' },
        'mail-dir': { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        out: { type: 'string' },
        description: { type: 'string' },
        external: { type: 'boolean' },
        collections: { type: 'string' },
        dir: { type: 'string' },
        passphrase: { type: 'string' },
      },
    })
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`)
    return 2
  }

  const colour =
    parsed.values['no-color'] === true ? false : shouldUseColour(env, options.isTty ?? false)
  const out = createOutput(stdout, colour)

  const command = parsed.positionals[0] ?? (parsed.values.version === true ? 'version' : 'help')

  if (parsed.values.help === true || command === 'help') {
    stdout(USAGE)
    return 0
  }

  if (command === 'version') {
    stdout(`${options.version ?? '0.0.0'}\n`)
    return 0
  }

  const verboseLogger =
    parsed.values.verbose === true
      ? createLogger({ level: 'debug', destination: stderr })
      : undefined

  if (command === 'migrate') {
    // `--steps` is a string here because parseArgs has no number type. A
    // non-number is a usage error, not a silent 0 that would revert nothing.
    let steps: number | undefined
    if (typeof parsed.values.steps === 'string') {
      steps = Number(parsed.values.steps)
      if (!Number.isInteger(steps) || steps < 1) {
        stderr(`--steps must be a whole number of migrations, not "${parsed.values.steps}".\n`)
        return 2
      }
    }

    return runMigrate({
      subcommand: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.to === 'string' ? { to: parsed.values.to } : {}),
      ...(steps === undefined ? {} : { steps }),
      ...(parsed.values['confirm-destructive'] === true ? { confirmDestructive: true } : {}),
      ...(parsed.values['backup-verified'] === true ? { backupVerified: true } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'users') {
    return runUsers({
      subcommand: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.email === 'string' ? { email: parsed.values.email } : {}),
      ...(typeof parsed.values.roles === 'string' ? { roles: parsed.values.roles } : {}),
      ...(parsed.values.admin === true ? { admin: true } : {}),
      ...(typeof parsed.values.token === 'string' ? { token: parsed.values.token } : {}),
      ...(typeof parsed.values.password === 'string' ? { password: parsed.values.password } : {}),
      ...(typeof parsed.values['mail-dir'] === 'string'
        ? { mailDir: parsed.values['mail-dir'] }
        : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'import' && parsed.positionals[1] === 'content') {
    return runImportContent({
      file: parsed.positionals[2],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'import') {
    return runImport({
      subcommand: parsed.positionals[1],
      file: parsed.positionals[2],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'export') {
    return runExport({
      file: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.collections === 'string'
        ? { collections: parsed.values.collections.split(',').map((name) => name.trim()) }
        : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'backup') {
    return runBackup({
      subcommand: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.dir === 'string' ? { dir: parsed.values.dir } : {}),
      ...(typeof parsed.values.passphrase === 'string'
        ? { passphrase: parsed.values.passphrase }
        : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'restore') {
    return runRestore({
      subcommand: parsed.positionals[1],
      file: parsed.positionals[2],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.passphrase === 'string'
        ? { passphrase: parsed.values.passphrase }
        : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'generate') {
    return runGenerate({
      subcommand: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.out === 'string' ? { outFile: parsed.values.out } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'links') {
    return runLinks({
      subcommand: parsed.positionals[1],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(parsed.values.external === true ? { external: true } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'skin') {
    return runSkin({
      subcommand: parsed.positionals[1],
      file: parsed.positionals[2],
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.description === 'string'
        ? { description: parsed.values.description }
        : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'serve' || command === 'dev') {
    let port: number | undefined
    if (typeof parsed.values.port === 'string') {
      port = Number(parsed.values.port)
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        stderr(`--port must be a whole number between 0 and 65535, not "${parsed.values.port}".\n`)
        return 2
      }
    }

    return runServe({
      out,
      stderr,
      env,
      // ADR-0010: the schema is writable in development only. This is the
      // one place the two commands differ in more than name.
      development: command === 'dev',
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(port === undefined ? {} : { port }),
      ...(typeof parsed.values.host === 'string' ? { host: parsed.values.host } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onListening === undefined ? {} : { onListening: options.onListening }),
    })
  }

  if (command === 'mcp') {
    return runMcp({
      out,
      stderr,
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(typeof parsed.values.email === 'string' ? { email: parsed.values.email } : {}),
      ...(typeof parsed.values.role === 'string' ? { role: parsed.values.role } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command !== 'doctor') {
    stderr(`Unknown command "${command}".\n\n${USAGE}`)
    return 2
  }

  try {
    const report = await runDoctor({
      env,
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      // Structured logs go to stderr so the report on stdout stays readable
      // when it is piped.
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
    formatDoctorReport(report, out)
    return report.problems.length === 0 ? 0 : 1
  } catch (error) {
    // Anything that reaches here is a bug in doctor itself, not a diagnosis.
    if (isCogentaError(error)) {
      stderr(`${error.code}: ${error.message}\n`)
      if (error.hint !== undefined) stderr(`${error.hint}\n`)
    } else {
      stderr(`${error instanceof Error ? error.stack : String(error)}\n`)
    }
    return 1
  }
}
