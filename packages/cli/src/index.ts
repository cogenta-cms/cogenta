import process from 'node:process'
import { parseArgs } from 'node:util'
import { createLogger, isCogentaError } from '@cogenta/core'
import { formatDoctorReport, runDoctor } from './commands/doctor.js'
import { runMigrate } from './commands/migrate.js'
import { runServe } from './commands/serve.js'
import { runUsers } from './commands/users.js'
import { createOutput, shouldUseColour, type Writer } from './output.js'

export type { DoctorCheck, DoctorOptions, DoctorReport } from './commands/doctor.js'
export { formatDoctorReport, runDoctor } from './commands/doctor.js'
export type { MigrateOptions, MigrateSubcommand } from './commands/migrate.js'
export { loadMigrations, MIGRATIONS_DIRECTORY, runMigrate } from './commands/migrate.js'
export type { ServeOptions } from './commands/serve.js'
export { loadCollections, runServe } from './commands/serve.js'
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
  serve            Run the content and auth API over HTTP
  help             Show this message
  version          Print the version

Options
  --cwd <path>            Run as if from this directory
  --no-color              Never colour the output (NO_COLOR is honoured too)
  --verbose               Send structured driver logs to stderr

Migration options
  --to <id>               Stop at this migration, inclusive
  --steps <n>             How many migrations "migrate down" reverts (default 1)
  --confirm-destructive   The impact of every destructive migration has been read
  --backup-verified       A backup was taken and verified to restore

User options
  --email <email>         The new user's email
  --roles <role,role>     Comma-separated role names
  --admin                 Shorthand for --roles admin

Serve options
  --port <n>              Port to listen on (default 4000)
  --host <host>           Host to bind to (default 127.0.0.1)
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
        admin: { type: 'boolean' },
        port: { type: 'string' },
        host: { type: 'string' },
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
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
    })
  }

  if (command === 'serve') {
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
      ...(typeof parsed.values.cwd === 'string' ? { cwd: parsed.values.cwd } : {}),
      ...(port === undefined ? {} : { port }),
      ...(typeof parsed.values.host === 'string' ? { host: parsed.values.host } : {}),
      ...(verboseLogger === undefined ? {} : { logger: verboseLogger }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.onListening === undefined ? {} : { onListening: options.onListening }),
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
