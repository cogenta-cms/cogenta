import { redact } from '@cogenta/core'
import type { ExportResult } from '@opentelemetry/core'
import { ExportResultCode } from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { ObservabilityRecentStore } from './recent-store.js'

/** Where a local trace line goes. Same shape as `@cogenta/core`'s `LogDestination` — stdout by default. */
export type SpanDestination = (line: string) => void

const writeToStdout: SpanDestination = (line) => {
  process.stdout.write(line)
}

function hrTimeToMillis([seconds, nanos]: readonly [number, number]): number {
  return seconds * 1000 + nanos / 1_000_000
}

/**
 * The "console/fichier local" exporter fiche L22 task 5 asks for as the
 * always-available default (R1 — no external service required to see a
 * trace at all): every ended span is written as one NDJSON line through an
 * injectable destination (stdout by default; a caller wanting a file only
 * has to pass a destination that appends to one, the same seam
 * `@cogenta/core`'s `createLogger` already uses), and — regardless of
 * whether an operator ever reads that stream — recorded into the bounded
 * `ObservabilityRecentStore` the admin's Exploitation screen queries.
 *
 * Only ever reads a span's `name`, `kind`, timing, status code and the
 * handful of attributes `request-tracing.ts` itself sets (method, path,
 * status code, duration) — never a header, a cookie, or a request/response
 * body, so there is nothing here for `redact()` to have to catch. It is
 * still applied, the same belt-and-braces discipline `createErrorLog`
 * already follows, in case a future caller ever sets a richer attribute.
 */
export interface LocalSpanExporterOptions {
  readonly recentStore: ObservabilityRecentStore
  readonly destination?: SpanDestination
}

export function createLocalSpanExporter(options: LocalSpanExporterOptions): SpanExporter {
  const { recentStore } = options
  const destination = options.destination ?? writeToStdout

  return {
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
      try {
        for (const span of spans) {
          const attributes = redact(span.attributes as Record<string, unknown>)
          const statusCode = attributes['http.response.status_code']
          const durationMs = hrTimeToMillis(span.duration)
          const spanContext = span.spanContext()

          const line = {
            time: new Date(hrTimeToMillis(span.endTime)).toISOString(),
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            name: span.name,
            statusCode: span.status.code,
            durationMs,
            attributes,
          }
          destination(`${JSON.stringify(line)}\n`)

          const method = attributes['http.request.method']
          const path = attributes['url.path']

          recentStore.recordTrace({
            traceId: spanContext.traceId,
            spanId: spanContext.spanId,
            name: span.name,
            ...(typeof method === 'string' ? { method } : {}),
            ...(typeof path === 'string' ? { path } : {}),
            ...(typeof statusCode === 'number' ? { statusCode } : {}),
            durationMs,
            // OTel's `SpanStatusCode.ERROR` is `2` — `request-tracing.ts` only ever sets that
            // for a >=500 response, so `ok` here means exactly what the admin screen shows it as.
            ok: span.status.code !== 2,
          })
        }
        resultCallback({ code: ExportResultCode.SUCCESS })
      } catch (error) {
        resultCallback({ code: ExportResultCode.FAILED, error: error as Error })
      }
    },
    shutdown: () => Promise.resolve(),
  }
}
