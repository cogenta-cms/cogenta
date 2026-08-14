import { access, constants as fsConstants, mkdir, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { join } from 'node:path'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface EnvironmentCheck {
  readonly name: string
  readonly status: CheckStatus
  /** Cause and remedy together — "a broken environment error says what to do, not just what failed." */
  readonly message: string
}

export interface EnvironmentReport {
  readonly node: string
  readonly packageManager: string
  readonly checks: readonly EnvironmentCheck[]
  readonly detectedDatabases: readonly ('postgres' | 'mysql')[]
  /** `false` when any check is `fail` — a `warn` alone (e.g. no built-in SQLite, but Postgres/MySQL still work) does not block installation. */
  readonly ok: boolean
}

export interface CheckEnvironmentOptions {
  readonly targetDir: string
  readonly env?: NodeJS.ProcessEnv
}

/** Node's own SQLite module needs 22.13 — the same threshold `cogenta doctor` already checks. */
function checkNodeVersion(): EnvironmentCheck {
  const version = process.versions.node
  const [major, minor] = version.split('.').map(Number)
  if (major === undefined || major < 22) {
    return {
      name: 'node',
      status: 'fail',
      message: `Node ${version} is too old. Cogenta needs Node 22.11 or later — install a current LTS from nodejs.org.`,
    }
  }
  if (major === 22 && minor !== undefined && minor < 13) {
    return {
      name: 'node',
      status: 'warn',
      message: `Node ${version} has no built-in SQLite. Upgrade to 22.13 or later, or choose Postgres or MySQL in the next step.`,
    }
  }
  return { name: 'node', status: 'ok', message: `Node ${version}.` }
}

/** `npm_config_user_agent` is the one signal every package manager sets consistently — parsed the same way `pnpm`/`corepack` themselves rely on it being. */
function detectPackageManager(env: NodeJS.ProcessEnv): string {
  const userAgent = env.npm_config_user_agent
  if (userAgent === undefined) return 'npm'
  const name = userAgent.split('/')[0]
  return name === undefined || name === '' ? 'npm' : name
}

async function checkWritePermission(targetDir: string): Promise<EnvironmentCheck> {
  try {
    await mkdir(targetDir, { recursive: true })
    await access(targetDir, fsConstants.W_OK)
    const probe = join(targetDir, '.cogenta-write-probe')
    await writeFile(probe, '', 'utf8')
    await rm(probe, { force: true })
    return { name: 'write-permission', status: 'ok', message: `${targetDir} is writable.` }
  } catch (error) {
    return {
      name: 'write-permission',
      status: 'fail',
      message: `Cannot write to ${targetDir} (${error instanceof Error ? error.message : String(error)}). Choose a different directory, or fix its permissions.`,
    }
  }
}

/** A short-timeout TCP connect — best-effort, never a `fail`: a database that is not running locally is completely normal, this only feeds "Postgres/MySQL proposed if detected". */
function probePort(port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    const finish = (result: boolean): void => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/**
 * Step 1 of the wizard: "Vérification de l'environnement — version de Node,
 * gestionnaire de paquets, droits d'écriture, services détectés." Every
 * `fail` message names both the cause and the remedy — never just what
 * broke, matching `cogenta doctor`'s own convention (`packages/cli/src/commands/doctor.ts`).
 */
export async function checkEnvironment(
  options: CheckEnvironmentOptions,
): Promise<EnvironmentReport> {
  const env = options.env ?? process.env

  const [writeCheck, hasPostgres, hasMysql] = await Promise.all([
    checkWritePermission(options.targetDir),
    probePort(5432),
    probePort(3306),
  ])

  const checks = [checkNodeVersion(), writeCheck]
  const detectedDatabases: ('postgres' | 'mysql')[] = []
  if (hasPostgres) detectedDatabases.push('postgres')
  if (hasMysql) detectedDatabases.push('mysql')

  return {
    node: process.versions.node,
    packageManager: detectPackageManager(env),
    checks,
    detectedDatabases,
    ok: checks.every((check) => check.status !== 'fail'),
  }
}
