---
'@cogenta/core': minor
'@cogenta/agents-builtin': minor
---

Add the Performance agent: `queryCrux` measures Core Web Vitals via the
Chrome UX Report API (real-user field data on the deployed site, no
headless browser); `medianMetrics` combines several noisy samples
before `compareToBudget` or `detectRegression` ever run
(`detectRegression`'s default 15% threshold is deliberately generous,
so normal field-data jitter never gets reported as a regression);
`diagnosePerformanceRisks` flags only structurally-derivable causes
(missing image dimensions, unoptimized images, too many third-party
scripts) — it does not guess at causes it cannot back with data.
`performanceAgent` ties it together with the lot's tool list
(`http.fetch`/`content.read`/`channel.send`/`build.trigger` — no
content-writing tools).

One new `@cogenta/core` error code: `PERFORMANCE_CRUX_QUERY_FAILED`.
