// cogenta:allow-fake-credentials — this file must contain a credential-shaped
// string to prove that recordTrace()/recordLog() actually redact one. It is
// not a real key.

import { describe, expect, it } from 'vitest'
import { createObservabilityRecentStore } from '../src/recent-store.js'

describe('createObservabilityRecentStore', () => {
  it('keeps traces newest first', () => {
    const store = createObservabilityRecentStore()
    store.recordTrace({
      traceId: 't1',
      spanId: 's1',
      name: 'GET /a',
      method: 'GET',
      path: '/a',
      statusCode: 200,
      durationMs: 5,
      ok: true,
    })
    store.recordTrace({
      traceId: 't2',
      spanId: 's2',
      name: 'GET /b',
      method: 'GET',
      path: '/b',
      statusCode: 200,
      durationMs: 3,
      ok: true,
    })
    const traces = store.recentTraces()
    expect(traces).toHaveLength(2)
    expect(traces[0]?.path).toBe('/b')
    expect(traces[1]?.path).toBe('/a')
  })

  it('evicts the oldest trace once capacity is exceeded', () => {
    const store = createObservabilityRecentStore({ traceCapacity: 2 })
    for (let i = 0; i < 3; i += 1) {
      store.recordTrace({
        traceId: `t${i}`,
        spanId: `s${i}`,
        name: `GET /${i}`,
        durationMs: 1,
        ok: true,
      })
    }
    const traces = store.recentTraces()
    expect(traces).toHaveLength(2)
    expect(traces.map((entry) => entry.name)).toEqual(['GET /2', 'GET /1'])
  })

  it('evicts the oldest log once capacity is exceeded', () => {
    const store = createObservabilityRecentStore({ logCapacity: 2 })
    for (let i = 0; i < 3; i += 1) {
      store.recordLog({ level: 'info', msg: `line ${i}` })
    }
    const logs = store.recentLogs()
    expect(logs).toHaveLength(2)
    expect(logs.map((entry) => entry.msg)).toEqual(['line 2', 'line 1'])
  })

  it('redacts a secret-looking field on a trace and on a log', () => {
    const store = createObservabilityRecentStore()
    store.recordTrace({
      traceId: 't1',
      spanId: 's1',
      name: 'token=sk-ant-abcdefghijklmnopqrstuvwx in the name',
      durationMs: 1,
      ok: true,
    })
    store.recordLog({
      level: 'error',
      msg: 'request failed',
      fields: { apiKey: 'super-secret-value', path: '/checkout' },
    })

    const trace = store.recentTraces()[0]
    expect(trace?.name).not.toContain('sk-ant-abcdefghijklmnopqrstuvwx')

    const log = store.recentLogs()[0]
    expect(log?.fields?.['apiKey']).toBe('[redacted]')
    expect(log?.fields?.['path']).toBe('/checkout')
  })

  it('clear() empties both buffers', () => {
    const store = createObservabilityRecentStore()
    store.recordTrace({ traceId: 't1', spanId: 's1', name: 'GET /', durationMs: 1, ok: true })
    store.recordLog({ level: 'info', msg: 'hello' })
    store.clear()
    expect(store.recentTraces()).toHaveLength(0)
    expect(store.recentLogs()).toHaveLength(0)
  })
})
