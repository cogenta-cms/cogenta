import { createLogger } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { withRecentLogCapture } from '../src/dynamic-logger.js'
import { createObservabilityRecentStore } from '../src/recent-store.js'

describe('withRecentLogCapture', () => {
  it('captures a record at or above the dynamic level', () => {
    const store = createObservabilityRecentStore()
    const base = createLogger({ level: 'debug', destination: () => undefined })
    const level: 'debug' | 'info' | 'warn' | 'error' | 'silent' = 'info'
    const logger = withRecentLogCapture(base, store, () => level)

    logger.debug('should not appear yet')
    logger.info('should appear')
    logger.warn('also appears')

    const logs = store.recentLogs()
    expect(logs.map((entry) => entry.msg)).toEqual(['also appears', 'should appear'])
  })

  it('reacts to a level change without rebuilding the logger', () => {
    const store = createObservabilityRecentStore()
    const base = createLogger({ level: 'debug', destination: () => undefined })
    let level: 'debug' | 'info' | 'warn' | 'error' | 'silent' = 'error'
    const logger = withRecentLogCapture(base, store, () => level)

    logger.debug('still too quiet')
    expect(store.recentLogs()).toHaveLength(0)

    level = 'debug'
    logger.debug('now visible')
    expect(store.recentLogs()).toHaveLength(1)
    expect(store.recentLogs()[0]?.msg).toBe('now visible')
  })

  it('still calls the base logger even when the dynamic level suppresses capture', () => {
    const store = createObservabilityRecentStore()
    const lines: string[] = []
    const base = createLogger({ level: 'debug', destination: (line) => lines.push(line) })
    const logger = withRecentLogCapture(base, store, () => 'silent')

    logger.error('boom')

    expect(store.recentLogs()).toHaveLength(0)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('boom')
  })

  it('propagates capture through child()', () => {
    const store = createObservabilityRecentStore()
    const base = createLogger({ level: 'debug', destination: () => undefined })
    const logger = withRecentLogCapture(base, store, () => 'info')
    const child = logger.child({ requestId: 'r1' })

    child.info('from child', { extra: true })

    const logs = store.recentLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.msg).toBe('from child')
    expect(logs[0]?.fields?.['extra']).toBe(true)
  })
})
