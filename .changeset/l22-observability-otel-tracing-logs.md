---
'@cogenta/observability': minor
'@cogenta/core': minor
'@cogenta/schema': minor
'@cogenta/api': minor
'@cogenta/cli': minor
---

L22 task 5 — OpenTelemetry request tracing, a configurable log level, and
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
