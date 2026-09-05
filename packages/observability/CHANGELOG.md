# @cogenta/observability

## 0.2.0

### Minor Changes

- 3cbd6d7: L22 task 5 — OpenTelemetry request tracing, a configurable log level, and
  an admin "Exploitation" > Observability screen, all on by default and
  working with zero external service (R1).
  
  **New package `@cogenta/observability`:** wraps `@opentelemetry/api` +
  `@opentelemetry/sdk-trace-base` (a real new dependency — see the task
  report for size and maintenance detail; this is the industry-standard
  choice, never a hand-rolled tracer). `createObservabilityRuntime` builds
  one server span per HTTP request (`withRequestTracing`) and a bounded,
  in-process "recent events" buffer (`ObservabilityRecentStore`, same ring-
  buffer shape `@cogenta/core`'s `createErrorLog` already uses) that the
  admin reads. A local NDJSON exporter runs always, needing no external
  service; an OTLP HTTP exporter runs in addition when an endpoint is
  configured — never one hardcoded vendor, any OTLP-speaking backend
  (Grafana, Datadog, …) works. `withRecentLogCapture` wraps any
  `@cogenta/core` `Logger` so its records also feed the same buffer, gated
  by a dynamic level getter rather than the logger's own fixed threshold.
  Every field passes through `@cogenta/core`'s `redact()` before storage —
  the same discipline the audit log already applies — and a trace only ever
  carries a request's method, path (query string stripped) and status code,
  never a header, cookie, or body.
  
  **`@cogenta/core`:** a new `observability` config section
  (`cogenta.config.mjs`) — `serviceName` and `otlpEndpoint`, resolved
  always, defaults needing nothing external. No `otlpHeaders` field, on
  purpose (rule R7, same shape as `payment`'s missing `stripeSecretKey`):
  those come from `COGENTA_OTLP_HEADERS`/`OTEL_EXPORTER_OTLP_HEADERS` only,
  refused if written to the file (`CONFIG_SECRET_IN_FILE`). `serviceName`
  and `otlpEndpoint` also honour the standard `OTEL_SERVICE_NAME`/
  `OTEL_EXPORTER_OTLP_ENDPOINT` environment variables as a fallback.
  
  **`@cogenta/schema`:** `SITE_SETTINGS_REGISTRY` gains a new `observability`
  group with two editorial settings — `observability.enabled` (default on)
  and `observability.logLevel` (`error`/`warn`/`info`/`debug`, default
  `info`) — changeable from the admin with no restart, unlike the OTLP
  export destination above.
  
  **`@cogenta/api`:** `createObservabilityRouter` — `GET /api/observability`,
  admin-only, read-only, answering the current `enabled` state plus the
  recent traces and logs.
  
  **`@cogenta/cli`:** `cogenta serve` wires all of the above — the HTTP
  listener is wrapped with `withRequestTracing`, the shared logger is
  wrapped with `withRecentLogCapture`, and `observability.enabled`/
  `observability.logLevel` are polled from the settings store every 15s
  (configurable via `ServeOptions.observabilitySettingsTickMs`, a test
  seam) so an admin's change takes effect without a restart.

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [4d3f3c7]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [2285720]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [745ebd8]
- Updated dependencies [960757d]
- Updated dependencies [07c0f0a]
  - @cogenta/core@0.5.0
