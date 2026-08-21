import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { withRequestTracing } from '../src/request-tracing.js'
import { createObservabilityRuntime } from '../src/runtime.js'

function fakeRequest(method: string, url: string): IncomingMessage {
  return { method, url } as IncomingMessage
}

function fakeResponse(statusCode: number): ServerResponse {
  return { statusCode } as ServerResponse
}

describe('withRequestTracing', () => {
  it('records a trace with method, path (query stripped) and status', async () => {
    const lines: string[] = []
    const runtime = createObservabilityRuntime({ destination: (line) => lines.push(line) })
    const listener = withRequestTracing(async (_req, res) => {
      res.statusCode = 200
    }, runtime)

    await listener(fakeRequest('GET', '/api/content/posts?token=secret'), fakeResponse(200))

    const traces = runtime.recentStore.recentTraces()
    expect(traces).toHaveLength(1)
    expect(traces[0]?.method).toBe('GET')
    expect(traces[0]?.path).toBe('/api/content/posts')
    expect(traces[0]?.statusCode).toBe(200)
    expect(traces[0]?.ok).toBe(true)
    // The query string (which could carry a token) never reaches the trace.
    expect(traces[0]?.path).not.toContain('token')
    expect(lines.join('')).not.toContain('secret')
  })

  it('marks a >=500 response as not ok', async () => {
    const runtime = createObservabilityRuntime({ destination: () => undefined })
    const listener = withRequestTracing(async (_req, res) => {
      res.statusCode = 500
    }, runtime)

    await listener(fakeRequest('POST', '/api/content/posts'), fakeResponse(500))

    const [trace] = runtime.recentStore.recentTraces()
    expect(trace?.statusCode).toBe(500)
    expect(trace?.ok).toBe(false)
  })

  it('still runs the listener, and records nothing, when tracing is disabled', async () => {
    const runtime = createObservabilityRuntime({
      destination: () => undefined,
      isEnabled: () => false,
    })
    let ran = false
    const listener = withRequestTracing(async () => {
      ran = true
    }, runtime)

    await listener(fakeRequest('GET', '/'), fakeResponse(200))

    expect(ran).toBe(true)
    expect(runtime.recentStore.recentTraces()).toHaveLength(0)
  })

  it('never puts a request header or body into the trace', async () => {
    const lines: string[] = []
    const runtime = createObservabilityRuntime({ destination: (line) => lines.push(line) })
    const req = {
      method: 'POST',
      url: '/api/settings',
      headers: { authorization: 'Bearer top-secret-token' },
    } as IncomingMessage
    const listener = withRequestTracing(async (_req, res) => {
      res.statusCode = 200
    }, runtime)

    await listener(req, fakeResponse(200))

    expect(lines.join('')).not.toContain('top-secret-token')
    const [trace] = runtime.recentStore.recentTraces()
    expect(JSON.stringify(trace)).not.toContain('top-secret-token')
  })
})
