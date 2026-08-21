import type { Logger, LogLevel } from '@cogenta/core'
import type { Tracer } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import { withRecentLogCapture } from './dynamic-logger.js'
import { createLocalSpanExporter, type SpanDestination } from './local-span-exporter.js'
import { createObservabilityRecentStore, type ObservabilityRecentStore } from './recent-store.js'

export interface ObservabilityOtlpOptions {
  readonly endpoint: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface ObservabilityRuntimeOptions {
  /** Identifies this process to whatever OTLP backend it exports to. `'cogenta'` by default. */
  readonly serviceName?: string
  /**
   * Sends spans to any OTLP-speaking backend — Grafana, Datadog, Honeycomb,
   * whatever an operator already runs — never one hardcoded vendor (fiche
   * L22 task 5 point 1). Absent by default: the local exporter below is
   * always on, so a site with none of this configured still gets the
   * Exploitation screen (R1).
   */
  readonly otlp?: ObservabilityOtlpOptions
  readonly recentStore?: ObservabilityRecentStore
  /** Where the local NDJSON trace line goes. stdout by default. */
  readonly destination?: SpanDestination
  /**
   * Whether tracing actually runs, re-checked on every request rather than
   * fixed at startup — backs the `observability.enabled` site setting
   * (fiche L22 task 5's own "activable/désactivable"), which an admin can
   * flip without a restart. Defaults to always on.
   */
  readonly isEnabled?: () => boolean
}

export interface ObservabilityRuntime {
  readonly recentStore: ObservabilityRecentStore
  readonly tracer: Tracer
  readonly isEnabled: () => boolean
  /** `withRecentLogCapture` pre-bound to this runtime's own recent-log store. */
  wrapLogger(logger: Logger, getLevel: () => LogLevel): Logger
  shutdown(): Promise<void>
}

const DEFAULT_SERVICE_NAME = 'cogenta'

/**
 * Builds the OpenTelemetry tracer plus the local recent-events buffer
 * behind it (fiche L22 task 5).
 *
 * Two span processors, always: a `SimpleSpanProcessor` over the local
 * NDJSON/recent-store exporter (R1 — this is what makes the feature work
 * with zero external service, and it runs synchronously so the admin
 * screen's data is never stale behind a batching window), and — only when
 * `otlp` is configured — a `BatchSpanProcessor` over the OTLP HTTP
 * exporter, batched because an external network call has no business
 * blocking the request it is describing.
 */
export function createObservabilityRuntime(
  options: ObservabilityRuntimeOptions = {},
): ObservabilityRuntime {
  const recentStore = options.recentStore ?? createObservabilityRecentStore()
  const isEnabled = options.isEnabled ?? ((): boolean => true)

  const resource = resourceFromAttributes({
    'service.name': options.serviceName ?? DEFAULT_SERVICE_NAME,
  })

  const spanProcessors = [
    new SimpleSpanProcessor(
      createLocalSpanExporter({
        recentStore,
        ...(options.destination === undefined ? {} : { destination: options.destination }),
      }),
    ),
    ...(options.otlp === undefined
      ? []
      : [
          new BatchSpanProcessor(
            new OTLPTraceExporter({
              url: options.otlp.endpoint,
              ...(options.otlp.headers === undefined ? {} : { headers: options.otlp.headers }),
            }),
          ),
        ]),
  ]

  const provider = new BasicTracerProvider({ resource, spanProcessors })
  const tracer = provider.getTracer('@cogenta/observability')

  return {
    recentStore,
    tracer,
    isEnabled,
    wrapLogger: (logger, getLevel) => withRecentLogCapture(logger, recentStore, getLevel),
    shutdown: () => provider.shutdown(),
  }
}
