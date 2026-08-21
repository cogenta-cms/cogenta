import type { IncomingMessage, ServerResponse } from 'node:http'
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import type { ObservabilityRuntime } from './runtime.js'

export type RequestListener = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

/** Strips the query string — a query string can itself carry a token (e.g. an API key passed as `?key=`), the same reason the audit log never stores one verbatim. */
function pathOnly(url: string | undefined): string {
  if (url === undefined || url === '') return '/'
  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}

/**
 * Wraps a plain Node HTTP request listener with one server span per
 * request (fiche L22 task 5 point 1).
 *
 * Deliberately hand-instruments this one entry point rather than pulling in
 * `@opentelemetry/instrumentation-http` or the "auto-instrumentations-node"
 * bundle: `cogenta serve` has exactly one place a request enters
 * (`createRequestListener` in `@cogenta/cli`), so a generic
 * auto-instrumentation layer would be the kind of abstraction for a
 * hypothetical AGENTS.md discourages — this wrapper *is* the
 * instrumentation, and it is a handful of lines.
 *
 * The only things ever read off the request/response are `req.method`,
 * the request's *path* (query string stripped — see `pathOnly`) and the
 * final `res.statusCode`. Never a header, a cookie, or any byte of a
 * request or response body — there is no code path here that could put a
 * secret or personal data into a trace (fiche L22 task 5 point 4, the same
 * discipline `@cogenta/core`'s audit log already applies).
 */
export function withRequestTracing(
  listener: RequestListener,
  runtime: ObservabilityRuntime,
): RequestListener {
  return async (req, res) => {
    if (!runtime.isEnabled()) {
      await listener(req, res)
      return
    }

    const method = req.method ?? 'GET'
    const path = pathOnly(req.url)
    const span = runtime.tracer.startSpan(`${method} ${path}`, { kind: SpanKind.SERVER })

    try {
      await context.with(trace.setSpan(context.active(), span), () => listener(req, res))
    } finally {
      const statusCode = res.statusCode
      span.setAttribute('http.request.method', method)
      span.setAttribute('url.path', path)
      span.setAttribute('http.response.status_code', statusCode)
      span.setStatus({
        code: statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      })
      span.end()
    }
  }
}
