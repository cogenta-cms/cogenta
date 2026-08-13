---
'@cogenta/admin': minor
---

Add `@cogenta/admin` — the app shell for L2's admin SPA (task 1): routing, layout, and a
visual theme.

React + Vite + react-router, deliberately without a component-library dependency (R9):
the admin is one interior application with a small, fixed set of layouts, not a
public-facing surface that needs a design system's breadth. Hand-written CSS custom
properties instead, with a dark variant and `prefers-reduced-motion` respected from the
start.

Keyboard navigation and a skip link are in from task 1, not deferred to the
accessibility pass in task 16 — retrofitting a skip link after fifteen tasks of markup
is a much bigger job than starting with one.

The bundle deliberately does not depend on `@cogenta/core`: that package pulls in
Node-only database, queue and storage drivers that do not belong in a browser bundle, so
the one place this package would have used `CogentaError` uses a plain type assertion
instead — `index.html` is owned by this same package, so its `#root` element is a real
invariant, not a runtime possibility to branch on.
