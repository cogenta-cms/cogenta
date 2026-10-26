import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * What `cogenta channels` tells `cogenta serve` about itself.
 *
 * The two are separate processes (a persistent chat connection must exist
 * once, never once per web replica), so the admin cannot ask the one for the
 * state of the other directly. The channel process leaves a small heartbeat
 * file in the project's `.cogenta` folder and the web process reads it: a
 * code generated while nothing is listening would never be read, and the
 * screen can now say so instead of letting someone wait for a reply.
 */
export interface ChannelsStatus {
  /** The chat channels this process is connected to. */
  readonly channels: readonly string[]
  readonly startedAt: string
  readonly heartbeatAt: string
}

export interface ChannelsRunnerState {
  readonly running: boolean
  readonly channels: readonly string[]
  readonly since?: string
}

/** The process beats every 20 s; three missed beats means it is gone. */
export const CHANNELS_HEARTBEAT_MS = 20_000
const STALE_AFTER_MS = CHANNELS_HEARTBEAT_MS * 3

export function channelsStatusPath(projectRoot: string): string {
  return join(projectRoot, '.cogenta', 'channels-status.json')
}

export async function writeChannelsStatus(
  projectRoot: string,
  status: ChannelsStatus,
): Promise<void> {
  const path = channelsStatusPath(projectRoot)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(status), 'utf8')
}

export async function clearChannelsStatus(projectRoot: string): Promise<void> {
  await rm(channelsStatusPath(projectRoot), { force: true })
}

export async function readChannelsRunner(
  projectRoot: string,
  now: () => number = Date.now,
): Promise<ChannelsRunnerState> {
  let raw: string
  try {
    raw = await readFile(channelsStatusPath(projectRoot), 'utf8')
  } catch {
    return { running: false, channels: [] }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChannelsStatus>
    const beat = Date.parse(parsed.heartbeatAt ?? '')
    if (Number.isNaN(beat) || now() - beat > STALE_AFTER_MS) {
      return { running: false, channels: [] }
    }
    return {
      running: true,
      channels: Array.isArray(parsed.channels) ? parsed.channels.map(String) : [],
      ...(parsed.startedAt === undefined ? {} : { since: parsed.startedAt }),
    }
  } catch {
    return { running: false, channels: [] }
  }
}
