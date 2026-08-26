import { execFile } from 'node:child_process'
import process from 'node:process'

/**
 * Fiche 58 task 1bis: "Watchdog mémoire/CPU par poll du PID (pas de
 * dépendance native)". A `child_process` spawned to run a third-party
 * binary has no `resourceLimits` the way a `worker_threads` worker does
 * (`@cogenta/plugins`'s isolation model does not apply here — see the
 * fiche's "pièges connus"), and R9/R10 forbid pulling in a native addon
 * (`pidusage` and friends) just to read one process's RSS/CPU. This polls
 * the OS's own process inspector instead — `ps` on POSIX, PowerShell's
 * `Get-Process` on Windows — both already present on every real deployment
 * target, zero new dependency.
 *
 * This is explicitly a best-effort floor, not a guarantee: the real limit
 * is host-level (a cgroup, a Windows Job Object), which this code cannot
 * set up and does not pretend to (fiche's own words: "à documenter comme
 * prérequis, pas une garantie du code"). `readUsage` is injectable so tests
 * never depend on the real `ps`/PowerShell being present or behaving a
 * particular way.
 */

export interface PidUsage {
  readonly rssBytes: number
  /** 0-based fraction of one core recently, e.g. 1.5 == 150% of one core. `0` when unknown (Windows falls back to memory-only). */
  readonly cpuPercent: number
}

export type ReadPidUsage = (pid: number) => Promise<PidUsage | null>

function parsePosixPs(stdout: string): PidUsage | null {
  const line = stdout.trim().split('\n').at(-1) ?? ''
  const [rssKb, cpu] = line.trim().split(/\s+/u)
  const rssBytes = Number.parseInt(rssKb ?? '', 10) * 1024
  if (!Number.isFinite(rssBytes) || rssBytes < 0) return null
  const cpuPercent = Number.parseFloat(cpu ?? '')
  return { rssBytes, cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : 0 }
}

async function readUsageViaCli(pid: number): Promise<PidUsage | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64`,
        ],
        { timeout: 5000 },
        (error, stdout) => {
          if (error) {
            resolve(null)
            return
          }
          const rssBytes = Number.parseInt(stdout.trim(), 10)
          resolve(Number.isFinite(rssBytes) && rssBytes >= 0 ? { rssBytes, cpuPercent: 0 } : null)
        },
      )
      return
    }
    execFile('ps', ['-o', 'rss=,%cpu=', '-p', String(pid)], { timeout: 5000 }, (error, stdout) => {
      resolve(error ? null : parsePosixPs(stdout))
    })
  })
}

export interface PidWatchdogOptions {
  readonly pid: number
  readonly pollMs?: number
  /** `undefined` disables the memory ceiling. */
  readonly maxRssBytes?: number
  /** `undefined` disables the CPU ceiling. */
  readonly maxCpuPercent?: number
  readonly onExceeded: (usage: PidUsage, reason: 'memory' | 'cpu') => void
  /** Injectable for tests — defaults to the real `ps`/PowerShell probe. */
  readonly readUsage?: ReadPidUsage
}

export interface PidWatchdog {
  stop(): void
}

const DEFAULT_POLL_MS = 5000

/** Polls one PID on an interval; fires `onExceeded` at most once (the caller is expected to kill the process and tear the watchdog down in response — this module never kills anything itself, it only observes). A process that has already exited, or a platform where the probe fails, is silently treated as "no signal" rather than a crash — this is a best-effort floor, never a hard dependency for the connection to function. */
export function startPidWatchdog(options: PidWatchdogOptions): PidWatchdog {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const readUsage = options.readUsage ?? readUsageViaCli
  let stopped = false
  let fired = false

  const timer = setInterval(() => {
    if (stopped || fired) return
    void readUsage(options.pid).then((usage) => {
      if (stopped || fired || usage === null) return
      if (options.maxRssBytes !== undefined && usage.rssBytes > options.maxRssBytes) {
        fired = true
        options.onExceeded(usage, 'memory')
        return
      }
      if (options.maxCpuPercent !== undefined && usage.cpuPercent > options.maxCpuPercent) {
        fired = true
        options.onExceeded(usage, 'cpu')
      }
    })
  }, pollMs)
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
