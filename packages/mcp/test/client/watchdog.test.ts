import { describe, expect, it, vi } from 'vitest'
import { startPidWatchdog } from '../../src/client/watchdog.js'

describe('startPidWatchdog', () => {
  it('fires onExceeded with reason "memory" once RSS crosses the configured ceiling', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({ rssBytes: 600 * 1024 * 1024, cpuPercent: 5 }))
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 10,
      maxRssBytes: 512 * 1024 * 1024,
      onExceeded,
      readUsage,
    })

    await vi.waitFor(() => expect(onExceeded).toHaveBeenCalledTimes(1))
    expect(onExceeded).toHaveBeenCalledWith(
      { rssBytes: 600 * 1024 * 1024, cpuPercent: 5 },
      'memory',
    )
    watchdog.stop()
  })

  it('fires onExceeded with reason "cpu" once CPU crosses the configured ceiling', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({ rssBytes: 10, cpuPercent: 250 }))
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 10,
      maxCpuPercent: 200,
      onExceeded,
      readUsage,
    })

    await vi.waitFor(() => expect(onExceeded).toHaveBeenCalledTimes(1))
    expect(onExceeded).toHaveBeenCalledWith({ rssBytes: 10, cpuPercent: 250 }, 'cpu')
    watchdog.stop()
  })

  it('never fires while usage stays under every configured ceiling', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({ rssBytes: 10 * 1024 * 1024, cpuPercent: 5 }))
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 10,
      maxRssBytes: 512 * 1024 * 1024,
      maxCpuPercent: 200,
      onExceeded,
      readUsage,
    })

    // Several poll cycles, deliberately — a single clean pass proves little.
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(onExceeded).not.toHaveBeenCalled()
    watchdog.stop()
  })

  it('fires at most once, even across many polls past the ceiling', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({ rssBytes: 600 * 1024 * 1024, cpuPercent: 5 }))
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 10,
      maxRssBytes: 512 * 1024 * 1024,
      onExceeded,
      readUsage,
    })

    await vi.waitFor(() => expect(onExceeded).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(onExceeded).toHaveBeenCalledTimes(1)
    watchdog.stop()
  })

  it('stop() prevents any further poll from firing onExceeded', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({ rssBytes: 600 * 1024 * 1024, cpuPercent: 5 }))
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 20,
      maxRssBytes: 512 * 1024 * 1024,
      onExceeded,
      readUsage,
    })

    watchdog.stop()
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(onExceeded).not.toHaveBeenCalled()
  })

  it('degrades to "no signal" — never throws, never fires — when the probe cannot read the process', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => null)
    const watchdog = startPidWatchdog({
      pid: 4242,
      pollMs: 10,
      maxRssBytes: 1,
      maxCpuPercent: 0,
      onExceeded,
      readUsage,
    })

    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(onExceeded).not.toHaveBeenCalled()
    watchdog.stop()
  })

  it('with neither ceiling configured, never fires regardless of reported usage', async () => {
    const onExceeded = vi.fn()
    const readUsage = vi.fn(async () => ({
      rssBytes: Number.MAX_SAFE_INTEGER,
      cpuPercent: 100_000,
    }))
    const watchdog = startPidWatchdog({ pid: 4242, pollMs: 10, onExceeded, readUsage })

    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(onExceeded).not.toHaveBeenCalled()
    watchdog.stop()
  })
})
