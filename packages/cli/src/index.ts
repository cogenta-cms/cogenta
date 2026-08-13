import process from 'node:process'
import { parseArgs } from 'node:util'
import { createLogger, isCogentaError } from '@cogenta/core'
import { formatDoctorReport, runDoctor } from './commands/doctor.js'
import { createOutput, shouldUseColour, type Writer } from './output.js'

export type { DoctorCheck, DoctorOptions, DoctorReport } from './commands/doctor.js'
export { formatDoctorReport, runDoctor } from './commands/doctor.js'
export type { Output, Writer } from './output.js'
export { createOutput, shouldUseColour } from './output.js'

const USAGE = `cogenta — the command line for a Cogenta site

Usage
  cogenta <command> [options]

Commands
  doctor     Report which driver is running for each need, and why
  help       Show this message
  version    Print the version

Options
  --cwd <path>   Run as if from this directory
  --no-color     Never colour the output (NO_COLOR is honoured too)
  --verbose      Send structured driver logs to stderr
`

export interface RunOptions {
  readonly argv: readonly string[]
  readonly stdout?: Writer
  readonly stderr?: Writer
  readonly env?: Record<string, string | undefined>
  readonly isTty?: boolean
  readonly version?: string
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
      ...(parsed.values.verbose === true
        ? { logger: createLogger({ level: 'debug', destination: stderr }) }
        : {}),
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
