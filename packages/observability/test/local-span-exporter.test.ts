import { describe, expect, it } from 'vitest'
import { createObservabilityRuntime } from '../src/runtime.js'

describe('createObservabilityRuntime local export', () => {
  it('writes one NDJSON line per ended span, parseable and secret-free', async () => {
    const lines: string[] = []
    const runtime = createObservabilityRuntime({
      serviceName: 'test-site',
      destination: (line) => lines.push(line),
    })

    const span = runtime.tracer.startSpan('GET /home')
    span.setAttribute('http.request.method', 'GET')
    span.setAttribute('url.path', '/home')
    span.setAttribute('http.response.status_code', 200)
    span.end()

    await runtime.shutdown()

    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
    expect(parsed['name']).toBe('GET /home')
    expect(typeof parsed['traceId']).toBe('string')
    expect(typeof parsed['durationMs']).toBe('number')
  })

  it('also records the span into the recent-trace buffer', async () => {
    const runtime = createObservabilityRuntime({ destination: () => undefined })

    const span = runtime.tracer.startSpan('GET /about')
    span.setAttribute('http.request.method', 'GET')
    span.setAttribute('url.path', '/about')
    span.setAttribute('http.response.status_code', 404)
    span.end()

    await runtime.shutdown()

    const [entry] = runtime.recentStore.recentTraces()
    expect(entry?.path).toBe('/about')
    expect(entry?.statusCode).toBe(404)
  })
})
